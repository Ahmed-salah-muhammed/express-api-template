import fs from "node:fs/promises";
import { TEST_DB_CLIENT, uploadsDir } from "./testEnv.js";

// ------------------- Which database the tests run on -------------------
// By default one that needs nothing installed:
//
//   sqlite            an in-memory database
//   mongo             mongodb-memory-server - a real mongod, downloaded once and cached
//   pg / mysql / mssql  need a server: set TEST_DATABASE_URL
//
// TEST_DATABASE_URL points any of them at a real server instead - which is how to run the
// suite on the engine production uses.

/**
 * The tests migrate and write to whatever database they are pointed at. Requiring the
 * name to end in _test means a stray connection string - a pasted development or, worse,
 * production one - stops the run instead of rewriting real data.
 */
function guard(url) {
    const name = decodeURIComponent(new URL(url, "file:///").pathname.split("/").pop() ?? "").replace(/\.[a-z0-9]+$/i, "");

    if (!name.toLowerCase().endsWith("_test")) {
        throw new Error(
            `TEST_DATABASE_URL points at database "${name}". The test suite creates, migrates and writes to ` +
            'its target, so it only accepts a database whose name ends in "_test". Refusing to run.',
        );
    }
}

export default async function setup(project) {
    const teardowns = [() => fs.rm(uploadsDir, { recursive: true, force: true })];
    const external = process.env.TEST_DATABASE_URL;

    if (external) {
        guard(external);
        project.provide("databaseUrl", external);
    } else if (TEST_DB_CLIENT === "sqlite") {
        project.provide("databaseUrl", ":memory:");
    } else if (TEST_DB_CLIENT === "mongo" || TEST_DB_CLIENT === "mongodb") {
        // A one-member replica set, because that is what makes transactions work.
        const { MongoMemoryReplSet } = await import("mongodb-memory-server");
        const server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });

        project.provide("databaseUrl", server.getUri("app_test"));
        teardowns.push(() => server.stop());
    } else {
        throw new Error(`TEST_DB_CLIENT=${TEST_DB_CLIENT} needs a server: set TEST_DATABASE_URL (database name ending in "_test").`);
    }

    return async () => {
        for (const teardown of teardowns) await teardown();
    };
}
