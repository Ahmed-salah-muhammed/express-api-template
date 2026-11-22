import { fail } from "../models/common/apiResponse.js";
import { ErrorCodes } from "../models/common/errorCodes.js";
import { respond } from "../utils/respond.js";

/**
 * Checks a request against its schemas before the controller runs.
 *
 *   router.post("/", validate({ body: createUserSchema }), controller.createUser)
 *
 * On success `req.body` is replaced by the parsed value (trimmed, unknown keys dropped) and
 * the parsed query is put on `req.validatedQuery` (Express 5 makes req.query read-only).
 * On failure the answer is the same envelope as every other failure: code
 * "validation.fields", the field names in Args (what the client's message interpolates)
 * and each field's messages in Data.
 */
export const validate = ({ body, query } = {}) => (req, res, next) => {
    const errors = {};

    const collect = (error) => {
        for (const issue of error.issues) {
            const field = issue.path.length > 0 ? String(issue.path[0]) : "body";
            (errors[field] ??= []).push(issue.message);
        }
    };

    if (body) {
        // No body at all is an empty object - its required fields are then named one by
        // one. A body that is not an object has no fields to name.
        const source = req.body ?? {};
        if (typeof source !== "object" || Array.isArray(source)) {
            return respond(res, fail(ErrorCodes.ValidationMalformed, "The request body is missing or malformed."));
        }

        const parsed = body.safeParse(source);
        if (parsed.success) req.body = parsed.data;
        else collect(parsed.error);
    }

    if (query) {
        const parsed = query.safeParse(req.query ?? {});
        if (parsed.success) req.validatedQuery = parsed.data;
        else collect(parsed.error);
    }

    const fields = Object.keys(errors);
    if (fields.length > 0) {
        return respond(res, fail(ErrorCodes.ValidationFields, "Validation failed.", { fields: fields.join(", ") }, errors));
    }

    next();
};
