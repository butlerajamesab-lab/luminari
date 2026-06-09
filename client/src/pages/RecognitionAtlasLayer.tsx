import { useAuth } from "@/core/hooks/useAuth";
import { duwamish_language_seed } from "@/data/duwamish_language_seed";
import { duwamish_truth_layers } from "@/data/recognition_atlas_layers";
import { duwamish_truth_seed } from "@/data/duwamish_truth_seed";
import { get_conflict_fields, resolve_truth_layer } from "@/resolvers/truth_layer_resolver";
import { Link, useRoute } from "wouter";
import { ArrowLeft, EyeOff, Lock, Shield } from "lucide-react";

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

type layer_slug =
  | "identity"
  | "treaty"
  | "dispossession"
  | "timeline"
  | "lawsuit"
  | "language"
  | "ally-call";

type preview_field = {
  label: string;
  value: string | number | boolean | string[];
  source_url?: string;
  warning?: string;
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

function gate_panel({ title, message }: { title: string; message: string }) {
  return (
    <main style={{ minHeight: "100vh", background: tone.bg, color: tone.paper, display: "grid", placeItems: "center", padding: "2rem", fontFamily: "Inter, system-ui, sans-serif" }}>
      <section style={{ width: "min(720px, 100%)", border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 24, padding: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <Lock size={22} color={tone.gold} />
          <span style={{ color: tone.gold, textTransform: "uppercase", letterSpacing: "0.12em", fontSize: 12 }}>Admin gated</span>
        </div>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", margin: "0 0 1rem" }}>{title}</h1>
        <p style={{ color: tone.muted, lineHeight: 1.7, fontSize: "1.05rem", marginBottom: "1.5rem" }}>{message}</p>
        <Link href="/recognition-atlas" style={{ color: tone.blue, textDecoration: "none", display: "inline-flex", gap: 8 }}>
          Back to Recognition Atlas
        </Link>
      </section>
    </main>
  );
}

function render_value(value: preview_field["value"]) {
  if (Array.isArray(value)) return value.join(" · ");
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function section_card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 22, padding: "1.25rem" }}>
      <h2 style={{ margin: "0 0 1rem", fontSize: "1.25rem" }}>{title}</h2>
      {children}
    </section>
  );
}

