import { FileKind } from "../../enums/index.js";

// ------------------- What a file actually is -------------------
// Read from its first bytes - never from the name or the content type the client sent,
// both of which the client chooses. The content type stored and served comes from here, so
// a script named photo.jpg is refused rather than saved and later served as an image.

export const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

/** What a phone camera and a browser's own recorder write. */
export const VIDEO_EXTENSIONS = new Set([".mp4", ".m4v", ".mov", ".3gp", ".webm", ".mkv"]);

/** Images plus the office documents an attachment usually is. */
export const DOCUMENT_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf", ".doc", ".docx", ".xls", ".xlsx"]);

// HEIF stills (HEIC, AVIF) and MPEG-4 audio share the ISO container with video and are
// told apart only by the brand; none of them is a video.
const NOT_VIDEO_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevm", "hevs", "hevx", "mif1", "msf1", "avif", "avis", "M4A ", "M4B ", "M4P "]);

const startsWith = (buffer, bytes, offset = 0) =>
    buffer.length >= offset + bytes.length && bytes.every((byte, index) => buffer[offset + index] === byte);

const ascii = (text) => [...text].map((char) => char.charCodeAt(0));

const sniffed = (contentType, extension, kind) => ({ contentType, extension, kind });

/**
 * Identifies a file from its header, or returns null when the bytes are not one of the
 * accepted kinds. `extension` is the client's, used only to tell the zip-based office
 * formats apart (docx/xlsx share a header) - never to accept a file.
 */
export function identify(buffer, extension) {
    const ext = String(extension ?? "").toLowerCase();

    if (startsWith(buffer, [0xff, 0xd8, 0xff])) return sniffed("image/jpeg", ext === ".jpeg" ? ".jpeg" : ".jpg", FileKind.Image);

    if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return sniffed("image/png", ".png", FileKind.Image);

    if (startsWith(buffer, ascii("RIFF")) && startsWith(buffer, ascii("WEBP"), 8)) return sniffed("image/webp", ".webp", FileKind.Image);

    // ISO base media - mp4, mov, 3gp: a box size, then "ftyp", then the major brand.
    if (startsWith(buffer, ascii("ftyp"), 4) && buffer.length >= 12) {
        const brand = buffer.subarray(8, 12).toString("latin1");
        if (NOT_VIDEO_BRANDS.has(brand)) return null;
        if (brand === "qt  ") return sniffed("video/quicktime", ".mov", FileKind.Video);
        if (brand.startsWith("3g")) return sniffed("video/3gpp", ".3gp", FileKind.Video);
        return sniffed("video/mp4", ".mp4", FileKind.Video);
    }

    // Matroska / WebM - what a browser's MediaRecorder writes.
    if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return sniffed("video/webm", ".webm", FileKind.Video);

    if (startsWith(buffer, ascii("%PDF-"))) return sniffed("application/pdf", ".pdf", FileKind.Pdf);

    // Legacy Office (OLE compound file) - .doc / .xls
    if (startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
        if (ext === ".xls") return sniffed("application/vnd.ms-excel", ".xls", FileKind.Document);
        if (ext === ".doc") return sniffed("application/msword", ".doc", FileKind.Document);
        return null;
    }

    // OOXML (zip) - .docx / .xlsx; the extension decides which, the header only says "zip".
    if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) {
        if (ext === ".docx") return sniffed("application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx", FileKind.Document);
        if (ext === ".xlsx") return sniffed("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx", FileKind.Document);
        return null;
    }

    return null;
}
