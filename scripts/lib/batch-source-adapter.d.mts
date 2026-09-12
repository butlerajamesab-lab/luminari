export const BATCH_SOURCE_PARSER_VERSION: string;
export function parse_batch_source(bytes: Buffer, source_name: string,
  recognize_images?: ((bytes: Buffer, source_hash: string) => Promise<Map<string, {text: string; engine: string}>>) | null,
  depth?: number): Promise<{ parser_version: string; source_name: string; source_sha256: string;
    observations: import("../../server/services/batch-corpus-source").batch_observation[];
    holds: Record<string, unknown>[]; parts: Record<string, unknown>[]; resources?: Record<string, unknown>[];
    native_records?: Record<string, unknown>[] }>;
