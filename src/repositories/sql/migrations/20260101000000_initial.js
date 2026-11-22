import { baseColumns, reference, timestamp } from "../schemaHelpers.js";

// Column names are written in camelCase; they become snake_case in the database (knex.js).

/** @param {import("knex").Knex} knex */
export async function up(knex) {
    await knex.schema.createTable("users", (table) => {
        baseColumns(table);
        table.string("fullName", 200).notNullable();
        table.string("username", 100).notNullable();
        table.string("email", 256).notNullable();
        // The lower-cased copies are what is looked up and what is unique, so "Sara@x.com"
        // and "sara@x.com" are one account on every database.
        table.string("normalizedUsername", 100).notNullable().unique();
        table.string("normalizedEmail", 256).notNullable().unique();
        table.string("passwordHash", 200).notNullable();
        table.string("role", 50).notNullable();
        table.boolean("isActive").notNullable().defaultTo(true);
        table.string("jobDescription", 120).nullable();
        table.string("phoneNumber", 30).nullable();
        table.string("profilePictureUrl", 1000).nullable();

        // Rotated whenever the role or the password changes; a token carries it.
        table.string("securityStamp", 36).notNullable();
        table.integer("accessFailedCount").notNullable().defaultTo(0);
        timestamp(table, "lockoutEnd").nullable();
        table.string("resetTokenHash", 64).nullable();
        timestamp(table, "resetTokenExpiresAt").nullable();

        table.index(["role"]);
    });

    // The example resource - replace with the application's own tables.
    await knex.schema.createTable("items", (table) => {
        baseColumns(table);
        table.string("title", 200).notNullable();
        table.string("status", 20).notNullable();
        reference(table, "ownerId", "users").notNullable();

        // The list is always "this owner's items, newest first".
        table.index(["ownerId", "createdAt"]);
    });
}

/** @param {import("knex").Knex} knex */
export async function down(knex) {
    await knex.schema.dropTable("items");
    await knex.schema.dropTable("users");
}
