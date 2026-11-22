import { randomUUID } from "node:crypto";
import path from "node:path";
import { FileKind, USER_ROLES } from "../../enums/index.js";
import { fail, ok } from "../../models/common/apiResponse.js";
import { ErrorCodes } from "../../models/common/errorCodes.js";
import { toUserDto } from "../../models/dtos/users.dto.js";
import { unitOfWork } from "../../repositories/index.js";
import { logger } from "../../utils/logger.js";
import { hashPassword, passwordProblems, verifyPassword } from "../../utils/password.js";
import { identify, IMAGE_EXTENSIONS } from "../common/fileSniffer.js";
// The disk on purpose, whatever STORAGE_PROVIDER says: avatars are served back by this
// API's own static-file middleware.
import { localStorage } from "../storage/index.js";

const MAX_PROFILE_PICTURE_MB = 5;

const users = unitOfWork.users;

const blank = (value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

const notFound = () => fail(ErrorCodes.UserNotFound, "User not found.");
const roleUnknown = (role) => fail(ErrorCodes.UserRoleUnknown, `Role '${role}' does not exist.`, { role });
const emailTaken = (email) => fail(ErrorCodes.UserEmailTaken, "Email is already in use.", { email });
const usernameTaken = () => fail(ErrorCodes.UserUsernameTaken, "Username is already taken.");
const passwordRejected = (problems) => fail(ErrorCodes.UserPasswordRejected, problems.join(" "));

// ------------------------------------------------------------------ admin

export async function getFiltered(filter) {
    return ok("Users retrieved successfully.", (await users.findFiltered(filter)).map(toUserDto));
}

export async function getById(id) {
    const user = await users.getById(id);
    return user ? ok("User retrieved successfully.", toUserDto(user)) : notFound();
}

export async function create(dto) {
    if (!USER_ROLES.includes(dto.roleName)) return roleUnknown(dto.roleName);

    // A soft-deleted account keeps its address: its history still has to say whose it was.
    if (await users.findByEmail(dto.email)) return emailTaken(dto.email);

    // Left out, the username is the part of the address before the @ - and the whole
    // address when somebody already has that.
    let username = blank(dto.username);
    if (!username) {
        username = dto.email.split("@")[0];
        if (await users.findByUsername(username)) username = dto.email;
    }
    if (await users.findByUsername(username)) return usernameTaken();

    const problems = passwordProblems(dto.password);
    if (problems.length > 0) return passwordRejected(problems);

    const user = await users.add({
        fullName: dto.fullName,
        username,
        email: dto.email,
        passwordHash: await hashPassword(dto.password),
        role: dto.roleName,
        isActive: true,
        jobDescription: blank(dto.jobDescription),
        phoneNumber: blank(dto.phoneNumber),
        profilePictureUrl: null,
        securityStamp: randomUUID(),
        accessFailedCount: 0,
        lockoutEnd: null,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
    });

    return ok("User created successfully.", toUserDto(user));
}

export async function update(id, dto, callerId) {
    const user = await users.getById(id);
    if (!user) return notFound();

    const role = blank(dto.roleName) ?? user.role;
    const roleChanges = role !== user.role;

    // Everything is checked before anything is written.
    if (roleChanges && !USER_ROLES.includes(role)) return roleUnknown(role);

    // An administrator demoting themselves can leave the system with nobody able to undo
    // it. Somebody else has to do that.
    if (roleChanges && id === callerId) {
        return fail(ErrorCodes.UserSelfActionForbidden, "You cannot change your own role.");
    }

    const email = blank(dto.email);
    if (email && email.toLowerCase() !== user.email.toLowerCase()) {
        const existing = await users.findByEmail(email);
        if (existing && existing.id !== user.id) return emailTaken(email);
    }

    const username = blank(dto.username);
    if (username && username.toLowerCase() !== user.username.toLowerCase()) {
        const existing = await users.findByUsername(username);
        if (existing && existing.id !== user.id) return usernameTaken();
    }

    // "Not sent" leaves a value alone: for the identity fields null and blank both mean
    // that. The two free-text fields can be cleared by sending them empty.
    const patch = {
        fullName: blank(dto.fullName) ?? undefined,
        email: email ?? undefined,
        username: username ?? undefined,
        jobDescription: dto.jobDescription === undefined || dto.jobDescription === null ? undefined : blank(dto.jobDescription),
        phoneNumber: dto.phoneNumber === undefined || dto.phoneNumber === null ? undefined : blank(dto.phoneNumber),
    };

    if (roleChanges) {
        // One role per user, so a role change is a replacement. The role lives in the
        // token for days; rotating the stamp makes every token minted before this change
        // fail on its next request, so the old role stops working now.
        patch.role = role;
        patch.securityStamp = randomUUID();
    }

    return ok("User updated successfully.", toUserDto(await users.update(id, patch)));
}

export async function resetPassword(id, { newPassword }) {
    const user = await users.getById(id);
    if (!user) return notFound();

    const problems = passwordProblems(newPassword);
    if (problems.length > 0) return passwordRejected(problems);

    // A new stamp signs the user out everywhere; the lockout is cleared because an
    // administrator setting a password is usually answering "I am locked out".
    await users.update(id, {
        passwordHash: await hashPassword(newPassword),
        securityStamp: randomUUID(),
        accessFailedCount: 0,
        lockoutEnd: null,
    });

    return ok("Password reset successfully.");
}

export async function setActiveStatus(id, { isActive }, callerId) {
    if (id === callerId && !isActive) {
        return fail(ErrorCodes.UserSelfActionForbidden, "You cannot suspend your own account.");
    }

    const user = await users.update(id, { isActive });
    if (!user) return notFound();

    return ok(isActive ? "User activated successfully." : "User suspended successfully.", toUserDto(user));
}

export async function remove(id, callerId) {
    if (id === callerId) {
        return fail(ErrorCodes.UserSelfActionForbidden, "You cannot delete your own account.");
    }

    // Soft: whatever the account wrote keeps a name to show. Two writes that only make
    // sense together, so they share a transaction.
    const removed = await unitOfWork.transaction(async () => {
        if (!(await users.update(id, { isActive: false }))) return false;
        return users.remove(id);
    });

    return removed ? ok("User deleted successfully.") : notFound();
}

// ------------------------------------------------------------------ self-service
// Any signed-in account, about itself only: the id always comes from the token.

export async function changeMyPassword(userId, { currentPassword, newPassword }) {
    const user = await users.getById(userId);
    if (!user) return notFound();

    // Two failures with a code each: "that is not your password" and "the new one does
    // not meet the policy" need different sentences.
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
        return fail(ErrorCodes.UserCurrentPasswordWrong, "The current password is incorrect.");
    }

    const problems = passwordProblems(newPassword);
    if (problems.length > 0) return passwordRejected(problems);

    // A new stamp: every session, this one included, signs in again.
    await users.update(userId, { passwordHash: await hashPassword(newPassword), securityStamp: randomUUID() });

    return ok("Password changed successfully. Sign in again.");
}

