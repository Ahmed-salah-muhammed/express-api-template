#!/usr/bin/env node
// ------------------- Starts a new application from this template -------------------
//
//   node scripts/create-app.mjs <target-directory> --db <mongo|postgres|mysql|mssql|sqlite> [--install]
//
//   node scripts/create-app.mjs ../shop-api --db mongo        a MERN backend
//   node scripts/create-app.mjs ../shop-api --db postgres
//
// Copies the template, keeps the one database provider the project will use (and only its
// packages), names everything after the target folder, and writes a .env with a signing
// key and a database password generated for this project alone.
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const TEMPLATE_NAME = "express-api-template";
const templateRoot = path.resolve(import.meta.dirname, "..");

// What each choice means. `url` is the DATABASE_URL a developer's machine uses; the
// Compose file carries the address the API container uses.
const FLAVORS = {
    mongo: { client: "mongo", provider: "mongo", label: "MongoDB (mongoose)", url: () => "memory" },
    postgres: { client: "pg", provider: "sql", label: "PostgreSQL (knex)", driver: "pg", url: (password) => `postgres://app:${password}@localhost:54329/app` },
    mysql: { client: "mysql", provider: "sql", label: "MySQL (knex)", driver: "mysql2", driverVersion: "^3.24.6", url: (password) => `mysql://app:${password}@localhost:33069/app` },
    mssql: { client: "mssql", provider: "sql", label: "SQL Server (knex)", driver: "tedious", driverVersion: "^20.4.1", url: (password) => `mssql://sa:${password}@localhost:14339/app` },
    sqlite: { client: "sqlite", provider: "sql", label: "SQLite (knex)", driver: "better-sqlite3", url: () => "./data/dev.sqlite" },
};
const ALIASES = { mongodb: "mongo", pg: "postgres", postgresql: "postgres", sqlserver: "mssql", sql: "mssql", sqlite3: "sqlite" };

function stop(message) {
    console.error(`\n  ${message}\n`);
    process.exit(1);
}

// ----------------------------------------------------------------- arguments
const args = process.argv.slice(2);
const targetArg = args.find((arg) => !arg.startsWith("--") && args[args.indexOf(arg) - 1] !== "--db");
const dbArg = (args[args.indexOf("--db") + 1] ?? "").toLowerCase();
const flavorName = ALIASES[dbArg] ?? dbArg;
const flavor = args.includes("--db") ? FLAVORS[flavorName] : null;

if (!targetArg || !flavor) {
    stop(`Usage: node scripts/create-app.mjs <target-directory> --db <${Object.keys(FLAVORS).join("|")}> [--install]`);
}

const target = path.resolve(targetArg);
const appName = path.basename(target).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[._-]+|[._-]+$/g, "");

if (!appName) stop(`"${path.basename(target)}" cannot be turned into a package name.`);
if (target === templateRoot || target.startsWith(templateRoot + path.sep)) stop("The target must be outside the template folder.");
if (fs.existsSync(target) && fs.readdirSync(target).length > 0) stop(`${target} already exists and is not empty.`);

// ----------------------------------------------------------------- copy
// Everything except what belongs to this folder alone: installed packages, local
// settings and data, the Compose variants (one is chosen below) and this script.
const SKIP = new Set(["node_modules", ".git", ".env", "uploads", "data", "coverage", "docker", "package-lock.json", path.join("scripts", "create-app.mjs")]);

fs.cpSync(templateRoot, target, {
    recursive: true,
    filter: (source) => !SKIP.has(path.relative(templateRoot, source)),
});

const read = (relative) => fs.readFileSync(path.join(target, relative), "utf8");
const write = (relative, content) => fs.writeFileSync(path.join(target, relative), content);
const remove = (relative) => fs.rmSync(path.join(target, relative), { recursive: true, force: true });

// ----------------------------------------------------------------- one database provider
// The template carries both; a project keeps the one it uses. Nothing above the
// repositories folder knows which that is, so nothing else changes.
remove(flavor.provider === "mongo" ? "src/repositories/sql" : "src/repositories/mongo");
if (flavor.provider === "mongo") remove("knexfile.js");

write("src/repositories/index.js", `// ------------------- The data layer's front door -------------------
// Services import \`unitOfWork\` from here and nothing else: they never see ${flavor.provider === "mongo" ? "mongoose" : "knex"}.
//
//   unitOfWork.users / .items      repositories with queries of their own
//   unitOfWork.repository("name")  a generic repository for any registered entity
//   unitOfWork.transaction(fn)     everything inside commits or rolls back together
export { connect, disconnect, migrate, unitOfWork } from "./${flavor.provider}/index.js";
`);

