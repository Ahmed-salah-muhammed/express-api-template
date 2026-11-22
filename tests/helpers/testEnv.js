import os from "node:os";
import path from "node:path";

// Read by vitest.config.js and globalSetup.js - both run in the main process.

/** Which database the suite runs on. TEST_DB_CLIENT overrides the project's default. */
export const TEST_DB_CLIENT = process.env.TEST_DB_CLIENT || "sqlite";

/** Uploaded files go to a scratch folder, removed when the run ends. */
export const uploadsDir = path.join(os.tmpdir(), `api-tests-uploads-${process.pid}`);
