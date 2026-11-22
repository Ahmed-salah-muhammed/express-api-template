import { normalize, withNormalized } from "../shared.js";
import { GenericRepository } from "./genericRepository.js";
import { db } from "./knex.js";

// A repository of its own, and the reason is the reason to add another: the generic one
// cannot express these queries - lookups that must also see soft-deleted accounts, and a
// search across three columns.
export class UserRepository extends GenericRepository {
    constructor() {
        super({ table: "users", booleans: ["isActive"], dates: ["lockoutEnd", "resetTokenExpiresAt"] });
    }

    // By address or username an account is found even when it is soft-deleted: its
    // address stays taken, and a sign-in to it is "disabled", not "no such account".
    async findByEmail(email) {
        return this.toEntity(await db()("users").where({ normalizedEmail: normalize(email) }).first());
    }

    async findByUsername(username) {
        return this.toEntity(await db()("users").where({ normalizedUsername: normalize(username) }).first());
    }

    /** By id, deleted or not - for the seeder, which must not re-create what was deleted. */
    async findByIdIncludingDeleted(id) {
        return this.toEntity(await db()("users").where({ id }).first());
    }

    findFiltered({ role, isActive, search } = {}) {
        return this.find(
            { role: role || undefined, isActive },
            { orderBy: ["createdAt", "asc"], search: search ? { fields: ["fullName", "email", "username"], term: search } : undefined },
        );
    }

    add(user) {
        return super.add(withNormalized(user));
    }

    update(id, patch) {
        return super.update(id, withNormalized(patch));
    }
}
