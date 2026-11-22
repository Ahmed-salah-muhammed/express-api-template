// What both providers agree on, so an entity looks the same whichever database holds it.

/** The spelling an e-mail address or a username is compared and indexed under. */
export const normalize = (value) => String(value ?? "").trim().toLowerCase();

/**
 * Keeps the normalized copies in step: whenever a write carries `email` or `username`, it
 * carries the lookup spelling too. Uniqueness is on the normalized columns, which is what
 * makes it case-insensitive on every database rather than on the ones whose collation
 * happens to be.
 */
export function withNormalized(user) {
    const result = { ...user };
    if (typeof user.email === "string") result.normalizedEmail = normalize(user.email);
    if (typeof user.username === "string") result.normalizedUsername = normalize(user.username);
    return result;
}

/** Drops undefined values: "not sent" must never be written as NULL. */
export const defined = (object) =>
    Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));

export const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The fields every entity has (the BaseEntity of this codebase): an id, when the row was
 * written and changed, and the soft-delete pair. Nothing is ever DELETEd - remove() sets
 * isDeleted, and every read through a repository leaves those rows out.
 */
export const newEntity = (entity, randomId) => ({
    id: entity.id ?? randomId(),
    ...entity,
    createdAt: entity.createdAt ?? new Date(),
    updatedAt: entity.updatedAt ?? null,
    isDeleted: false,
    deletedAt: null,
});
