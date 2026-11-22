import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.js";
import { fail, ok } from "../../models/common/apiResponse.js";
import { ErrorCodes } from "../../models/common/errorCodes.js";
import { unitOfWork } from "../../repositories/index.js";
import { signToken } from "../../utils/jwt.js";
import { logger } from "../../utils/logger.js";
import { hashPassword, passwordProblems, verifyPassword } from "../../utils/password.js";
import { sendPasswordResetEmail } from "../email/emailService.js";

const RESET_TOKEN_MINUTES = 60;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

// Verified against when there is no such account, so "no such user" costs the same time
// as "wrong password" and the difference cannot be measured from outside.
let dummyHash = null;

// ------------------------------------------------------------------ sign-in

export const loginByEmail = async ({ emailOrUsername, password }) =>
    attemptLogin(await unitOfWork.users.findByEmail(emailOrUsername), password);

export const loginByUsername = async ({ emailOrUsername, password }) =>
    attemptLogin(await unitOfWork.users.findByUsername(emailOrUsername), password);

async function attemptLogin(user, password) {
    // Checked before the password, and with its own message: a user who is locked out and
    // told only "invalid credentials" keeps trying, which is exactly the behaviour that
    // locked them out.
    if (user?.lockoutEnd && user.lockoutEnd > new Date()) {
        return fail(ErrorCodes.AuthAccountLocked, "Account temporarily locked after too many failed attempts. Try again later.");
    }

    dummyHash ??= await hashPassword(randomUUID());
    const passwordIsRight = await verifyPassword(password, user?.passwordHash ?? dummyHash);

    if (!user || !passwordIsRight) {
        // Counted only against a real account, so a wrong address cannot be used to lock
        // somebody else out by proxy.
        if (user) await registerFailedAttempt(user);

        // The same words whichever half was wrong: "no such user" versus "wrong password"
        // turns the login form into an account enumerator.
        return fail(ErrorCodes.AuthInvalidCredentials, "Invalid credentials.");
    }

    if (!user.isActive || user.isDeleted) {
        return fail(ErrorCodes.AuthAccountDisabled, "Account is disabled or deleted.");
    }

    // A correct password clears the count, so a few typos spread over a week never add up
    // to a lockout.
    if (user.accessFailedCount > 0 || user.lockoutEnd) {
        await unitOfWork.users.update(user.id, { accessFailedCount: 0, lockoutEnd: null });
    }

    return ok("Login successful.", { token: signToken(user), email: user.email, fullName: user.fullName, role: user.role });
}

async function registerFailedAttempt(user) {
    const attempts = user.accessFailedCount + 1;

    await unitOfWork.users.update(
        user.id,
        attempts >= env.lockout.maxFailedAttempts
            ? { accessFailedCount: 0, lockoutEnd: new Date(Date.now() + env.lockout.minutes * 60_000) }
            : { accessFailedCount: attempts },
    );
}

// ------------------------------------------------------------------ password reset
// These endpoints are anonymous - they have to be, they are what you call when you cannot
// log in. So every branch says the same thing, and nothing an anonymous caller could act on:
//
//   1. The reset token leaves only by e-mail. Returned in the response body, anyone could
//      post an address, read the token out of the JSON and take the account over without
//      ever seeing the mailbox.
//   2. A missing account, a suspended one and a real one whose mail failed to send all get
//      the same answer - otherwise the endpoint answers "does this account exist?"
//      precisely and for free.
//
// Only the token's hash is stored, so a copy of the database is not a set of reset links.

const RESET_REQUESTED = "If the account exists, a reset link has been sent to its e-mail address.";

export async function forgetPassword({ email }) {
    const user = (await unitOfWork.users.findByEmail(email)) ?? (await unitOfWork.users.findByUsername(email));

    if (!user || !user.isActive || user.isDeleted) return ok(RESET_REQUESTED);

    const token = randomBytes(32).toString("hex");
    await unitOfWork.users.update(user.id, {
        resetTokenHash: sha256(token),
        resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_MINUTES * 60_000),
    });

    const resetLink = `${env.frontendUrl}/auth/reset-password?email=${encodeURIComponent(user.email)}&token=${token}`;

    if (!(await sendPasswordResetEmail(user.email, resetLink))) {
        // Deliberately not surfaced: the caller is told the same thing either way, and
        // this is the line that tells an operator the mail settings are broken.
        logger.error(`Password reset email could not be sent (user ${user.id}). Check the SMTP_* settings.`);
    }

    return ok(RESET_REQUESTED);
}

export async function resetPassword({ email, token, newPassword }) {
    // An unknown address, a wrong token and an expired one are the same failure to the
    // caller, for the same reason as above.
    const invalid = fail(ErrorCodes.AuthResetTokenInvalid, "The reset link is invalid or has expired.");

    const user = await unitOfWork.users.findByEmail(email);
    if (!user || !user.isActive || user.isDeleted || !user.resetTokenHash || !user.resetTokenExpiresAt) return invalid;
    if (user.resetTokenExpiresAt < new Date()) return invalid;

    const given = Buffer.from(sha256(token));
    const stored = Buffer.from(user.resetTokenHash);
    if (given.length !== stored.length || !timingSafeEqual(given, stored)) return invalid;

    // The token was fine and the new password was not: that one is worth explaining.
    const problems = passwordProblems(newPassword);
    if (problems.length > 0) return fail(ErrorCodes.UserPasswordRejected, problems.join(" "));

    await unitOfWork.users.update(user.id, {
        passwordHash: await hashPassword(newPassword),
        // Whoever held a session before the reset must not keep it.
        securityStamp: randomUUID(),
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        accessFailedCount: 0,
        lockoutEnd: null,
    });

    return ok("Password has been reset successfully.");
}
