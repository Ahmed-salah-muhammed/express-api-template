import { env } from "../config/env.js";

// ------------------- The data layer's front door -------------------
// Services import `unitOfWork` from here and nothing else: they never see knex or mongoose.
// Both providers expose the same thing -
//
//   unitOfWork.users / .items      repositories with queries of their own
//   unitOfWork.repository("name")  a generic repository for any registered entity
//   unitOfWork.transaction(fn)     everything inside commits or rolls back together
//
// - so the choice of database is one environment variable (DB_CLIENT) and no service code.
// scripts/create-app.mjs deletes the provider a new project does not use.
const provider = env.dbClient === "mongo"
    ? await import("./mongo/index.js")
    : await import("./sql/index.js");

export const { connect, migrate, disconnect, unitOfWork } = provider;
