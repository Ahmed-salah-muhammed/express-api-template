import { defined } from "../shared.js";
import { GenericRepository } from "./genericRepository.js";

export class ItemRepository extends GenericRepository {
    constructor() {
        super({ table: "items" });
    }

    /**
     * Items with their owner's name, newest first. Only the columns the list shows are
     * read, and the name comes from a join rather than from a query per row.
     */
    async listWithOwner(where = {}) {
        const rows = await this.query()
            .join("users", "users.id", "items.ownerId")
            .where(Object.fromEntries(Object.entries(defined(where)).map(([field, value]) => [`items.${field}`, value])))
            .select("items.id", "items.title", "items.status", "items.ownerId", "items.createdAt", "users.fullName as ownerName")
            .orderBy("items.createdAt", "desc");

        return rows.map((row) => this.toEntity(row));
    }

    /** { status: count } - counted by the database, one row per status, never by loading the items. */
    async countByStatus(where = {}) {
        const rows = await this.query().where(defined(where)).select("status").count({ count: "*" }).groupBy("status");

        return Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));
    }
}
