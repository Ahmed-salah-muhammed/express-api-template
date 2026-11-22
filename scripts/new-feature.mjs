#!/usr/bin/env node
// ------------------- Scaffolds a feature -------------------
//
//   npm run new:feature -- Product
//   npm run new:feature -- Category --plural Categories
//
// Writes the same vertical slice the Items example is made of, for a new entity with a
// single `name` field - schemas, service, controller, router, a test file, and the entity
// itself for whichever database the project uses (a migration for SQL, a model for
// MongoDB) - and makes every registration at the [new-feature:...] markers.
//
// What comes out lints and passes its own tests; shape the entity and its schemas to the
// real fields afterwards. It refuses to run twice for the same name, and changes nothing
// at all if a marker is missing from a file.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const name = args.find((arg) => !arg.startsWith("--"));
const pluralFlag = args.indexOf("--plural");

function stop(message) {
    console.error(`\n  ${message}\n`);
    process.exit(1);
}

if (!name || !/^[A-Z][A-Za-z0-9]*$/.test(name)) {
    stop("Usage: npm run new:feature -- <Name> [--plural <Names>]   (PascalCase, e.g. Product or PurchaseOrder)");
}

const guessPlural = (word) =>
    /(s|x|z|ch|sh)$/.test(word) ? `${word}es` : /[^aeiou]y$/.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`;

const Plural = pluralFlag >= 0 ? args[pluralFlag + 1] : guessPlural(name);
if (!Plural || !/^[A-Z][A-Za-z0-9]*$/.test(Plural) || Plural === name) {
    stop(`The plural must be PascalCase and differ from the name. Got "${Plural}" - pass --plural explicitly.`);
}

const lowerFirst = (word) => word[0].toLowerCase() + word.slice(1);
const separated = (word, separator) => word.replace(/(?<!^)([A-Z])/g, `${separator}$1`).toLowerCase();

const tokens = {
    __Name__: name, //                         ProductCategory
    __name__: lowerFirst(name), //             productCategory
    __Plural__: Plural, //                     ProductCategories
    __plural__: lowerFirst(Plural), //         productCategories  (files, the entity key, the table)
    __route__: separated(Plural, "-"), //      product-categories (the URL)
    __code__: separated(name, "_"), //         product_category   (the error code)
};
const fill = (text) => Object.entries(tokens).reduce((result, [token, value]) => result.replaceAll(token, value), text);

const hasSql = fs.existsSync(path.join(root, "src/repositories/sql"));
const hasMongo = fs.existsSync(path.join(root, "src/repositories/mongo"));

// ----------------------------------------------------------------- the files
const files = {};

files["src/models/dtos/__plural__.dto.js"] = `import { z } from "zod";
import { paginationQuery } from "../common/pagination.js";
import { notBlank, optionalText } from "./common.js";

export const to__Name__Dto = ({ id, name, createdAt }) => ({ id, name, createdAt });

// Paged from the start: a list that can grow is never returned whole.
export const __name__FilterSchema = z.object({
    ...paginationQuery,
    search: z.string().trim().max(200).optional(),
});

export const create__Name__Schema = z.object({
    name: notBlank(200),
});

// Every field is optional - only what is sent gets written.
export const update__Name__Schema = z.object({
    name: optionalText(200),
});
`;

files["src/services/__plural__/__name__Service.js"] = `import { fail, ok } from "../../models/common/apiResponse.js";
import { ErrorCodes } from "../../models/common/errorCodes.js";
import { to__Name__Dto } from "../../models/dtos/__plural__.dto.js";
import { unitOfWork } from "../../repositories/index.js";

const __plural__ = () => unitOfWork.repository("__plural__");

const notFound = () => fail(ErrorCodes.__Name__NotFound, "__Name__ not found.");

export async function getAll({ page, pageSize, search }) {
    const result = await __plural__().page({}, { page, pageSize, search: search ? { fields: ["name"], term: search } : undefined });

    return ok("__Plural__ retrieved successfully.", { ...result, items: result.items.map(to__Name__Dto) });
}

