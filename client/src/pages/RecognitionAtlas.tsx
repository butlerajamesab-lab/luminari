import { useAuth } from "@/core/hooks/useAuth";
import {
  duwamish_language_entries,
  duwamish_truth_layers,
  type truth_layer_action,
} from "@/data/recognition_atlas_layers";
import { duwamish_truth_seed } from "@/data/duwamish_truth_seed";
import {
  get_conflict_fields,
  resolve_truth_layer,
} from "@/resolvers/truth_layer_resolver";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  EyeOff,
  Globe2,
  Languages,
  Lock,
  MapPin,
  Shield,
  Users,
} from "lucide-react";

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

function gate_panel({ title, message }: { title: string; message: string }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: tone.bg,
        color: tone.paper,
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <section
        style={{
          width: "min(720px, 100%)",
          border: `1px solid ${tone.card_border}`,
          background: tone.card_bg,
          borderRadius: 24,
          padding: "2rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <Lock size={22} color={tone.gold} />
          <span style={{ color: tone.gold, textTransform: "uppercase", letterSpacing: "0.12em", fontSize: 12 }}>
            Admin gated
          </span>
        </div>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", margin: "0 0 1rem" }}>{title}</h1>
        <p style={{ color: tone.muted, lineHeight: 1.7, fontSize: "1.05rem", marginBottom: "1.5rem" }}>{message}</p>
        <Link href="/civil-gideon" style={{ color: tone.blue, textDecoration: "none", display: "inline-flex", gap: 8 }}>
          Return to Civil Gideon <ArrowRight size={16} />
        </Link>
      </section>
    </main>
  );
}

function action_button({ action }: { action: truth_layer_action }) {
  const label = action.action_label.replace(/_/g, " ");
  const shared_style = {
    border: `1px solid ${action.route_status === "live" ? "rgba(126,179,232,0.45)" : tone.card_border}`,
    background: action.route_status === "live" ? "rgba(126,179,232,0.08)" : "rgba(255,255,255,0.025)",
    color: action.route_status === "live" ? tone.blue : "rgba(240,236,228,0.35)",
    borderRadius: 999,
    padding: "0.45rem 0.7rem",
    fontSize: 12,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    textTransform: "capitalize" as const,
  };

  if (action.route_status !== "live") {
    return (
      <span title="planned_route_not_implemented" style={shared_style}>
        <Lock size={12} /> {label} · planned
      </span>
    );
  }

  if (action.external) {
    return (
      <a href={action.route} target="_blank" rel="noopener noreferrer" style={shared_style}>
        {label} <ExternalLink size={12} />
      </a>
    );
  }

  return (
    <Link href={action.route} style={shared_style}>
      {label} <ArrowRight size={12} />
    </Link>
  );
}

export default function RecognitionAtlas() {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return gate_panel({
      title: "Loading Recognition Atlas preview",
      message: "Checking admin access before showing this unpublished public-site preview.",
    });
  }

  if (!isAuthenticated) {
    return gate_panel({
      title: "Recognition Atlas preview requires admin access",
      message: "This Lighthouse route exists only so the public projection can be prepared before tribal approval. It is not public-facing yet.",
    });
  }

  if (user?.role !== "admin") {
    return gate_panel({
      title: "Recognition Atlas is not public yet",
      message: "This record is still in preparation and requires tribal review before public publication.",
    });
  }

  const truth_record = resolve_truth_layer({
    tribe_id: "duwamish",
    priority: "truth_layer_first",
    include_source_refs: true,
    include_conflict_flags: true,
  }, duwamish_truth_seed);
  const conflict_fields = get_conflict_fields(truth_record);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: tone.bg,
        color: tone.paper,
        fontFamily: "Inter, system-ui, sans-serif",
        padding: "clamp(1.25rem, 3vw, 3rem)",
      }}
    >
      <section style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div
          style={{
            border: `1px solid rgba(212,160,23,0.35)`,
            background: "rgba(212,160,23,0.08)",
            color: tone.gold,
            borderRadius: 999,
            padding: "0.5rem 0.85rem",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            marginBottom: "1.5rem",
          }}
        >
          <EyeOff size={14} /> Admin Preview — Not Public
        </div>

        <header style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(280px, 0.8fr)", gap: "2rem", alignItems: "end" }}>
          <div>
            <p style={{ color: tone.blue, letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 12, marginBottom: 12 }}>
              Lighthouse public projection · locked until tribal approval
            </p>
            <h1 style={{ fontSize: "clamp(2.8rem, 8vw, 6.5rem)", lineHeight: 0.9, margin: 0 }}>
              Recognition Atlas
            </h1>
            <p style={{ color: tone.muted, lineHeight: 1.75, fontSize: "1.08rem", maxWidth: 760, marginTop: "1.5rem" }}>
              This page is the Lighthouse-side preview of the Recognition Atlas. It is visible to admins only while the Duwamish record and future tribal records are prepared for review. Nothing here is a public claim of approval, endorsement, or final publication.
            </p>
          </div>

          <aside
            style={{
              border: `1px solid ${tone.card_border}`,
              background: tone.card_bg,
              borderRadius: 22,
              padding: "1.25rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <Shield size={20} color={tone.green} />
              <strong>Protection state</strong>
            </div>
            <p style={{ color: tone.muted, lineHeight: 1.6, margin: 0 }}>
              Atlas remains the private build and approval workspace. Lighthouse only witnesses records after the tribe approves publication.
            </p>
          </aside>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginTop: "2rem" }}>
          {[
            ["visibility", "admin_only"],
            ["source_workspace", "atlas"],
            ["public_surface", "lighthouse"],
            ["publication_gate", "tribe_approved"],
          ].map(([label, value]) => (
            <div key={label} style={{ border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 18, padding: "1rem" }}>
              <div style={{ color: tone.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{label}</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", color: tone.paper }}>{value}</div>
            </div>
          ))}
        </section>

        <section
          style={{
            marginTop: "2rem",
            border: `1px solid ${tone.card_border}`,
            background: "linear-gradient(135deg, rgba(126,179,232,0.08), rgba(255,255,255,0.025))",
            borderRadius: 28,
            padding: "clamp(1.25rem, 3vw, 2rem)",
          }}
        >
          <span style={{ color: tone.gold, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.14em" }}>
            Anchor node preview · resolved from duwamish_truth_seed
          </span>
          <h2 style={{ fontSize: "clamp(2rem, 5vw, 4.5rem)", margin: "0.75rem 0 0.35rem" }}>{truth_record.tribe_self_name.value}</h2>
          <p style={{ color: tone.blue, fontSize: "1.35rem", margin: 0 }}>
            Duwamish Tribe · {truth_record.name_meaning.value}
          </p>
          <blockquote style={{ borderLeft: `4px solid ${tone.gold}`, paddingLeft: "1rem", margin: "1.5rem 0", fontSize: "1.5rem", lineHeight: 1.35 }}>
            {truth_record.primary_declaration.value}
          </blockquote>
          <p style={{ color: tone.muted, lineHeight: 1.75, maxWidth: 860 }}>
            {truth_record.territorial_declaration.value}. This preview is now backed by the recovered truth-layer seed and resolver. The content remains admin-only and pending tribal review.
          </p>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginTop: "1.25rem" }}>
          <div style={{ border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 22, padding: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <Languages size={20} color={tone.blue} />
              <h3 style={{ margin: 0 }}>Language preservation</h3>
            </div>
            {duwamish_language_entries.map((entry) => (
              <div key={entry.entry_id} style={{ borderTop: `1px solid ${tone.card_border}`, paddingTop: 12, marginTop: 12 }}>
                <div style={{ fontSize: "1.4rem", color: tone.paper }}>{entry.original_text}</div>
                <div style={{ color: tone.muted, fontSize: 13 }}>{entry.romanization}</div>
                <div style={{ color: tone.blue, marginTop: 4 }}>{entry.english_gloss}</div>
                {entry.extended_meaning && (
                  <p style={{ color: tone.muted, lineHeight: 1.55, marginBottom: 0 }}>{entry.extended_meaning}</p>
                )}
                {entry.verified_by_tribe === false && (
                  <p style={{ color: "rgba(212,160,23,0.8)", fontSize: 12, marginBottom: 0 }}>
                    recovered_thread_unverified · requires tribal review
                  </p>
                )}
              </div>
            ))}
          </div>

          <div style={{ border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 22, padding: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <Globe2 size={20} color={tone.green} />
              <h3 style={{ margin: 0 }}>Atlas → Lighthouse</h3>
            </div>
            <ol style={{ color: tone.muted, lineHeight: 1.8, paddingLeft: "1.25rem" }}>
              <li>Build and source the record in Atlas.</li>
              <li>Lock every section pending tribal review.</li>
              <li>Preview the public projection here as admin only.</li>
              <li>Publish to Lighthouse only after tribal approval.</li>
            </ol>
          </div>
        </section>

        <section style={{ marginTop: "1.25rem" }}>
          <h2 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <AlertTriangle size={22} color={tone.gold} /> Conflict flags
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
            {conflict_fields.map((conflict) => (
              <article key={conflict.field} style={{ border: `1px solid rgba(239,68,68,0.22)`, background: "rgba(239,68,68,0.055)", borderRadius: 20, padding: "1rem" }}>
                <div style={{ color: tone.red, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>{conflict.field}</div>
                <p style={{ color: tone.muted, lineHeight: 1.6 }}>{conflict.conflict_note}</p>
              </article>
            ))}
          </div>
        </section>

        <section style={{ marginTop: "1.25rem" }}>
          <h2 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BookOpen size={22} color={tone.gold} /> Truth layers
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
            {duwamish_truth_layers.map((layer) => (
              <article key={layer.key} style={{ border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 20, padding: "1rem" }}>
                <div style={{ color: tone.muted, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>{layer.key}</div>
                <h3 style={{ margin: "0.55rem 0 0.25rem" }}>{layer.title}</h3>
                <p style={{ color: tone.blue, margin: 0 }}>{layer.subtitle}</p>
                <p style={{ color: tone.muted, lineHeight: 1.6 }}>{layer.description}</p>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: layer.status === "available_admin_only" ? tone.gold : tone.muted, fontSize: 12 }}>
                  {layer.status === "available_admin_only" ? <CheckCircle2 size={14} /> : <Lock size={14} />}
                  {layer.status}
                </span>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "1rem" }}>
                  {layer.actions.map((action) => (
                    <span key={action.action_label}>{action_button({ action })}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <footer style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: `1px solid ${tone.card_border}`, display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ color: tone.muted, margin: 0 }}>
            luminari_commitment: <strong style={{ color: tone.paper }}>we_are_the_vessel_they_are_the_author</strong>
          </p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Link href="/civil-gideon" style={{ color: tone.blue, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
              Civil Gideon <ArrowRight size={15} />
            </Link>
            <Link href="/civic-map" style={{ color: tone.blue, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
              CivicMap <MapPin size={15} />
            </Link>
            <Link href="/mission-control" style={{ color: tone.blue, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
              Mission Control <Users size={15} />
            </Link>
          </div>
        </footer>
      </section>
    </main>
  );
}
