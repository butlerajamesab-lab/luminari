import { useAuth } from "@/core/hooks/useAuth";
import { duwamish_language_seed } from "@/data/duwamish_language_seed";
import { duwamish_truth_layers } from "@/data/recognition_atlas_layers";
import { continuous_habitation_paradox } from "@/data/recognition_weak_joints";
import { duwamish_truth_seed } from "@/data/duwamish_truth_seed";
import { muwekma_truth_seed } from "@/data/muwekma_truth_seed";
import { get_conflict_fields, resolve_truth_layer } from "@/resolvers/truth_layer_resolver";
import type { ReactNode } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, ArrowRight, EyeOff, Lock, Shield } from "lucide-react";

const tone = {
  bg: "#0c0f14",
  paper: "#f0ece4",
  muted: "rgba(240,236,228,0.6)",
  card_bg: "rgba(255,255,255,0.035)",
  card_border: "rgba(255,255,255,0.09)",
  gold: "#D4A017",
  blue: "#7eb3e8",
  green: "#34d399",
  red: "#ef4444",
};

type layer_slug = "identity" | "treaty" | "dispossession" | "timeline" | "lawsuit" | "language" | "ally-call";
type supported_tribe_id = "duwamish" | "muwekma";
type sourcePosture = "verbatim_tribal_source" | "structured_extraction_from_tribal_source" | "structured_extraction_from_public_record" | "structured_extraction_from_tribal_affiliated_scholarly_source" | "tribe_affiliated_source" | "external_source" | "lighthouse_analysis_pending_tribal_review";

type source_meta = {
  url: string;
  sourcePosture: sourcePosture;
  warning?: string;
};

type preview_field = {
  label: string;
  value: ReactNode;
  source: source_meta;
};

type layer_preview_config = {
  key: string;
  title: string;
  subtitle: string;
  description: string;
};

const layer_slug_to_key: Record<layer_slug, string> = {
  identity: "layer_0_identity",
  treaty: "layer_1_treaty",
  dispossession: "layer_2_dispossession",
  timeline: "layer_3_recognition_timeline",
  lawsuit: "layer_4_lawsuit",
  language: "layer_5_language_vault",
  "ally-call": "layer_6_ally_call",
};

const muwekma_layer_configs: Record<layer_slug, layer_preview_config> = {
  identity: {
    key: "layer_0_identity",
    title: "Identity Core",
    subtitle: "Muwékma · Those Who Walk Forward",
    description: "Muwékma identity, homeland, and present-day community territory render here as a cited admin-preview review packet pending tribal review.",
  },
  treaty: {
    key: "layer_1_treaty",
    title: "Treaty / Political Relationship",
    subtitle: "Verona Band / federal identification and omission",
    description: "Political relationship and treaty-status fields render from the Muwékma source seed with citation and source posture.",
  },
  dispossession: {
    key: "layer_2_dispossession",
    title: "Dispossession Record",
    subtitle: "Continuity-impacting events and administrative omission",
    description: "Each event renders as a cited source-packet row. This is not a summary and not a recognition determination.",
  },
  timeline: {
    key: "layer_3_recognition_timeline",
    title: "Recognition Timeline",
    subtitle: "Prior federal identification, omission, petition, denial, and litigation",
    description: "Recognition events render with year, label, outcome, and agent from the Muwékma source seed.",
  },
  lawsuit: {
    key: "layer_4_lawsuit",
    title: "Lawsuit Claims",
    subtitle: "Muwékma Ohlone v. Salazar frame",
    description: "Legal claims and procedural posture render from the Muwékma recognition record with citations and source posture.",
  },
  language: {
    key: "layer_5_living_culture",
    title: "Living Culture / Language",
    subtitle: "Chochenyo language and cultural revitalization",
    description: "Language program, living practices, physical home, and stewardship fields render from the seed without count-only compression.",
  },
  "ally-call": {
    key: "layer_6_ally_call",
    title: "Ally Call",
    subtitle: "How to stand with the Muwékma Ohlone Tribe",
    description: "Land acknowledgement, closing statement, and every ally action render from the Muwékma source seed.",
  },
};

const back_link_style = {
  color: tone.blue,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  border: `1px solid rgba(126,179,232,0.35)`,
  background: "rgba(126,179,232,0.06)",
  borderRadius: 999,
  padding: "0.45rem 0.7rem",
  fontSize: 13,
};

function source_posture_for_muwekma(source_domain: string): sourcePosture {
  if (source_domain === "muwekma.org") return "structured_extraction_from_tribal_source";
  if (source_domain === "muwekmafoundation.org") return "tribe_affiliated_source";
  return "external_source";
}

