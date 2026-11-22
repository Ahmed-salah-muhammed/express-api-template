import { randomUUID } from "node:crypto";

// ------------------- Where a file goes in the store, and what it is called there -------------------
// A key built only from ids - "orders/{uuid}/{uuid}.jpg" - is unique and unreadable: nobody
// opening the bucket can find a customer's files without first looking the id up in the
// database. So folders can be named with the words people actually use, made safe by
// segment(), and the file keeps a uuid in front so two uploads on the same day cannot collide.

// The characters that break an S3 key or a URL built from one. The forward slash leads:
// left in, it would silently invent a folder level inside a name.
const UNSAFE = /[/\\?#%"'<>{}[\]|^`~*]/g;

/**
 * One path segment, safe to put in a key and in a URL. Letters of any script, digits,
 * spaces and hyphens survive - the point is that it still reads as the name it came from.
 */
export function segment(value, fallback) {
    if (typeof value !== "string" || value.trim() === "") return fallback;

    const text = value
        .normalize("NFC")
        // eslint-disable-next-line no-control-regex -- control characters are exactly what is being removed
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .replace(UNSAFE, "-")
        .split(" ")
        .filter(Boolean)
        .join(" ")
        // Never end on a dot: legal in a key and confusing in a filename.
        .replace(/^[ .-]+|[ .-]+$/g, "");

    if (text === "") return fallback;

    // Generous, but a key is capped at 1024 bytes in total and a non-Latin character is two
    // bytes or more - a few segments of 80 leave plenty of room for the filename.
    return text.length <= 80 ? text : text.slice(0, 80).replace(/[ .-]+$/g, "");
}

/**
 * The file's own name: a uuid, the date, and optionally what it is of. The uuid stays
 * first - it is what makes the name unique. The date and the descriptor are what make it
 * readable once found.
 */
export function fileName(extension, at = new Date(), descriptor = null) {
    const stamp = at.toISOString().slice(0, 10);
    const tail = descriptor ? segment(descriptor, "") : "";

    return `${randomUUID()}-${stamp}${tail ? `-${tail}` : ""}${extension}`;
}

/**
 * Percent-encodes each segment and rejoins them with real slashes. A key with spaces or
 * non-Latin letters needs it - a literal space in an href is not a valid URL - and the
 * slashes stay literal or the hierarchy would collapse into one long filename.
 */
export const encodeKey = (key) => key.split("/").map(encodeURIComponent).join("/");

/** The inverse, for turning a stored URL back into a key to read or delete. */
export const decodeKey = (encodedKey) => encodedKey.split("/").map(decodeURIComponent).join("/");
