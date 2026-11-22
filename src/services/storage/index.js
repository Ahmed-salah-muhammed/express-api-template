import { env } from "../../config/env.js";
import { localStorage } from "./localStorage.js";
import { s3Storage } from "./s3Storage.js";

// ------------------- File storage: one contract, two backends -------------------
//
//   upload(buffer, originalName, contentType, folder, descriptor?) -> the URL to store
//   read(fileUrl)   -> the bytes, or null when the URL is not this provider's (or is gone)
//   remove(fileUrl)
//
// `originalName` only lends its extension - the stored name is generated. Build `folder`
// with storagePath.segment() when a part of it comes from user input.

/**
 * The provider STORAGE_PROVIDER selects, and what anything storing a user's file should
 * ask for - that is what makes the setting mean something. A host with no object store
 * leaves it on "local" and every upload still works.
 */
export const storage = env.storage.provider === "s3" ? s3Storage : localStorage;

/**
 * Always the disk, whatever the setting says. Avatars are the deliberate exception that
 * use it: they are served back by this API's own static-file middleware.
 */
export { localStorage };
