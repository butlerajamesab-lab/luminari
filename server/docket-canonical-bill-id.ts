import { createHash } from "node:crypto";

/**
 * The original Docket/Civic Genome stable identity. This MUST stay byte-for-byte
 * equivalent to the historical stable_uuid(`docket_room:legiscan:${id}`) so
 * archive, live API, and previously projected bills share one key.
 *
 * Live read-only audit (2026-11-16): all 39,410 source-bound Genome bills had
 * this exact UUID, with no source_bill_id duplicates or mismatches.
 */
export function canonical_docket_bill_uuid(source_bill_id: number): string {
  if (!Number.isSafeInteger(source_bill_id) || source_bill_id <= 0) {
    throw new Error("docket_canonical_bill_uuid_invalid_source_bill_id");
  }
  const hash = createHash("sha256")
    .update(`docket_room:legiscan:${source_bill_id}`)
    .digest("hex");
  const variant = ((parseInt(hash[16] ?? "8", 16) & 0x3) | 0x8).toString(16);
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `${variant}${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}
