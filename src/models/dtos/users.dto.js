import { z } from "zod";
import { email, notBlank, optionalEmail, optionalPhone, optionalText, queryBoolean } from "./common.js";

/** An account as the API shows it - in the users table and as GET users/me. Never the hash. */
export const toUserDto = (user) => ({
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    email: user.email,
    phoneNumber: user.phoneNumber ?? null,
    role: user.role,
    isActive: user.isActive,
    jobDescription: user.jobDescription ?? null,
    profilePictureUrl: user.profilePictureUrl ?? null,
    createdAt: user.createdAt,
});

export const userFilterSchema = z.object({
    role: z.string().trim().max(50).optional(),
    isActive: queryBoolean(),
    /** Matched against the name, the e-mail address and the username. */
    search: z.string().trim().max(200).optional(),
});

// Admin-only: adds an account and gives it its role. There is no self-registration.
export const createUserSchema = z.object({
    fullName: notBlank(200, 2),
    email: email(),
    /** Optional: left out, it is taken from the e-mail address. */
    username: optionalText(100, 3),
    // The password policy itself is applied by the service; this only stops an empty one.
    password: z.string().min(1).max(128),
    roleName: notBlank(50),
    jobDescription: optionalText(120),
    phoneNumber: optionalPhone(),
});

// Admin-only. Every field is optional - only what is sent gets written. The password is
// not here; that is a separate, deliberate action (POST users/:id/reset-password).
export const updateUserSchema = z.object({
    fullName: optionalText(200, 2),
    email: optionalEmail(),
    username: optionalText(100, 3),
    // A user has exactly one role, so this replaces it rather than adding to it.
    roleName: optionalText(50),
    jobDescription: optionalText(120),
    phoneNumber: optionalPhone(),
});

// Suspend (false) or reactivate (true) an account.
export const updateUserStatusSchema = z.object({
    isActive: z.boolean(),
});

// An administrator setting someone's password, without knowing the old one.
export const adminResetPasswordSchema = z.object({
    newPassword: z.string().min(1).max(128),
});

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(1).max(128),
});
