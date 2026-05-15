/**
 * Luminari Spine — Storage Adapter
 *
 * Provides S3-compatible storage operations that work with both:
 * - Manus Forge storage proxy (legacy)
 * - MinIO (Spine sovereign deployment)
 *
 * Detection is automatic based on environment variables:
 * - If SPINE_STORAGE_ENDPOINT is set → MinIO mode (direct S3 SDK)
 * - Otherwise → Manus Forge proxy mode (existing behavior)
 *
 * This file is a drop-in replacement for storage.ts.
 * Import from here instead of storage.ts for Spine-compatible code.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ─── Mode Detection ───

type StorageMode = "minio" | "forge";

function detectMode(): StorageMode {
  if (process.env.SPINE_STORAGE_ENDPOINT) {
    return "minio";
  }
  return "forge";
}

// ─── MinIO / S3 Direct Mode ───

let _s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (_s3Client) return _s3Client;

  const endpoint = process.env.SPINE_STORAGE_ENDPOINT;
  const accessKey = process.env.SPINE_STORAGE_ACCESS_KEY;
  const secretKey = process.env.SPINE_STORAGE_SECRET_KEY;
  const region = process.env.SPINE_STORAGE_REGION || "us-east-1";

  if (!endpoint || !accessKey || !secretKey) {
    throw new Error(
      "[Spine Storage] MinIO mode requires SPINE_STORAGE_ENDPOINT, " +
        "SPINE_STORAGE_ACCESS_KEY, and SPINE_STORAGE_SECRET_KEY"
    );
  }

  _s3Client = new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
    forcePathStyle: process.env.SPINE_STORAGE_FORCE_PATH_STYLE === "true",
  });

  console.log(`[Spine Storage] Initialized MinIO client → ${endpoint}`);
  return _s3Client;
}

function getBucket(): string {
  return process.env.SPINE_STORAGE_BUCKET || "spine-documents";
}

async function minioPut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string
): Promise<{ key: string; url: string }> {
  const client = getS3Client();
  const bucket = getBucket();
  const key = relKey.replace(/^\/+/, "");

  const body =
    typeof data === "string" ? Buffer.from(data, "utf-8") : data;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  // Construct direct URL (MinIO public access or presigned)
  const endpoint = process.env.SPINE_STORAGE_ENDPOINT!.replace(/\/+$/, "");
  const url = `${endpoint}/${bucket}/${key}`;

  return { key, url };
}

async function minioGet(
  relKey: string,
  expiresIn: number = 3600
): Promise<{ key: string; url: string }> {
  const client = getS3Client();
  const bucket = getBucket();
  const key = relKey.replace(/^\/+/, "");

  const url = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn }
  );

  return { key, url };
}

// ─── Manus Forge Proxy Mode (existing behavior) ───

async function forgePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string
): Promise<{ key: string; url: string }> {
  // Dynamic import to avoid loading forge deps in MinIO mode
  const { storagePut } = await import("./storage");
  return storagePut(relKey, data, contentType);
}

async function forgeGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  const { storageGet } = await import("./storage");
  return storageGet(relKey);
}

// ─── Unified API ───

/**
 * Upload bytes to storage.
 * Automatically routes to MinIO or Manus Forge based on environment.
 */
export async function spineStoragePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const mode = detectMode();
  if (mode === "minio") {
    return minioPut(relKey, data, contentType);
  }
  return forgePut(relKey, data, contentType);
}

/**
 * Get a download URL for a stored object.
 * MinIO returns a presigned URL; Forge returns a proxy URL.
 */
export async function spineStorageGet(
  relKey: string,
  expiresIn?: number
): Promise<{ key: string; url: string }> {
  const mode = detectMode();
  if (mode === "minio") {
    return minioGet(relKey, expiresIn);
  }
  return forgeGet(relKey);
}

/**
 * Get the current storage mode for diagnostics.
 */
export function getStorageMode(): StorageMode {
  return detectMode();
}
