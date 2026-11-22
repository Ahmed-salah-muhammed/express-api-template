// What the knex CLI reads (`npm run migrate`, `npm run migrate:make <name>`, ...). The
// app itself never imports this: both get the same configuration from the same place.
import { env } from "./src/config/env.js";
import { buildKnexConfig } from "./src/repositories/sql/knex.js";

export default buildKnexConfig(env.dbClient, env.databaseUrl);
