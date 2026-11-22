import { fail } from "../models/common/apiResponse.js";
import { ErrorCodes } from "../models/common/errorCodes.js";
import { unitOfWork } from "../repositories/index.js";
import { verifyToken } from "../utils/jwt.js";
import { respond } from "../utils/respond.js";

const unauthorized = (res) => respond(res, fail(ErrorCodes.Unauthorized, "Unauthorized."));

/**
 * Who the caller is. Puts `req.user = { id, role }` on the request, or answers 401.
 *
 * A signature only proves the token was ours when it was issued. Tokens live for days, so
 * without the lookup below an admin suspending an account is telling the user to stop - not
 * making them stop - and a deleted user keeps working until the token expires. The whole
 * point of the suspend button is that access ends now.
 *
 * The cost is one lookup by primary key per authenticated request, which is the accepted
 * price of not maintaining a revocation list.
 */
export async function authenticate(req, res, next) {
    const match = /^Bearer\s+(\S+)$/i.exec(req.get("authorization") ?? "");
    if (!match) return unauthorized(res);

    let payload;
    try {
        payload = verifyToken(match[1]);
    } catch {
        return unauthorized(res);
    }

    if (typeof payload?.sub !== "string") return unauthorized(res);

    // Soft-deleted accounts are not found at all.
    const account = await unitOfWork.users.getById(payload.sub);
    if (!account || !account.isActive) return unauthorized(res);

    // A role change or a new password rotates the stamp; a token carrying the old one is
    // refused, so the change takes effect now and not when the token expires. A token with
    // no stamp at all is not one of ours.
    if (typeof payload.stamp !== "string" || payload.stamp !== account.securityStamp) return unauthorized(res);

    // The role comes from the token: the stamp check above is what keeps it current.
    req.user = { id: account.id, role: payload.role };
    next();
}

/**
 * Which roles may call an endpoint at all - and nothing more. Which *rows* a caller then
 * sees or changes is the service's decision, from (callerId, callerRole).
 */
export const authorize = (...roles) => (req, res, next) =>
    roles.includes(req.user?.role) ? next() : respond(res, fail(ErrorCodes.Forbidden, "Forbidden."));