function field_grid({ fields }: { fields: preview_field[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.75rem" }}>
      {fields.map((field) => (
        <article key={field.label} style={{ border: `1px solid ${tone.card_border}`, background: "rgba(255,255,255,0.025)", borderRadius: 16, padding: "0.9rem" }}>
          <div style={{ color: tone.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{field.label}</div>
          <div style={{ color: tone.paper, lineHeight: 1.55 }}>{render_value(field.value)}</div>
          {field.source_url && <div style={{ color: tone.blue, fontSize: 12, marginTop: 8 }}>{field.source_url}</div>}
          {field.warning && <div style={{ color: tone.gold, fontSize: 12, marginTop: 8 }}>{field.warning}</div>}
        </article>
      ))}
    </div>
  );
}

export default function RecognitionAtlasLayer() {
  const [, params] = useRoute("/recognition-atlas/:tribe_id/:layer_slug");
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return gate_panel({
      title: "Loading Recognition Atlas layer preview",
      message: "Checking admin access before showing this unpublished layer preview.",
    });
  }

  if (!isAuthenticated || user?.role !== "admin") {
    return gate_panel({
      title: "Recognition Atlas layer preview requires admin access",
      message: "This layer is available only for pre-publication review. It is not public-facing and does not indicate tribal approval.",
    });
  }

  const tribe_id = params?.tribe_id ?? "";
  const active_layer_slug = params?.layer_slug as layer_slug | undefined;

  if (tribe_id !== "duwamish" || !active_layer_slug || !(active_layer_slug in layer_slug_to_key)) {
    return gate_panel({
      title: "Recognition Atlas layer not found",
      message: "Only the Duwamish admin preview layers are wired in this phase.",
    });
  }

  const truth_record = resolve_truth_layer({
    tribe_id: "duwamish",
    priority: "truth_layer_first",
    include_source_refs: true,
    include_conflict_flags: true,
  }, duwamish_truth_seed);
  const conflict_fields = get_conflict_fields(truth_record);
  const layer_key = layer_slug_to_key[active_layer_slug];
  const layer_config = duwamish_truth_layers.find((layer) => layer.key === layer_key);

  const layer_fields: Record<layer_slug, preview_field[]> = {
    identity: [
      { label: "tribe_self_name", value: truth_record.tribe_self_name.value, source_url: truth_record.tribe_self_name.source_url },
      { label: "name_meaning", value: truth_record.name_meaning.value, source_url: truth_record.name_meaning.source_url },
      { label: "primary_declaration", value: truth_record.primary_declaration.value, source_url: truth_record.primary_declaration.source_url },
      { label: "territorial_declaration", value: truth_record.territorial_declaration.value, source_url: truth_record.territorial_declaration.source_url },
      { label: "homeland_waters", value: truth_record.homeland_waters.value, source_url: truth_record.homeland_waters.source_url },
      { label: "present_day_member_territory", value: truth_record.present_day_member_territory.value, source_url: truth_record.present_day_member_territory.source_url },
    ],
    treaty: [
      { label: "treaty_name", value: truth_record.treaty_name.value, source_url: truth_record.treaty_name.source_url },
      { label: "treaty_date", value: truth_record.treaty_date.value, source_url: truth_record.treaty_date.source_url },
      { label: "signatory_position", value: truth_record.signatory_position.value, source_url: truth_record.signatory_position.source_url },
      { label: "chief_name", value: truth_record.chief_name.value, source_url: truth_record.chief_name.source_url },
      { label: "chief_lineage_note", value: truth_record.chief_lineage_note.value, source_url: truth_record.chief_lineage_note.source_url },
      { label: "city_named_for_chief", value: truth_record.city_named_for_chief.value, source_url: truth_record.city_named_for_chief.source_url },
    ],
    dispossession: [
      { label: "dispossession_events", value: truth_record.dispossession_events.value, source_url: truth_record.dispossession_events.source_url, warning: truth_record.dispossession_events.conflict_note },
      { label: "forced_removal_agent", value: truth_record.forced_removal_agent.value, source_url: truth_record.forced_removal_agent.source_url, warning: truth_record.forced_removal_agent.conflict_note },
      { label: "displacement_method", value: truth_record.displacement_method.value, source_url: truth_record.displacement_method.source_url },
    ],
    timeline: [
      { label: "recognition_current_status", value: truth_record.recognition_current_status.value, source_url: truth_record.recognition_current_status.source_url, warning: truth_record.recognition_current_status.conflict_note },
      { label: "recognition_events_count", value: truth_record.recognition_events_count.value, source_url: truth_record.recognition_events_count.source_url },
      { label: "recognition_granted_reversed", value: truth_record.recognition_granted_reversed.value, source_url: truth_record.recognition_granted_reversed.source_url, warning: truth_record.recognition_granted_reversed.conflict_note },
      { label: "reversal_agent", value: truth_record.reversal_agent.value, source_url: truth_record.reversal_agent.source_url, warning: truth_record.reversal_agent.conflict_note },
    ],
    lawsuit: [
      { label: "lawsuit_filed_date", value: truth_record.lawsuit_filed_date.value, source_url: truth_record.lawsuit_filed_date.source_url },
      { label: "lawsuit_court", value: truth_record.lawsuit_court.value, source_url: truth_record.lawsuit_court.source_url },
      { label: "lawsuit_claims", value: truth_record.lawsuit_claims.value, source_url: truth_record.lawsuit_claims.source_url },
      { label: "sex_discrimination_claim_present", value: truth_record.sex_discrimination_claim_present.value, source_url: truth_record.sex_discrimination_claim_present.source_url, warning: truth_record.sex_discrimination_claim_present.conflict_note },
    ],
    language: [
      { label: "language_name", value: truth_record.language_name.value, source_url: truth_record.language_name.source_url },
      { label: "language_program_active", value: truth_record.language_program_active.value, source_url: truth_record.language_program_active.source_url },
      { label: "living_practices_count", value: truth_record.living_practices_count.value, source_url: truth_record.living_practices_count.source_url },
      { label: "physical_home_address", value: truth_record.physical_home_address.value, source_url: truth_record.physical_home_address.source_url },
      { label: "physical_home_public_access", value: truth_record.physical_home_public_access.value, source_url: truth_record.physical_home_public_access.source_url },
      { label: "enrolled_members_approx", value: truth_record.enrolled_members_approx.value, source_url: truth_record.enrolled_members_approx.source_url },
      { label: "canoe_journey_active", value: truth_record.canoe_journey_active.value, source_url: truth_record.canoe_journey_active.source_url },
      { label: "mmiw_work_active", value: truth_record.mmiw_work_active.value, source_url: truth_record.mmiw_work_active.source_url },
    ],
    "ally-call": [
      { label: "land_status", value: truth_record.land_status.value, source_url: truth_record.land_status.source_url },
      { label: "closing_statement", value: truth_record.closing_statement.value, source_url: truth_record.closing_statement.source_url },
      { label: "ally_actions_count", value: truth_record.ally_actions_count.value, source_url: truth_record.ally_actions_count.source_url },
    ],
  };

  return (
    <main style={{ minHeight: "100vh", background: tone.bg, color: tone.paper, fontFamily: "Inter, system-ui, sans-serif", padding: "clamp(1.25rem, 3vw, 3rem)" }}>
      <section style={{ maxWidth: 1180, margin: "0 auto" }}>
        <Link href="/recognition-atlas" style={{ color: tone.blue, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8, marginBottom: "1.5rem" }}>
          <ArrowLeft size={16} /> Back to Recognition Atlas
        </Link>

        <div style={{ border: `1px solid rgba(212,160,23,0.35)`, background: "rgba(212,160,23,0.08)", color: tone.gold, borderRadius: 999, padding: "0.5rem 0.85rem", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "1.5rem" }}>
          <EyeOff size={14} /> Tribal council/admin preview — Not Public
        </div>

        <header style={{ border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 28, padding: "clamp(1.25rem, 3vw, 2rem)", marginBottom: "1rem" }}>
          <p style={{ color: tone.blue, letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 12, marginBottom: 12 }}>
            {tribe_id} · {layer_key}
          </p>
          <h1 style={{ fontSize: "clamp(2.3rem, 7vw, 5rem)", lineHeight: 0.95, margin: 0 }}>
            {layer_config?.title ?? "Recognition Atlas Layer"}
          </h1>
          <p style={{ color: tone.blue, fontSize: "1.25rem", marginBottom: 0 }}>{layer_config?.subtitle}</p>
          <p style={{ color: tone.muted, lineHeight: 1.75, maxWidth: 860 }}>{layer_config?.description}</p>
          <p style={{ color: tone.gold, lineHeight: 1.65, maxWidth: 860 }}>
            This is an admin/tribal-review preview. It is not public, not approved, and not a final publication record.
          </p>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
          {section_card({
            title: "Resolved fields",
            children: field_grid({ fields: layer_fields[active_layer_slug] }),
          })}

          {section_card({
            title: "Protection state",
            children: (
              <div style={{ color: tone.muted, lineHeight: 1.75 }}>
                <p><Shield size={16} color={tone.green} /> Atlas remains the private build and approval workspace.</p>
                <p>public_display_permitted: false</p>
                <p>approval_status: locked_pending_tribe_review</p>
                <p>luminari_commitment: we_are_the_vessel_they_are_the_author</p>
              </div>
            ),
          })}
        </div>

        {active_layer_slug === "language" && section_card({
          title: "Language entries for review",
          children: (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              {[duwamish_language_seed.self_identifier_entry, duwamish_language_seed.primary_declaration_entry, ...duwamish_language_seed.entries].map((entry) => (
                <article key={entry.entry_id} style={{ border: `1px solid ${tone.card_border}`, borderRadius: 16, padding: "0.9rem", background: "rgba(255,255,255,0.025)" }}>
                  <div style={{ color: tone.paper, fontSize: "1.25rem" }}>{entry.original_text}</div>
                  <div style={{ color: tone.muted }}>{entry.romanization}</div>
                  <div style={{ color: tone.blue }}>{entry.english_gloss}</div>
                  {entry.extended_meaning && <p style={{ color: tone.muted, lineHeight: 1.6 }}>{entry.extended_meaning}</p>}
                  {entry.verified_by_tribe === false && <p style={{ color: tone.gold, fontSize: 12 }}>recovered_thread_unverified · requires tribal review</p>}
                </article>
              ))}
            </div>
          ),
        })}

        {conflict_fields.length > 0 && section_card({
          title: "Conflict flags visible in this record",
          children: (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.75rem" }}>
              {conflict_fields.map((conflict) => (
                <article key={conflict.field} style={{ border: `1px solid rgba(239,68,68,0.22)`, background: "rgba(239,68,68,0.055)", borderRadius: 16, padding: "0.9rem" }}>
                  <div style={{ color: tone.red, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>{conflict.field}</div>
                  <p style={{ color: tone.muted, lineHeight: 1.6 }}>{conflict.conflict_note}</p>
                </article>
              ))}
            </div>
          ),
        })}
      </section>
    </main>
  );
}
