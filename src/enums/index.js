// ------------------- The domain's enums -------------------
// The values are the contract: they are what is stored, what travels in JSON and what the
// client switches on. They are stored as these names, never as ordinals, so reordering or
// inserting a member never changes the meaning of a row already written.

/**
 * The roles an account can hold - exactly one each. Adding a role is a member here (and,
 * if it should have one, a demo account in data/seeder.js); the client's navigation and
 * route guards key on the same string.
 */
export const UserRole = Object.freeze({
    Admin: "Admin",
    Member: "Member",
});
export const USER_ROLES = Object.freeze(Object.values(UserRole));

/** The example resource's states. */
export const ItemStatus = Object.freeze({
    Open: "Open",
    InProgress: "InProgress",
    Done: "Done",
});
export const ITEM_STATUSES = Object.freeze(Object.values(ItemStatus));

/** What an uploaded file turned out to be, judged by its bytes (services/common/fileSniffer.js). */
export const FileKind = Object.freeze({
    Image: "Image",
    Video: "Video",
    Pdf: "Pdf",
    Document: "Document",
});
