import { randomUUID } from "node:crypto";
import multer from "multer";
import { env } from "../config/env.js";
import { fail } from "../models/common/apiResponse.js";
import { ErrorCodes } from "../models/common/errorCodes.js";
import { logger } from "../utils/logger.js";
import { respond } from "../utils/respond.js";

/** A correlation id on every request: it is what ties a 500 the user saw to its log line. */
export function requestId(req, res, next) {
    req.id = randomUUID();
    next();
}

/** No route matched. */
export const notFound = (req, res) => respond(res, fail(ErrorCodes.NotFound, "Not found."));

/**
 * The last resort. Expected business failures never get here - a service returns a failed
 * ApiResponse for those. This catches what nobody expected (Express 5 forwards a rejected
 * async handler here by itself) and turns it into a 500 in the same envelope as everything
 * else. The few framework errors that are really the client's doing are answered as such.
 */
// eslint-disable-next-line no-unused-vars -- Express recognises an error handler by its four parameters.
export function errorHandler(err, req, res, next) {
    if (res.headersSent) return;

    // express.json(): the body was not JSON, or was bigger than it accepts.
    if (err?.type === "entity.parse.failed") {
        return respond(res, fail(ErrorCodes.ValidationMalformed, "The request body is missing or malformed."));
    }
    if (err?.type === "entity.too.large") {
        return respond(res, fail(ErrorCodes.PayloadTooLarge, "The request is too large."));
    }

    // multer: the upload broke one of its limits.
    if (err instanceof multer.MulterError) {
        return err.code === "LIMIT_FILE_SIZE"
            ? respond(res, fail(ErrorCodes.FileTooLarge, `File size must not exceed ${env.storage.maxUploadMb}MB.`, { limitMb: env.storage.maxUploadMb }))
            : respond(res, fail(ErrorCodes.ValidationFields, "Validation failed.", { fields: err.field ?? "file" }));
    }

    logger.error(`Unhandled error on ${req.method} ${req.originalUrl}. CorrelationId: ${req.id}`, err);

    // The error's message never crosses the wire. It routinely carries the things that
    // must not leave the server: SQL text and column names, the storage endpoint and
    // bucket, absolute file paths, and - when a connection string fails to parse - the
    // connection string itself. It is in the log above, which is where an operator should
    // read it; the correlation id lets a user quote it without being handed internals.
    respond(res, fail(ErrorCodes.Generic, "An internal server error occurred. Please try again later.", null, { correlationId: req.id }));
}