export async function getById(id) {
    const entity = await __plural__().getById(id);
    return entity ? ok("__Name__ retrieved successfully.", to__Name__Dto(entity)) : notFound();
}

export async function create({ name }) {
    return ok("__Name__ created successfully.", to__Name__Dto(await __plural__().add({ name })));
}

export async function update(id, { name }) {
    // Blank and absent both mean "not sent": the name is left alone.
    const entity = await __plural__().update(id, { name: name || undefined });
    return entity ? ok("__Name__ updated successfully.", to__Name__Dto(entity)) : notFound();
}

export async function remove(id) {
    return (await __plural__().remove(id)) ? ok("__Name__ deleted successfully.") : notFound();
}
`;

files["src/controllers/__plural__.controller.js"] = `import * as __name__Service from "../services/__plural__/__name__Service.js";
import { respond } from "../utils/respond.js";

export const getAll = async (req, res) => respond(res, await __name__Service.getAll(req.validatedQuery));

export const getById = async (req, res) => respond(res, await __name__Service.getById(req.params.id));

export const create = async (req, res) => respond(res, await __name__Service.create(req.body));

export const update = async (req, res) => respond(res, await __name__Service.update(req.params.id, req.body));

export const remove = async (req, res) => respond(res, await __name__Service.remove(req.params.id));
`;

files["src/routes/__plural__.routes.js"] = `import { Router } from "express";
import * as controller from "../controllers/__plural__.controller.js";
import { UserRole } from "../enums/index.js";
import { authenticate, authorize } from "../middlewares/authenticate.js";
import { validate } from "../middlewares/validate.js";
import { create__Name__Schema, __name__FilterSchema, update__Name__Schema } from "../models/dtos/__plural__.dto.js";

// Scaffolded with a sensible default - every signed-in role reads, only an Admin writes.
// Change authorize() to who may call each route; who may see which *rows* belongs in the
// service, from the caller's id and role (see services/items/itemService.js).
const adminOnly = authorize(UserRole.Admin);

export const __plural__Router = Router();
__plural__Router.use(authenticate);

__plural__Router.get("/", validate({ query: __name__FilterSchema }), controller.getAll);
__plural__Router.get("/:id", controller.getById);
__plural__Router.post("/", adminOnly, validate({ body: create__Name__Schema }), controller.create);
__plural__Router.patch("/:id", adminOnly, validate({ body: update__Name__Schema }), controller.update);
__plural__Router.delete("/:id", adminOnly, controller.remove);
`;

files["tests/__plural__.test.js"] = `import { describe, expect, it } from "vitest";
import { clientAs, itemsOf, shouldFail, shouldSucceed } from "./helpers/api.js";