/** @param file what multer hands over: { originalname, mimetype, size, buffer } */
export async function updateMyProfilePicture(userId, file) {
    const user = await users.getById(userId);
    if (!user) return notFound();

    if (file.size === 0) return fail(ErrorCodes.FileEmpty, "No file was uploaded.");

    if (file.size > MAX_PROFILE_PICTURE_MB * 1024 * 1024) {
        return fail(ErrorCodes.FileTooLarge, `Image size must not exceed ${MAX_PROFILE_PICTURE_MB}MB.`, { limitMb: MAX_PROFILE_PICTURE_MB });
    }

    // The name and the content type are the client's to choose; what the file is comes
    // from its bytes.
    const extension = path.extname(file.originalname).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) {
        return fail(ErrorCodes.FileTypeNotAllowed, "Only images (jpg, png, webp) are allowed.");
    }

    const sniffed = identify(file.buffer, extension);
    if (sniffed?.kind !== FileKind.Image) return fail(ErrorCodes.FileContentMismatch, "That file is not an image.");

    let profilePictureUrl;
    try {
        profilePictureUrl = await localStorage.upload(file.buffer, `avatar${sniffed.extension}`, sniffed.contentType, `users/${user.id}`);
    } catch (error) {
        logger.error(`Profile picture upload failed for user ${userId}.`, error);
        return fail(ErrorCodes.StorageUnavailable, "File storage is unavailable. The file was not saved.");
    }

    await users.update(userId, { profilePictureUrl });
    await removeStoredFile(user.profilePictureUrl);

    return ok("Profile picture updated successfully.", { profilePictureUrl });
}

export async function deleteMyProfilePicture(userId) {
    const user = await users.getById(userId);
    if (!user) return notFound();

    if (user.profilePictureUrl) {
        await users.update(userId, { profilePictureUrl: null });
        await removeStoredFile(user.profilePictureUrl);
    }

    return ok("Profile picture removed successfully.");
}

// Removing the old file is cleanup, not part of the operation the user asked for. If it
// fails the change is already saved, so failing the request here would report a success as
// an error - log and move on.
async function removeStoredFile(url) {
    if (!url) return;

    try {
        await localStorage.remove(url);
    } catch (error) {
        logger.warn(`Could not delete the stored file at ${url}.`, error);
    }
}
