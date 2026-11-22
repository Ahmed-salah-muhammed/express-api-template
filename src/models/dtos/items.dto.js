import { z } from "zod";
import { ITEM_STATUSES } from "../../enums/index.js";

export const itemFilterSchema = z.object({
    status: z.enum(ITEM_STATUSES).optional(),
});

export const createItemSchema = z.object({
    // Not required here on purpose: a blank title is answered by the service with its own
    // code (item.title_required), which the client has a sentence for.
    title: z.string().max(200).nullish(),
});

export const updateItemStatusSchema = z.object({
    // Anything is let through, for the same reason: an unknown value is then the service's
    // to refuse (item.status_invalid) instead of a validation failure naming only the field.
    status: z.any().optional(),
});
