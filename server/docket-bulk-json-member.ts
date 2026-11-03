/**
 * LegiScan Bulk JSON layout: folder names and payload wrappers are not 1:1.
 * bill/*.json -> {"bill": ...}; people/*.json -> {"person": ...};
 * vote/*.json -> {"roll_call": ...}. Never synthesize source identities.
 */
export type docket_bulk_record_kind = "bill" | "person" | "roll_call";
export type docket_bulk_parsed_member = {
  kind: docket_bulk_record_kind;
  payload: Record<string, unknown>;
  id: number;
};
const mapping = {
  bill: { wrapper: "bill", id_key: "bill_id" },
  people: { wrapper: "person", id_key: "people_id" },
  vote: { wrapper: "roll_call", id_key: "roll_call_id" },
} as const;

export function parse_docket_bulk_json_member(
  member_path: string,
  raw: Buffer,
  jurisdiction: string,
  session_ids: string,
): docket_bulk_parsed_member {
  const parts = member_path.split("/");
  if (parts.length !== 4 || parts[0] !== jurisdiction ||
      !parts[1] || parts.some(part => !part || part === "." || part === "..") ||
      member_path.includes("\\") || member_path.startsWith("/")) {
    throw new Error("docket_bulk_member_path_mismatch: " + member_path);
  }
  const [, , folder, filename] = parts;
  if (!Object.prototype.hasOwnProperty.call(mapping, folder) ||
      !filename.endsWith(".json") || filename.length <= 5) {
    throw new Error("docket_bulk_unrecognized_json_member: " + member_path);
  }
  const spec = mapping[folder as keyof typeof mapping];
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error("docket_bulk_invalid_json_member: " + member_path);
  }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new Error("docket_bulk_invalid_member_envelope: " + member_path);
  }
  const envelope = decoded as Record<string, unknown>;
  if (Object.keys(envelope).length !== 1 ||
      !Object.prototype.hasOwnProperty.call(envelope, spec.wrapper)) {
    throw new Error("docket_bulk_wrong_member_wrapper: " + member_path);
  }
  const payload = envelope[spec.wrapper];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("docket_bulk_invalid_member_payload: " + member_path);
  }
  const record = payload as Record<string, unknown>;
  const id = Number(record[spec.id_key]);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error("docket_bulk_invalid_member_id: " + member_path);
  }
  if (folder !== "bill" && filename.slice(0, -5) !== String(id)) {
    throw new Error("docket_bulk_filename_id_mismatch: " + member_path);
  }
  if (folder === "bill") {
    const session_id = Number(record.session_id);
    const allowed = new Set(session_ids.split(";"));
    if (record.state !== jurisdiction ||
        !Number.isSafeInteger(session_id) || session_id < 1 ||
        !allowed.has(String(session_id)) ||
        typeof record.bill_number !== "string" || !record.bill_number.trim()) {
      throw new Error("docket_bulk_bill_identity_mismatch: " + member_path);
    }
  }
  return {
    kind: spec.wrapper,
    payload: record,
    id,
  };
}
