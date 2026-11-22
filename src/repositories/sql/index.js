import knexFactory from "knex";
import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import { entities } from "./entities.js";
import { GenericRepository } from "./genericRepository.js";
import { ItemRepository } from "./itemRepository.js";
import { buildKnexConfig, closeKnex, openKnex, pool, runInTransaction } from "./knex.js";
import { UserRepository } from "./userRepository.js";

// ------------------- The SQL provider: PostgreSQL, MySQL, SQL Server, SQLite -------------------
// One code path for all four, through knex. What differs between them is handled in three
// places and nowhere else: buildKnexConfig (connecting), GenericRepository.toEntity
// (booleans and dates) and ensureDatabase below.

export async function connect() {
    openKnex(buildKnexConfig(env.dbClient, env.databaseUrl));
}

export async function disconnect() {
    await closeKnex();
}

/**
 * SQL Server is the one that will not create its database for you: the postgres and mysql
 * images do it from an environment variable, and SQLite is a file. So before the first
 * migration the database is created if it is missing - which is also what makes a brand
 * new test database work.
 */
async function ensureDatabase() {
    if (env.dbClient !== "mssql") return;

    const config = buildKnexConfig(env.dbClient, env.databaseUrl);
    const name = config.connection.database;
    const master = knexFactory({ client: "mssql", connection: { ...config.connection, database: "master" } });

    try {
        // The name cannot be a parameter in CREATE DATABASE, so it is bracket-quoted.
        await master.raw(`IF DB_ID(?) IS NULL CREATE DATABASE [${name.replaceAll("]", "]]")}]`, [name]);
    } finally {
        await master.destroy();
    }
}

/** Brings the schema up to date from src/repositories/sql/migrations. */
export async function migrate() {
    await ensureDatabase();

    const [, applied] = await pool().migrate.latest();
    if (applied.length > 0) logger.info(`Applied ${applied.length} migration(s): ${applied.join(", ")}`);
}

const users = new UserRepository();
const items = new ItemRepository();
const generic = new Map();

export const unitOfWork = {
    users,
    items,

    /** A generic repository for an entity registered in entities.js. */
    repository(name) {
        if (name === "users") return users;
        if (name === "items") return items;

        if (!generic.has(name)) {
            if (!entities[name]) throw new Error(`No entity "${name}" is registered in repositories/sql/entities.js.`);
            generic.set(name, new GenericRepository(entities[name]));
        }
        return generic.get(name);
    },

    /**
     * Everything `fn` does through the repositories commits together, or - if it throws -
     * not at all. The repositories need no argument for it: they pick the transaction up
     * on their own (see db() in knex.js).
     */
    transaction: (fn) => runInTransaction(fn),
};
