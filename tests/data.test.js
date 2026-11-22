import { describe, expect, it } from "vitest";
import { closeDemoAccounts, ensureAdministrator } from "../src/data/seedAccountGuard.js";
import { seedDemoData } from "../src/data/seeder.js";
import { anonymous, clientAs, createTestUser, itemsOf, SEED_PASSWORD, SEED_USERS, shouldFail, shouldSucceed, unitOfWork } from "./helpers/api.js";

// The data layer on its own terms. These run against whichever database the suite is on,
// so they are also what proves a provider keeps the promises the services rely on.

const newItem = (ownerId, title) => unitOfWork.items.add({ title, status: "Open", ownerId });

describe("repositories", () => {
    it("an entity comes back with real dates and booleans, whatever the database stores", async () => {
        const owner = await createTestUser();
        const added = await newItem(owner.id, "Typed");

        for (const item of [added, await unitOfWork.items.getById(added.id)]) {
            expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
            expect(item.createdAt).toBeInstanceOf(Date);
            expect(Math.abs(item.createdAt.getTime() - Date.now())).toBeLessThan(60_000); // and it is the right instant
            expect(item.isDeleted).toBe(false);
            expect(item.updatedAt).toBeNull();
        }

        const user = await unitOfWork.users.getById(owner.id);
        expect(user.isActive).toBe(true);
        expect(user.lockoutEnd).toBeNull();
    });

    it("update writes only the patch and stamps the change", async () => {
        const owner = await createTestUser();
        const item = await newItem(owner.id, "Before");

        const updated = await unitOfWork.items.update(item.id, { title: "After", status: undefined });

        expect(updated).toMatchObject({ id: item.id, title: "After", status: "Open", ownerId: owner.id });
        expect(updated.updatedAt).toBeInstanceOf(Date);
        expect(await unitOfWork.items.update(crypto.randomUUID(), { title: "Nobody" })).toBeNull();
    });

    it("a removed entity is gone from every read, and stays in the table", async () => {
        const owner = await createTestUser();
        const item = await newItem(owner.id, "Soft-deleted");

        expect(await unitOfWork.items.remove(item.id)).toBe(true);
        expect(await unitOfWork.items.remove(item.id)).toBe(false); // already gone

        expect(await unitOfWork.items.getById(item.id)).toBeNull();
        expect(await unitOfWork.items.find({ ownerId: owner.id })).toEqual([]);
        expect(await unitOfWork.items.count({ ownerId: owner.id })).toBe(0);
        expect(await unitOfWork.items.update(item.id, { title: "Revived" })).toBeNull();
    });

    it("find filters, searches, orders and pages", async () => {
        const owner = await createTestUser();
        const other = await createTestUser();
        for (const title of ["Alpha needle", "Beta", "Gamma NEEDLE", "Delta"]) await newItem(owner.id, title);
        await newItem(other.id, "Someone else's needle");

        const mine = { ownerId: owner.id };
        const byTitle = { orderBy: ["title", "asc"] };

        expect((await unitOfWork.items.find(mine, byTitle)).map((item) => item.title)).toEqual(["Alpha needle", "Beta", "Delta", "Gamma NEEDLE"]);
        expect(await unitOfWork.items.count({ ownerId: [owner.id, other.id] })).toBe(5); // an array means "any of"

        // Case does not matter, on any database.
        const search = { fields: ["title"], term: "needle" };
        expect((await unitOfWork.items.find(mine, { ...byTitle, search })).map((item) => item.title)).toEqual(["Alpha needle", "Gamma NEEDLE"]);

        const page = await unitOfWork.items.page(mine, { ...byTitle, page: 2, pageSize: 3 });
        expect(page.items.map((item) => item.title)).toEqual(["Gamma NEEDLE"]);
        expect(page).toMatchObject({ page: 2, pageSize: 3, totalCount: 4, totalPages: 2, hasPrevious: true, hasNext: false });

        // Straight from a query string, missing or absurd: the repository is what clamps it.
        expect(await unitOfWork.items.page(mine, { page: "0", pageSize: "100000" })).toMatchObject({ page: 1, pageSize: 100, totalCount: 4 });
        expect(await unitOfWork.items.page(mine)).toMatchObject({ page: 1, pageSize: 20 });

        expect((await unitOfWork.items.firstOrDefault({ ownerId: owner.id, title: "Beta" })).title).toBe("Beta");
        expect(await unitOfWork.items.firstOrDefault({ ownerId: owner.id, title: "Nope" })).toBeNull();
    });

    it("an unregistered entity is a clear error, not a silent empty repository", () => {
        expect(() => unitOfWork.repository("unicorns")).toThrow(/No entity "unicorns"/);
        expect(unitOfWork.repository("items")).toBe(unitOfWork.items);
    });
});

