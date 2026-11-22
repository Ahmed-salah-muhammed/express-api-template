import { describe, expect, it } from "vitest";
import { anonymous, clientAs, createTestUser, itemsOf, shouldFail, shouldSucceed } from "./helpers/api.js";

const unique = () => crypto.randomUUID().replaceAll("-", "").slice(0, 10);

// Accounts: who may manage them, and the rules the service holds them to.
describe("user management", () => {
    it("only an administrator manages accounts", async () => {
        const member = await clientAs("member");
        const other = await createTestUser();

        shouldFail(await member.get("users"), 403);
        shouldFail(await member.get(`users/${other.id}`), 403);
        shouldFail(await member.post("users", {}), 403);
        shouldFail(await member.patch(`users/${other.id}`, { fullName: "Hijacked" }), 403);
        shouldFail(await member.patch(`users/${other.id}/status`, { isActive: false }), 403);
        shouldFail(await member.post(`users/${other.id}/reset-password`, { newPassword: "Hijacked-Pass1!" }), 403);
        shouldFail(await member.delete(`users/${other.id}`), 403);

        shouldSucceed(await anonymous().tryLogin(other.email, other.password), "none of it happened");
    });

    it("the list filters by role, status and search", async () => {
        const admin = await clientAs("admin");

        const admins = itemsOf(await admin.get("users?role=Admin"));
        expect(admins.length).toBeGreaterThan(0);
        expect(admins.every((user) => user.role === "Admin")).toBe(true);

        const suspended = itemsOf(await admin.get("users?isActive=false"));
        expect(suspended.map((user) => user.email)).toContain("omar@example.com");
        expect(suspended.every((user) => user.isActive === false)).toBe(true);

        // Case does not matter, on any database.
        const found = itemsOf(await admin.get("users?search=SARA"));
        expect(found.map((user) => user.email)).toEqual(["sara@example.com"]);
    });

    it("a listed account never carries its password hash", async () => {
        const raw = JSON.stringify(shouldSucceed(await (await clientAs("admin")).get("users")).data).toLowerCase();

        for (const secret of ["passwordhash", "securitystamp", "resettoken", "normalized"]) expect(raw).not.toContain(secret);
    });

    it("a created account gets its role, a username, and can sign in", async () => {
        const admin = await clientAs("admin");
        const email = `Mona${unique()}@Tests.example`;

        const created = shouldSucceed(await admin.post("users", {
            fullName: "  منى السالم  ",
            email,
            password: "Password123!",
            roleName: "Member",
            jobDescription: "محاسبة",
        })).data;

        expect(created.fullName).toBe("منى السالم"); // trimmed
        expect(created.username).toBe(email.split("@")[0]); // left out, it comes from the address
        expect(created.role).toBe("Member");
        expect(created.isActive).toBe(true);
        expect(created.jobDescription).toBe("محاسبة");
        expect(new Date(created.createdAt).getTime()).toBeGreaterThan(Date.now() - 60_000);

        // The address is one account however it is capitalised.
        const client = anonymous();
        shouldSucceed(await client.tryLogin(email.toLowerCase(), "Password123!"));
        expect(shouldSucceed(await client.get("users/me")).data.id).toBe(created.id);
    });

    it("fields the schema does not name are dropped, not written", async () => {
        const admin = await clientAs("admin");

        // What a client would send to hand itself more than it was given.
        const created = shouldSucceed(await admin.post("users", {
            fullName: "Plain Member",
            email: `plain${unique()}@tests.example`,
            password: "Password123!",
            roleName: "Member",
            role: "Admin",
            isActive: false,
            id: "00000000-0000-4000-8000-000000000000",
        })).data;

        expect(created.role).toBe("Member");
        expect(created.isActive).toBe(true);
        expect(created.id).not.toBe("00000000-0000-4000-8000-000000000000");
    });

    it("an address already in use is refused by name, whatever its capitals", async () => {
        const result = await (await clientAs("admin")).post("users", {
            fullName: "Second Member", email: "Member@Example.com", password: "Password123!", roleName: "Member",
        });

        shouldFail(result, 400, "user.email_taken");
        expect(result.args.email).toBe("Member@Example.com"); // the client's message names the address
    });

    it("a role that does not exist is refused", async () => {
        const result = await (await clientAs("admin")).post("users", {
            fullName: "Nobody", email: `nobody${unique()}@tests.example`, password: "Password123!", roleName: "SuperAdmin",
        });

        shouldFail(result, 400, "user.role_unknown");
        expect(result.args.role).toBe("SuperAdmin");
    });

    it.each(["short1!", "nodigitshere!", "nosymbol12345"])("a password that misses the policy is refused: %s", async (password) => {
        const result = await (await clientAs("admin")).post("users", {
            fullName: "Weak Password", email: `weak${unique()}@tests.example`, password, roleName: "Member",
        });

        shouldFail(result, 400, "user.password_rejected");
    });

    it("an update writes only what was sent", async () => {
        const admin = await clientAs("admin");
        const user = await createTestUser();
        const before = shouldSucceed(await admin.get(`users/${user.id}`)).data;

        const after = shouldSucceed(await admin.patch(`users/${user.id}`, { jobDescription: "مدير حسابات" })).data;

        expect(after).toEqual({ ...before, jobDescription: "مدير حسابات" });
        shouldSucceed(await user.client.get("users/me"), "nothing that is in the token changed");

        // Sent empty, a free-text field is cleared; a name sent empty is left alone.
        const cleared = shouldSucceed(await admin.patch(`users/${user.id}`, { jobDescription: "", fullName: "" })).data;
        expect(cleared.jobDescription).toBeNull();
        expect(cleared.fullName).toBe(before.fullName);
    });

    it("an update cannot take somebody else's address", async () => {
        const user = await createTestUser();

        shouldFail(await (await clientAs("admin")).patch(`users/${user.id}`, { email: "member@example.com" }), 400, "user.email_taken");
    });

    it("an unknown account is a 404", async () => {
        const admin = await clientAs("admin");

        // An id nothing has, and one that is not even shaped like an id.
        for (const nobody of [crypto.randomUUID(), "not-an-id"]) {
            shouldFail(await admin.get(`users/${nobody}`), 404, "user.not_found");
            shouldFail(await admin.patch(`users/${nobody}`, { fullName: "Ghost" }), 404, "user.not_found");
            shouldFail(await admin.patch(`users/${nobody}/status`, { isActive: false }), 404, "user.not_found");
            shouldFail(await admin.delete(`users/${nobody}`), 404, "user.not_found");
        }
    });

    it("an administrator cannot lock themselves out", async () => {
        // A second administrator, so the seeded one is never what is at stake.
        const self = await createTestUser("Admin");

        shouldFail(await self.client.patch(`users/${self.id}/status`, { isActive: false }), 400, "user.self_action_forbidden");
        shouldFail(await self.client.delete(`users/${self.id}`), 400, "user.self_action_forbidden");
        shouldFail(await self.client.patch(`users/${self.id}`, { roleName: "Member" }), 400, "user.self_action_forbidden");

        shouldSucceed(await self.client.get("users"), "still an administrator, still signed in");
    });

    it("changing your own password needs the current one", async () => {
        const user = await createTestUser();

        shouldFail(
            await user.client.post("users/me/password", { currentPassword: "Not-My-Password1!", newPassword: "Brand-New-Pass1!" }),
            400, "user.current_password_wrong",
        );
        shouldFail(await user.client.post("users/me/password", { currentPassword: user.password, newPassword: "weak" }), 400, "user.password_rejected");

        shouldSucceed(await user.client.post("users/me/password", { currentPassword: user.password, newPassword: "Brand-New-Pass1!" }));

        shouldFail(await anonymous().tryLogin(user.email, user.password), 401, "auth.invalid_credentials");
        shouldSucceed(await anonymous().tryLogin(user.email, "Brand-New-Pass1!"));
        shouldFail(await user.client.get("users/me"), 401); // every session signs in again, this one included
    });

    it("an administrator can set a password without knowing the old one", async () => {
        const user = await createTestUser();

        shouldSucceed(await (await clientAs("admin")).post(`users/${user.id}/reset-password`, { newPassword: "Set-By-Admin1!" }));

        shouldSucceed(await anonymous().tryLogin(user.email, "Set-By-Admin1!"));
        shouldFail(await anonymous().tryLogin(user.email, user.password), 401, "auth.invalid_credentials");
    });

    it("a deleted account is gone from the list and cannot come back in", async () => {
        const admin = await clientAs("admin");
        const user = await createTestUser();

        shouldSucceed(await admin.delete(`users/${user.id}`));

        expect(itemsOf(await admin.get(`users?search=${user.email}`))).toEqual([]);
        shouldFail(await admin.get(`users/${user.id}`), 404, "user.not_found");
        shouldFail(await user.client.get("users/me"), 401); // the token it was holding stops working too
        shouldFail(await anonymous().tryLogin(user.email, user.password), 401, "auth.account_disabled");

        // Its address stays taken: whatever it wrote still has to say whose it was.
        shouldFail(await admin.post("users", { fullName: "Again", email: user.email, password: "Password123!", roleName: "Member" }), 400, "user.email_taken");
    });
});
