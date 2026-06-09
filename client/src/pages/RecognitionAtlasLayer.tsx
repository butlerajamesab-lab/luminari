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

type layer_slug =
  | "identity"
  | "treaty"
  | "dispossession"
  | "timeline"
  | "lawsuit"
  | "language"
  | "ally-call";

type supported_tribe_id = "duwamish" | "muwekma";

type preview_field = {
  label: string;
  value: string | number | boolean | string[];
  source_url?: string;
  warning?: string;
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
    description: "WE ARE STILL HERE. Muwékma identity, homeland, and present-day community territory render here as an admin-preview record pending tribal review.",
  },
  treaty: {
    key: "layer_1_treaty",
    title: "Treaty Record",
    subtitle: "No ratified treaty recorded in this seed",
    description: "Treaty and land-cession framing for Muwékma recognition analysis. This remains admin-preview only pending tribal review.",
  },
  dispossession: {
    key: "layer_2_dispossession",
    title: "Dispossession Record",
    subtitle: "Missionization, secularization, state violence, and federal omission",
    description: "The Muwékma seed identifies structural disruptions to continuity including missionization, disease, secularization, rancho grants, Gold Rush violence, and omission from the 1978 list.",
  },
  timeline: {
    key: "layer_3_recognition_timeline",
    title: "Recognition Timeline",
    subtitle: "Prior federal identification, omission, petition, denial, and litigation",
    description: "Recognition events from federal identification and Verona Band history through petition, denial, litigation, and recent advocacy.",
  },
  lawsuit: {
    key: "layer_4_lawsuit",
    title: "Lawsuit Claims",
    subtitle: "Muwékma Ohlone v. Salazar frame",
    description: "Legal claims and procedural posture from the Muwékma recognition record, rendered as admin-preview only pending tribal review.",
  },
  language: {
    key: "layer_5_living_culture",
    title: "Living Culture / Language",
    subtitle: "Chochenyo language and cultural revitalization",
    description: "Chochenyo language, cultural practices, community continuity, and stewardship records from the Muwékma seed.",
  },
  "ally-call": {
    key: "layer_6_ally_call",
    title: "Ally Call",
    subtitle: "Support recognition and Muwékma stewardship",
    description: "Land acknowledgement and ally actions from the Muwékma seed. This is not public-facing and does not indicate tribal approval.",
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

function return_links() {
  return (
    <nav style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
      <Link href="/recognition-atlas" style={back_link_style}>
        <ArrowLeft size={16} /> Recognition Atlas
      </Link>
      <Link href="/recognition-gideon" style={back_link_style}>
        <ArrowLeft size={16} /> Recognition Gideon / RTR Matrix
      </Link>
    </nav>
  );
}

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
        {return_links()}
      </section>
    </main>
  );
}

