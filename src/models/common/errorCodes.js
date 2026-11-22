// ------------------- Every code the API can put on a failure -------------------
// The frontend keeps a translation for each under errors:<code> in both of its locale
// files, so a new failure is a constant here and two JSON lines there. Keep the strings
// stable - they are the contract, the names on the left are not.
export const ErrorCodes = Object.freeze({
    Generic: "generic",
    Unauthorized: "http.unauthorized",
    Forbidden: "http.forbidden",
    NotFound: "http.not_found",
    PayloadTooLarge: "http.payload_too_large",
    TooManyRequests: "http.too_many_requests",

    // Request validation, answered before the controller runs (middlewares/validate.js).
    // Args carries "fields" - the offending property names, comma-separated.
    ValidationFields: "validation.fields",
    ValidationMalformed: "validation.malformed",

    AuthInvalidCredentials: "auth.invalid_credentials",
    AuthAccountLocked: "auth.account_locked",
    AuthAccountDisabled: "auth.account_disabled",
    AuthResetTokenInvalid: "auth.reset_token_invalid",

    UserNotFound: "user.not_found",
    UserEmailTaken: "user.email_taken", // args: email
    UserUsernameTaken: "user.username_taken",
    UserRoleUnknown: "user.role_unknown", // args: role
    // Suspending, deleting or re-roling the account you are signed in with.
    UserSelfActionForbidden: "user.self_action_forbidden",
    UserCurrentPasswordWrong: "user.current_password_wrong",
    // The password misses the policy - which rules, in the message.
    UserPasswordRejected: "user.password_rejected",

    FileEmpty: "file.empty",
    FileTypeNotAllowed: "file.type_not_allowed",
    // The bytes are not what the name says they are.
    FileContentMismatch: "file.content_mismatch",
    FileTooLarge: "file.too_large", // args: limitMb

    // The object store is a separate process and can simply be down; the caller needs to
    // know their file did not land, which is not the same as a rejected file.
    StorageUnavailable: "storage.unavailable",

    // The example resource - these go when it does.
    ItemNotFound: "item.not_found",
    ItemNotYours: "item.not_yours",
    ItemAdminReadOnly: "item.admin_read_only",
    ItemTitleRequired: "item.title_required",
    ItemStatusInvalid: "item.status_invalid",

    // [new-feature:error-code] - scripts/new-feature.mjs adds the next feature's codes above this line
});

const STATUS = {
    [ErrorCodes.Unauthorized]: 401,
    [ErrorCodes.AuthInvalidCredentials]: 401,
    [ErrorCodes.AuthAccountLocked]: 401,
    [ErrorCodes.AuthAccountDisabled]: 401,

    [ErrorCodes.Forbidden]: 403,
    [ErrorCodes.ItemNotYours]: 403,
    [ErrorCodes.ItemAdminReadOnly]: 403,

    [ErrorCodes.PayloadTooLarge]: 413,
    [ErrorCodes.TooManyRequests]: 429,
    [ErrorCodes.Generic]: 500,
};

/**
 * The HTTP status a failure travels with. Services stay ignorant of HTTP; this is the only
 * table that maps one to the other. Anything ending in ".not_found" is a 404 without being
 * listed, and anything not listed is a 400 - so a new code only needs a line above when it
 * means "not allowed" or "not signed in".
 */
export function httpStatus(code) {
    if (typeof code !== "string") return 400;
    if (STATUS[code]) return STATUS[code];
    return code.endsWith(".not_found") ? 404 : 400;
}
