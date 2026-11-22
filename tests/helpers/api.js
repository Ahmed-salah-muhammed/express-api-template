import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { expect } from "vitest";
import { createApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { seedDemoData, SEED_PASSWORD, SEED_USERS } from "../../src/data/seeder.js";
import { connect, migrate, unitOfWork } from "../../src/repositories/index.js";
import { outbox } from "../../src/services/email/emailService.js";

// ------------------- The app under test, and a client that speaks its envelope -------------------
// Which database it connects to was decided before this file loaded (setupEnv.js).

// Once for the whole run (vitest.config.js shares modules between files): connect, bring
// the schema up through the real migrations, and seed - running them is itself part of
// what is being verified.
await connect();
await migrate();
await seedDemoData(unitOfWork);

export const app = createApp();
export { env, outbox, SEED_PASSWORD, SEED_USERS, unitOfWork };

/** The seeded demo accounts (src/data/seeder.js), by the short name tests use. */
export const SEED_ACCOUNTS = { admin: "admin@example.com", member: "member@example.com", sara: "sara@example.com" };

const toResult = (response) => ({
    status: response.status,
    success: response.body?.success === true,
    message: response.body?.message ?? null,
    data: response.body?.data ?? null,
    code: response.body?.code ?? null,
    args: response.body?.args ?? null,
});

/**
 * A thin wrapper over supertest that speaks the app's envelope and its auth. Tests read as
 * "as this account, call this endpoint" rather than as HTTP plumbing. Paths are relative
 * to /api/v1 unless they start with a slash.
 */
export class ApiClient {
    /** The bearer token sent with every request; null sends none. Set it directly for forged-token tests. */
    token = null;

    #open(method, path) {
        const call = request(app)[method](path.startsWith("/") ? path : `/api/v1/${path}`);
        return this.token === null ? call : call.set("Authorization", `Bearer ${this.token}`);
    }

    async #send(method, path, body) {
        const call = this.#open(method, path);
        return toResult(await (body === undefined ? call : call.send(body)));
    }

    get = (path) => this.#send("get", path);
    post = (path, body) => this.#send("post", path, body);
    patch = (path, body) => this.#send("patch", path, body);
    delete = (path) => this.#send("delete", path);

    /** Sends a body verbatim - for malformed-payload tests. */
    postRaw = async (path, raw) => toResult(await this.#open("post", path).set("Content-Type", "application/json").send(raw));

    /** Multipart upload of one file. */
    upload = async (path, field, buffer, filename, contentType) =>
        toResult(await this.#open("post", path).attach(field, buffer, { filename, contentType }));

    /** A path outside the envelope - an uploaded file. Resolves to the HTTP status. */
    statusOf = async (path) => (await this.#open("get", path)).status;

    /** Signs in by e-mail and keeps the token. */
    async tryLogin(email, password) {
        const result = await this.post("auth/login-email", { emailOrUsername: email, password });
        if (result.success) this.token = result.data.token;
        return result;
    }
}

// ------------------------------------------------------------------ assertions
// They put the server's own words in the failure message. A bare "expected true, received
// false" says nothing about which guard rejected the call, which is the only thing worth
// knowing when an integration test fails.

const said = (result) => `${result.status} with code '${result.code}': ${result.message ?? "(no message)"}`;

export function shouldSucceed(result, because) {
    expect(result.success, `expected success${because ? ` (${because})` : ""} but got ${said(result)}`).toBe(true);
    return result;
}

/** Rejected with this status and, when given, this ErrorCodes value. */
export function shouldFail(result, status, code) {
    expect(result.success, `expected the call to be rejected but got ${said(result)}`).toBe(false);
    expect(result.status, `expected ${status}${code ? ` '${code}'` : ""} but got ${said(result)}`).toBe(status);
    if (code) expect(result.code, `expected code '${code}' but got ${said(result)}`).toBe(code);
    return result;
}

/**
 * The response's Data as an array. Data is either the rows themselves or a page wrapping
 * them; an endpoint moves from the first shape to the second the day it is paged, and a
 * test that only wanted the rows should not break over which shape it sees today.
 */
export function itemsOf(result) {
    shouldSucceed(result);
    const rows = Array.isArray(result.data) ? result.data : result.data?.items;
    expect(Array.isArray(rows), `expected Data to be an array or a page of them: ${JSON.stringify(result.data)}`).toBe(true);
    return rows;
}

// ------------------------------------------------------------------ clients

export const anonymous = () => new ApiClient();

/** A session of its own for a seeded account - for token and sign-out tests. */
export async function freshClientAs(account) {
    const client = new ApiClient();
    shouldSucceed(await client.tryLogin(SEED_ACCOUNTS[account], SEED_PASSWORD), `signing in as ${account}`);
    return client;
}

// One shared client per seeded account: signing the same account in for every test would
// dominate the run. Anything that needs its own session, or changes what the account can
// do, uses freshClientAs or createTestUser.
const signedIn = new Map();

export async function clientAs(account) {
    if (!signedIn.has(account)) signedIn.set(account, await freshClientAs(account));
    return signedIn.get(account);
}

/**
 * A throwaway account and a client signed in as it. A test that suspends, locks, deletes
 * or re-roles somebody - or that counts "my items" - must not do it to a seeded account
 * the rest of the suite signs in with, and must not depend on what an earlier test left.
 */
export async function createTestUser(role = "Member", password = SEED_PASSWORD) {
    const admin = await clientAs("admin");
    const unique = randomUUID().replaceAll("-", "").slice(0, 10);
    const email = `user${unique}@tests.example`;

    const created = shouldSucceed(
        await admin.post("users", { fullName: `Test ${role} ${unique}`, email, password, roleName: role }),
        "creating a throwaway account",
    );

    const client = new ApiClient();
    shouldSucceed(await client.tryLogin(email, password), "signing the throwaway account in");

    return { id: created.data.id, email, password, client };
}

/**
 * A token for the seeded administrator, built the way utils/jwt.js builds one - with
 * whichever part the test is about made wrong.
 */
export async function mintAdminToken({ secret = env.jwt.secret, role = "Admin", expiresInSeconds = 300, includeStamp = true } = {}) {
    const admin = await unitOfWork.users.getById(SEED_USERS.admin);
    const now = Math.floor(Date.now() / 1000);

    return jwt.sign(
        { role, ...(includeStamp ? { stamp: admin.securityStamp } : {}), iat: now - 60, exp: now + expiresInSeconds },
        secret,
        { algorithm: "HS256", subject: admin.id, jwtid: randomUUID(), issuer: env.jwt.issuer, audience: env.jwt.audience },
    );
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