function render_value(value: preview_field["value"]) {
  if (Array.isArray(value)) return value.join(" · ");
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function section_card({ title, children }: { title: string; children: ReactNode }) {
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

function is_supported_tribe_id(tribe_id: string): tribe_id is supported_tribe_id {
  return tribe_id === "duwamish" || tribe_id === "muwekma";
}

function get_layer_config(tribe_id: supported_tribe_id, active_layer_slug: layer_slug): layer_preview_config | undefined {
  if (tribe_id === "muwekma") return muwekma_layer_configs[active_layer_slug];
  const layer_key = layer_slug_to_key[active_layer_slug];
  return duwamish_truth_layers.find((layer) => layer.key === layer_key);
}

function get_duwamish_layer_fields(active_layer_slug: layer_slug): { fields: preview_field[]; conflict_fields: ReturnType<typeof get_conflict_fields> } {
  const truth_record = resolve_truth_layer({
    tribe_id: "duwamish",
    priority: "truth_layer_first",
    include_source_refs: true,
    include_conflict_flags: true,
  }, duwamish_truth_seed);

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

  return { fields: layer_fields[active_layer_slug], conflict_fields: get_conflict_fields(truth_record) };
}

function get_muwekma_layer_fields(active_layer_slug: layer_slug): preview_field[] {
  const recovered_warning = muwekma_truth_seed.meta.recovered_thread_unverified
    ? "recovered_thread_unverified · requires tribal review"
    : undefined;

  const layer_fields: Record<layer_slug, preview_field[]> = {
    identity: [
      { label: "tribe_self_name", value: muwekma_truth_seed.layer_0_identity.tribe_self_name, source_url: muwekma_truth_seed.layer_0_identity.source.url, warning: recovered_warning },
      { label: "name_meaning", value: muwekma_truth_seed.layer_0_identity.name_meaning, source_url: muwekma_truth_seed.layer_0_identity.source.url, warning: recovered_warning },
      { label: "primary_declaration", value: muwekma_truth_seed.layer_0_identity.primary_declaration, source_url: muwekma_truth_seed.layer_0_identity.source.url, warning: recovered_warning },
      { label: "territorial_declaration", value: muwekma_truth_seed.layer_0_identity.territorial_declaration, source_url: muwekma_truth_seed.layer_0_identity.source.url, warning: recovered_warning },
      { label: "homeland_waters", value: muwekma_truth_seed.layer_0_identity.homeland_waters, source_url: muwekma_truth_seed.layer_0_identity.source.url, warning: recovered_warning },
      { label: "present_day_member_territory", value: muwekma_truth_seed.layer_0_identity.present_day_member_territory, source_url: muwekma_truth_seed.layer_0_identity.source.url, warning: recovered_warning },
    ],
    treaty: [
      { label: "treaty_name", value: muwekma_truth_seed.layer_1_treaty.treaty_name, source_url: muwekma_truth_seed.layer_1_treaty.source.url, warning: recovered_warning },
      { label: "treaty_date", value: muwekma_truth_seed.layer_1_treaty.treaty_date, source_url: muwekma_truth_seed.layer_1_treaty.source.url, warning: recovered_warning },
      { label: "signatory_position", value: muwekma_truth_seed.layer_1_treaty.signatory_position, source_url: muwekma_truth_seed.layer_1_treaty.source.url, warning: recovered_warning },
    ],
    dispossession: [
      { label: "dispossession_events", value: muwekma_truth_seed.layer_2_dispossession.events.map((event) => event.event_label), source_url: muwekma_truth_seed.layer_2_dispossession.source.url, warning: recovered_warning },
      { label: "agents", value: muwekma_truth_seed.layer_2_dispossession.events.map((event) => event.agent ?? "agent_unlisted"), source_url: muwekma_truth_seed.layer_2_dispossession.source.url, warning: recovered_warning },
      { label: "outcomes", value: muwekma_truth_seed.layer_2_dispossession.events.map((event) => event.outcome ?? "outcome_unlisted"), source_url: muwekma_truth_seed.layer_2_dispossession.source.url, warning: recovered_warning },
    ],
    timeline: [
      { label: "recognition_current_status", value: muwekma_truth_seed.layer_3_recognition_timeline.current_status, source_url: muwekma_truth_seed.layer_3_recognition_timeline.source.url, warning: recovered_warning },
      { label: "recognition_events_count", value: muwekma_truth_seed.layer_3_recognition_timeline.events.length, source_url: muwekma_truth_seed.layer_3_recognition_timeline.source.url, warning: recovered_warning },
      { label: "recognition_event_labels", value: muwekma_truth_seed.layer_3_recognition_timeline.events.map((event) => event.event_label), source_url: muwekma_truth_seed.layer_3_recognition_timeline.source.url, warning: recovered_warning },
    ],
    lawsuit: [
      { label: "lawsuit_filed_date", value: muwekma_truth_seed.layer_4_lawsuit.filed_date, source_url: muwekma_truth_seed.layer_4_lawsuit.source.url, warning: recovered_warning },
      { label: "lawsuit_court", value: muwekma_truth_seed.layer_4_lawsuit.court, source_url: muwekma_truth_seed.layer_4_lawsuit.source.url, warning: recovered_warning },
      { label: "lawsuit_claims", value: muwekma_truth_seed.layer_4_lawsuit.claims.map((claim) => claim.claim_label), source_url: muwekma_truth_seed.layer_4_lawsuit.source.url, warning: recovered_warning },
      { label: "current_procedural_status", value: muwekma_truth_seed.layer_4_lawsuit.current_procedural_status, source_url: muwekma_truth_seed.layer_4_lawsuit.source.url, warning: recovered_warning },
    ],
    language: [
      { label: "language_name", value: muwekma_truth_seed.layer_5_living_culture.language.language_name, source_url: muwekma_truth_seed.layer_5_living_culture.language.source.url, warning: recovered_warning },
      { label: "language_program", value: muwekma_truth_seed.layer_5_living_culture.language.program_name, source_url: muwekma_truth_seed.layer_5_living_culture.language.source.url, warning: recovered_warning },
      { label: "living_practices_count", value: muwekma_truth_seed.layer_5_living_culture.living_practices.length, source_url: muwekma_truth_seed.layer_5_living_culture.source.url, warning: recovered_warning },
      { label: "physical_home_address", value: muwekma_truth_seed.layer_5_living_culture.physical_home.address, source_url: muwekma_truth_seed.layer_5_living_culture.physical_home.source.url, warning: recovered_warning },
      { label: "physical_home_public_access", value: muwekma_truth_seed.layer_5_living_culture.physical_home.public_access, source_url: muwekma_truth_seed.layer_5_living_culture.physical_home.source.url, warning: recovered_warning },
      { label: "enrolled_members_approx", value: muwekma_truth_seed.layer_5_living_culture.enrolled_members_approx, source_url: muwekma_truth_seed.layer_5_living_culture.source.url, warning: recovered_warning },
      { label: "environmental_coalition", value: muwekma_truth_seed.layer_5_living_culture.environmental_coalition, source_url: muwekma_truth_seed.layer_5_living_culture.source.url, warning: recovered_warning },
    ],
    "ally-call": [
      { label: "land_status", value: muwekma_truth_seed.layer_6_ally_call.land_status, source_url: muwekma_truth_seed.layer_6_ally_call.source.url, warning: recovered_warning },
      { label: "closing_statement", value: muwekma_truth_seed.layer_6_ally_call.closing_statement, source_url: muwekma_truth_seed.layer_6_ally_call.source.url, warning: recovered_warning },
      { label: "ally_actions_count", value: muwekma_truth_seed.layer_6_ally_call.ally_actions.length, source_url: muwekma_truth_seed.layer_6_ally_call.source.url, warning: recovered_warning },
    ],
  };

  return layer_fields[active_layer_slug];
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

  if (!is_supported_tribe_id(tribe_id) || !active_layer_slug || !(active_layer_slug in layer_slug_to_key)) {
    return gate_panel({
      title: "Recognition Atlas layer not found",
      message: "Only the Duwamish and Muwékma admin preview layers are wired in this phase.",
    });
  }

  const layer_key = tribe_id === "muwekma" && active_layer_slug === "language"
    ? "layer_5_living_culture"
    : layer_slug_to_key[active_layer_slug];
  const layer_config = get_layer_config(tribe_id, active_layer_slug);
  const duwamish_layer_data = tribe_id === "duwamish" ? get_duwamish_layer_fields(active_layer_slug) : undefined;
  const layer_fields = tribe_id === "duwamish"
    ? duwamish_layer_data?.fields ?? []
    : get_muwekma_layer_fields(active_layer_slug);
  const conflict_fields = duwamish_layer_data?.conflict_fields ?? [];

  return (
    <main style={{ minHeight: "100vh", background: tone.bg, color: tone.paper, fontFamily: "Inter, system-ui, sans-serif", padding: "clamp(1.25rem, 3vw, 3rem)" }}>
      <section style={{ maxWidth: 1180, margin: "0 auto" }}>
        {return_links()}

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
            children: field_grid({ fields: layer_fields }),
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

        {tribe_id === "duwamish" && active_layer_slug === "dispossession" && section_card({
          title: "Weak Joints Illustrated",
          children: (
            <article style={{ border: `1px solid rgba(212,160,23,0.35)`, background: "rgba(212,160,23,0.06)", borderRadius: 16, padding: "0.95rem" }}>
              <div style={{ color: tone.gold, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>{continuous_habitation_paradox.weak_joint_id}</div>
              <h3 style={{ margin: "0.5rem 0" }}>{continuous_habitation_paradox.title}</h3>
              <p style={{ color: tone.muted, lineHeight: 1.65 }}>{continuous_habitation_paradox.description}</p>
              <p style={{ color: tone.gold, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>
                authorship: {continuous_habitation_paradox.authorship} · publication_status: {continuous_habitation_paradox.publication_status}
              </p>
              <Link href="/recognition-gideon?weak_joint=continuous_habitation_paradox" style={{ color: tone.blue, textDecoration: "none", display: "inline-flex", gap: 6 }}>
                Open Recognition Gideon analysis <ArrowRight size={14} />
              </Link>
            </article>
          ),
        })}

        {tribe_id === "duwamish" && active_layer_slug === "language" && section_card({
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
