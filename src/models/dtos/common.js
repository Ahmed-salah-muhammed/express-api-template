import { z } from "zod";

// ------------------- Building blocks for request schemas -------------------
// A DTO here is a zod schema: it says what a request may carry, and middlewares/validate.js
// answers anything else with `validation.fields` before the controller runs. Unknown keys
// are dropped, so a client cannot write a field the schema does not name.

/**
 * Text that must actually say something. A plain required string accepts "   ", which is
 * how blank-named rows reach the database - and with soft delete a blank row tends to be
 * permanent and shows up in every picker.
 */
export const notBlank = (max, min = 1) => z.string().trim().min(min).max(max);

/**
 * Optional text in a partial update. Absent, null and blank all mean "nothing sent"; the
 * service decides whether that leaves the value alone or clears it.
 */
export const optionalText = (max, min = 0) =>
    z
        .string()
        .trim()
        .max(max)
        .refine((value) => value === "" || value.length >= min, { message: `Must be at least ${min} characters.` })
        .nullish();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const email = () => z.string().trim().min(1).max(256).regex(EMAIL, "Not a valid e-mail address.");
export const optionalEmail = () =>
    z.string().trim().max(256).refine((value) => value === "" || EMAIL.test(value), { message: "Not a valid e-mail address." }).nullish();

/** A phone number, or nothing at all - a form with an empty box sends "". */
export const optionalPhone = () =>
    z.string().trim().max(30).refine((value) => value === "" || /^[+0-9][0-9 ()-]{4,}$/.test(value), { message: "Not a valid phone number." }).nullish();

/** A query-string boolean: only "true" and "false" - anything else is a mistake worth reporting. */
export const queryBoolean = () => z.enum(["true", "false"]).transform((value) => value === "true").optional();
