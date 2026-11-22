import { describe, expect, it } from "vitest";
import { anonymous, clientAs, SEED_ACCOUNTS, SEED_PASSWORD, shouldFail, shouldSucceed } from "./helpers/api.js";

// Proves the harness itself works before anything is built on it: the app boots, the
// migrations run against a real database, and the seeded accounts sign in.
describe("smoke", () => {
    it.each([
        ["admin", "Admin"],
        ["member", "Member"],
        ["sara", "Member"],
    ])("the seeded account %s signs in and holds the role %s", async (account, role) => {
        const client = await clientAs(account);
        const me = shouldSucceed(await client.get("users/me")).data;

        expect(me.role).toBe(role);
        expect(me.email).toBe(SEED_ACCOUNTS[account]);
    });

    it("a seeded account signs in by username too", async () => {
        const result = await anonymous().post("auth/login-username", { emailOrUsername: "member", password: SEED_PASSWORD });

        expect(shouldSucceed(result).data.token).toBeTruthy();
    });

    it("the client's own spelling of a path finds the route", async () => {
        const client = await clientAs("member");

        shouldSucceed(await client.get("Users/me"));
        shouldSucceed(await client.get("Dashboard/summary"));
    });

    it("the seeded suspended account cannot sign in", async () => {
        shouldFail(await anonymous().tryLogin("omar@example.com", SEED_PASSWORD), 401, "auth.account_disabled");
    });

    it.each(["users/me", "users", "items", "dashboard/summary"])("an anonymous caller is rejected on %s", async (path) => {
        shouldFail(await anonymous().get(path), 401, "http.unauthorized");
    });

    it("self-registration is closed", async () => {
        const result = await anonymous().post("auth/signup", { fullName: "Attacker", email: "attacker@x.com", password: "Password123!", roleName: "Admin" });

        shouldFail(result, 404);
    });

    it("the health check answers without a token", async () => {
        expect(await anonymous().statusOf("/health")).toBe(200);
    });

    it("a path that is not a route is a 404 in the envelope", async () => {
        shouldFail(await (await clientAs("admin")).get("no-such-thing"), 404, "http.not_found");
    });
});
