import { randomUUID } from "node:crypto";
import { normalizePage, normalizePageSize, pagedResult } from "../../models/common/pagination.js";
import { defined, newEntity } from "../shared.js";
import { db } from "./knex.js";

const BASE_BOOLEANS = ["isDeleted"];
const BASE_DATES = ["createdAt", "updatedAt", "deletedAt"];

/**
 * The repository every entity gets by default. An entity needs one of its own only when it
 * has queries this cannot express (see userRepository.js, itemRepository.js) - and then it
 * extends this, so the soft-delete rule is still written once.
 *
 *   where    a flat object of equalities; an array value means "any of"
 *   options  { orderBy: [field, "asc" | "desc"], search: { fields, term }, limit, offset }
 */
export class GenericRepository {
    /**
     * @param table     the table's name
     * @param booleans  boolean columns besides isDeleted
     * @param dates     date columns besides createdAt / updatedAt / deletedAt
     */
    constructor({ table, booleans = [], dates = [] }) {
        this.table = table;
        this.booleans = [...BASE_BOOLEANS, ...booleans];
        this.dates = [...BASE_DATES, ...dates];
    }

    /**
     * A row as the rest of the app sees it. The drivers disagree about two types - SQLite
     * and MySQL hand a boolean back as 0/1, and SQLite a date as a number - so both are
     * put right here, once, and nothing above this file knows which database it is on.
     */
    toEntity(row) {
        if (!row) return null;

        const entity = { ...row };
        for (const field of this.booleans) {
            if (field in entity && entity[field] !== null) entity[field] = Boolean(entity[field]);
        }
        for (const field of this.dates) {
            if (field in entity && entity[field] !== null) entity[field] = new Date(entity[field]);
        }
        return entity;
    }

    /** Escape hatch: a knex query over the live rows, for joins/grouping the methods below don't cover. */
    query() {
        return db()(this.table).where(`${this.table}.isDeleted`, false);
    }

    #filtered(where = {}, { search } = {}) {
        const query = this.query();

        for (const [field, value] of Object.entries(defined(where))) {
            const column = `${this.table}.${field}`;
            if (Array.isArray(value)) query.whereIn(column, value);
            else if (value === null) query.whereNull(column);
            else query.where(column, value);
        }

        if (search?.term) {
            query.where((builder) => {
                for (const field of search.fields) builder.orWhereILike(`${this.table}.${field}`, `%${search.term}%`);
            });
        }

        return query;
    }

    async getById(id) {
        if (typeof id !== "string") return null;
        return this.toEntity(await this.query().where(`${this.table}.id`, id).first());
    }

    async find(where = {}, options = {}) {
        const [field, direction] = options.orderBy ?? ["createdAt", "desc"];
        const query = this.#filtered(where, options).orderBy(`${this.table}.${field}`, direction);

        if (options.limit !== undefined) query.limit(options.limit).offset(options.offset ?? 0);

        return (await query).map((row) => this.toEntity(row));
    }

    async firstOrDefault(where = {}) {
        return this.toEntity(await this.#filtered(where).first());
    }

    async count(where = {}, options = {}) {
        const row = await this.#filtered(where, options).count({ count: "*" }).first();
        return Number(row?.count ?? 0);
    }

    /**
     * One page of find(), with the totals a pager needs. The page and its size are taken
     * as they came from the request and clamped here, so a list can never be read whole.
     */
    async page(where = {}, { page: requestedPage, pageSize: requestedSize, ...options } = {}) {
        const page = normalizePage(requestedPage);
        const pageSize = normalizePageSize(requestedSize);

        const [items, totalCount] = await Promise.all([
            this.find(where, { ...options, limit: pageSize, offset: (page - 1) * pageSize }),
            this.count(where, options),
        ]);
        return pagedResult(items, page, pageSize, totalCount);
    }

    async add(entity) {
        const row = defined(newEntity(entity, randomUUID));
        await db()(this.table).insert(row);
        return this.toEntity(row);
    }

    /** Writes only the fields in `patch`. Returns the updated entity, or null when there is no such live row. */
    async update(id, patch) {
        if (typeof id !== "string") return null;

        const changed = await db()(this.table)
            .where({ id, isDeleted: false })
            .update({ ...defined(patch), updatedAt: new Date() });

        return changed ? this.getById(id) : null;
    }

    /** Soft delete (isDeleted/deletedAt), never a real DELETE. */
    async remove(id) {
        if (typeof id !== "string") return false;

        const changed = await db()(this.table)
            .where({ id, isDeleted: false })
            .update({ isDeleted: true, deletedAt: new Date() });

        return changed > 0;
    }
}
