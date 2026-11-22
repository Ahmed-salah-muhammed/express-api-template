import { inject } from "vitest";

// Runs in the worker before any test file is imported. The database address has to be in
// the environment before anything of the app is loaded, because config/env.js reads it
// once, at import - and a file that imported the app first would otherwise connect it to
// the developer's own database.
process.env.DATABASE_URL = inject("databaseUrl");
