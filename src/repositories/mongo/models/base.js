import { Schema } from "mongoose";

/**
 * The fields every entity has. `_id` is a UUID string rather than an ObjectId, so an id
 * looks the same to the services, the API and the client whichever database holds it; the
 * repository shows it as `id`.
 */
export const baseFields = {
    _id: { type: String, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, required: true, default: false },
    deletedAt: { type: Date, default: null },
};

/** A schema with the base fields and no `__v`: the repository owns the timestamps. */
export const entitySchema = (fields, collection) =>
    new Schema({ ...baseFields, ...fields }, { collection, versionKey: false });
