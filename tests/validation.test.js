import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { perMinute } from "../src/middlewares/rateLimit.js";
import { clientAs, createTestUser, shouldFail, shouldSucceed } from "./helpers/api.js";

// A request that fails validation never reaches its controller - and still has to be
// answered in the envelope, with a code the client can translate and the fields to name.
describe("validation", () => {
    it("missing fields are named", async () => {
        const result = shouldFail(await (await clientAs("admin")).post("users", { jobDescription: "nothing else" }), 400, "validation.fields");

        expect(result.args.fields.split(", ").sort()).toEqual(["email", "fullName", "password", "roleName"]);
        // The per-field messages ride along for whoever wants more than the names.
        expect(result.data.email.length).toBeGreaterThan(0);
    });

    it("no body at all names the required fields too", async () => {
        const result = shouldFail(await (await clientAs("admin")).post("users"), 400, "validation.fields");

        expect(result.args.fields).toContain("email");
    });

    // A plain required string would let the first one through.
    it.each(["   ", "not-an-address"])("a field that is present but wrong is named: %j", async (email) => {
        const result = await (await clientAs("admin")).post("users", { fullName: "Somebody", email, password: "Password123!", roleName: "Member" });

        expect(shouldFail(result, 400, "validation.fields").args.fields).toBe("email");
    });

    it("a value of the wrong type names its field", async () => {
        const result = await (await clientAs("admin")).post(`users/${crypto.randomUUID()}/reset-password`, { newPassword: 12345 });

        expect(shouldFail(result, 400, "validation.fields").args.fields).toBe("newPassword");
    });

    it.each(["{ this is not json", "[1, 2, 3]", '"just a string"'])("a body that is not a JSON object is answered in the envelope: %s", async (body) => {
        const result = shouldFail(await (await clientAs("admin")).postRaw("users", body), 400, "validation.malformed");

        expect(result.message).toBeTruthy();
    });

    it("an unknown value in the query is a validation failure, not an empty list", async () => {
        const member = await clientAs("member");

        expect(shouldFail(await member.get("items?status=Archived"), 400, "validation.fields").args.fields).toBe("status");
        expect(shouldFail(await (await clientAs("admin")).get("users?isActive=maybe"), 400, "validation.fields").args.fields).toBe("isActive");
    });
});

describe("rate limit", () => {
    it("the requests over the limit get a 429 in the envelope", async () => {
        // The limiter on a tiny app of its own, with a limit of its own: the real one is
        // raised out of the way for the run, since every test comes from one address.
        const probe = express();
        probe.post("/reset", perMinute(2), (req, res) => res.json({ success: true }));

        expect((await request(probe).post("/reset")).status).toBe(200);
        expect((await request(probe).post("/reset")).status).toBe(200);

        const third = await request(probe).post("/reset");
        expect(third.status).toBe(429);
        expect(third.body).toMatchObject({ success: false, code: "http.too_many_requests" });
    });
});

// The one upload in the template, end to end: sniffed by its bytes, stored through the
// storage service, served back by the static-file middleware.
describe("profile picture", () => {
    // The eight-byte PNG signature, then enough of anything to be a file.
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

    const upload = (client, buffer, name, type = "image/png") => client.upload("users/me/photo", "file", buffer, name, type);

    it("a picture is stored, served, replaced and removed", async () => {
        const user = await createTestUser();

        const first = shouldSucceed(await upload(user.client, png, "me.png")).data.profilePictureUrl;

        // Root-relative, so the row is right at any origin - never "{scheme}://{host}/...".
        expect(first).toMatch(new RegExp(`^/uploads/users/${user.id}/[0-9a-f-]{36}-\\d{4}-\\d{2}-\\d{2}\\.png$`));
        expect(await user.client.statusOf(first)).toBe(200);
        expect(shouldSucceed(await user.client.get("users/me")).data.profilePictureUrl).toBe(first);

        const second = shouldSucceed(await upload(user.client, png, "again.png")).data.profilePictureUrl;

        expect(second).not.toBe(first);
        expect(await user.client.statusOf(first)).toBe(404); // the picture it replaced is deleted, not left behind

        shouldSucceed(await user.client.delete("users/me/photo"));

        expect(await user.client.statusOf(second)).toBe(404);
        expect(shouldSucceed(await user.client.get("users/me")).data.profilePictureUrl).toBeNull();
    });

    it("what a file is comes from its bytes, not from its name", async () => {
        const user = await createTestUser();
        const script = Buffer.from("<script>alert('not an image')</script>");

        // Named and typed as an image by the client, which chooses both.
        shouldFail(await upload(user.client, script, "photo.png"), 400, "file.content_mismatch");

        // A real image under a name that is not on the list.
        shouldFail(await upload(user.client, png, "photo.exe"), 400, "file.type_not_allowed");

        // A PNG uploaded as "photo.jpg" is stored and served as what it is.
        expect(shouldSucceed(await upload(user.client, png, "photo.jpg", "image/jpeg")).data.profilePictureUrl).toMatch(/\.png$/);
    });

    it("no file, an empty file and one over the limit are each refused by name", async () => {
        const user = await createTestUser();

        expect(shouldFail(await user.client.post("users/me/photo"), 400, "validation.fields").args.fields).toBe("file");
        shouldFail(await upload(user.client, Buffer.alloc(0), "empty.png"), 400, "file.empty");

        const tooLarge = Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]);
        expect(shouldFail(await upload(user.client, tooLarge, "huge.png"), 400, "file.too_large").args.limitMb).toBe(5);
    });
});
