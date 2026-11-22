import { ITEM_STATUSES, ItemStatus, UserRole } from "../../enums/index.js";
import { fail, ok } from "../../models/common/apiResponse.js";
import { ErrorCodes } from "../../models/common/errorCodes.js";
import { unitOfWork } from "../../repositories/index.js";

// ------------------- The example resource, and the pattern to copy -------------------
// The rule it enforces: an Admin reads every item and writes none; everyone else reads and
// writes their own.
//
// Every function takes who is asking. Which rows a caller may see or change is decided
// here, from (callerId, callerRole) - not by the route's authorize(), which can only say
// whether a role may call the endpoint at all.

const items = unitOfWork.items;

/**
 * The rows this caller may see, as a filter. Every read starts here, so the rule is
 * written once and a new query cannot forget it.
 */
const visibleTo = (callerId, callerRole) => (callerRole === UserRole.Admin ? {} : { ownerId: callerId });

const toItemDto = ({ id, title, status, ownerId, ownerName, createdAt }) => ({ id, title, status, ownerId, ownerName, createdAt });

async function getDto(id) {
    const [item] = await items.listWithOwner({ id });
    return toItemDto(item);
}

export async function getAll({ status } = {}, callerId, callerRole) {
    const rows = await items.listWithOwner({ ...visibleTo(callerId, callerRole), status });
    return ok("Items retrieved successfully.", rows.map(toItemDto));
}

export async function create({ title }, callerId, callerRole) {
    if (callerRole === UserRole.Admin) {
        return fail(ErrorCodes.ItemAdminReadOnly, "The administrator only reads items.");
    }

    const trimmed = typeof title === "string" ? title.trim() : "";
    if (trimmed === "") return fail(ErrorCodes.ItemTitleRequired, "A title is required.");

    const item = await items.add({ title: trimmed, status: ItemStatus.Open, ownerId: callerId });

    return ok("Item created successfully.", await getDto(item.id));
}

export async function setStatus(id, { status }, callerId) {
    const item = await items.getById(id);
    if (!item) return fail(ErrorCodes.ItemNotFound, "Item not found.");

    if (item.ownerId !== callerId) return fail(ErrorCodes.ItemNotYours, "This item belongs to someone else.");

    // The names are the contract, exactly: "done" and 2 are not states.
    if (!ITEM_STATUSES.includes(status)) return fail(ErrorCodes.ItemStatusInvalid, "Unknown status.");

    await items.update(id, { status });

    return ok("Status updated successfully.", await getDto(id));
}

export async function remove(id, callerId) {
    const item = await items.getById(id);
    if (!item) return fail(ErrorCodes.ItemNotFound, "Item not found.");

    if (item.ownerId !== callerId) return fail(ErrorCodes.ItemNotYours, "This item belongs to someone else.");

    await items.remove(id);

    return ok("Item deleted successfully.");
}
