import { useAuth } from "@/core/hooks/useAuth";
import { Link } from "wouter";
import { ArrowRight, BookOpen, FileText, HeartHandshake, Languages, Lock, Map, MessageSquarePlus, ShieldAlert, Sparkles, Users } from "lucide-react";

const tone = {
  bg: "#0c0f14",
  paper: "#f0ece4",
  muted: "rgba(240,236,228,0.65)",
  card_bg: "rgba(255,255,255,0.035)",
  card_border: "rgba(255,255,255,0.09)",
  gold: "#D4A017",
  blue: "#7eb3e8",
  green: "#34d399",
  red: "#ef4444",
};

type card = {
  label: string;
  title: string;
  description: string;
  route?: string;
  status: "live" | "planned_route_not_implemented";
  icon: typeof HeartHandshake;
};

const native_focus_cards: card[] = [
  { label: "guided_native_nations_intake", title: "Guided Native Nations Intake", description: "Start with what happened, what you are trying to recover, or what needs protecting.", status: "planned_route_not_implemented", icon: HeartHandshake },
  { label: "urgent_sensitive_support", title: "Urgent / Sensitive Support Pathways", description: "A focused door for safety, family, missing-person, child, housing, and urgent-support routing.", status: "planned_route_not_implemented", icon: ShieldAlert },
  { label: "membership_documentation", title: "Tribal Membership & Documentation", description: "Records recovery for family connection, enrollment documentation, vital records, archives, and related paperwork. This does not determine belonging.", status: "planned_route_not_implemented", icon: Users },
  { label: "foia_records_recovery", title: "FOIA / Records Recovery", description: "Request and organize public, archival, court, probate, federal, state, and county records.", status: "planned_route_not_implemented", icon: FileText },
  { label: "language_preservation", title: "Language Preservation", description: "Language programs, source pages, display restrictions, and review-controlled preservation workflows.", status: "planned_route_not_implemented", icon: Languages },
  { label: "place_names_homelands", title: "Place Names & Homelands", description: "Original place names, waterways, village sites, homelands, imposed names, and land/water context.", status: "planned_route_not_implemented", icon: Map },
  { label: "traditions_cultural_continuity", title: "Traditions & Cultural Continuity", description: "Community-approved traditions, foodways, songs, dances, stories, events, and cultural preservation materials.", status: "planned_route_not_implemented", icon: Sparkles },
  { label: "share_tribal_input", title: "Share Tribal Input / Source Materials", description: "Submit source links, corrections, documents, program information, language materials, place names, or review notes. Nothing becomes public automatically.", status: "planned_route_not_implemented", icon: MessageSquarePlus },
];

const connected_cards: card[] = [
  { label: "recognition_atlas", title: "Recognition Atlas", description: "Open tribe-specific source packets and review records.", route: "/recognition-atlas", status: "live", icon: BookOpen },
  { label: "recognition_gideon", title: "Right to Recognition / Recognition Gideon", description: "Open recognition standards, weak-joint analysis, and procedural pathways.", route: "/recognition-gideon", status: "live", icon: BookOpen },
  { label: "broader_lighthouse_support", title: "Broader Lighthouse Support", description: "Bridge from Native Nations needs into housing, benefits, health, court, documents, and general Lighthouse pathways.", route: "/mudroom", status: "live", icon: HeartHandshake },
];

const suggestions = [
  "I need help finding family, enrollment, or ancestry records.",
  "I need help with FOIA, archives, court, probate, or public records.",
  "I need recognition, sovereignty, treaty, or petition pathway information.",
  "I need language, place-name, tradition, or cultural source support.",
  "I need safety, family, housing, health, or urgent support resources.",
];

