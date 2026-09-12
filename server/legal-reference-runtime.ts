import { read_current_legal_authority } from "./services/current-legal-authority-reader";
import { searchRuntimeStatutes as search_statutes, searchRuntimeCaseLaw as search_case_law } from "./legal-library-runtime-db";

export type legal_reference_kind = "statute" | "runtime_statute" | "case_law" | "legal_authority";

export function legal_commit_ref(kind: legal_reference_kind, id: string | number): string | number {
  return kind === "statute" ? id : `${kind}:${id}`;
}

export function parse_legal_commit_ref(ref: string | number): { kind: legal_reference_kind; id: string } {
  if (typeof ref === "string") {
    for (const kind of ["runtime_statute", "case_law", "legal_authority"] as const) {
      if (ref.startsWith(`${kind}:`)) return { kind, id: ref.slice(kind.length + 1) };
    }
  }
  return { kind: "statute", id: String(ref) };
}

export async function resolve_legal_reference(ref: string | number) {
  const { kind, id } = parse_legal_commit_ref(ref);
  if (!id.trim()) return { committed_ref: ref, kind, id, status: "unresolved" as const,
    reason: "The saved reference has no source identity.", record: null };
  const records = kind === "legal_authority"
    ? [await read_current_legal_authority(id)].filter(record => record != null)
    : kind === "case_law" ? await search_case_law({ record_id: id, limit: 2 })
    : await search_statutes({ record_id: id, limit: 2 });
  return { committed_ref: ref, kind, id, status: records.length === 1 ? "resolved" as const : "unresolved" as const,
    reason: records.length === 0 ? "No current eligible record matches this saved identity." : records.length > 1 ? "The saved identity matches multiple current records." : null,
    record: records.length === 1 ? records[0] as Record<string, unknown> : null };
}
