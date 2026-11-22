import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { closeDemoAccounts, ensureAdministrator } from "./data/seedAccountGuard.js";
import { seedDemoData } from "./data/seeder.js";
import { connect, disconnect, migrate, unitOfWork } from "./repositories/index.js";
import { logger } from "./utils/logger.js";

await connect();

// The schema has to exist before the first request, and nothing else creates it. On by
// default in development; a production deployment decides for itself whether a starting
// instance is allowed to alter the schema (RUN_MIGRATIONS_ON_STARTUP).
if (env.runMigrationsOnStartup) await migrate();

if (env.isProduction && !env.keepDemoLogins) {
    // The two ways of getting this wrong are not equal: a demo stack that has lost its
    // demo logins is an annoyance, and a public deployment that kept them is a stranger
    // with an admin session. So production closes them unless told otherwise.
    await closeDemoAccounts(unitOfWork);
    await ensureAdministrator(unitOfWork);
} else if (env.seedDemoData) {
    if (await seedDemoData(unitOfWork)) logger.info("Seeded the demo accounts and items (password: see src/data/seeder.js).");
}

const server = createApp().listen(env.port, () => {
    logger.info(`${env.appName} listening on http://localhost:${env.port} (${env.nodeEnv}, ${env.dbClient})`);
});

// Finish the requests in flight, then let go of the database - so a redeploy or Ctrl+C
// never cuts a write in half.
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
        server.close(async () => {
            await disconnect();
            process.exit(0);
        });
    });
}
