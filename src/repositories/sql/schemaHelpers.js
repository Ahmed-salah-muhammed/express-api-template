// What migrations share, so every table is shaped the same way.

/** A point in time: stored with its offset where the database can, and to the millisecond everywhere. */
export const timestamp = (table, name) => table.datetime(name, { useTz: true, precision: 3 });

/**
 * The columns every entity has. The id is a UUID kept as a 36-character string rather than
 * the database's own uuid type: SQL Server hands that type back in upper case, MySQL has
 * none, and an id that changes its spelling with the database is not an id.
 */
export function baseColumns(table) {
    table.string("id", 36).primary();
    timestamp(table, "createdAt").notNullable();
    timestamp(table, "updatedAt").nullable();
    table.boolean("isDeleted").notNullable().defaultTo(false);
    timestamp(table, "deletedAt").nullable();
}

/**
 * A foreign key to another entity. No ON DELETE action, on purpose: rows are soft-deleted,
 * so a real DELETE is already an exception - and when one does happen it must be refused
 * rather than quietly take the rows that point at it along.
 */
export const reference = (table, name, otherTable) =>
    table.string(name, 36).references("id").inTable(otherTable);
