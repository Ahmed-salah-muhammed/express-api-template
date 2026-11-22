import { describe, expect, it } from "vitest";
import { clientAs, createTestUser, itemsOf, shouldFail, shouldSucceed, sleep } from "./helpers/api.js";

const createItem = async (client, title) => shouldSucceed(await client.post("items", { title })).data.id;

// The example resource's one rule, from every side: an Admin reads every item and writes
// none; everyone else reads and writes their own. Replace with the application's own rules
// - the shape of these tests is the part worth keeping.
describe("items", () => {
    it("a new item is open and belongs to whoever made it", async () => {
        const owner = await createTestUser();

        const item = shouldSucceed(await owner.client.post("items", { title: "  مراجعة العقد  " })).data;

        expect(item.title).toBe("مراجعة العقد"); // trimmed
        expect(item.status).toBe("Open");
        expect(item.ownerId).toBe(owner.id);
        expect(item.ownerName).toBeTruthy();
        expect(Object.keys(item).sort()).toEqual(["createdAt", "id", "ownerId", "ownerName", "status", "title"]);
    });

    it("everyone sees their own items and nobody else's", async () => {
        const first = await createTestUser();
        const second = await createTestUser();
        const mine = await createItem(first.client, "First's item");
        const theirs = await createItem(second.client, "Second's item");

        const listed = itemsOf(await first.client.get("items")).map((item) => item.id);

        expect(listed).toContain(mine);
        expect(listed).not.toContain(theirs);
    });

    it("the administrator sees every item, newest first", async () => {
        const admin = await clientAs("admin");
        const owner = await createTestUser();
        const older = await createItem(owner.client, "Older");
        await sleep(15);
        const newer = await createItem(owner.client, "Newer");

        const all = itemsOf(await admin.get("items"));
        const listed = all.map((item) => item.id);

        expect(listed).toContain(older);
        expect(listed.indexOf(newer)).toBeLessThan(listed.indexOf(older));
        // The seeded items belong to two different people, and all of them are there.
        expect(new Set(all.map((item) => item.ownerId)).size).toBeGreaterThan(1);
    });

    it("the list filters by status", async () => {
        const owner = await createTestUser();
        await createItem(owner.client, "Stays open");
        const done = await createItem(owner.client, "Gets done");
        shouldSucceed(await owner.client.patch(`items/${done}/status`, { status: "Done" }));

        expect(itemsOf(await owner.client.get("items?status=Done")).map((item) => item.id)).toEqual([done]);
    });

    it("the administrator reads items and does not write them", async () => {
        const admin = await clientAs("admin");
        const owner = await createTestUser();
        const item = await createItem(owner.client, "Not the admin's");

        shouldFail(await admin.post("items", { title: "Admin's own" }), 403, "item.admin_read_only");
        shouldFail(await admin.patch(`items/${item}/status`, { status: "Done" }), 403, "item.not_yours");
        shouldFail(await admin.delete(`items/${item}`), 403, "item.not_yours");
    });

    it("nobody changes or deletes an item that is not theirs", async () => {
        const owner = await createTestUser();
        const stranger = await createTestUser();
        const item = await createItem(owner.client, "Owner's item");

        shouldFail(await stranger.client.patch(`items/${item}/status`, { status: "Done" }), 403, "item.not_yours");
        shouldFail(await stranger.client.delete(`items/${item}`), 403, "item.not_yours");

        expect(itemsOf(await owner.client.get("items"))).toMatchObject([{ id: item, status: "Open" }]);
    });

    it.each(["", "   ", null, undefined])("a title is required: %j", async (title) => {
        shouldFail(await (await clientAs("member")).post("items", { title }), 400, "item.title_required");
    });

    // Not a member; the names are the contract, exactly; an ordinal is not a name.
    it.each(["Archived", "done", "2", 2, "", null, undefined])("a status that is not one of the states is refused: %j", async (status) => {
        const owner = await createTestUser();
        const item = await createItem(owner.client, "Stays as it is");

        shouldFail(await owner.client.patch(`items/${item}/status`, { status }), 400, "item.status_invalid");
    });

    it("a deleted item is gone for good as far as the API is concerned", async () => {
        const owner = await createTestUser();
        const item = await createItem(owner.client, "Short-lived");

        shouldSucceed(await owner.client.delete(`items/${item}`));

        expect(itemsOf(await owner.client.get("items"))).toEqual([]);
        shouldFail(await owner.client.delete(`items/${item}`), 404, "item.not_found");
        shouldFail(await owner.client.patch(`items/${item}/status`, { status: "Done" }), 404, "item.not_found");
    });
});

// One endpoint, scoped to whoever asks.
describe("dashboard", () => {
    it("a member gets the figures of their own items and no user counts", async () => {
        const member = await createTestUser();

        // A new account owns nothing, whatever others own.
        expect(shouldSucceed(await member.client.get("dashboard/summary")).data.items).toBe(0);

        const first = await createItem(member.client, "One");
        await createItem(member.client, "Two");
        await createItem(member.client, "Three");
        shouldSucceed(await member.client.patch(`items/${first}/status`, { status: "InProgress" }));

        // How many accounts exist is not a member's to know: the keys are not there at all.
        expect(shouldSucceed(await member.client.get("dashboard/summary")).data)
            .toEqual({ items: 3, openItems: 2, inProgressItems: 1, doneItems: 0 });
    });

    it("the administrator gets the whole system", async () => {
        const summary = shouldSucceed(await (await clientAs("admin")).get("dashboard/summary")).data;

        // "At least", not "exactly": other tests legitimately add accounts and items, and
        // a suite that breaks when a sibling creates a row is testing the wrong thing.
        expect(summary.users).toBeGreaterThanOrEqual(4); // the four seeded accounts
        expect(summary.activeUsers).toBeLessThan(summary.users); // one of them is suspended
        expect(summary.items).toBeGreaterThanOrEqual(5); // the five seeded items
        expect(summary.openItems + summary.inProgressItems + summary.doneItems).toBe(summary.items);
    });
});
