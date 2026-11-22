import multer from "multer";
import { env } from "../config/env.js";
import { fail } from "../models/common/apiResponse.js";
import { ErrorCodes } from "../models/common/errorCodes.js";
import { respond } from "../utils/respond.js";

// Uploads are held in memory and handed to the service as a buffer: the service sniffs the
// bytes and decides where the file goes (services/storage), so nothing touches the disk before
// it has been judged. The cap keeps a request from holding more than this in memory;
// a feature with a smaller limit of its own (an avatar) checks that itself.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.storage.maxUploadMb * 1024 * 1024, files: 1 },
});

/** One multipart file under `field`, on `req.file` ({ originalname, mimetype, size, buffer }). */
export const uploadSingle = (field) => (req, res, next) =>
    upload.single(field)(req, res, (err) => {
        if (err) return next(err);

        if (!req.file) {
            return respond(res, fail(ErrorCodes.ValidationFields, "Validation failed.", { fields: field }, { [field]: ["A file is required."] }));
        }

        next();
    });