function return_links() {
  return (
    <nav style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
      <Link href="/recognition-atlas" style={back_link_style}><ArrowLeft size={16} /> Recognition Atlas</Link>
      <Link href="/recognition-gideon" style={back_link_style}><ArrowLeft size={16} /> Recognition Gideon / RTR Matrix</Link>
    </nav>
  );
}

function gate_panel({ title, message }: { title: string; message: string }) {
  return (
    <main style={{ minHeight: "100vh", background: tone.bg, color: tone.paper, display: "grid", placeItems: "center", padding: "2rem", fontFamily: "Inter, system-ui, sans-serif" }}>
      <section style={{ width: "min(720px, 100%)", border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 24, padding: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}><Lock size={22} color={tone.gold} /><span style={{ color: tone.gold, textTransform: "uppercase", letterSpacing: "0.12em", fontSize: 12 }}>Admin gated</span></div>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", margin: "0 0 1rem" }}>{title}</h1>
        <p style={{ color: tone.muted, lineHeight: 1.7, fontSize: "1.05rem", marginBottom: "1.5rem" }}>{message}</p>
        {return_links()}
      </section>
    </main>
  );
}

function section_card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 22, padding: "1.25rem" }}>
      <h2 style={{ margin: "0 0 1rem", fontSize: "1.25rem" }}>{title}</h2>
      {children}
    </section>
  );
}

function source_footer(source: source_meta) {
  return (
    <div style={{ color: tone.gold, fontFamily: "JetBrains Mono, monospace", fontSize: 12, marginTop: 10 }}>
      <span style={{ border: `1px solid rgba(212,160,23,0.35)`, borderRadius: 999, padding: "0.2rem 0.45rem" }}>{source.sourcePosture.replace(/_/g, " ")}</span>
      {source.url && (
        <a href={source.url} target="_blank" rel="noreferrer" style={{ color: tone.blue, display: "block", marginTop: 8, wordBreak: "break-word" }}>citation: {source.url}</a>
      )}
      {source.warning && <div style={{ color: tone.gold, marginTop: 8 }}>{source.warning}</div>}
    </div>
  );
}

