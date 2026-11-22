import { ItemStatus, UserRole } from "../../enums/index.js";
import { ok } from "../../models/common/apiResponse.js";
import { unitOfWork } from "../../repositories/index.js";

/**
 * The figures on the signed-in role's home screen, counted on the server. An Admin gets
 * the whole system; everyone else gets their own items and no user counts at all - the two
 * keys are left out rather than sent as null.
 */
export async function getSummary(callerId, callerRole) {
    const isAdmin = callerRole === UserRole.Admin;

    const counts = await unitOfWork.items.countByStatus(isAdmin ? {} : { ownerId: callerId });
    const of = (status) => counts[status] ?? 0;

    const summary = {
        items: Object.values(counts).reduce((total, count) => total + count, 0),
        openItems: of(ItemStatus.Open),
        inProgressItems: of(ItemStatus.InProgress),
        doneItems: of(ItemStatus.Done),
    };

    if (!isAdmin) return ok("Summary retrieved successfully.", summary);

    const [users, activeUsers] = await Promise.all([
        unitOfWork.users.count(),
        unitOfWork.users.count({ isActive: true }),
    ]);

    return ok("Summary retrieved successfully.", { users, activeUsers, ...summary });
}