// The suite runs on a database that needs nothing installed unless told otherwise.
write("tests/helpers/testEnv.js", read("tests/helpers/testEnv.js").replace('|| "sqlite"', `|| "${flavor.provider === "mongo" ? "mongo" : "sqlite"}"`));

// ----------------------------------------------------------------- package.json
const manifest = JSON.parse(read("package.json"));
const { dependencies, devDependencies, scripts } = manifest;

manifest.name = appName;

if (flavor.provider === "mongo") {
    for (const name of ["knex", "pg", "better-sqlite3"]) delete dependencies[name];
    for (const name of ["migrate", "migrate:make", "migrate:rollback"]) delete scripts[name];
} else {
    delete dependencies.mongoose;
    delete devDependencies["mongodb-memory-server"];

    // The tests default to SQLite in memory, so its driver stays - as a development tool,
    // unless SQLite is also what the app itself runs on.
    const sqlite = dependencies["better-sqlite3"];
    const postgres = dependencies.pg;
    delete dependencies["better-sqlite3"];
    delete dependencies.pg;

    if (flavorName === "sqlite") dependencies["better-sqlite3"] = sqlite;
    else devDependencies["better-sqlite3"] = sqlite;

    if (flavorName !== "sqlite") dependencies[flavor.driver] = flavor.driverVersion ?? postgres;
}

const sorted = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
manifest.dependencies = sorted(dependencies);
manifest.devDependencies = sorted(devDependencies);

write("package.json", `${JSON.stringify(manifest, null, 4)}\n`);

// ----------------------------------------------------------------- docker-compose.yml
write("docker-compose.yml", fs.readFileSync(path.join(templateRoot, "docker", `compose.${flavorName}.yml`), "utf8"));

// ----------------------------------------------------------------- settings
const jwtSecret = randomBytes(48).toString("base64url");
// Upper case, lower case, digits and a symbol: SQL Server refuses anything less.
const dbPassword = `Dev_${randomBytes(12).toString("hex")}`;

// The example lists every database the template can run on; a project lists its own.
const otherProvider = flavor.provider === "mongo"
    ? /^#\s+(sqlite|pg|mysql|mssql)\s+DATABASE_URL=.*\r?\n/gm
    : /^#\s+(mongo)?\s+DATABASE_URL=(memory|mongodb).*\r?\n/gm;

const example = read(".env.example")
    .replace(otherProvider, "")
    .replace(/^DB_CLIENT=.*$/m, `DB_CLIENT=${flavor.client}`)
    .replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${flavor.url("change-me")}`);
write(".env.example", example);

// SQLite has no database container, and the development MongoDB one has no password.
const composeSettings = flavor.url(dbPassword).includes(dbPassword) ? `
# ---------------------------------------------------------------- docker compose
# The password of the database container (docker-compose.yml), and the one in DATABASE_URL above.
DB_PASSWORD=${dbPassword}
` : "";

write(".env", example
    .replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${flavor.url(dbPassword)}`)
    .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${jwtSecret}`)
    + composeSettings);

// ----------------------------------------------------------------- the name, everywhere
// Docs written for the template itself are cut out of the copy, then the template's name
// becomes the project's in every text file.
const TEXT = /\.(js|mjs|json|md|yml|yaml|html|http|example)$|^\.env$|^Dockerfile$|^\.[a-z]+ignore$/;

(function rename(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) rename(full);
        else if (TEXT.test(entry.name)) {
            const before = fs.readFileSync(full, "utf8");
            const after = before
                .replace(/<!-- template-only -->[\s\S]*?<!-- \/template-only -->\r?\n?/g, "")
                .replaceAll(TEMPLATE_NAME, appName);
            if (after !== before) fs.writeFileSync(full, after);
        }
    }
})(target);

// ----------------------------------------------------------------- done
if (args.includes("--install")) {
    console.log("\n  Installing packages...\n");
    execSync("npm install", { cwd: target, stdio: "inherit" });
}

const databaseStep = {
    mongo: "DATABASE_URL=memory runs a throwaway MongoDB inside the app (data is lost on restart).\n     For a database that keeps its data: set DATABASE_URL in .env to your local server or Atlas,\n     or `docker compose up -d db` and use mongodb://localhost:27019/app?directConnection=true",
    sqlite: "Nothing to start: the database is the file ./data/dev.sqlite.",
}[flavorName] ?? "docker compose up -d db      (or point DATABASE_URL in .env at a server of your own)";

console.log(`
  Created ${appName} in ${target}
  Database: ${flavor.label}

  Next:
     cd ${path.relative(process.cwd(), target) || "."}
     ${args.includes("--install") ? "" : "npm install\n     "}${databaseStep}
     npm run dev                  http://localhost:5000  (admin@example.com / Password123!)
     npm test
`);
