import { useAuth } from "@/core/hooks/useAuth";
import { duwamish_language_entries, duwamish_truth_layers } from "@/data/recognition_atlas_layers";
import { duwamish_truth_seed } from "@/data/duwamish_truth_seed";
import { muwekma_truth_seed } from "@/data/muwekma_truth_seed";
import { get_conflict_fields, resolve_truth_layer } from "@/resolvers/truth_layer_resolver";
import { Link, useRoute } from "wouter";
import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, CheckCircle2, EyeOff, Globe2, Languages, Lock, Shield } from "lucide-react";

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

type layer_card = {
  key: string;
  title: string;
  subtitle: string;
  description: string;
  route: string;
  status: string;
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
          Recognition Atlas <ArrowRight size={16} />
        </Link>
      </section>
    </main>
  );
}

function page_link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} style={{ color: tone.blue, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8, border: `1px solid rgba(126,179,232,0.35)`, background: "rgba(126,179,232,0.06)", borderRadius: 999, padding: "0.45rem 0.7rem", fontSize: 13 }}>
      {children}
    </Link>
  );
}

function status_grid({ tribe_id }: { tribe_id: string }) {
  return (
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginTop: "2rem" }}>
      {[["visibility", "admin_only"], ["tribal_review_status", "locked_pending_tribal_review"], ["source_workspace", "atlas"], ["publication_gate", "tribe_approved"], ["tribe_id", tribe_id]].map(([label, value]) => (
        <div key={label} style={{ border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 18, padding: "1rem" }}>
          <div style={{ color: tone.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{label}</div>
          <div style={{ fontFamily: "JetBrains Mono, monospace", color: tone.paper }}>{value}</div>
        </div>
      ))}
    </section>
  );
}

