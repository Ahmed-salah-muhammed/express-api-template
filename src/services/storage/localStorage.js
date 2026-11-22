import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";
import { decodeKey, encodeKey, fileName } from "./storagePath.js";

// Stores files on the app server itself under uploadsDir/{folder}/, served back at
// /uploads by express.static (app.js). In a container that directory is a mounted volume.

export const uploadsRoot = path.resolve(env.storage.uploadsDir);

/**
 * The file on disk behind a stored URL, or null when the path would leave the uploads tree
 * - a stored URL is data, and a crafted one must not be able to name any file on the server.
 */
function resolveUploadPath(fileUrl) {
    if (typeof fileUrl !== "string" || !fileUrl.startsWith("/uploads/")) return null;

    let key;
    try {
        key = decodeKey(fileUrl.slice("/uploads/".length));
    } catch {
        return null;
    }

    const fullPath = path.resolve(uploadsRoot, key);
    return fullPath.startsWith(uploadsRoot + path.sep) ? fullPath : null;
}

export const localStorage = {
    async upload(buffer, originalName, contentType, folder, descriptor = null) {
        const directory = path.join(uploadsRoot, folder);
        await fs.mkdir(directory, { recursive: true });

        const name = fileName(path.extname(originalName), new Date(), descriptor);
        await fs.writeFile(path.join(directory, name), buffer);

        // A root-relative path, not an absolute URL. This value is *stored*, so baking
        // "{scheme}://{host}" into it would make the row valid only for the host that
        // happened to serve the upload: behind a proxy it records the proxy's idea of the
        // host, and it rots again the day the domain changes. Relative is correct at any
        // origin; the client resolves it against the host it is already talking to.
        return `/uploads/${encodeKey(`${folder}/${name}`)}`;
    },

    async read(fileUrl) {
        const fullPath = resolveUploadPath(fileUrl);
        if (!fullPath) return null;

        try {
            return await fs.readFile(fullPath);
        } catch {
            return null;
        }
    },

    async remove(fileUrl) {
        const fullPath = resolveUploadPath(fileUrl);
        if (fullPath) await fs.rm(fullPath, { force: true });
    },
};
