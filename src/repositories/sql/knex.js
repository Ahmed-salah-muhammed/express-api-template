import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import knexFactory from "knex";

// ------------------- The knex instance, and the transaction it may be inside -------------------

// Columns are snake_case in the database and camelCase in JavaScript; these two hooks are
// the whole translation, so no repository or migration ever spells a column twice.
const toSnake = (name) => name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const toCamel = (name) => name.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());

const isRow = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) && !Buffer.isBuffer(value);

const camelizeRow = (row) =>
    isRow(row) ? Object.fromEntries(Object.entries(row).map(([key, value]) => [toCamel(key), value])) : row;

const mappers = {
    // knex also passes things that are not names here (an absent constraint name, "*").
    wrapIdentifier: (value, wrap) => wrap(typeof value === "string" && value !== "*" ? toSnake(value) : value),
    postProcessResponse: (result) => (Array.isArray(result) ? result.map(camelizeRow) : camelizeRow(result)),
};

const MIGRATIONS = {
    directory: path.join(import.meta.dirname, "migrations"),
    loadExtensions: [".js"],
    // `npm run migrate:make <name>` starts a new migration from this file.
    stub: path.join(import.meta.dirname, "migration.stub.js"),
};

/** DATABASE_URL -> a knex config, for each of the four SQL databases. */
export function buildKnexConfig(client, url) {
    if (client === "sqlite") {
        if (url !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(url)), { recursive: true });
        return {
            client: "better-sqlite3",
            connection: { filename: url },
            useNullAsDefault: true,
            // SQLite ignores foreign keys unless each connection asks for them.
            pool: { afterCreate: (connection, done) => { connection.pragma("foreign_keys = ON"); done(); } },
            migrations: MIGRATIONS,
            ...mappers,
        };
    }

    if (client === "pg") {
        return { client: "pg", connection: url, migrations: MIGRATIONS, ...mappers };
    }

    const parsed = new URL(url);
    const connection = {
        host: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : undefined,
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    };

    if (client === "mysql") {
        // Every DATETIME is read and written as UTC; left at the default the driver uses
        // the server process's local time zone and every date drifts by its offset.
        return { client: "mysql2", connection: { ...connection, timezone: "Z", charset: "utf8mb4" }, migrations: MIGRATIONS, ...mappers };
    }

    if (client === "mssql") {
        const { host, ...rest } = connection;
        return {
            client: "mssql",
            connection: {
                ...rest,
                server: host,
                options: {
                    encrypt: parsed.searchParams.get("encrypt") !== "false",
                    trustServerCertificate: parsed.searchParams.get("trustServerCertificate") !== "false",
                },
            },
            migrations: MIGRATIONS,
            ...mappers,
        };
    }

    throw new Error(`No SQL configuration for DB_CLIENT=${client}.`);
}

let knex = null;
const transactionScope = new AsyncLocalStorage();

export function openKnex(config) {
    knex = knexFactory(config);
    return knex;
}

export async function closeKnex() {
    await knex?.destroy();
    knex = null;
}

/** The connection pool itself - for migrations and shutdown. Queries go through db(). */
export function pool() {
    if (!knex) throw new Error("The database is not connected yet: call connect() first.");
    return knex;
}

/**
 * What every repository queries through: the transaction this call is running inside, if
 * there is one, otherwise the pool. That is what lets a service wrap several repository
 * calls in unitOfWork.transaction() without any of them being handed a transaction.
 */
export const db = () => transactionScope.getStore() ?? pool();

/** Runs fn in a transaction; a transaction already open is joined, not nested. */
export const runInTransaction = (fn) =>
    transactionScope.getStore() ? fn() : pool().transaction((trx) => transactionScope.run(trx, fn));
