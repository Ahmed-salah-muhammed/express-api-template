import { z } from "zod";
import { notBlank } from "./common.js";

// No rules on purpose: a blank identifier or password is simply a failed login, answered
// with the same "invalid credentials" as any other.
export const loginSchema = z.object({
    emailOrUsername: z.string().default(""),
    password: z.string().default(""),
});

export const forgetPasswordSchema = z.object({
    /** The account's e-mail address, or its username. */
    email: notBlank(256),
});

export const resetPasswordSchema = z.object({
    email: notBlank(256),
    token: notBlank(512),
    // The password policy itself is applied by the service; this only stops an empty one.
    newPassword: z.string().min(1).max(128),
});
