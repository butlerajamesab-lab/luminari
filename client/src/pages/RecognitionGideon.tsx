import { useAuth } from "@/core/hooks/useAuth";
import {
  recognition_gideon_axes,
  route_to_recognition_profiles,
} from "@/data/route_to_recognition_profiles";
import type { recognition_condition_status } from "@/types/route_to_recognition";
import { Link } from "wouter";
import {
  ArrowRight,
  EyeOff,
  GitBranch,
  Lock,
  Scale,
  Shield,
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

const status_tone: Record<recognition_condition_status, string> = {
  met: tone.green,
  substantially_met: tone.blue,
  disputed: tone.gold,
  blocked_by_government_action: tone.red,
  requires_tribal_review: tone.gold,
  unknown: tone.muted,
};

function gate_panel({ title, message }: { title: string; message: string }) {
  return (
    <main style={{ minHeight: "100vh", background: tone.bg, color: tone.paper, display: "grid", placeItems: "center", padding: "2rem", fontFamily: "Inter, system-ui, sans-serif" }}>
      <section style={{ width: "min(760px, 100%)", border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 24, padding: "2rem" }}>
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

export default function RecognitionGideon() {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return gate_panel({
      title: "Loading Recognition Gideon preview",
      message: "Checking admin access before showing the unpublished Route to Recognition comparison surface.",
    });
  }

  if (!isAuthenticated || user?.role !== "admin") {
    return gate_panel({
      title: "Recognition Gideon requires admin access",
      message: "This RTR comparison page is a private preview. It is not public-facing and does not indicate tribal approval.",
    });
  }

  const populated_profiles = route_to_recognition_profiles.length;
  const condition_keys = route_to_recognition_profiles[0]?.recognition_conditions.map((condition) => condition.condition_key) ?? [];

  return (
    <main style={{ minHeight: "100vh", background: tone.bg, color: tone.paper, fontFamily: "Inter, system-ui, sans-serif", padding: "clamp(1.25rem, 3vw, 3rem)" }}>
      <section style={{ maxWidth: 1240, margin: "0 auto" }}>
        <div style={{ border: `1px solid rgba(212,160,23,0.35)`, background: "rgba(212,160,23,0.08)", color: tone.gold, borderRadius: 999, padding: "0.5rem 0.85rem", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "1.5rem" }}>
          <EyeOff size={14} /> Admin Preview — RTR not public
        </div>

        <header style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 0.8fr)", gap: "2rem", alignItems: "end" }}>
          <div>
            <p style={{ color: tone.blue, letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 12, marginBottom: 12 }}>
              Recognition Gideon · Route to Recognition
            </p>
            <h1 style={{ fontSize: "clamp(2.8rem, 8vw, 6.5rem)", lineHeight: 0.9, margin: 0 }}>
              RTR Matrix
            </h1>
            <p style={{ color: tone.muted, lineHeight: 1.75, fontSize: "1.08rem", maxWidth: 840, marginTop: "1.5rem" }}>
              Civil Gideon compares states against right-to-counsel needs. Recognition Gideon compares tribal communities against recognition conditions, barriers, contradictions, and routes to recognition. This preview starts with Duwamish as the anchor profile and leaves space for each tribe to author and approve its own record.
            </p>
          </div>

          <aside style={{ border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 22, padding: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <Shield size={20} color={tone.green} />
              <strong>Protection state</strong>
            </div>
            <p style={{ color: tone.muted, lineHeight: 1.6, margin: 0 }}>
              RTR uses Atlas truth layers as source material. It does not publish or approve any tribal record. It compares conditions only after tribe-specific layers exist.
            </p>
          </aside>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginTop: "2rem" }}>
          {[
            ["comparison_unit", "tribal_community"],
            ["civil_gideon_parallel", "state_matrix"],
            ["populated_profiles", String(populated_profiles)],
            ["publication_status", "admin_preview_only"],
          ].map(([label, value]) => (
            <div key={label} style={{ border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 18, padding: "1rem" }}>
              <div style={{ color: tone.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{label}</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", color: tone.paper }}>{value}</div>
            </div>
          ))}
        </section>

        <section style={{ marginTop: "2rem" }}>
          <h2 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Scale size={22} color={tone.gold} /> Recognition conditions
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: "1rem" }}>
            {recognition_gideon_axes.map((axis) => (
              <article key={axis.axis_key} style={{ border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 20, padding: "1rem" }}>
                <div style={{ color: tone.muted, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>{axis.axis_key}</div>
                <h3 style={{ margin: "0.55rem 0 0.25rem" }}>{axis.axis_label}</h3>
                <p style={{ color: tone.blue, lineHeight: 1.55 }}>{axis.civil_gideon_parallel}</p>
                <p style={{ color: tone.muted, lineHeight: 1.65 }}>{axis.recognition_gideon_question}</p>
                <p style={{ color: tone.gold, lineHeight: 1.6 }}>{axis.why_it_matters}</p>
              </article>
            ))}
          </div>
        </section>

        <section style={{ marginTop: "2rem" }}>
          <h2 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <GitBranch size={22} color={tone.gold} /> Route to Recognition comparison
          </h2>
          <div style={{ overflowX: "auto", border: `1px solid ${tone.card_border}`, borderRadius: 22, background: tone.card_bg }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "1rem", color: tone.muted, borderBottom: `1px solid ${tone.card_border}` }}>tribe</th>
                  {condition_keys.map((condition_key) => (
                    <th key={condition_key} style={{ textAlign: "left", padding: "1rem", color: tone.muted, borderBottom: `1px solid ${tone.card_border}` }}>{condition_key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {route_to_recognition_profiles.map((profile) => (
                  <tr key={profile.tribe_id}>
                    <td style={{ padding: "1rem", borderBottom: `1px solid ${tone.card_border}`, verticalAlign: "top" }}>
                      <strong>{profile.tribe_name}</strong>
                      {profile.tribe_self_name && <div style={{ color: tone.blue }}>{profile.tribe_self_name}</div>}
                      <div style={{ color: tone.muted, fontSize: 12 }}>{profile.recognition_status}</div>
                    </td>
                    {profile.recognition_conditions.map((condition) => (
                      <td key={condition.condition_key} style={{ padding: "1rem", borderBottom: `1px solid ${tone.card_border}`, verticalAlign: "top" }}>
                        <div style={{ color: status_tone[condition.status], fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>{condition.status}</div>
                        <p style={{ color: tone.muted, lineHeight: 1.5, marginBottom: 0 }}>{condition.why_gap_should_not_count_against_tribe}</p>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ marginTop: "2rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem" }}>
          {route_to_recognition_profiles.map((profile) => (
            <article key={profile.tribe_id} style={{ border: `1px solid ${tone.card_border}`, background: tone.card_bg, borderRadius: 22, padding: "1.25rem" }}>
              <div style={{ color: tone.gold, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>{profile.tribe_id}</div>
              <h3 style={{ margin: "0.55rem 0" }}>{profile.tribe_name}</h3>
              <p style={{ color: tone.blue }}>{profile.tribe_self_name} · {profile.name_meaning}</p>
              <p style={{ color: tone.muted, lineHeight: 1.6 }}>tribal_review_status: {profile.tribal_review_status}</p>
              <p style={{ color: tone.muted, lineHeight: 1.6 }}>publication_status: {profile.publication_status}</p>
              <h4>Strongest approval arguments</h4>
              <ul style={{ color: tone.muted, lineHeight: 1.65, paddingLeft: "1.2rem" }}>
                {profile.strongest_approval_arguments.map((argument) => (
                  <li key={argument}>{argument}</li>
                ))}
              </ul>
              <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap", marginTop: "1rem" }}>
                <Link href={`/recognition-atlas/${profile.tribe_id}/identity`} style={{ color: tone.blue, textDecoration: "none", display: "inline-flex", gap: 6 }}>
                  Atlas record <ArrowRight size={14} />
                </Link>
                <Link href="/recognition-atlas" style={{ color: tone.blue, textDecoration: "none", display: "inline-flex", gap: 6 }}>
                  Atlas hub <ArrowRight size={14} />
                </Link>
              </div>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
