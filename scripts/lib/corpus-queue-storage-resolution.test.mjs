import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { read_registered_queue_storage } from "./corpus-queue-storage-resolution.mjs";

const bytes = Buffer.from("retained bytes");
const digest = createHash("sha256").update(bytes).digest("hex");
const target = { source_artifact_key: "Batch/original.docx", retained_artifact_key: "Batch/keeper.docx", bucket_id: "Batch", object_name: "keeper.docx", byte_size: bytes.length, transport_etag: "retained-v1", content_sha256: digest, storage_resolution: "retained_exact_copy" };
const env = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-only" };
const row = { storage_bucket: "Batch", storage_path: "original.docx" };
const pool = (value = target) => ({ query: vi.fn().mockResolvedValue({ rows: value ? [value] : [] }) });

it("downloads the retained bytes with private auth and preserves the queue identity", async () => {
  const request = vi.fn().mockResolvedValue(new Response(bytes, { headers: { etag: '"retained-v1"' } }));
  const result = await read_registered_queue_storage(row, pool(), env, request);
  expect(result.buffer).toEqual(bytes);
  expect(result.attempts[0]).toMatchObject({ source_artifact_key: "Batch/original.docx", retained_artifact_key: "Batch/keeper.docx" });
  expect(String(request.mock.calls[0][0])).toContain("/authenticated/Batch/keeper.docx");
  expect(request.mock.calls[0][1]).toMatchObject({ redirect: "error", headers: { Authorization: "Bearer test-only" } });
  expect(row.storage_path).toBe("original.docx");
});

it("fails closed on permissions, corrupt bytes and unresolved registered sources", async () => {
  const request = vi.fn().mockResolvedValue(new Response("denied", { status: 403 }));
  await expect(read_registered_queue_storage(row, pool(), env, request)).rejects.toThrow("http_403");
  expect(request).toHaveBeenCalledTimes(1);
  request.mockResolvedValueOnce(new Response(Buffer.alloc(bytes.length), { headers: { etag: '"retained-v1"' } }));
  await expect(read_registered_queue_storage(row, pool(), env, request)).rejects.toThrow("sha256_changed");
  await expect(read_registered_queue_storage(row, pool({ original_artifact_key: "Batch/original.docx" }), env, request)).rejects.toThrow("storage_unavailable");
  await expect(read_registered_queue_storage(row, pool({ ...target, bucket_id: "public" }), env, request)).rejects.toThrow("bucket_changed");
  await expect(read_registered_queue_storage(row, pool(), { SUPABASE_URL: env.SUPABASE_URL }, request)).rejects.toThrow("credential_unavailable");
});

it("allows the existing queue path only for genuinely unregistered sources", async () => {
  expect(await read_registered_queue_storage(row, pool(null), env, vi.fn())).toBeNull();
});
