// ------------------- Entities served by the generic repository -------------------
// name -> { table, booleans?, dates? }. An entry here is all `unitOfWork.repository("name")`
// needs; `booleans` and `dates` list the columns of those types besides the base ones, so
// the repository can hand them back as real booleans and Dates on every database.
//
// users and items are not here: they have repositories of their own (index.js).
export const entities = {
    // [new-feature:sql-entity] - scripts/new-feature.mjs registers the next entity above this line
};