function gate_panel({ title, message }: { title: string; message: string }) {
  return (
    <main style={{ minHeight: "100vh", background: tone.bg, color: tone.paper, display: "grid", placeItems: "center", padding: "2rem", fontFamily: "Inter, system-ui, sans-serif" }}>
      <section style={{ width: "min(720px, 100%)", border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 24, padding: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <Lock size={22} color={tone.gold} />
          <span style={{ color: tone.gold, textTransform: "uppercase", letterSpacing: "0.12em", fontSize: 12 }}>Admin preview</span>
        </div>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", margin: "0 0 1rem" }}>{title}</h1>
        <p style={{ color: tone.muted, lineHeight: 1.7, fontSize: "1.05rem", marginBottom: "1.5rem" }}>{message}</p>
        <Link href="/mudroom" style={{ color: tone.blue, textDecoration: "none", display: "inline-flex", gap: 8 }}>Return to Mudroom <ArrowRight size={16} /></Link>
      </section>
    </main>
  );
}

function card_view(item: card) {
  const Icon = item.icon;
  const body = (
    <article style={{ border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 22, padding: "1.1rem", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: item.status === "live" ? tone.blue : tone.gold, fontSize: 12, fontFamily: "JetBrains Mono, monospace", marginBottom: 10 }}>
        <Icon size={18} /> {item.label} · {item.status}
      </div>
      <h3 style={{ margin: "0 0 0.6rem", fontSize: "1.18rem" }}>{item.title}</h3>
      <p style={{ color: tone.muted, lineHeight: 1.65, margin: 0 }}>{item.description}</p>
      <div style={{ marginTop: "1rem", color: item.status === "live" ? tone.blue : "rgba(240,236,228,0.35)", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        {item.status === "live" ? "Open" : "Pipeline scaffold"} <ArrowRight size={14} />
      </div>
    </article>
  );

  if (item.status === "live" && item.route) {
    return <Link key={item.label} href={item.route} style={{ color: "inherit", textDecoration: "none" }}>{body}</Link>;
  }
  return <div key={item.label}>{body}</div>;
}

export default function NativeNationsHub() {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return gate_panel({ title: "Loading Native Nations Hub", message: "Checking access before showing this focused entry point." });
  }

  if (!isAuthenticated || user?.role !== "admin") {
    return gate_panel({ title: "Native Nations Hub is in admin preview", message: "This focused Lighthouse entry point is being prepared before public release." });
  }

  return (
    <main style={{ minHeight: "100vh", background: tone.bg, color: tone.paper, fontFamily: "Inter, system-ui, sans-serif", padding: "clamp(1.25rem, 3vw, 3rem)" }}>
      <section style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ border: `1px solid rgba(212,160,23,0.35)`, background: "rgba(212,160,23,0.08)", color: tone.gold, borderRadius: 999, padding: "0.5rem 0.85rem", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "1.5rem" }}>
          <Lock size={14} /> admin_preview_only · not_public_yet
        </div>

        <header style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(280px, 0.85fr)", gap: "2rem", alignItems: "end" }}>
          <div>
            <p style={{ color: tone.blue, letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 12, marginBottom: 12 }}>Lighthouse focused entry point</p>
            <h1 style={{ fontSize: "clamp(2.8rem, 8vw, 6.5rem)", lineHeight: 0.9, margin: 0 }}>Native Nations Hub</h1>
            <p style={{ color: tone.muted, lineHeight: 1.75, fontSize: "1.08rem", maxWidth: 820, marginTop: "1.5rem" }}>
              A tribal-focused Lighthouse entry point for records recovery, recognition pathways, language preservation, place names, safety resources, traditions, source-grounded review, and the full guided intake system.
            </p>
          </div>
          <aside style={{ border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 22, padding: "1.25rem" }}>
            <strong>How this should feel</strong>
            <p style={{ color: tone.muted, lineHeight: 1.6, marginBottom: 0 }}>
              Start with what you need. This hub centers Native Nations and tribal families while still connecting to the rest of Lighthouse.
            </p>
          </aside>
        </header>

        <section style={{ marginTop: "2rem", border: `1px solid ${tone.card_border}`, background: "linear-gradient(135deg, rgba(126,179,232,0.08), rgba(255,255,255,0.025))", borderRadius: 28, padding: "clamp(1.25rem, 3vw, 2rem)" }}>
          <p style={{ color: tone.gold, letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 12, marginTop: 0 }}>guided entry prompt</p>
          <h2 style={{ fontSize: "clamp(2rem, 5vw, 4rem)", margin: "0 0 0.75rem" }}>What do you need help with today?</h2>
          <p style={{ color: tone.muted, lineHeight: 1.7, maxWidth: 860 }}>Tell us what happened, what you are trying to recover, what needs protecting, or what kind of support you are looking for.</p>
          <button disabled style={{ marginTop: "1rem", border: `1px solid ${tone.card_border}`, background: "rgba(255,255,255,0.035)", color: "rgba(240,236,228,0.45)", borderRadius: 999, padding: "0.7rem 1rem", cursor: "not-allowed" }}>
            Start Native Nations Intake · planned_route_not_implemented
          </button>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
          {[['current_build_status', 'admin_preview_only'], ['public_release', 'not_public_yet'], ['routing_model', 'native_focus_plus_lighthouse'], ['publication_controls', 'tribal_review_required']].map(([label, value]) => (
            <div key={label} style={{ border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 18, padding: "1rem" }}>
              <div style={{ color: tone.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{label}</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", color: tone.paper }}>{value}</div>
            </div>
          ))}
        </section>

        <section style={{ marginTop: "2rem" }}>
          <h2>Native Nations focus pathways</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginTop: "1rem" }}>{native_focus_cards.map(card_view)}</div>
        </section>

        <section style={{ marginTop: "2rem" }}>
          <h2>Connected Lighthouse support</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginTop: "1rem" }}>{connected_cards.map(card_view)}</div>
        </section>

        <section style={{ marginTop: "2rem", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 0.75fr)", gap: "1rem" }}>
          <div style={{ border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 22, padding: "1.25rem" }}>
            <h2 style={{ marginTop: 0 }}>What can we help with?</h2>
            {suggestions.map((pathway) => <p key={pathway} style={{ color: tone.muted, lineHeight: 1.55, borderTop: `1px solid ${tone.card_border}`, paddingTop: "0.75rem" }}>{pathway}</p>)}
          </div>
          <div style={{ border: `1px solid rgba(239,68,68,0.22)`, background: "rgba(239,68,68,0.055)", borderRadius: 22, padding: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}><ShieldAlert size={20} color={tone.red} /><strong>Safety note</strong></div>
            <p style={{ color: tone.muted, lineHeight: 1.65, margin: 0 }}>If there is immediate danger, use emergency or local crisis resources first. Lighthouse can help organize records, contacts, next steps, and support pathways.</p>
          </div>
        </section>
      </section>
    </main>
  );
}
