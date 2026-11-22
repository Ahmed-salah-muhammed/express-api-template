import mongoose from "mongoose";
import { entitySchema } from "./base.js";

// The example resource - replace with the application's own models.
const schema = entitySchema(
    {
        title: { type: String, required: true },
        status: { type: String, required: true },
        ownerId: { type: String, required: true },
    },
    "items",
);

// The list is always "this owner's items, newest first".
schema.index({ ownerId: 1, createdAt: -1 });

export const ItemModel = mongoose.model("Item", schema);