describe("__route__", () => {
    it("an administrator creates, reads, updates and deletes", async () => {
        const admin = await clientAs("admin");
        const name = \`__Name__ \${crypto.randomUUID()}\`;

        const id = shouldSucceed(await admin.post("__route__", { name: \`  \${name}  \` })).data.id;

        expect(shouldSucceed(await admin.get(\`__route__/\${id}\`)).data).toMatchObject({ id, name });
        expect(itemsOf(await admin.get(\`__route__?search=\${encodeURIComponent(name.toUpperCase())}\`)).map((row) => row.id)).toEqual([id]);

        expect(shouldSucceed(await admin.patch(\`__route__/\${id}\`, { name: \`\${name} (edited)\` })).data.name).toBe(\`\${name} (edited)\`);

        shouldSucceed(await admin.delete(\`__route__/\${id}\`));
        shouldFail(await admin.get(\`__route__/\${id}\`), 404, "__code__.not_found");
        shouldFail(await admin.delete(\`__route__/\${id}\`), 404, "__code__.not_found");
    });

    it("everyone reads and only an administrator writes", async () => {
        const member = await clientAs("member");

        shouldSucceed(await member.get("__route__"));
        shouldFail(await member.post("__route__", { name: "Not allowed" }), 403, "http.forbidden");
    });

    it("a blank name is refused and the list is paged", async () => {
        const admin = await clientAs("admin");

        expect(shouldFail(await admin.post("__route__", { name: "   " }), 400, "validation.fields").args.fields).toBe("name");

        const page = shouldSucceed(await admin.get("__route__?pageSize=1")).data;
        expect(page.pageSize).toBe(1);
        expect(page.items.length).toBeLessThanOrEqual(1);
    });
});
`;

if (hasSql) {
    const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);

    files[`src/repositories/sql/migrations/${stamp}_create_${separated(Plural, "_")}.js`] = `import { baseColumns } from "../schemaHelpers.js";

// Column names are written in camelCase; they become snake_case in the database (knex.js).

/** @param {import("knex").Knex} knex */
export async function up(knex) {
    await knex.schema.createTable("__plural__", (table) => {
        baseColumns(table);
        table.string("name", 200).notNullable();
    });
}

/** @param {import("knex").Knex} knex */
export async function down(knex) {
    await knex.schema.dropTable("__plural__");
}
`;
}

if (hasMongo) {
    files["src/repositories/mongo/models/__name__.model.js"] = `import mongoose from "mongoose";
import { entitySchema } from "./base.js";

const schema = entitySchema(
    {
        name: { type: String, required: true },
    },
    "__plural__",
);

export const __Name__Model = mongoose.model("__Name__", schema);
`;
}

// ----------------------------------------------------------------- the registrations
const insertions = [
    { file: "src/models/common/errorCodes.js", marker: "new-feature:error-code", line: '__Name__NotFound: "__code__.not_found",' },
    { file: "src/routes/index.js", marker: "new-feature:route-import", line: 'import { __plural__Router } from "./__plural__.routes.js";' },
    { file: "src/routes/index.js", marker: "new-feature:route", line: 'apiRouter.use("/__route__", __plural__Router);' },
];

if (hasSql) {
    insertions.push({ file: "src/repositories/sql/entities.js", marker: "new-feature:sql-entity", line: '__plural__: { table: "__plural__" },' });
}
if (hasMongo) {
    insertions.push(
        { file: "src/repositories/mongo/entities.js", marker: "new-feature:mongo-model-import", line: 'import { __Name__Model } from "./models/__name__.model.js";' },
        { file: "src/repositories/mongo/entities.js", marker: "new-feature:mongo-entity", line: "__plural__: { model: __Name__Model }," },
    );
}

const markerPattern = (marker) => new RegExp(`^([ \\t]*)// \\[${marker}\\]`, "m");

// ----------------------------------------------------------------- check everything first
for (const relative of Object.keys(files)) {
    const target = fill(relative);
    if (fs.existsSync(path.join(root, target))) stop(`${target} already exists - "${name}" has been scaffolded before. Nothing was changed.`);
}
if (fs.existsSync(path.join(root, "src/routes", `${tokens.__plural__}.routes.js`))) stop(`"${name}" has been scaffolded before. Nothing was changed.`);

for (const { file, marker } of insertions) {
    const target = path.join(root, file);
    if (!fs.existsSync(target)) stop(`${file} was not found. Nothing was changed.`);
    if (!markerPattern(marker).test(fs.readFileSync(target, "utf8"))) stop(`The marker [${marker}] is missing from ${file}. Nothing was changed.`);
}

// ----------------------------------------------------------------- write
for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, fill(relative));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, fill(content));
    console.log(`  created  ${fill(relative)}`);
}

for (const { file, marker, line } of insertions) {
    const target = path.join(root, file);
    const text = fs.readFileSync(target, "utf8");
    const match = markerPattern(marker).exec(text);
    const newline = text.includes("\r\n") ? "\r\n" : "\n";

    fs.writeFileSync(target, text.slice(0, match.index) + match[1] + fill(line) + newline + text.slice(match.index));
    console.log(`  updated  ${file}`);
}

console.log(`
Done. Next:
  1. Shape the entity to its real fields: the schemas in src/models/dtos/${tokens.__plural__}.dto.js${hasSql ? ", the migration" : ""}${hasMongo ? ", the model" : ""}.
  2. npm test${hasSql ? "   (and `npm run migrate` for a database that does not migrate on start)" : ""}
  3. Add the translation of "${tokens.__code__}.not_found" to the frontend's errors.json (both languages).
`);