describe("unit of work", () => {
    it("a transaction that throws leaves nothing behind", async () => {
        const owner = await createTestUser();

        await expect(unitOfWork.transaction(async () => {
            await newItem(owner.id, "Written, then rolled back");
            await unitOfWork.users.update(owner.id, { jobDescription: "Changed, then rolled back" });
            throw new Error("boom");
        })).rejects.toThrow("boom");

        expect(itemsOf(await owner.client.get("items"))).toEqual([]);
        expect((await unitOfWork.users.getById(owner.id)).jobDescription).toBeNull();
    });

    it("a transaction that returns commits, and hands its result back", async () => {
        const owner = await createTestUser();

        const title = await unitOfWork.transaction(async () => {
            // A transaction inside a transaction joins it rather than starting another.
            const item = await unitOfWork.transaction(() => newItem(owner.id, "Committed"));
            return item.title;
        });

        expect(title).toBe("Committed");
        expect(itemsOf(await owner.client.get("items")).map((item) => item.title)).toEqual(["Committed"]);
    });
});

describe("seed data", () => {
    it("seeding again changes nothing", async () => {
        const before = await unitOfWork.users.count();

        expect(await seedDemoData(unitOfWork)).toBe(false);
        expect(await unitOfWork.users.count()).toBe(before);
    });

    it("a production start closes an account that still holds the published password, and no other", async () => {
        const demo = await createTestUser("Member", SEED_PASSWORD);
        const real = await createTestUser("Member", "Their-Own-Pass1!");

        // Pointed at these two rather than at the seeded accounts the suite signs in with.
        expect(await closeDemoAccounts(unitOfWork, [demo.id, real.id])).toBe(1);

        shouldFail(await demo.client.get("users/me"), 401);
        shouldFail(await anonymous().tryLogin(demo.email, SEED_PASSWORD), 401);
        expect(shouldSucceed(await (await clientAs("admin")).get(`users/${demo.id}`)).data.isActive).toBe(false);

        shouldSucceed(await real.client.get("users/me"));
        expect(await closeDemoAccounts(unitOfWork, [demo.id, real.id])).toBe(0); // a no-op once done
    });

    it("an administrator that exists is left alone", async () => {
        expect(await ensureAdministrator(unitOfWork, { email: "someone@tests.example", password: "" })).toBe(false);
        expect(await unitOfWork.users.findByEmail("someone@tests.example")).toBeNull();
    });

    it("with no administrator, the bootstrap account is created - or the start is refused", async () => {
        // A stand-in for an empty users table: the real one always has the seeded admin.
        const added = [];
        const empty = { users: { count: async () => 0, findByEmail: async () => null, add: async (user) => added.push(user) } };

        await expect(ensureAdministrator(empty, { email: "root@tests.example", password: "" })).rejects.toThrow(/BOOTSTRAP_ADMIN_PASSWORD/);
        await expect(ensureAdministrator(empty, { email: "root@tests.example", password: "weak" })).rejects.toThrow(/rejected/);

        expect(await ensureAdministrator(empty, { email: "root@tests.example", password: "A-Real-Pass1!" })).toBe(true);
        expect(added).toHaveLength(1);
        expect(added[0]).toMatchObject({ email: "root@tests.example", role: "Admin", isActive: true });
        expect(added[0].passwordHash).not.toContain("A-Real-Pass1!");
    });

    it("the seeded ids are the ones the guard watches", () => {
        expect(Object.keys(SEED_USERS)).toEqual(["admin", "member", "sara", "omar"]);
    });
});
