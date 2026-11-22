import { z } from "zod";

// ------------------- Paging -------------------
// A list that can outgrow a few hundred rows must never be returned whole. Its filter
// schema spreads `paginationQuery`, and the repository's page() returns a pagedResult -
// Data then is { items, page, pageSize, totalCount, ... } instead of a bare array.

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

/** A page below one is the first page. */
export const normalizePage = (value) => {
    const page = Number.parseInt(value, 10);
    return Number.isFinite(page) && page >= 1 ? page : 1;
};

/** Clamped so a caller can't request the whole table in one go. */
export const normalizePageSize = (value) => {
    if (value === undefined || value === null || value === "") return DEFAULT_PAGE_SIZE;
    const size = Number.parseInt(value, 10);
    return Number.isFinite(size) && size >= 1 && size <= MAX_PAGE_SIZE ? size : MAX_PAGE_SIZE;
};

/**
 * The ?page=&pageSize= half of a list request: `z.object({ ...paginationQuery, search: ... })`.
 * Anything is let through here, absent included - repository.page() is what normalizes
 * and clamps them, so no caller of it can forget to.
 */
export const paginationQuery = {
    page: z.any().optional(),
    pageSize: z.any().optional(),
};

export function pagedResult(items, page, pageSize, totalCount) {
    const totalPages = pageSize > 0 ? Math.ceil(totalCount / pageSize) : 0;
    return { items, page, pageSize, totalCount, totalPages, hasPrevious: page > 1, hasNext: page < totalPages };
}
