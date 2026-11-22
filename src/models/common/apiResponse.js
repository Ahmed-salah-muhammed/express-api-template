// ------------------- The envelope every endpoint answers in -------------------
// { success, message, data, code, args } - success or failure. Every service function
// returns one; a controller only turns it into a status code (utils/respond.js).
//
// `code` is the stable, language-neutral identifier of a failure (errorCodes.js): the
// client translates it and interpolates `args`. `message` stays English, for logs and tests.

export const ok = (message, data = null) => ({ success: true, message, data, code: null, args: null });

export const fail = (code, message, args = null, data = null) => ({ success: false, message, data, code, args });
