import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { errorHandler, requestId } from "../src/middlewares/errorHandler.js";
import {
    anonymous, ApiClient, clientAs, createTestUser, env, freshClientAs, mintAdminToken, outbox, shouldFail, shouldSucceed, unitOfWork,
} from "./helpers/api.js";

const withToken = (token) => Object.assign(new ApiClient(), { token });

// What the API accepts as proof of identity, and what it says when something breaks.
describe("tokens", () => {
    it.each(["", "not-a-token", "Bearer", "a.b.c", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0."])(
        "a token that is not a token is rejected: %j",
        async (token) => {
            shouldFail(await withToken(token).get("users/me"), 401);
        },
    );

    it("a tampered payload is rejected", async () => {
        const client = await freshClientAs("member");
        const parts = client.token.split(".");

        // Flip one character of the payload: the claims change, the signature does not.
        parts[1] = parts[1].slice(0, 5) + (parts[1][5] === "A" ? "B" : "A") + parts[1].slice(6);

        shouldFail(await withToken(parts.join(".")).get("users/me"), 401);
    });

    it("a valid token minted the same way the app mints them is accepted", async () => {
        // The control for the tests below: proves they fail for the reason stated and not
        // because the minting helper is simply wrong.
        shouldSucceed(await withToken(await mintAdminToken()).get("users"));
    });

    it("a token signed with a different key is rejected", async () => {
        // What an attacker holding the source but not the deployment's JWT_SECRET can make.
        const forged = await mintAdminToken({ secret: "a-completely-different-key-that-is-long-enough-32" });

        shouldFail(await withToken(forged).get("users"), 401);
    });

    it("an expired token is rejected", async () => {
        shouldFail(await withToken(await mintAdminToken({ expiresInSeconds: -300 })).get("users"), 401);
    });

    it("a token without the account's security stamp is rejected", async () => {
        // The stamp is how a role change or a new password ends the tokens issued before it.
        shouldFail(await withToken(await mintAdminToken({ includeStamp: false })).get("users"), 401);
    });

    it("the role claim is what decides access, not the account name", async () => {
        // Guards against an authorization check that reads the e-mail or the username
        // instead of the role: a token whose role claim says Member gets a member's
        // access, whoever the subject is.
        const client = withToken(await mintAdminToken({ role: "Member" }));

        shouldSucceed(await client.get("users/me"), "the token itself is valid");
        shouldFail(await client.get("users"), 403, "http.forbidden");
    });

    it("signing in twice gives two tokens that both work", async () => {
        const first = await freshClientAs("member");
        const second = await freshClientAs("member");

        expect(first.token).not.toBe(second.token);
        shouldSucceed(await first.get("users/me"));
        shouldSucceed(await second.get("users/me"));
    });
});

describe("credentials", () => {
    it.each([
        ["member@example.com", "WrongPassword1!"],
        ["nobody@example.com", "Password123!"],
        ["", ""],
    ])("bad credentials are refused without saying which half was wrong: %j / %j", async (emailOrUsername, password) => {
        const result = await anonymous().post("auth/login-email", { emailOrUsername, password });

        // "No such user" versus "wrong password" turns the login form into an account
        // enumerator - so it is one code and one sentence for both.
        shouldFail(result, 401, "auth.invalid_credentials");
        expect(result.message).toBe("Invalid credentials.");
    });
});

describe("password reset", () => {
    /** The link out of the mail the request sent - the only road it ever leaves by. */
    const mailedToken = (email) => {
        const mail = outbox.findLast((message) => message.to === email);
        return /[?&]token=([0-9a-f]+)/.exec(mail.text)[1];
    };

    it("a request says the same thing whether or not the account exists, and never hands the token back", async () => {
        const victim = await createTestUser();
        const sentBefore = outbox.length;

        const forReal = await anonymous().post("auth/forget-password", { email: victim.email });
        const forFake = await anonymous().post("auth/forget-password", { email: `nobody-${Date.now()}@tests.example` });

        shouldSucceed(forReal);
        shouldSucceed(forFake);
        expect(forFake.message).toBe(forReal.message);
        expect(forReal.data).toBeNull();
        expect(forFake.data).toBeNull();

        expect(outbox.length).toBe(sentBefore + 1);
        expect(outbox.at(-1).to).toBe(victim.email);
    });

    it("a made-up token is refused the same way as an unknown address", async () => {
        const victim = await createTestUser();
        shouldSucceed(await anonymous().post("auth/forget-password", { email: victim.email }));

        const guess = { token: "0".repeat(64), newPassword: "Brand-New-Pass1!" };

        shouldFail(await anonymous().post("auth/reset-password", { email: victim.email, ...guess }), 400, "auth.reset_token_invalid");
        shouldFail(await anonymous().post("auth/reset-password", { email: "nobody@tests.example", ...guess }), 400, "auth.reset_token_invalid");
        shouldSucceed(await anonymous().tryLogin(victim.email, victim.password), "nothing changed");
    });

    it("the mailed token sets the password once and ends the old sessions", async () => {
        const victim = await createTestUser();
        shouldSucceed(await anonymous().post("auth/forget-password", { email: victim.email }));
        const token = mailedToken(victim.email);

        // The token is fine and the new password is not: that one is worth explaining.
        shouldFail(await anonymous().post("auth/reset-password", { email: victim.email, token, newPassword: "weak" }), 400, "user.password_rejected");

        shouldSucceed(await anonymous().post("auth/reset-password", { email: victim.email, token, newPassword: "Brand-New-Pass1!" }));

        shouldFail(await anonymous().tryLogin(victim.email, victim.password), 401, "auth.invalid_credentials");
        shouldSucceed(await anonymous().tryLogin(victim.email, "Brand-New-Pass1!"));
        shouldFail(await victim.client.get("users/me"), 401);

        // Spent: the same link does not work a second time.
        shouldFail(await anonymous().post("auth/reset-password", { email: victim.email, token, newPassword: "Another-Pass1!" }), 400, "auth.reset_token_invalid");
    });

    it("an expired token is refused", async () => {
        const victim = await createTestUser();
        shouldSucceed(await anonymous().post("auth/forget-password", { email: victim.email }));
        const token = mailedToken(victim.email);

        await unitOfWork.users.update(victim.id, { resetTokenExpiresAt: new Date(Date.now() - 1000) });

        shouldFail(await anonymous().post("auth/reset-password", { email: victim.email, token, newPassword: "Brand-New-Pass1!" }), 400, "auth.reset_token_invalid");
    });
});

describe("lockout", () => {
    // Read from the app's own configuration rather than written down here: tuning it must
    // never quietly turn these tests into no-ops.
    const maxAttempts = env.lockout.maxFailedAttempts;

    it("guessing a password locks the account rather than running forever", async () => {
        // A throwaway account, so the attack cannot lock a seeded one out.
        const victim = await createTestUser();
        const attacker = anonymous();

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            shouldFail(await attacker.tryLogin(victim.email, `Guess${attempt}!`), 401);
        }

        // The next attempt is refused for a different reason - and so is the right
        // password, which is the whole point.
        shouldFail(await attacker.tryLogin(victim.email, victim.password), 401, "auth.account_locked");
    });

    it("a correct password clears the count, so typos do not accumulate", async () => {
        const victim = await createTestUser();
        const client = anonymous();

        for (let attempt = 1; attempt < maxAttempts; attempt++) await client.tryLogin(victim.email, `Guess${attempt}!`);
        shouldSucceed(await client.tryLogin(victim.email, victim.password), "one short of the threshold is not a lockout");

        // The same number again must not tip it over, because the counter went to zero.
        for (let attempt = 1; attempt < maxAttempts; attempt++) await client.tryLogin(victim.email, `Again${attempt}!`);
        shouldSucceed(await client.tryLogin(victim.email, victim.password), "the successful login in between reset the counter");
    });

    it("a wrong address cannot be used to lock somebody else out", async () => {
        for (let attempt = 1; attempt <= maxAttempts + 3; attempt++) {
            shouldFail(await anonymous().tryLogin(`no-such-account-${attempt}@tests.example`, "whatever"), 401);
        }

        expect((await freshClientAs("member")).token).toBeTruthy();
    });

    it("an administrator setting a new password lifts the lockout", async () => {
        const admin = await clientAs("admin");
        const victim = await createTestUser();
        for (let attempt = 1; attempt <= maxAttempts; attempt++) await anonymous().tryLogin(victim.email, `Guess${attempt}!`);

        shouldSucceed(await admin.post(`users/${victim.id}/reset-password`, { newPassword: "Set-By-Admin1!" }));

        shouldSucceed(await anonymous().tryLogin(victim.email, "Set-By-Admin1!"));
    });
});

