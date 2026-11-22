import { describe, expect, it } from "vitest";
import { ErrorCodes, httpStatus } from "../src/models/common/errorCodes.js";
import { MAX_PAGE_SIZE, normalizePage, normalizePageSize, pagedResult } from "../src/models/common/pagination.js";
import { identify } from "../src/services/common/fileSniffer.js";
import { decodeKey, encodeKey, fileName, segment } from "../src/services/storage/storagePath.js";
import { passwordProblems } from "../src/utils/password.js";

// Plain unit tests: no HTTP, no database.

describe("error codes", () => {
    const codes = Object.values(ErrorCodes);

    it("every code is unique and spelled the way the client keys its translations", () => {
        expect(new Set(codes).size).toBe(codes.length); // two failures sharing a code share a sentence

        // errors:<code> in the frontend's locale files: lower-case segments joined by dots.
        for (const code of codes) expect(code).toMatch(/^[a-z0-9_]+(\.[a-z0-9_]+)*$/);
    });

    it("a code travels with the status it means", () => {
        expect(httpStatus(ErrorCodes.UserNotFound)).toBe(404);
        expect(httpStatus("anything_new.not_found")).toBe(404); // the suffix is the rule, not a list
        expect(httpStatus(ErrorCodes.ItemNotYours)).toBe(403);
        expect(httpStatus(ErrorCodes.AuthInvalidCredentials)).toBe(401);
        expect(httpStatus(ErrorCodes.UserEmailTaken)).toBe(400);
        expect(httpStatus(null)).toBe(400);
    });
});

describe("paging", () => {
    it.each([[0, 1], [-3, 1], ["x", 1], [undefined, 1], ["7", 7]])("a page of %j is page %j", (requested, expected) => {
        expect(normalizePage(requested)).toBe(expected);
    });

    it.each([0, -1, 100_000, "everything"])("a page size of %j is clamped so nobody reads the whole table", (requested) => {
        expect(normalizePageSize(requested)).toBe(MAX_PAGE_SIZE);
    });

    it("a page knows where it stands", () => {
        expect(pagedResult(["a"], 2, 10, 25)).toMatchObject({ totalPages: 3, hasPrevious: true, hasNext: true });
        expect(pagedResult([], 1, 10, 0)).toMatchObject({ totalPages: 0, hasPrevious: false, hasNext: false });
    });
});

describe("password policy", () => {
    it("eight characters with a digit and a symbol; case is not required", () => {
        expect(passwordProblems("lowercase-only1!")).toEqual([]);
        expect(passwordProblems("short1!")).toHaveLength(1);
        expect(passwordProblems("")).toHaveLength(3);
        expect(passwordProblems(undefined)).toHaveLength(3);
    });
});

describe("storage paths", () => {
    it.each([
        ["عقد الصيانة 2026", "عقد الصيانة 2026"], // other scripts and spaces survive
        ["a/b\\c?d#e", "a-b-c-d-e"], // what breaks a key or a URL does not
        ["  trailing dot.  ", "trailing dot"],
        ["   ", "fallback"],
        [null, "fallback"],
    ])("the segment for %j is %j", (value, expected) => {
        expect(segment(value, "fallback")).toBe(expected);
    });

    it("a file name is unique, dated and keeps its extension", () => {
        const at = new Date("2026-03-09T00:00:00Z");

        const first = fileName(".jpg", at, "site photo");

        expect(first).toMatch(/^[0-9a-f-]{36}-2026-03-09-site photo\.jpg$/);
        expect(fileName(".jpg", at, "site photo")).not.toBe(first);
    });

    it("encoding a key round-trips and leaves the slashes alone", () => {
        const key = "users/عقد 12/file name.png";
        const encoded = encodeKey(key);

        expect(encoded).not.toContain(" ");
        expect(encoded.split("/")).toHaveLength(3);
        expect(decodeKey(encoded)).toBe(key);
    });
});

describe("file sniffer", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

    it("a file is identified by its header", () => {
        expect(identify(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), ".jpg")).toMatchObject({ kind: "Image", contentType: "image/jpeg" });
        expect(identify(png, ".png")).toMatchObject({ kind: "Image", contentType: "image/png" });
        expect(identify(Buffer.from("%PDF-1.7"), ".pdf")).toMatchObject({ kind: "Pdf" });
        expect(identify(Buffer.from("\0\0\0\x18ftypmp42"), ".mp4")).toMatchObject({ kind: "Video" });
        expect(identify(Buffer.from("\0\0\0\x18ftypheic"), ".mp4")).toBeNull(); // a still, not a video
    });

    it("the extension never makes a file something it is not", () => {
        expect(identify(Buffer.from("#!/bin/sh"), ".png")).toBeNull();
        expect(identify(Buffer.alloc(0), ".jpg")).toBeNull();

        // A zip is only a document under a document's name - never an image.
        expect(identify(zip, ".png")).toBeNull();
        expect(identify(zip, ".docx")).toMatchObject({ kind: "Document" });
    });

    it("the content type comes from the bytes, not from the name", () => {
        expect(identify(png, ".jpg")).toMatchObject({ contentType: "image/png", extension: ".png" });
    });
});
