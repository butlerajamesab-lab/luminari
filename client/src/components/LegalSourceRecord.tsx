import { CommitToCase } from "./CommitToCase";

export function LegalSourceRecord({ record, attachable = false }: { record: Record<string, unknown>; attachable?: boolean }) {
  const metadata = record.metadata && typeof record.metadata === "object" ? record.metadata as Record<string, unknown> : {};
  const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";
  const title = text(record.name ?? record.case_name ?? record.short_title ?? record.title ?? record.citation) || "Source reference";
  const source_locator = text(record.source_locator ?? metadata.source_locator);
  const source_hash = text(record.source_content_sha256 ?? metadata.source_content_sha256);
  const candidate_hash = text(record.source_candidate_hash ?? metadata.source_candidate_hash);
  return <article className="rounded-lg border border-purple-400/20 bg-white/[0.03] p-4 space-y-3 min-w-0 break-words">
    <h3 className="font-semibold">{title}</h3>
    <p className="text-xs text-amber-200">Source reference · legal accuracy and case applicability require review.</p>
    <p className="text-sm whitespace-pre-wrap">{text(record.description ?? record.summary ?? record.statutory_authority)}</p>
    <p className="text-xs text-muted-foreground">{text(record.state_code ?? record.jurisdiction) || "Jurisdiction not recorded"} · {text(record.data_state ?? metadata.publication_state) || "Compatibility record"}</p>
    <details className="text-xs space-y-2">
      <summary className="cursor-pointer">Identity and source history</summary>
      <dl className="grid gap-2 mt-2 break-all">
        <dt>Saved identity</dt><dd>{text(record.object_ref ?? metadata.object_ref ?? record.runtime_entity_id ?? record.id)}</dd>
        <dt>Source location</dt><dd>{source_locator || "Not recorded"}</dd>
        <dt>Original source hash</dt><dd>{source_hash || "Not recorded"}</dd>
        <dt>Candidate hash</dt><dd>{candidate_hash || "Not recorded"}</dd>
        <dt>Recorded field provenance</dt><dd><pre className="whitespace-pre-wrap">{JSON.stringify(record.field_provenance ?? metadata.field_provenance ?? null, null, 2)}</pre></dd>
      </dl>
    </details>
    {attachable && typeof record.object_ref === "string" && <CommitToCase type="legal_authority" itemId={record.object_ref} label="Attach source reference" size="sm" />}
  </article>;
}