describe("access ends when it is taken away", () => {
    it("suspending an account takes effect on the token already in their hands", async () => {
        const admin = await clientAs("admin");
        const victim = await createTestUser();
        shouldSucceed(await victim.client.get("users/me"), "precondition: the account works");

        // The reason an admin does this is to cut off access now.
        shouldSucceed(await admin.patch(`users/${victim.id}/status`, { isActive: false }));

        shouldFail(await victim.client.get("users/me"), 401);
        shouldFail(await anonymous().tryLogin(victim.email, victim.password), 401, "auth.account_disabled");
    });

    it("changing a role ends the tokens that carry the old one", async () => {
        const admin = await clientAs("admin");
        const promoted = await createTestUser("Member");

        shouldSucceed(await admin.patch(`users/${promoted.id}`, { roleName: "Admin" }));

        // The old token still says Member; it must be replaced, not trusted for days.
        shouldFail(await promoted.client.get("users/me"), 401);

        const again = anonymous();
        shouldSucceed(await again.tryLogin(promoted.email, promoted.password));
        shouldSucceed(await again.get("users"), "the new token carries the new role");
    });
});

describe("the error surface", () => {
    it("an unhandled error never returns its message to the client", async () => {
        // A tiny app with the real handler and a route that throws: the point is what the
        // handler writes, and no real endpoint should be induced to throw to observe it.
        const secret = "Server=db;User Id=sa;Password=SuperSecret123;Initial Catalog=App";
        const probe = express();
        probe.use(requestId);
        probe.get("/boom", async () => {
            throw new Error(`Login failed. Connection: ${secret}`);
        });
        probe.use(errorHandler);

        const response = await request(probe).get("/boom");

        expect(response.status).toBe(500);
        expect(response.text).not.toContain("SuperSecret123");
        expect(response.text).not.toContain("Login failed");
        expect(response.body.success).toBe(false);
        expect(response.body.code).toBe("generic");
        // An operator needs something to match the response against the log.
        expect(response.body.data.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("a business failure is a 4xx with a code, not a 500", async () => {
        const member = await clientAs("member");

        // An id nothing has, and one that is not even shaped like an id.
        for (const id of [crypto.randomUUID(), "not-an-id"]) {
            const result = shouldFail(await member.patch(`items/${id}/status`, { status: "Done" }), 404, "item.not_found");
            expect(result.message).toBeTruthy();
        }
    });
});
