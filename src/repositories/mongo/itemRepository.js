import { GenericRepository } from "./genericRepository.js";
import { ItemModel } from "./models/item.model.js";
import { UserModel } from "./models/user.model.js";

export class ItemRepository extends GenericRepository {
    constructor() {
        super({ model: ItemModel });
    }

    /**
     * Items with their owner's name, newest first. The names come from one query for all
     * the owners on the page, not from a query per item.
     */
    async listWithOwner(where = {}) {
        const items = await ItemModel.find(this.filter(where), { title: 1, status: 1, ownerId: 1, createdAt: 1 })
            .sort({ createdAt: -1 })
            .lean();

        const owners = await UserModel.find({ _id: { $in: [...new Set(items.map((item) => item.ownerId))] } }, { fullName: 1 }).lean();
        const names = new Map(owners.map((owner) => [owner._id, owner.fullName]));

        return items.map((item) => ({ ...this.toEntity(item), ownerName: names.get(item.ownerId) ?? "" }));
    }

    /** { status: count } - counted by the database, one group per status, never by loading the items. */
    async countByStatus(where = {}) {
        const groups = await ItemModel.aggregate([
            { $match: this.filter(where) },
            { $group: { _id: "$status", count: { $sum: 1 } } },
        ]);

        return Object.fromEntries(groups.map((group) => [group._id, group.count]));
    }
}
