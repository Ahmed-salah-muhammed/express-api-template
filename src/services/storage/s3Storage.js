import path from "node:path";
import { env } from "../../config/env.js";
import { decodeKey, encodeKey, fileName } from "./storagePath.js";

// Talks to any S3-compatible endpoint - MinIO locally, Cloudflare R2 or S3 in production.
// Everything provider-specific lives in the S3_* settings, never here.
//
// The AWS SDK is not a dependency of the template: it is a hundred packages that a project
// storing files on disk never loads. Switching to STORAGE_PROVIDER=s3 is
// `npm install @aws-sdk/client-s3` and the settings.

let clientPromise = null;

async function sdk() {
    clientPromise ??= (async () => {
        let aws;
        try {
            aws = await import("@aws-sdk/client-s3");
        } catch {
            throw new Error("STORAGE_PROVIDER=s3 needs the AWS SDK: run `npm install @aws-sdk/client-s3`.");
        }

        const { endpoint, region, accessKeyId, secretAccessKey, forcePathStyle } = env.storage.s3;

        const client = new aws.S3Client({
            endpoint,

            // SigV4 needs a region to sign with, even when the endpoint is not AWS. R2
            // expects "auto"; MinIO expects whatever it was started with ("us-east-1" by
            // default). Left unset, the SDK hunts for AWS_REGION or a local profile and
            // then signs with something the endpoint rejects.
            region,

            // R2 and MinIO put the bucket in the path (https://host/<bucket>/<key>). The
            // default virtual-hosted style would address https://<bucket>.host, which
            // resolves for neither.
            forcePathStyle,

            credentials: { accessKeyId, secretAccessKey },

            // Recent SDKs add a CRC32 checksum to every upload and send it as a trailer.
            // R2 rejects that outright while MinIO accepts it - so uploads work locally and
            // fail in production. WHEN_REQUIRED keeps checksums for the operations that
            // genuinely need one and leaves an ordinary PutObject alone.
            requestChecksumCalculation: "WHEN_REQUIRED",
            responseChecksumValidation: "WHEN_REQUIRED",
        });

        return { aws, client };
    })();

    return clientPromise;
}

const publicPrefix = () => `${env.storage.s3.publicUrl}/`;

/**
 * The object key behind a URL this provider handed out, or null when the URL is not one of
 * its own. Decoded: the stored URL is encoded and the SDK encodes what it is given, so the
 * encoded form would look for a key with a literal %20 in its name.
 */
function keyOf(fileUrl) {
    if (typeof fileUrl !== "string" || !fileUrl.startsWith(publicPrefix())) return null;

    try {
        return decodeKey(fileUrl.slice(publicPrefix().length));
    } catch {
        return null;
    }
}

export const s3Storage = {
    async upload(buffer, originalName, contentType, folder, descriptor = null) {
        const { aws, client } = await sdk();
        const key = `${folder}/${fileName(path.extname(originalName), new Date(), descriptor)}`;

        await client.send(new aws.PutObjectCommand({ Bucket: env.storage.s3.bucket, Key: key, Body: buffer, ContentType: contentType }));

        // The key is handed to the SDK raw - it signs and escapes it on the wire - but
        // what is stored is a URL an <img> has to load, so that is encoded per segment.
        return publicPrefix() + encodeKey(key);
    },

    async read(fileUrl) {
        const key = keyOf(fileUrl);
        if (!key) return null;

        const { aws, client } = await sdk();
        try {
            const response = await client.send(new aws.GetObjectCommand({ Bucket: env.storage.s3.bucket, Key: key }));
            return Buffer.from(await response.Body.transformToByteArray());
        } catch (error) {
            if (error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) return null;
            throw error;
        }
    },

    async remove(fileUrl) {
        const key = keyOf(fileUrl);
        if (!key) return;

        const { aws, client } = await sdk();
        await client.send(new aws.DeleteObjectCommand({ Bucket: env.storage.s3.bucket, Key: key }));
    },
};