function layer_grid({ layers, title }: { layers: layer_card[]; title: string }) {
  return (
    <section style={{ marginTop: "1.25rem" }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 10 }}><BookOpen size={22} color={tone.gold} /> {title}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
        {layers.map((layer) => (
          <Link key={layer.key} href={layer.route} style={{ border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 20, padding: "1rem", color: tone.paper, textDecoration: "none", display: "block" }}>
            <div style={{ color: tone.muted, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>{layer.key}</div>
            <h3 style={{ margin: "0.55rem 0 0.25rem" }}>{layer.title}</h3>
            <p style={{ color: tone.blue, margin: 0 }}>{layer.subtitle}</p>
            <p style={{ color: tone.muted, lineHeight: 1.6 }}>{layer.description}</p>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: tone.gold, fontSize: 12 }}>
              <CheckCircle2 size={14} /> {layer.status}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function duwamish_page() {
  const truth_record = resolve_truth_layer({ tribe_id: "duwamish", priority: "truth_layer_first", include_source_refs: true, include_conflict_flags: true }, duwamish_truth_seed);
  const conflict_fields = get_conflict_fields(truth_record);
  const layers: layer_card[] = duwamish_truth_layers.map((layer) => ({
    key: layer.key,
    title: layer.title,
    subtitle: layer.subtitle,
    description: layer.description,
    route: layer.actions[0]?.route ?? "/recognition-atlas/duwamish/identity",
    status: layer.status,
  }));

  return {
    tribe_id: "duwamish",
    eyebrow: "Recognition Atlas tribal card · Duwamish",
    title: truth_record.tribe_self_name.value,
    subtitle: `Duwamish Tribe · ${truth_record.name_meaning.value}`,
    declaration: truth_record.primary_declaration.value,
    description: `${truth_record.territorial_declaration.value}. This tribal card consolidates the Duwamish Recognition Atlas depth into the Duwamish page: identity, treaty, dispossession, recognition timeline, lawsuit, language vault, ally call, conflict flags, and source-packet links.`,
    language_title: "Language preservation",
    language_children: duwamish_language_entries.map((entry) => (
      <div key={entry.entry_id} style={{ borderTop: `1px solid ${tone.card_border}`, paddingTop: 12, marginTop: 12 }}>
        <div style={{ fontSize: "1.4rem", color: tone.paper }}>{entry.original_text}</div>
        <div style={{ color: tone.muted, fontSize: 13 }}>{entry.romanization}</div>
        <div style={{ color: tone.blue, marginTop: 4 }}>{entry.english_gloss}</div>
        {entry.extended_meaning && <p style={{ color: tone.muted, lineHeight: 1.55, marginBottom: 0 }}>{entry.extended_meaning}</p>}
        {entry.verified_by_tribe === false && <p style={{ color: "rgba(212,160,23,0.8)", fontSize: 12, marginBottom: 0 }}>recovered_thread_unverified · requires tribal review</p>}
      </div>
    )),
    conflict_fields,
    layers,
  };
}

function muwekma_page() {
  const seed = muwekma_truth_seed;
  const layers: layer_card[] = [
    ["layer_0_identity", "Identity Core", "Muwékma · Those Who Walk Forward", "Muwékma identity, homeland, waters, and present-day member territory.", "/recognition-atlas/muwekma/identity"],
    ["layer_1_treaty", "Treaty / Political Relationship", "Verona Band / federal identification and omission", "Political relationship record, prior federal identification, and no ratified treaty recorded in this seed.", "/recognition-atlas/muwekma/treaty"],
    ["layer_2_dispossession", "Dispossession Record", "Missionization, secularization, displacement, and omission", "Structured event record for continuity-impacting historical and administrative events.", "/recognition-atlas/muwekma/dispossession"],
    ["layer_3_recognition_timeline", "Recognition Timeline", "Federal identification, omission, petition, denial, litigation", "Recognition events from the Muwékma seed rendered as a source review packet.", "/recognition-atlas/muwekma/timeline"],
    ["layer_4_lawsuit", "Lawsuit Claims", "Muwékma Ohlone v. Salazar frame", "Legal claims and procedural posture from the Muwékma recognition record.", "/recognition-atlas/muwekma/lawsuit"],
    ["layer_5_living_culture", "Living Culture / Language", "Chochenyo language and cultural revitalization", "Chochenyo language, cultural practices, community continuity, and stewardship records.", "/recognition-atlas/muwekma/language"],
    ["layer_6_ally_call", "Ally Call", "How to stand with the Muwékma Ohlone Tribe", "Land acknowledgement and ally actions from the Muwékma seed.", "/recognition-atlas/muwekma/ally-call"],
  ].map(([key, title, subtitle, description, route]) => ({ key, title, subtitle, description, route, status: "locked_pending_tribal_review" }));

  return {
    tribe_id: "muwekma",
    eyebrow: "Recognition Atlas tribal card · Muwékma",
    title: seed.layer_0_identity.tribe_self_name,
    subtitle: `Muwékma Ohlone Tribe · ${seed.layer_0_identity.name_meaning}`,
    declaration: seed.layer_0_identity.primary_declaration,
    description: `${seed.layer_0_identity.territorial_declaration}. This tribal card consolidates the Muwékma Recognition Atlas layers into the Muwékma page: identity, political relationship, dispossession, recognition timeline, lawsuit, living culture and language, ally call, and source-packet links.`,
    language_title: "Chochenyo language and living culture",
    language_children: [
      ["language_name", seed.layer_5_living_culture.language.language_name],
      ["language_program", seed.layer_5_living_culture.language.program_name],
      ["program_purpose", seed.layer_5_living_culture.language.program_purpose],
      ["living_practices", seed.layer_5_living_culture.living_practices.map((practice) => practice.practice_name).join(" · ")],
      ["environmental_coalition", seed.layer_5_living_culture.environmental_coalition],
    ].map(([label, value]) => (
      <div key={label} style={{ borderTop: `1px solid ${tone.card_border}`, paddingTop: 12, marginTop: 12 }}>
        <div style={{ color: tone.muted, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>{label}</div>
        <div style={{ color: tone.paper, lineHeight: 1.55 }}>{value}</div>
      </div>
    )),
    conflict_fields: [],
    layers,
  };
}

export default function RecognitionAtlasTribe() {
  const { user, isAuthenticated, loading } = useAuth();
  const [, params] = useRoute("/recognition-atlas/:tribe_id");
  const tribe_id = params?.tribe_id ?? "";

  if (loading) return gate_panel({ title: "Loading tribal card preview", message: "Checking admin access before showing this unpublished tribal card." });
  if (!isAuthenticated || user?.role !== "admin") return gate_panel({ title: "Tribal card requires admin access", message: "This tribal card is still in preparation and requires tribal review before public publication." });
  if (tribe_id !== "duwamish" && tribe_id !== "muwekma") return gate_panel({ title: "Tribal card not available yet", message: "This Recognition Atlas tribal card has not been scaffolded into the admin preview yet." });

  const page = tribe_id === "muwekma" ? muwekma_page() : duwamish_page();

  return (
    <main style={{ minHeight: "100vh", background: tone.bg, color: tone.paper, fontFamily: "Inter, system-ui, sans-serif", padding: "clamp(1.25rem, 3vw, 3rem)" }}>
      <section style={{ maxWidth: 1180, margin: "0 auto" }}>
        <nav style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
          {page_link({ href: "/recognition-atlas", children: <><ArrowLeft size={16} /> Recognition Atlas</> })}
          {page_link({ href: "/native-nations", children: <><ArrowLeft size={16} /> Native Nations Hub</> })}
        </nav>

        <div style={{ border: `1px solid rgba(212,160,23,0.35)`, background: "rgba(212,160,23,0.08)", color: tone.gold, borderRadius: 999, padding: "0.5rem 0.85rem", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "1.5rem" }}>
          <EyeOff size={14} /> Admin Preview — tribal card not public
        </div>

        <header style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(280px, 0.8fr)", gap: "2rem", alignItems: "end" }}>
          <div>
            <p style={{ color: tone.blue, letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 12, marginBottom: 12 }}>{page.eyebrow}</p>
            <h1 style={{ fontSize: "clamp(2.8rem, 8vw, 6.5rem)", lineHeight: 0.9, margin: 0 }}>{page.title}</h1>
            <p style={{ color: tone.blue, fontSize: "1.35rem", margin: "1rem 0 0" }}>{page.subtitle}</p>
            <blockquote style={{ borderLeft: `4px solid ${tone.gold}`, paddingLeft: "1rem", margin: "1.5rem 0", fontSize: "1.5rem", lineHeight: 1.35 }}>{page.declaration}</blockquote>
            <p style={{ color: tone.muted, lineHeight: 1.75, fontSize: "1.08rem", maxWidth: 840 }}>{page.description}</p>
          </div>

          <aside style={{ border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 22, padding: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}><Shield size={20} color={tone.green} /><strong>Protection state</strong></div>
            <p style={{ color: tone.muted, lineHeight: 1.6, margin: 0 }}>This is a council-review source packet page. It is not public, not final, and not tribal approval. Each deep layer remains linked for review and correction.</p>
          </aside>
        </header>

        {status_grid({ tribe_id: page.tribe_id })}

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginTop: "1.25rem" }}>
          <div style={{ border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 22, padding: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}><Languages size={20} color={tone.blue} /><h2 style={{ margin: 0, fontSize: "1.25rem" }}>{page.language_title}</h2></div>
            {page.language_children}
          </div>

          <div style={{ border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 22, padding: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}><Globe2 size={20} color={tone.green} /><h2 style={{ margin: 0, fontSize: "1.25rem" }}>Atlas → Lighthouse</h2></div>
            <ol style={{ color: tone.muted, lineHeight: 1.8, paddingLeft: "1.25rem" }}><li>Build and source the record in Atlas.</li><li>Keep every section locked pending tribal review.</li><li>Preview this tribal card as admin only.</li><li>Publish to Lighthouse only after tribal approval.</li></ol>
          </div>
        </section>

        {page.conflict_fields.length > 0 && (
          <section style={{ marginTop: "1.25rem" }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: 10 }}><AlertTriangle size={22} color={tone.gold} /> Conflict flags</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
              {page.conflict_fields.map((conflict) => (<article key={conflict.field} style={{ border: `1px solid rgba(239,68,68,0.22)`, background: "rgba(239,68,68,0.055)", borderRadius: 20, padding: "1rem" }}><div style={{ color: tone.red, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>{conflict.field}</div><p style={{ color: tone.muted, lineHeight: 1.6 }}>{conflict.conflict_note}</p></article>))}
            </div>
          </section>
        )}

        {layer_grid({ layers: page.layers, title: `${page.title} source-packet layers` })}

        <footer style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: `1px solid ${tone.card_border}`, display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ color: tone.muted, margin: 0 }}>luminari_commitment: <strong style={{ color: tone.paper }}>we_are_the_vessel_they_are_the_author</strong></p>
          <Link href="/recognition-gideon" style={{ color: tone.blue, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>Recognition Gideon / RTR Matrix <ArrowRight size={15} /></Link>
        </footer>
      </section>
    </main>
  );
}
