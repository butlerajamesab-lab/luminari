import { useAuth } from "@/core/hooks/useAuth";
import { Link } from "wouter";
import { ArrowRight, EyeOff, Lock, Shield } from "lucide-react";

const tone = {
  bg: "#0c0f14",
  paper: "#f0ece4",
  muted: "rgba(240,236,228,0.64)",
  card_bg: "rgba(255,255,255,0.035)",
  card_border: "rgba(255,255,255,0.09)",
  gold: "#D4A017",
  blue: "#7eb3e8",
  green: "#34d399",
};

const native_nations_pathways = [
  "Guided Native Nations Intake",
  "Urgent / Sensitive Support Pathways",
  "Tribal Membership & Documentation",
  "FOIA / Records Recovery",
  "Language Preservation",
  "Place Names & Homelands",
  "Traditions & Cultural Continuity",
  "Share Tribal Input / Source Materials",
];

const suggested_pathways = [
  "Start a guided intake to organize the Nation, family, program, or records-recovery need.",
  "Gather source materials, contacts, deadlines, agencies, and existing documentation before drafting requests.",
  "Route recognition, records, language, homelands, safety, or cultural-continuity needs into the right Lighthouse workspace.",
];

function gate_panel({ title, message }: { title: string; message: string }) {
  return (
    <main style={{ minHeight: "100vh", background: tone.bg, color: tone.paper, display: "grid", placeItems: "center", padding: "2rem", fontFamily: "Inter, system-ui, sans-serif" }}>
      <section style={{ width: "min(720px, 100%)", border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 24, padding: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <Lock size={22} color={tone.gold} />
          <span style={{ color: tone.gold, textTransform: "uppercase", letterSpacing: "0.12em", fontSize: 12 }}>admin preview</span>
        </div>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", margin: "0 0 1rem" }}>{title}</h1>
        <p style={{ color: tone.muted, lineHeight: 1.7, fontSize: "1.05rem", marginBottom: "1.5rem" }}>{message}</p>
        <Link href="/mudroom" style={{ color: tone.blue, textDecoration: "none", display: "inline-flex", gap: 8, alignItems: "center" }}>
          Return to Mudroom <ArrowRight size={16} />
        </Link>
      </section>
    </main>
  );
}

function planned_card({ title }: { title: string }) {
  return (
    <article style={{ border: `1px solid ${tone.card_border}`, background: "rgba(255,255,255,0.025)", borderRadius: 18, padding: "1rem", minHeight: 132 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", marginBottom: 12 }}>
        <h3 style={{ color: tone.paper, margin: 0, fontSize: "1.05rem" }}>{title}</h3>
        <Lock size={16} color={tone.gold} />
      </div>
      <p style={{ color: tone.muted, lineHeight: 1.6, margin: "0 0 0.85rem" }}>
        A focused Native Nations support pathway planned for this hub.
      </p>
      <span style={{ color: tone.gold, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>planned_route_not_implemented</span>
    </article>
  );
}

function support_card({ title, href, description }: { title: string; href: string; description: string }) {
  return (
    <Link href={href} style={{ border: `1px solid rgba(126,179,232,0.35)`, background: "rgba(126,179,232,0.07)", color: tone.paper, borderRadius: 18, padding: "1rem", textDecoration: "none", display: "block" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: "1.05rem" }}>{title}</h3>
        <ArrowRight size={16} color={tone.blue} />
      </div>
      <p style={{ color: tone.muted, lineHeight: 1.6, margin: 0 }}>{description}</p>
    </Link>
  );
}

export default function NativeNationsHub() {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return gate_panel({
      title: "Loading Native Nations Hub preview",
      message: "Checking admin access before showing this unpublished Native Nations Hub preview.",
    });
  }

  if (!isAuthenticated || user?.role !== "admin") {
    return gate_panel({
      title: "Native Nations Hub is in admin preview",
      message: "This page is not public yet. Admin access is required while the Native Nations Hub is prepared as a Lighthouse entry point.",
    });
  }

  return (
    <main style={{ minHeight: "100vh", background: tone.bg, color: tone.paper, fontFamily: "Inter, system-ui, sans-serif", padding: "clamp(1.25rem, 3vw, 3rem)" }}>
      <section style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ border: `1px solid rgba(212,160,23,0.35)`, background: "rgba(212,160,23,0.08)", color: tone.gold, borderRadius: 999, padding: "0.5rem 0.85rem", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "1.5rem" }}>
          <EyeOff size={14} /> admin_preview_only / not_public_yet
        </div>

        <header style={{ border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 28, padding: "clamp(1.25rem, 3vw, 2rem)", marginBottom: "1rem" }}>
          <p style={{ color: tone.blue, letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 12, marginBottom: 12 }}>Lighthouse entry point · admin preview</p>
          <h1 style={{ fontSize: "clamp(2.5rem, 7vw, 5.75rem)", lineHeight: 0.95, margin: 0 }}>Native Nations Hub</h1>
          <p style={{ color: tone.muted, lineHeight: 1.75, fontSize: "1.08rem", maxWidth: 920, marginTop: "1.25rem" }}>
            A tribal-focused Lighthouse entry point for records recovery, recognition pathways, language preservation, place names, safety resources, traditions, source-grounded review, and the full guided intake system.
          </p>
          <h2 style={{ fontSize: "clamp(1.6rem, 4vw, 3rem)", margin: "1.5rem 0 0.5rem" }}>What do you need help with today?</h2>
        </header>

        <section style={{ border: `1px solid rgba(52,211,153,0.32)`, background: "rgba(52,211,153,0.055)", borderRadius: 22, padding: "1rem", marginBottom: "1rem", display: "flex", gap: 12, alignItems: "start" }}>
          <Shield size={20} color={tone.green} />
          <p style={{ color: tone.muted, lineHeight: 1.65, margin: 0 }}>
            If there is immediate danger, use emergency or local crisis resources first. Lighthouse can help organize records, contacts, next steps, and support pathways.
          </p>
        </section>

        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ margin: "0 0 1rem", fontSize: "1.4rem" }}>Native Nations focus pathways</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.85rem" }}>
            {native_nations_pathways.map((title) => planned_card({ title }))}
          </div>
        </section>

        <section style={{ marginTop: "1.5rem" }}>
          <h2 style={{ margin: "0 0 1rem", fontSize: "1.4rem" }}>Connected Lighthouse support</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.85rem" }}>
            {support_card({ title: "Recognition Atlas", href: "/recognition-atlas", description: "Open the admin-preview recognition records workspace." })}
            {support_card({ title: "Right to Recognition / Recognition Gideon", href: "/recognition-gideon", description: "Open the recognition-pathway analysis and support workspace." })}
            {support_card({ title: "Broader Lighthouse Support", href: "/mudroom", description: "Return to the broader Lighthouse entry point for general support." })}
          </div>
        </section>

        <section style={{ marginTop: "1.5rem", border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 22, padding: "1.25rem" }}>
          <h2 style={{ margin: "0 0 1rem", fontSize: "1.4rem" }}>Suggested pathway examples</h2>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {suggested_pathways.map((example) => (
              <article key={example} style={{ border: `1px solid ${tone.card_border}`, background: "rgba(255,255,255,0.025)", borderRadius: 16, padding: "0.9rem", color: tone.muted, lineHeight: 1.6 }}>
                {example}
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
