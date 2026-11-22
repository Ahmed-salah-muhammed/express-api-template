import { randomBytes } from "node:crypto";
import { defineConfig } from "vitest/config";
import { TEST_DB_CLIENT, uploadsDir } from "./tests/helpers/testEnv.js";

// The suite drives the real app, in-process, against a real database - see tests/README
// section in README.md for choosing which one.
export default defineConfig({
    test: {
        include: ["tests/**/*.test.js"],
        globalSetup: ["./tests/helpers/globalSetup.js"],
        setupFiles: ["./tests/helpers/setupEnv.js"],

        // One worker, one module graph, one database for the whole run: the app is
        // connected and seeded once (tests/helpers/api.js) and every file shares it, the
        // way requests share it in production. Isolation between tests comes from each
        // test creating the accounts it changes (createTestUser), not from fresh databases.
        fileParallelism: false,
        isolate: false,

        testTimeout: 30_000,
        hookTimeout: 180_000,

        // Everything the app would read from .env - which it never reads under test.
        env: {
            NODE_ENV: "test",
            DB_CLIENT: TEST_DB_CLIENT,
            // A signing key generated per run: nothing secret is committed, and a token
            // from one run cannot be replayed against another.
            JWT_SECRET: randomBytes(48).toString("base64"),
            JWT_ISSUER: "tests-issuer",
            JWT_AUDIENCE: "tests-audience",
            // Hashing is deliberately slow; the tests sign in hundreds of times.
            PASSWORD_COST: "10",
            // Every request of the run comes from one address; the limiter is tested on
            // its own, with a limit of its own.
            PASSWORD_RESETS_PER_MINUTE: "1000",
            // Mail lands in an in-process outbox instead of leaving the machine.
            SMTP_HOST: "memory",
            STORAGE_PROVIDER: "local",
            UPLOADS_DIR: uploadsDir,
        },
    },
});