function field_grid({ fields }: { fields: preview_field[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.75rem" }}>
      {fields.map((field) => (
        <article key={field.label} style={{ border: `1px solid ${tone.card_border}`, background: "rgba(255,255,255,0.025)", borderRadius: 16, padding: "0.9rem" }}>
          <div style={{ color: tone.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{field.label}</div>
          <div style={{ color: tone.paper, lineHeight: 1.55 }}>{field.value}</div>
          {source_footer(field.source)}
        </article>
      ))}
    </div>
  );
}

function list_value(values: Array<string | number | undefined>) {
  const reported = values.filter((value): value is string | number => value !== undefined && value !== "");
  return reported.length === 0 ? null : reported.map(String).join(" · ");
}

function source_for_muwekma_layer(layer_source: typeof muwekma_truth_seed.layer_0_identity.source, warning?: string): source_meta {
  return {
    url: layer_source.url,
    sourcePosture: layer_source.source_posture ?? source_posture_for_muwekma(layer_source.source_domain),
    warning,
  };
}

function council_review_packet_notice({ tribe_id }: { tribe_id: supported_tribe_id }) {
  return (
    <section style={{ border: `1px solid rgba(52,211,153,0.35)`, background: "rgba(52,211,153,0.055)", borderRadius: 22, padding: "1rem", marginBottom: "1rem" }}>
      <h2 style={{ margin: "0 0 0.5rem" }}>Council review source packet</h2>
      <p style={{ color: tone.muted, lineHeight: 1.65, margin: 0 }}>This preview is a cited structured review packet for {tribe_id}. It is not public, not final, and not tribal approval. Each field shows a source badge and citation so the tribe can confirm, correct, restrict, replace, or reject what appears here.</p>
    </section>
  );
}

function is_supported_tribe_id(tribe_id: string): tribe_id is supported_tribe_id {
  return tribe_id === "duwamish" || tribe_id === "muwekma";
}

function get_layer_config(tribe_id: supported_tribe_id, active_layer_slug: layer_slug): layer_preview_config | undefined {
  if (tribe_id === "muwekma") return muwekma_layer_configs[active_layer_slug];
  const layer_key = layer_slug_to_key[active_layer_slug];
  return duwamish_truth_layers.find((layer) => layer.key === layer_key);
}

function get_duwamish_layer_fields(active_layer_slug: layer_slug): { fields: preview_field[]; conflict_fields: ReturnType<typeof get_conflict_fields> } {
  const truth_record = resolve_truth_layer({ tribe_id: "duwamish", priority: "truth_layer_first", include_source_refs: true, include_conflict_flags: true }, duwamish_truth_seed);
  const defaultSourcePosture: sourcePosture = "structured_extraction_from_tribal_source";
  const source = (url?: string, sourcePosture: sourcePosture = defaultSourcePosture): source_meta => ({ url: url ?? duwamish_truth_seed.layer_0_identity.source.url, sourcePosture });

  const layer_fields: Record<layer_slug, preview_field[]> = {
    identity: [
      { label: "tribe_self_name", value: truth_record.tribe_self_name.value, source: { url: truth_record.tribe_self_name.source_url, sourcePosture: "verbatim_tribal_source" } },
      { label: "name_meaning", value: truth_record.name_meaning.value, source: { url: truth_record.name_meaning.source_url, sourcePosture: "verbatim_tribal_source" } },
      { label: "primary_declaration", value: truth_record.primary_declaration.value, source: { url: truth_record.primary_declaration.source_url, sourcePosture: "verbatim_tribal_source" } },
      { label: "territorial_declaration", value: truth_record.territorial_declaration.value, source: { url: truth_record.territorial_declaration.source_url, sourcePosture: "verbatim_tribal_source" } },
      { label: "territorial_basis", value: duwamish_truth_seed.layer_0_identity.territorial_basis, source: source(duwamish_truth_seed.layer_0_identity.source.url) },
      { label: "oral_tradition_anchor", value: truth_record.oral_tradition_anchor.value, source: source(truth_record.oral_tradition_anchor.source_url) },
      { label: "homeland_waters", value: truth_record.homeland_waters.value.join(" · "), source: source(truth_record.homeland_waters.source_url, duwamish_truth_seed.layer_0_identity.homeland_waters_source_posture ?? defaultSourcePosture) },
      { label: "homeland_geography", value: duwamish_truth_seed.layer_0_identity.homeland_geography, source: source(duwamish_truth_seed.layer_0_identity.source.url) },
      { label: "present_day_member_territory", value: truth_record.present_day_member_territory.value.join(" · "), source: source(truth_record.present_day_member_territory.source_url) },
    ],
    treaty: [
      { label: "treaty_name", value: truth_record.treaty_name.value, source: source(truth_record.treaty_name.source_url) },
      { label: "treaty_date", value: truth_record.treaty_date.value, source: source(truth_record.treaty_date.source_url) },
      { label: "signatory_position", value: truth_record.signatory_position.value, source: source(truth_record.signatory_position.source_url) },
      { label: "chief_name", value: truth_record.chief_name.value, source: source(truth_record.chief_name.source_url) },
      { label: "chief_role", value: duwamish_truth_seed.layer_1_treaty.signatory_chief.role, source: source(duwamish_truth_seed.layer_1_treaty.signatory_chief.source.url) },
      { label: "chief_known_for", value: duwamish_truth_seed.layer_1_treaty.signatory_chief.known_for, source: source(duwamish_truth_seed.layer_1_treaty.signatory_chief.source.url) },
      { label: "chief_lineage_note", value: truth_record.chief_lineage_note.value, source: source(truth_record.chief_lineage_note.source_url) },
      { label: "city_named_for_chief", value: truth_record.city_named_for_chief.value, source: source(truth_record.city_named_for_chief.source_url) },
      { label: "largest_village_location", value: duwamish_truth_seed.layer_1_treaty.largest_village_location, source: source(duwamish_truth_seed.layer_1_treaty.source.url) },
      { label: "village_fate", value: duwamish_truth_seed.layer_1_treaty.village_fate, source: source(duwamish_truth_seed.layer_1_treaty.source.url) },
    ],
    dispossession: [
      { label: "dispossession_events", value: truth_record.dispossession_events.value.join(" · "), source: source(truth_record.dispossession_events.source_url) },
      { label: "forced_removal_agent", value: truth_record.forced_removal_agent.value, source: source(truth_record.forced_removal_agent.source_url) },
      { label: "displacement_method", value: truth_record.displacement_method.value, source: source(truth_record.displacement_method.source_url) },
      { label: "event_descriptions", value: duwamish_truth_seed.layer_2_dispossession.events.map((event) => event.description).filter(Boolean).join(" · "), source: source(duwamish_truth_seed.layer_2_dispossession.source.url) },
      { label: "event_outcomes", value: duwamish_truth_seed.layer_2_dispossession.events.map((event) => event.outcome).filter(Boolean).join(" · "), source: source(duwamish_truth_seed.layer_2_dispossession.source.url) },
      { label: "event_agents", value: duwamish_truth_seed.layer_2_dispossession.events.map((event) => event.agent).filter(Boolean).join(" · "), source: source(duwamish_truth_seed.layer_2_dispossession.source.url) },
      { label: "event_dates", value: duwamish_truth_seed.layer_2_dispossession.events.map((event) => event.date_approx).filter(Boolean).join(" · "), source: source(duwamish_truth_seed.layer_2_dispossession.source.url) },
    ],
    timeline: [
      { label: "recognition_current_status", value: truth_record.recognition_current_status.value, source: source(truth_record.recognition_current_status.source_url) },
      { label: "recognition_granted_reversed", value: truth_record.recognition_granted_reversed.value, source: source(truth_record.recognition_granted_reversed.source_url) },
      { label: "reversal_agent", value: truth_record.reversal_agent.value, source: source(truth_record.reversal_agent.source_url) },
      { label: "recognition_events", value: duwamish_truth_seed.layer_3_recognition_timeline.events.map((event) => `${event.year}: ${event.event_label} (${event.outcome})${event.agent ? ` — ${event.agent}` : ""}`).join(" · "), source: source(duwamish_truth_seed.layer_3_recognition_timeline.source.url) },
    ],
    lawsuit: [
      { label: "lawsuit_filed_date", value: truth_record.lawsuit_filed_date.value, source: source(truth_record.lawsuit_filed_date.source_url) },
      { label: "lawsuit_court", value: truth_record.lawsuit_court.value, source: source(truth_record.lawsuit_court.source_url) },
      { label: "lawsuit_claims", value: truth_record.lawsuit_claims.value.join(" · "), source: source(truth_record.lawsuit_claims.source_url) },
      { label: "sex_discrimination_claim_present", value: String(truth_record.sex_discrimination_claim_present.value), source: source(truth_record.sex_discrimination_claim_present.source_url) },
      { label: "lawsuit_defendant", value: duwamish_truth_seed.layer_4_lawsuit.defendant, source: source(duwamish_truth_seed.layer_4_lawsuit.source.url) },
      { label: "lawsuit_legal_bases", value: duwamish_truth_seed.layer_4_lawsuit.claims.map((claim) => claim.legal_basis).join(" · "), source: source(duwamish_truth_seed.layer_4_lawsuit.source.url) },
      { label: "lawsuit_statutes_or_doctrines", value: duwamish_truth_seed.layer_4_lawsuit.claims.map((claim) => claim.statute_or_doctrine).filter(Boolean).join(" · "), source: source(duwamish_truth_seed.layer_4_lawsuit.source.url) },
      { label: "current_procedural_status", value: duwamish_truth_seed.layer_4_lawsuit.current_procedural_status, source: source(duwamish_truth_seed.layer_4_lawsuit.source.url) },
    ],
    language: [
      { label: "language_name", value: truth_record.language_name.value, source: { url: truth_record.language_name.source_url, sourcePosture: "verbatim_tribal_source" } },
      { label: "language_program_active", value: String(truth_record.language_program_active.value), source: source(truth_record.language_program_active.source_url) },
      { label: "living_practices", value: duwamish_truth_seed.layer_5_living_culture.living_practices.map((practice) => `${practice.practice_name}: ${practice.description} — ${practice.cultural_significance}`).join(" · "), source: source(duwamish_truth_seed.layer_5_living_culture.source.url) },
      { label: "physical_home_name", value: duwamish_truth_seed.layer_5_living_culture.physical_home.name, source: source(duwamish_truth_seed.layer_5_living_culture.physical_home.source.url) },
      { label: "physical_home_historical_note", value: duwamish_truth_seed.layer_5_living_culture.physical_home.historical_note, source: source(duwamish_truth_seed.layer_5_living_culture.physical_home.source.url) },
      { label: "physical_home_functions", value: duwamish_truth_seed.layer_5_living_culture.physical_home.functions.join(" · "), source: source(duwamish_truth_seed.layer_5_living_culture.physical_home.source.url) },
      { label: "environmental_coalition", value: duwamish_truth_seed.layer_5_living_culture.environmental_coalition, source: source(duwamish_truth_seed.layer_5_living_culture.source.url) },
    ],
    "ally-call": [
      { label: "land_status", value: truth_record.land_status.value, source: source(truth_record.land_status.source_url) },
      { label: "closing_statement", value: truth_record.closing_statement.value, source: { url: truth_record.closing_statement.source_url, sourcePosture: "verbatim_tribal_source" } },
      { label: "land_acknowledgement_template", value: duwamish_truth_seed.layer_6_ally_call.template_text, source: { url: duwamish_truth_seed.layer_6_ally_call.source.url, sourcePosture: "verbatim_tribal_source" } },
      { label: "ally_actions", value: duwamish_truth_seed.layer_6_ally_call.ally_actions.map((action) => `${action.action_label}: ${action.description}${action.url ? ` — ${action.url}` : ""}`).join(" · "), source: source(duwamish_truth_seed.layer_6_ally_call.source.url) },
    ],
  };

  const conflict_fields = active_layer_slug === "dispossession" || active_layer_slug === "timeline" ? get_conflict_fields(truth_record) : [];
  return { fields: layer_fields[active_layer_slug].filter((field) => field.value !== ""), conflict_fields };
}

function get_muwekma_layer_fields(active_layer_slug: layer_slug): preview_field[] {
  const seed = muwekma_truth_seed;
  const recovered_warning = seed.meta.recovered_thread_unverified ? "source_authenticated_from_tribal_website · council_review_required" : undefined;
  const source = (layer_source: typeof seed.layer_0_identity.source): source_meta => source_for_muwekma_layer(layer_source, recovered_warning);

  const layer_fields: Record<layer_slug, preview_field[]> = {
    identity: [
      { label: "tribe_self_name", value: seed.layer_0_identity.tribe_self_name, source: source(seed.layer_0_identity.source) },
      { label: "name_meaning", value: seed.layer_0_identity.name_meaning, source: source(seed.layer_0_identity.source) },
      { label: "anglicized_name", value: seed.layer_0_identity.anglicized_name, source: source(seed.layer_0_identity.source) },
      { label: "primary_declaration", value: seed.layer_0_identity.primary_declaration, source: { url: seed.layer_0_identity.primary_declaration_citation ?? seed.layer_0_identity.source.url, sourcePosture: seed.layer_0_identity.primary_declaration_source_posture ?? source_posture_for_muwekma(seed.layer_0_identity.source.source_domain) } },
      { label: "territorial_declaration", value: seed.layer_0_identity.territorial_declaration === "requires_tribal_review" ? "Requires tribal review" : seed.layer_0_identity.territorial_declaration, source: source(seed.layer_0_identity.source) },
      { label: "territorial_declaration_note", value: seed.layer_0_identity.territorial_declaration_note ?? "", source: source(seed.layer_0_identity.source) },
      { label: "territorial_basis", value: seed.layer_0_identity.territorial_basis, source: source(seed.layer_0_identity.source) },
      { label: "oral_tradition_anchor", value: seed.layer_0_identity.oral_tradition_anchor, source: source(seed.layer_0_identity.source) },
      { label: "homeland_waters", value: seed.layer_0_identity.homeland_waters.join(" · "), source: source(seed.layer_0_identity.source) },
      { label: "homeland_geography", value: seed.layer_0_identity.homeland_geography, source: source(seed.layer_0_identity.source) },
      { label: "present_day_member_territory", value: seed.layer_0_identity.present_day_member_territory.join(" · "), source: source(seed.layer_0_identity.source) },
      ...(seed.layer_0_identity.chochenyo_greeting ? [
        { label: "chochenyo_greeting", value: seed.layer_0_identity.chochenyo_greeting.chochenyo_greeting, source: { url: seed.layer_0_identity.chochenyo_greeting.citation, sourcePosture: seed.layer_0_identity.chochenyo_greeting.source_posture } },
        { label: "chochenyo_greeting_phonetic", value: seed.layer_0_identity.chochenyo_greeting.phonetic, source: { url: seed.layer_0_identity.chochenyo_greeting.citation, sourcePosture: seed.layer_0_identity.chochenyo_greeting.source_posture } },
        { label: "chochenyo_greeting_meaning", value: seed.layer_0_identity.chochenyo_greeting.meaning, source: { url: seed.layer_0_identity.chochenyo_greeting.citation, sourcePosture: seed.layer_0_identity.chochenyo_greeting.source_posture } },
      ] : []),
    ],
    treaty: [
      { label: "treaty_name", value: seed.layer_1_treaty.treaty_name, source: source(seed.layer_1_treaty.source) },
      { label: "treaty_date", value: seed.layer_1_treaty.treaty_date, source: source(seed.layer_1_treaty.source) },
      { label: "signatory_position", value: seed.layer_1_treaty.signatory_position, source: source(seed.layer_1_treaty.source) },
    ],
    dispossession: [
      { label: "event_labels", value: seed.layer_2_dispossession.events.map((event) => event.event_label).join(" · "), source: source(seed.layer_2_dispossession.source) },
      { label: "event_agents", value: list_value(seed.layer_2_dispossession.events.map((event) => event.agent)), source: source(seed.layer_2_dispossession.source) },
      { label: "event_methods", value: list_value(seed.layer_2_dispossession.events.map((event) => event.method)), source: source(seed.layer_2_dispossession.source) },
      { label: "event_descriptions", value: list_value(seed.layer_2_dispossession.events.map((event) => event.description)), source: source(seed.layer_2_dispossession.source) },
      { label: "event_outcomes", value: list_value(seed.layer_2_dispossession.events.map((event) => event.outcome)), source: source(seed.layer_2_dispossession.source) },
      { label: "event_evidence", value: list_value(seed.layer_2_dispossession.events.map((event) => event.evidence)), source: source(seed.layer_2_dispossession.source) },
      { label: "event_citations", value: list_value(seed.layer_2_dispossession.events.map((event) => event.citation)), source: source(seed.layer_2_dispossession.source) },
    ].filter((field): field is preview_field => field.value !== null),
    timeline: [
      { label: "recognition_current_status", value: seed.layer_3_recognition_timeline.current_status, source: source(seed.layer_3_recognition_timeline.source) },
      { label: "recognition_events", value: seed.layer_3_recognition_timeline.events.map((event) => `${event.year}: ${event.event_label}${event.outcome ? ` (${event.outcome})` : ""}${event.agent ? ` — ${event.agent}` : ""}${event.date ? ` · ${event.date}` : ""}${event.description ? ` · ${event.description}` : ""}${event.basis ? ` · ${event.basis}` : ""}${event.case ? ` · ${event.case}` : ""}${event.citation ? ` · ${event.citation}` : ""}`).join(" · "), source: source(seed.layer_3_recognition_timeline.source) },
    ],
    lawsuit: [
      { label: "lawsuit_filed_date", value: seed.layer_4_lawsuit.filed_date, source: source(seed.layer_4_lawsuit.source) },
      { label: "lawsuit_court", value: seed.layer_4_lawsuit.court, source: source(seed.layer_4_lawsuit.source) },
      { label: "lawsuit_defendant", value: seed.layer_4_lawsuit.defendant, source: source(seed.layer_4_lawsuit.source) },
      { label: "lawsuit_claim_labels", value: seed.layer_4_lawsuit.claims.map((claim) => claim.claim_label).join(" · "), source: source(seed.layer_4_lawsuit.source) },
      { label: "lawsuit_legal_bases", value: seed.layer_4_lawsuit.claims.map((claim) => `${claim.claim_label}: ${claim.legal_basis}`).join(" · "), source: source(seed.layer_4_lawsuit.source) },
      { label: "current_procedural_status", value: seed.layer_4_lawsuit.current_procedural_status, source: source(seed.layer_4_lawsuit.source) },
    ],
    language: [
      { label: "language_name", value: seed.layer_5_living_culture.language.language_name, source: source(seed.layer_5_living_culture.language.source) },
      { label: "common_name", value: seed.layer_5_living_culture.language.common_name, source: source(seed.layer_5_living_culture.language.source) },
      ...(seed.layer_0_identity.chochenyo_greeting ? [
        { label: "chochenyo_greeting", value: seed.layer_0_identity.chochenyo_greeting.chochenyo_greeting, source: { url: seed.layer_0_identity.chochenyo_greeting.citation, sourcePosture: seed.layer_0_identity.chochenyo_greeting.source_posture } },
        { label: "chochenyo_greeting_phonetic", value: seed.layer_0_identity.chochenyo_greeting.phonetic, source: { url: seed.layer_0_identity.chochenyo_greeting.citation, sourcePosture: seed.layer_0_identity.chochenyo_greeting.source_posture } },
        { label: "chochenyo_greeting_meaning", value: seed.layer_0_identity.chochenyo_greeting.meaning, source: { url: seed.layer_0_identity.chochenyo_greeting.citation, sourcePosture: seed.layer_0_identity.chochenyo_greeting.source_posture } },
      ] : []),
      { label: "language_program", value: seed.layer_5_living_culture.language.program_name, source: source(seed.layer_5_living_culture.language.source) },
      { label: "program_established", value: String(seed.layer_5_living_culture.language.program_established), source: source(seed.layer_5_living_culture.language.source) },
      { label: "program_purpose", value: seed.layer_5_living_culture.language.program_purpose, source: source(seed.layer_5_living_culture.language.source) },
      { label: "living_practices", value: seed.layer_5_living_culture.living_practices.map((practice) => `${practice.practice_name}: ${practice.description} — ${practice.cultural_significance}`).join(" · "), source: source(seed.layer_5_living_culture.source) },
      { label: "physical_home_name", value: seed.layer_5_living_culture.physical_home.name, source: source(seed.layer_5_living_culture.physical_home.source) },
      { label: "physical_home_address", value: seed.layer_5_living_culture.physical_home.address, source: source(seed.layer_5_living_culture.physical_home.source) },
      { label: "physical_home_historical_note", value: seed.layer_5_living_culture.physical_home.historical_note, source: source(seed.layer_5_living_culture.physical_home.source) },
      { label: "physical_home_hours", value: seed.layer_5_living_culture.physical_home.hours, source: source(seed.layer_5_living_culture.physical_home.source) },
      { label: "physical_home_public_access", value: String(seed.layer_5_living_culture.physical_home.public_access), source: source(seed.layer_5_living_culture.physical_home.source) },
      { label: "physical_home_functions", value: seed.layer_5_living_culture.physical_home.functions.join(" · "), source: source(seed.layer_5_living_culture.physical_home.source) },
      { label: "enrolled_members_approx", value: String(seed.layer_5_living_culture.enrolled_members_approx), source: source(seed.layer_5_living_culture.source) },
      { label: "environmental_coalition", value: seed.layer_5_living_culture.environmental_coalition, source: source(seed.layer_5_living_culture.source) },
    ],
    "ally-call": [
      { label: "land_acknowledgement_template", value: seed.layer_6_ally_call.template_text, source: source(seed.layer_6_ally_call.source) },
      { label: "land_status", value: seed.layer_6_ally_call.land_status, source: source(seed.layer_6_ally_call.source) },
      { label: "closing_statement", value: seed.layer_6_ally_call.closing_statement, source: source(seed.layer_6_ally_call.source) },
      { label: "ally_actions", value: seed.layer_6_ally_call.ally_actions.map((action) => `${action.action_label}: ${action.description}${action.url ? ` — ${action.url}` : ""}`).join(" · "), source: source(seed.layer_6_ally_call.source) },
    ],
  };

  return layer_fields[active_layer_slug];
}

export default function RecognitionAtlasLayer() {
  const [, params] = useRoute("/recognition-atlas/:tribe_id/:layer_slug");
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) return gate_panel({ title: "Loading Recognition Atlas layer preview", message: "Checking admin access before showing this unpublished layer preview." });
  if (!isAuthenticated || user?.role !== "admin") return gate_panel({ title: "Recognition Atlas layer preview requires admin access", message: "This layer is available only for pre-publication review. It is not public-facing and does not indicate tribal approval." });

  const tribe_id = params?.tribe_id ?? "";
  const active_layer_slug = params?.layer_slug as layer_slug | undefined;
  if (!is_supported_tribe_id(tribe_id) || !active_layer_slug || !(active_layer_slug in layer_slug_to_key)) return gate_panel({ title: "Recognition Atlas layer not found", message: "Only the Duwamish and Muwékma admin preview layers are wired in this phase." });

  const layer_key = tribe_id === "muwekma" && active_layer_slug === "language" ? "layer_5_living_culture" : layer_slug_to_key[active_layer_slug];
  const layer_config = get_layer_config(tribe_id, active_layer_slug);
  const duwamish_layer_data = tribe_id === "duwamish" ? get_duwamish_layer_fields(active_layer_slug) : undefined;
  const layer_fields = tribe_id === "duwamish" ? duwamish_layer_data?.fields ?? [] : get_muwekma_layer_fields(active_layer_slug);
  const conflict_fields = duwamish_layer_data?.conflict_fields ?? [];

  return (
    <main style={{ minHeight: "100vh", background: tone.bg, color: tone.paper, fontFamily: "Inter, system-ui, sans-serif", padding: "clamp(1.25rem, 3vw, 3rem)" }}>
      <section style={{ maxWidth: 1180, margin: "0 auto" }}>
        {return_links()}
        {council_review_packet_notice({ tribe_id })}
        <div style={{ border: `1px solid rgba(212,160,23,0.35)`, background: "rgba(212,160,23,0.08)", color: tone.gold, borderRadius: 999, padding: "0.5rem 0.85rem", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "1.5rem" }}><EyeOff size={14} /> Tribal council/admin preview — Not Public</div>
        <header style={{ border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 28, padding: "clamp(1.25rem, 3vw, 2rem)", marginBottom: "1rem" }}>
          <p style={{ color: tone.blue, letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 12, marginBottom: 12 }}>{tribe_id} · {layer_key}</p>
          <h1 style={{ fontSize: "clamp(2.3rem, 7vw, 5rem)", lineHeight: 0.95, margin: 0 }}>{layer_config?.title ?? "Recognition Atlas Layer"}</h1>
          <p style={{ color: tone.blue, fontSize: "1.25rem", marginBottom: 0 }}>{layer_config?.subtitle}</p>
          <p style={{ color: tone.muted, lineHeight: 1.75, maxWidth: 860 }}>{layer_config?.description}</p>
          <p style={{ color: tone.gold, lineHeight: 1.65, maxWidth: 860 }}>This is an admin/tribal-review preview. It is not public, not approved, and not a final publication record.</p>
        </header>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
          {section_card({ title: "Resolved fields", children: field_grid({ fields: layer_fields }) })}
          {section_card({ title: "Protection state", children: (<div style={{ color: tone.muted, lineHeight: 1.75 }}><p><Shield size={16} color={tone.green} /> Atlas remains the private build and approval workspace.</p><p>public_display_permitted: false</p><p>approval_status: locked_pending_tribe_review</p><p>luminari_commitment: we_are_the_vessel_they_are_the_author</p></div>) })}
        </div>
        {tribe_id === "duwamish" && active_layer_slug === "dispossession" && section_card({ title: "Weak Joints Illustrated", children: (<article style={{ border: `1px solid rgba(212,160,23,0.35)`, background: "rgba(212,160,23,0.06)", borderRadius: 16, padding: "0.95rem" }}><div style={{ color: tone.gold, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>{continuous_habitation_paradox.weak_joint_id}</div><h3 style={{ margin: "0.5rem 0" }}>{continuous_habitation_paradox.title}</h3><p style={{ color: tone.muted, lineHeight: 1.65 }}>{continuous_habitation_paradox.description}</p><p style={{ color: tone.gold, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>authorship: {continuous_habitation_paradox.authorship} · publication_status: {continuous_habitation_paradox.publication_status}</p><Link href="/recognition-gideon?weak_joint=continuous_habitation_paradox" style={{ color: tone.blue, textDecoration: "none", display: "inline-flex", gap: 6 }}>Open Recognition Gideon analysis <ArrowRight size={14} /></Link></article>) })}
        {tribe_id === "duwamish" && active_layer_slug === "language" && section_card({ title: "Language entries for review", children: (<div style={{ display: "grid", gap: "0.75rem" }}>{[duwamish_language_seed.self_identifier_entry, duwamish_language_seed.primary_declaration_entry, ...duwamish_language_seed.entries].map((entry) => (<article key={entry.entry_id} style={{ border: `1px solid ${tone.card_border}`, borderRadius: 16, padding: "0.9rem", background: "rgba(255,255,255,0.025)" }}><div style={{ color: tone.paper, fontSize: "1.25rem" }}>{entry.original_text}</div><div style={{ color: tone.muted }}>{entry.romanization}</div><div style={{ color: tone.blue }}>{entry.english_gloss}</div><div style={{ color: tone.gold, fontFamily: "JetBrains Mono, monospace", fontSize: 12, marginTop: 8 }}><span style={{ border: `1px solid rgba(212,160,23,0.35)`, borderRadius: 999, padding: "0.2rem 0.45rem" }}>source authenticated from tribal website</span><a href={entry.source_url} target="_blank" rel="noreferrer" style={{ color: tone.blue, display: "block", marginTop: 8, wordBreak: "break-word" }}>citation: {entry.source_url}</a></div>{entry.extended_meaning && <p style={{ color: tone.muted, lineHeight: 1.6 }}>{entry.extended_meaning}</p>}{entry.verified_by_tribe === false && <p style={{ color: tone.gold, fontSize: 12 }}>council_review_required</p>}</article>))}</div>) })}
        {conflict_fields.length > 0 && section_card({ title: "Conflict flags visible in this record", children: (<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.75rem" }}>{conflict_fields.map((conflict) => (<article key={conflict.field} style={{ border: `1px solid rgba(239,68,68,0.22)`, background: "rgba(239,68,68,0.055)", borderRadius: 16, padding: "0.9rem" }}><div style={{ color: tone.red, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>{conflict.field}</div><p style={{ color: tone.muted, lineHeight: 1.6 }}>{conflict.conflict_note}</p></article>))}</div>) })}
      </section>
    </main>
  );
}
