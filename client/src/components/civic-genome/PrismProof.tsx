type ProofEntry = Record<string, unknown>;

type PrismProofTrait = {
  prism_verification_status?: string | null;
  prism_verification_receipt_id?: string | null;
  prism_engine_version?: string | null;
  prism_rule_set_version?: string | null;
  prism_rule_set_hash?: string | null;
  prism_input_hash?: string | null;
  prism_output_hash?: string | null;
  prism_deterministic_replay_key?: string | null;
  prism_bound_at?: string | null;
  prism_proof_scope?: "independent_source_replay" | "binding_only" | null;
  prism_supported_findings?: unknown[] | null;
  prism_contradictions?: unknown[] | null;
  prism_missing_evidence?: unknown[] | null;
  prism_unresolved_conditions?: unknown[] | null;
  prism_cited_evidence_identifiers?: string[] | null;
};

const mono = "'IBM Plex Mono', monospace";
const sans = "'Inter', system-ui, sans-serif";
const colors = {
  border: "rgba(82,193,145,.22)",
  green: "#59d89c",
  paper: "#edf7f2",
  muted: "#91a9a0",
  red: "#ef8b8b",
  amber: "#e6ba66",
  soft: "rgba(8,17,15,.45)",
};

function entries(value: unknown[] | null | undefined): ProofEntry[] {
  return Array.isArray(value)
    ? value.filter((item): item is ProofEntry =>
      typeof item === "object" && item !== null && !Array.isArray(item))
    : [];
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function verification_label(value: string | null | undefined): string {
  if (value === "supported_by_one_source") return "supported by replayed source snapshot";
  if (value === "independent_authoritative_source_not_supplied") return "no second corroborating source attached";
  return value ?? "not observed";
}

function Finding({ entry, tone }: { entry: ProofEntry; tone: "pass" | "fail" | "open" }) {
  const title = text(entry.check)
    ?? text(entry.finding)
    ?? text(entry.requirement)
    ?? text(entry.condition)
    ?? "Recorded proof item";
  const quote = text(entry.source_quote);
  const expected = text(entry.expected);
  const observed = text(entry.observed);
  const color = tone === "fail" ? colors.red : tone === "open" ? colors.amber : colors.green;
  return <div style={{ borderLeft: `2px solid ${color}`, padding: ".42rem .55rem", background: colors.soft, borderRadius: 6 }}>
    <div style={{ color, fontFamily: mono, fontSize: ".58rem", overflowWrap: "anywhere" }}>{verification_label(title)}</div>
    {quote && <blockquote style={{ margin: ".42rem 0 0", color: colors.paper, fontFamily: sans, fontSize: ".69rem", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{quote}</blockquote>}
    {(entry.source_section || entry.source_offset_start || entry.source_offset_end) && <div style={{ marginTop: ".35rem", color: colors.muted, fontFamily: mono, fontSize: ".54rem" }}>
      {text(entry.source_section) ?? "section not observed"}
      {entry.source_offset_start != null && ` · chars ${String(entry.source_offset_start)}–${String(entry.source_offset_end ?? "?")}`}
    </div>}
    {(expected || observed) && <div style={{ marginTop: ".35rem", color: colors.muted, fontFamily: mono, fontSize: ".54rem", overflowWrap: "anywhere" }}>
      {expected && <>expected {expected}</>}
      {expected && observed && <br/>}
      {observed && <>observed {observed}</>}
    </div>}
  </div>;
}

function Section({
  title,
  values,
  tone,
}: {
  title: string;
  values: ProofEntry[];
  tone: "pass" | "fail" | "open";
}) {
  if (values.length === 0) return null;
  const color = tone === "fail" ? colors.red : tone === "open" ? colors.amber : colors.green;
  return <section style={{ marginTop: ".65rem" }}>
    <div style={{ color, fontFamily: mono, fontSize: ".58rem", textTransform: "uppercase", marginBottom: ".35rem" }}>{title} · {values.length}</div>
    <div style={{ display: "grid", gap: ".35rem" }}>{values.map((entry, index) => <Finding key={`${title}-${index}`} entry={entry} tone={tone}/>)}</div>
  </section>;
}

export function PrismProof({ trait }: { trait: PrismProofTrait }) {
  if (!trait.prism_verification_receipt_id) {
    return <div style={{ marginTop: ".65rem", borderTop: `1px solid ${colors.border}`, paddingTop: ".55rem", color: colors.muted, fontFamily: mono, fontSize: ".58rem" }}>
      Prism proof receipt not observed.
    </div>;
  }

  const supported = entries(trait.prism_supported_findings);
  const contradictions = entries(trait.prism_contradictions);
  const missing = entries(trait.prism_missing_evidence);
  const unresolved = entries(trait.prism_unresolved_conditions);
  const scope = trait.prism_proof_scope === "independent_source_replay"
    ? "Independent deterministic source replay"
    : "Binding continuity verified; independent corroboration not evaluated";
  const status_color = contradictions.length > 0
    ? colors.red
    : missing.length > 0 || unresolved.length > 0
      ? colors.amber
      : colors.green;

  return <details style={{ marginTop: ".7rem", borderTop: `1px solid ${colors.border}`, paddingTop: ".55rem" }}>
    <summary style={{ cursor: "pointer", color: status_color, fontFamily: mono, fontSize: ".61rem" }}>
      Prism proof · {scope}
    </summary>
    <div style={{ marginTop: ".55rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: ".4rem" }}>
        {[
          ["result", trait.prism_verification_status],
          ["engine", trait.prism_engine_version],
          ["rule", trait.prism_rule_set_version],
          ["completed", trait.prism_bound_at ? new Date(trait.prism_bound_at).toLocaleString() : null],
        ].map(([label, value]) => <div key={label ?? "field"} style={{ background: colors.soft, borderRadius: 6, padding: ".42rem" }}>
          <div style={{ color: colors.muted, fontFamily: mono, fontSize: ".5rem", textTransform: "uppercase" }}>{label}</div>
          <div style={{ color: colors.paper, fontFamily: mono, fontSize: ".55rem", marginTop: ".2rem", overflowWrap: "anywhere" }}>{label === "result" ? verification_label(value) : value ?? "not observed"}</div>
        </div>)}
      </div>

      <Section title="Contradictions" values={contradictions} tone="fail"/>
      <Section title="Missing evidence" values={missing} tone="open"/>
      <Section title="Unresolved conditions" values={unresolved} tone="open"/>
      <Section title="Supported checks" values={supported} tone="pass"/>

      <details style={{ marginTop: ".65rem" }}>
        <summary style={{ cursor: "pointer", color: colors.muted, fontFamily: mono, fontSize: ".55rem" }}>Receipt and deterministic replay identifiers</summary>
        <div style={{ marginTop: ".35rem", color: colors.muted, fontFamily: mono, fontSize: ".52rem", lineHeight: 1.55, overflowWrap: "anywhere" }}>
          receipt {trait.prism_verification_receipt_id}<br/>
          rule hash {trait.prism_rule_set_hash ?? "not observed"}<br/>
          input {trait.prism_input_hash ?? "not observed"}<br/>
          output {trait.prism_output_hash ?? "not observed"}<br/>
          replay {trait.prism_deterministic_replay_key ?? "not observed"}<br/>
          evidence {(trait.prism_cited_evidence_identifiers ?? []).join(", ") || "not observed"}
        </div>
      </details>
    </div>
  </details>;
}
