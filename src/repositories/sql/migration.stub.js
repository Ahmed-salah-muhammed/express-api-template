import { baseColumns } from "../schemaHelpers.js";

// Column names are written in camelCase; they become snake_case in the database (knex.js).

/** @param {import("knex").Knex} knex */
export async function up(knex) {
    await knex.schema.createTable("things", (table) => {
        baseColumns(table);
        table.string("name", 200).notNullable();
    });
}

/** @param {import("knex").Knex} knex */
export async function down(knex) {
    await knex.schema.dropTable("things");
}
