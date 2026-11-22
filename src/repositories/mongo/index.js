import { AsyncLocalStorage } from "node:async_hooks";
import mongoose from "mongoose";
import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import { entities } from "./entities.js";
import { GenericRepository } from "./genericRepository.js";
import { ItemRepository } from "./itemRepository.js";
import { UserRepository } from "./userRepository.js";

// ------------------- The MongoDB provider (mongoose) -------------------

// Inside connection.transaction() every operation joins the session by itself, so a
// repository never has to be handed one.
mongoose.set("transactionAsyncLocalStorage", true);

let memoryServer = null;
let transactionsAvailable = false;

export async function connect() {
    let url = env.databaseUrl;

    // DATABASE_URL=memory: a throwaway MongoDB inside this process, so a fresh clone runs
    // with nothing installed. It is a one-member replica set, because that is what makes
    // transactions work. Everything in it is gone when the process stops.
    if (url === "memory") {
        if (env.isProduction) throw new Error("DATABASE_URL=memory is for development only.");

        const { MongoMemoryReplSet } = await import("mongodb-memory-server");
        memoryServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        url = memoryServer.getUri("app");

        logger.warn("MongoDB: using an in-memory server - the data is lost on restart. Set DATABASE_URL to keep it.");
    }

    await mongoose.connect(url);

    // Transactions need a replica set (Atlas always is one) or a sharded cluster. A plain
    // standalone mongod has neither, and says so only when the first transaction starts.
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    transactionsAvailable = Boolean(hello.setName) || hello.msg === "isdbgrid";
}

export async function disconnect() {
    await mongoose.disconnect();
    await memoryServer?.stop();
    memoryServer = null;
}

/** MongoDB has no migrations to run; what it needs before the first request is its indexes. */
export async function migrate() {
    await Promise.all(Object.values(mongoose.models).map((model) => model.createIndexes()));
}

const users = new UserRepository();
const items = new ItemRepository();
const generic = new Map();

const transactionScope = new AsyncLocalStorage();
let warnedAboutStandalone = false;

export const unitOfWork = {
    users,
    items,

    /** A generic repository for an entity registered in entities.js. */
    repository(name) {
        if (name === "users") return users;
        if (name === "items") return items;

        if (!generic.has(name)) {
            if (!entities[name]) throw new Error(`No entity "${name}" is registered in repositories/mongo/entities.js.`);
            generic.set(name, new GenericRepository(entities[name]));
        }
        return generic.get(name);
    },

    /**
     * Everything `fn` does through the repositories commits together, or - if it throws -
     * not at all. A transaction already open is joined, not nested.
     *
     * On a standalone mongod there are no transactions to be had: `fn` then simply runs,
     * and a warning says so once. Development on a local standalone server keeps working;
     * anything that depends on atomicity needs a replica set, which production should be.
     */
    async transaction(fn) {
        if (transactionScope.getStore()) return fn();

        if (!transactionsAvailable) {
            if (!warnedAboutStandalone) {
                warnedAboutStandalone = true;
                logger.warn("MongoDB is a standalone server: unitOfWork.transaction() ran without a transaction. Use a replica set for atomic writes.");
            }
            return fn();
        }

        let result;
        await mongoose.connection.transaction(() => transactionScope.run(true, async () => { result = await fn(); }));
        return result;
    },
};
