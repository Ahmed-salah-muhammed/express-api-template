import { randomUUID } from "node:crypto";
import { normalizePage, normalizePageSize, pagedResult } from "../../models/common/pagination.js";
import { defined, escapeRegex, newEntity } from "../shared.js";

const toId = (field) => (field === "id" ? "_id" : field);

/**
 * The repository every entity gets by default. An entity needs one of its own only when it
 * has queries this cannot express (see userRepository.js, itemRepository.js) - and then it
 * extends this, so the soft-delete rule is still written once.
 *
 *   where    a flat object of equalities; an array value means "any of"
 *   options  { orderBy: [field, "asc" | "desc"], search: { fields, term }, limit, offset }
 */
export class GenericRepository {
    constructor({ model }) {
        this.model = model;
    }

    /** A document as the rest of the app sees it: a plain object with `id`, not `_id`. */
    toEntity(document) {
        if (!document) return null;

        const { _id, ...rest } = document;
        return { id: _id, ...rest };
    }

    /** The MongoDB filter for the live documents matching `where`. */
    filter(where = {}, { search } = {}) {
        const filter = { isDeleted: false };

        for (const [field, value] of Object.entries(defined(where))) {
            filter[toId(field)] = Array.isArray(value) ? { $in: value } : value;
        }

        if (search?.term) {
            const pattern = { $regex: escapeRegex(search.term), $options: "i" };
            filter.$or = search.fields.map((field) => ({ [field]: pattern }));
        }

        return filter;
    }

    async getById(id) {
        if (typeof id !== "string") return null;
        return this.toEntity(await this.model.findOne({ _id: id, isDeleted: false }).lean());
    }

    async find(where = {}, options = {}) {
        const [field, direction] = options.orderBy ?? ["createdAt", "desc"];
        const query = this.model.find(this.filter(where, options)).sort({ [toId(field)]: direction === "asc" ? 1 : -1 });

        if (options.limit !== undefined) query.skip(options.offset ?? 0).limit(options.limit);

        return (await query.lean()).map((document) => this.toEntity(document));
    }

    async firstOrDefault(where = {}) {
        return this.toEntity(await this.model.findOne(this.filter(where)).lean());
    }

    count(where = {}, options = {}) {
        return this.model.countDocuments(this.filter(where, options));
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
        const { id, ...rest } = defined(newEntity(entity, randomUUID));
        const [document] = await this.model.create([{ _id: id, ...rest }]);
        return this.toEntity(document.toObject());
    }

    /** Writes only the fields in `patch`. Returns the updated entity, or null when there is no such live document. */
    async update(id, patch) {
        if (typeof id !== "string") return null;

        return this.toEntity(
            await this.model
                .findOneAndUpdate({ _id: id, isDeleted: false }, { $set: { ...defined(patch), updatedAt: new Date() } }, { returnDocument: "after" })
                .lean(),
        );
    }

    /** Soft delete (isDeleted/deletedAt), never a real delete. */
    async remove(id) {
        if (typeof id !== "string") return false;

        const result = await this.model.updateOne({ _id: id, isDeleted: false }, { $set: { isDeleted: true, deletedAt: new Date() } });
        return result.modifiedCount > 0;
    }
}
