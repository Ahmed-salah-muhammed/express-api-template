import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { env } from "../config/env.js";

// ------------------- Password hashing: scrypt, from Node's own crypto -------------------
// No dependency, and it runs on the thread pool: a pure-JavaScript bcrypt takes about a
// second per sign-in at a sensible cost and spends all of it on the event loop, where
// every other request waits behind it.
//
// A hash is stored as  scrypt$N$r$p$salt$key  - the parameters travel with it, so the cost
// can be raised later (PASSWORD_COST) without invalidating a single stored password.

const derive = promisify(scrypt);

const KEY_LENGTH = 64;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;

// scrypt needs 128 * N * r bytes; Node refuses anything over its default 32 MiB cap unless told.
const options = (N, r, p) => ({ N, r, p, maxmem: 256 * N * r });

// Unicode-normalised, so the same password typed on two keyboards is the same bytes.
const bytes = (password) => Buffer.from(String(password ?? "").normalize("NFKC"), "utf8");

export async function hashPassword(password) {
    const N = 2 ** env.passwordCost;
    const salt = randomBytes(16);
    const key = await derive(bytes(password), salt, KEY_LENGTH, options(N, BLOCK_SIZE, PARALLELISM));

    return ["scrypt", N, BLOCK_SIZE, PARALLELISM, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password, stored) {
    const [scheme, N, r, p, salt, key] = String(stored ?? "").split("$");
    if (scheme !== "scrypt" || !key) return false;

    const expected = Buffer.from(key, "base64");
    const actual = await derive(bytes(password), Buffer.from(salt, "base64"), expected.length, options(Number(N), Number(r), Number(p)));

    return timingSafeEqual(actual, expected);
}

/**
 * The password policy, as the list of rules a password breaks (empty when it is fine).
 *
 * Eight characters with a digit and a symbol. Case is deliberately not required: mixing it
 * buys very little against an attacker and costs a lot on a phone keyboard, and the
 * lockout in authService is what actually stops online guessing.
 */
export function passwordProblems(password) {
    const value = typeof password === "string" ? password : "";
    const problems = [];

    if (value.length < 8) problems.push("Passwords must be at least 8 characters.");
    if (!/\d/.test(value)) problems.push("Passwords must have at least one digit.");
    if (!/[^A-Za-z0-9]/.test(value)) problems.push("Passwords must have at least one symbol.");

    return problems;
}
