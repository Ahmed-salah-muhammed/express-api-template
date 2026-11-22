// ------------------- Everything the app reads from its environment -------------------
// Parsed once, here, so the rest of the code asks `env.x` and never `process.env.X`.
// In development the values come from .env (copy .env.example); in a container and in CI
// they are real environment variables, which always win over the file.
//
// Under test the file is not read at all: a developer's .env points at their own database,
// and the suite must never find it.
if (process.env.NODE_ENV !== "test") {
    try {
        process.loadEnvFile();
    } catch {
        /* no .env file: everything comes from the environment */
    }
}

const text = (name, fallback = "") => {
    const value = process.env[name];
    return value === undefined || value === "" ? fallback : value;
};

const flag = (name, fallback = false) => {
    const value = process.env[name];
    return value === undefined || value === "" ? fallback : ["true", "1", "yes", "on"].includes(value.toLowerCase());
};

const number = (name, fallback) => {
    const value = Number.parseInt(process.env[name] ?? "", 10);
    return Number.isFinite(value) ? value : fallback;
};

const nodeEnv = text("NODE_ENV", "development");
const isProduction = nodeEnv === "production";

// ------------------------------------------------------------------ database
const DB_CLIENTS = {
    mongo: "mongo", mongodb: "mongo",
    pg: "pg", postgres: "pg", postgresql: "pg",
    mysql: "mysql", mysql2: "mysql",
    mssql: "mssql", sqlserver: "mssql",
    sqlite: "sqlite", sqlite3: "sqlite",
};

const dbClient = DB_CLIENTS[text("DB_CLIENT", "sqlite").toLowerCase()];
if (!dbClient) {
    throw new Error(`DB_CLIENT "${process.env.DB_CLIENT}" is not supported. Use one of: mongo, pg, mysql, mssql, sqlite.`);
}

// The two that need no server get a default, so a fresh clone runs: SQLite is a file, and
// "memory" starts a throwaway MongoDB inside the process (development only).
const databaseUrl = text("DATABASE_URL", dbClient === "sqlite" ? "./data/dev.sqlite" : dbClient === "mongo" && !isProduction ? "memory" : "");
if (!databaseUrl) {
    throw new Error(`DATABASE_URL is not configured for DB_CLIENT=${dbClient}. Set it in .env (copy .env.example).`);
}

// ------------------------------------------------------------------ tokens
// Deliberately fail-closed: no fallback secret. A default here would be a signing key
// sitting in source control, and a deployment that forgot to set its own would accept
// tokens anyone with the repository could mint.
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
    throw new Error("JWT_SECRET is not configured. Set it in .env (copy .env.example) or in the environment.");
}
if (Buffer.byteLength(jwtSecret) < 32) {
    throw new Error("JWT_SECRET is too short: it must be at least 32 characters.");
}

export const env = Object.freeze({
    nodeEnv,
    isProduction,
    isTest: nodeEnv === "test",
    port: number("PORT", 5000),
    appName: text("APP_NAME", "express-api-template"),

    /** Where the web app lives - the password-reset link is built from it. */
    frontendUrl: text("FRONTEND_URL", "http://localhost:5173").replace(/\/+$/, ""),

    /** Behind nginx or another proxy: trust X-Forwarded-* for the client address and scheme. */
    behindReverseProxy: flag("BEHIND_REVERSE_PROXY"),

    dbClient,
    databaseUrl,

    /** Apply migrations (SQL) / build indexes (MongoDB) when the process starts. */
    runMigrationsOnStartup: flag("RUN_MIGRATIONS_ON_STARTUP", !isProduction),

    /** Insert the demo accounts and items (data/seeder.js). Ignored in production unless keepDemoLogins. */
    seedDemoData: flag("SEED_DEMO_DATA", !isProduction),
    keepDemoLogins: flag("KEEP_DEMO_LOGINS"),
    bootstrapAdmin: Object.freeze({
        email: text("BOOTSTRAP_ADMIN_EMAIL", "admin@example.com"),
        password: text("BOOTSTRAP_ADMIN_PASSWORD"),
    }),

    jwt: Object.freeze({
        secret: jwtSecret,
        issuer: text("JWT_ISSUER", "express-api-template"),
        audience: text("JWT_AUDIENCE", "express-api-template-client"),
        expiryDays: number("JWT_EXPIRY_DAYS", 7),
    }),

    // Ten wrong passwords, then five minutes. The pause is what makes online guessing
    // pointless, and it is short enough that someone who mistyped is not locked out of
    // their day. The lockout tests read these rather than repeating them.
    lockout: Object.freeze({
        maxFailedAttempts: number("LOCKOUT_MAX_ATTEMPTS", 10),
        minutes: number("LOCKOUT_MINUTES", 5),
    }),

    /** How many password-reset requests one client address may make in a minute. */
    passwordResetsPerMinute: number("PASSWORD_RESETS_PER_MINUTE", 10),

    /**
     * How expensive a password hash is: scrypt's N as a power of two (15 -> 32 MiB, well
     * under a tenth of a second). Raising it only affects passwords set afterwards. The
     * tests lower it; nothing else should.
     */
    passwordCost: Math.min(20, Math.max(10, number("PASSWORD_COST", 15))),

    storage: Object.freeze({
        /** "local" writes under uploadsDir; "s3" uses the S3-compatible settings below. */
        provider: text("STORAGE_PROVIDER", "local").toLowerCase(),
        uploadsDir: text("UPLOADS_DIR", "./uploads"),
        maxUploadMb: number("MAX_UPLOAD_MB", 10),
        s3: Object.freeze({
            endpoint: text("S3_ENDPOINT"),
            region: text("S3_REGION", "auto"),
            bucket: text("S3_BUCKET"),
            accessKeyId: text("S3_ACCESS_KEY_ID"),
            secretAccessKey: text("S3_SECRET_ACCESS_KEY"),
            publicUrl: text("S3_PUBLIC_URL").replace(/\/+$/, ""),
            forcePathStyle: flag("S3_FORCE_PATH_STYLE", true),
        }),
    }),

    email: Object.freeze({
        /** Empty sends nothing. "memory" keeps messages in an in-process outbox (the tests use it). */
        host: text("SMTP_HOST"),
        port: number("SMTP_PORT", 587),
        user: text("SMTP_USER"),
        password: text("SMTP_PASSWORD"),
        senderEmail: text("SMTP_SENDER_EMAIL"),
        senderName: text("SMTP_SENDER_NAME"),
    }),

    logLevel: text("LOG_LEVEL", nodeEnv === "test" ? "silent" : "info"),
});
