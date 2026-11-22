// ------------------- Entities served by the generic repository -------------------
// name -> { model }. An entry here is all `unitOfWork.repository("name")` needs.
//
// users and items are not here: they have repositories of their own (index.js).

// [new-feature:mongo-model-import] - scripts/new-feature.mjs imports the next model above this line

export const entities = {
    // [new-feature:mongo-entity] - scripts/new-feature.mjs registers the next entity above this line
};
