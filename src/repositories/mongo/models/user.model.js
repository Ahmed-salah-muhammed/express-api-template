import mongoose from "mongoose";
import { entitySchema } from "./base.js";

const schema = entitySchema(
    {
        fullName: { type: String, required: true },
        username: { type: String, required: true },
        email: { type: String, required: true },
        // The lower-cased copies are what is looked up and what is unique, so "Sara@x.com"
        // and "sara@x.com" are one account.
        normalizedUsername: { type: String, required: true, unique: true },
        normalizedEmail: { type: String, required: true, unique: true },
        passwordHash: { type: String, required: true },
        role: { type: String, required: true, index: true },
        isActive: { type: Boolean, required: true, default: true },
        jobDescription: { type: String, default: null },
        phoneNumber: { type: String, default: null },
        profilePictureUrl: { type: String, default: null },

        // Rotated whenever the role or the password changes; a token carries it.
        securityStamp: { type: String, required: true },
        accessFailedCount: { type: Number, required: true, default: 0 },
        lockoutEnd: { type: Date, default: null },
        resetTokenHash: { type: String, default: null },
        resetTokenExpiresAt: { type: Date, default: null },
    },
    "users",
);

export const UserModel = mongoose.model("User", schema);
