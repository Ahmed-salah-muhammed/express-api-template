import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import { fail } from "../models/common/apiResponse.js";
import { ErrorCodes } from "../models/common/errorCodes.js";
import { respond } from "../utils/respond.js";

/** At most `limit` requests per minute from one client address; the rest get a 429 in the envelope. */
export const perMinute = (limit) =>
    rateLimit({
        windowMs: 60_000,
        limit,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        handler: (req, res) => respond(res, fail(ErrorCodes.TooManyRequests, "Too many requests. Try again in a minute.")),
    });

/**
 * The password-reset endpoints are anonymous and one of them sends mail, so a script must
 * not be able to turn them into a free mail cannon. Sign-in is not limited here: the
 * lockout already stops guessing, per account, which an address-based limit cannot do.
 */
export const passwordResetRateLimit = perMinute(env.passwordResetsPerMinute);
