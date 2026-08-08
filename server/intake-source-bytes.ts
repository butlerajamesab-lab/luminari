import { createHash } from 'node:crypto';
import { storageGet } from './storage';

const SHA256_RE = /^[0-9a-f]{64}$/;

export type intake_source_artifact_locator = {
  artifact_id: string;
  artifact_key: string;
  storage_bucket: string | null;
  storage_object_path: string | null;
  byte_size: number | null;
  sha256: string | null;
};

export type intake_source_byte_read = {
  artifact_id: string;
  artifact_key: string;
  storage_key: string;
  bytes: Buffer;
  verified_sha256: string;
  verified_byte_size: number;
};

/**
 * Read the exact private source bytes already registered by the Intake Spine.
 *
 * Storage is not an authority for identity. The canonical intake_artifacts row
 * supplies the expected byte length and SHA-256. This function refuses to
 * return bytes unless the downloaded object matches both values exactly.
 */
export async function read_intake_source_artifact_bytes(
  artifact: intake_source_artifact_locator,
): Promise<intake_source_byte_read> {
  if (!artifact.artifact_id.trim()) throw new Error('intake_source_bytes_artifact_id_required');
  if (!artifact.artifact_key.trim()) throw new Error('intake_source_bytes_artifact_key_required');
  if (!artifact.storage_object_path?.trim()) throw new Error('intake_source_bytes_storage_object_path_required');
  if (artifact.byte_size === null || !Number.isSafeInteger(artifact.byte_size) || artifact.byte_size < 0) {
    throw new Error('intake_source_bytes_expected_byte_size_required');
  }
  if (!artifact.sha256 || !SHA256_RE.test(artifact.sha256)) {
    throw new Error('intake_source_bytes_expected_sha256_required');
  }

  const storage_key = artifact.storage_bucket
    ? `supabase://${artifact.storage_bucket}/${artifact.storage_object_path.replace(/^\/+/, '')}`
    : artifact.storage_object_path;
  const download = await storageGet(storage_key);
  if (!download.url) throw new Error('intake_source_bytes_download_url_missing');

  const response = await fetch(download.url, {
    method: 'GET',
    redirect: 'follow',
    headers: { Accept: 'application/octet-stream' },
  });
  if (!response.ok) {
    throw new Error(`intake_source_bytes_download_failed:${response.status}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== artifact.byte_size) {
    throw new Error(
      `intake_source_bytes_byte_size_mismatch:expected=${artifact.byte_size}:actual=${bytes.length}`,
    );
  }

  const verified_sha256 = createHash('sha256').update(bytes).digest('hex');
  if (verified_sha256 !== artifact.sha256) {
    throw new Error(
      `intake_source_bytes_sha256_mismatch:expected=${artifact.sha256}:actual=${verified_sha256}`,
    );
  }

  return {
    artifact_id: artifact.artifact_id,
    artifact_key: artifact.artifact_key,
    storage_key: download.key,
    bytes,
    verified_sha256,
    verified_byte_size: bytes.length,
  };
}
