import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { Eye, MapPin, Compass, ArrowLeft, Send } from "lucide-react";
import { STATES, ANOMALIES, PATTERNS, type StateData } from "./viewfinder-data";
import { AreaFlagButton } from "@/components/FlagButton";
import { VoiceReadout } from "@/components/VoiceReadout";

/* ═══════════════════════════════════════════════════════════════════════
   LUMINARI — ANOMALY VIEWFINDER
   A public lens on the patterns, traps, and structural irregularities
   embedded in the United States benefit system — revealed by comparing
   all 50 states simultaneously.
   ═══════════════════════════════════════════════════════════════════════ */

// ── Design tokens ──────────────────────────────────────────────────────
const v = {
  bg: "#0D0D0F",
  surface: "#13131A",
  border: "rgba(255,255,255,0.07)",
  borderLit: "rgba(255,200,60,0.3)",
  bone: "#F2EDE4",
  smoke: "#B8B0A0",
  muted: "#665E50",
  gold: "#E8A820",
  amber: "#C87820",
  red: "#C84040",
  blue: "#4A8FBF",
  green: "#5A8F5A",
  ink: "#080808",
};
const fontSerif = "'Fraunces', serif";
const fontMono = "'DM Mono', monospace";

type PanelId = "anomalies" | "patterns" | "compare" | "spotlight" | "about";
type SortKey = "state" | "ui" | "tanf" | "wage" | "port";

// ── Severity colors ────────────────────────────────────────────────────
const sevColor: Record<string, string> = {
  critical: v.red,
  warning: v.amber,
  info: v.blue,
  notable: v.green,
};

// ── Cell color helpers ─────────────────────────────────────────────────
function uiColor(val: number) { return val < 300 ? v.red : val > 700 ? v.green : v.amber; }
function uiWkColor(val: number) { return val < 20 ? v.red : val > 26 ? v.green : v.smoke; }
function wageColor(val: number) { return val <= 7.25 ? v.red : val >= 15 ? v.green : v.amber; }
function tanfColor(val: number) { return val < 250 ? v.red : val > 700 ? v.green : v.smoke; }
function wageSolColor(val: number) { return val >= 5 ? v.green : val <= 2 ? v.amber : v.smoke; }
function crSolColor(val: number) { return val <= 120 ? v.red : val <= 180 ? v.amber : val >= 365 ? v.green : v.smoke; }
function portColor(val: number) { return val < 52 ? v.red : val >= 57 ? v.green : v.smoke; }

// ── Flag color helper ──────────────────────────────────────────────────
function flagClass(f: string) {
  if (f.includes("No expansion") || f.includes("lowest") || f.includes("Floor")) return v.red;
  if (f.includes("Expanded") || f.includes("Strong") || f.includes("Mandatory")) return v.green;
  if (f.includes("tribe") || f.includes("Navajo") || f.includes("IHS")) return v.blue;
  return v.amber;
}

function flagBg(c: string) {
  if (c === v.red) return "rgba(200,64,64,0.1)";
  if (c === v.green) return "rgba(90,143,90,0.1)";
  if (c === v.blue) return "rgba(74,143,191,0.1)";
  return "rgba(200,120,32,0.1)";
}

function flagBorder(c: string) {
  if (c === v.red) return "rgba(200,64,64,0.15)";
  if (c === v.green) return "rgba(90,143,90,0.15)";
  if (c === v.blue) return "rgba(74,143,191,0.15)";
  return "rgba(200,120,32,0.15)";
}

// ── Detail Drawer ──────────────────────────────────────────────────────
function DetailDrawer({ state, onClose }: { state: StateData | null; onClose: () => void }) {
  const [, navigateTo] = useLocation();
  if (!state) return null;
  const s = state;
  const Row = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${v.border}`, gap: 16 }}>
      <span style={{ color: v.muted, fontSize: 11, fontFamily: fontMono }}>{label}</span>
      <span style={{ color: color || v.smoke, fontSize: 11, fontFamily: fontMono, textAlign: "right" }}>{value}</span>
    </div>
  );
  return (
    <div
      style={{
        position: "fixed", right: 0, top: 0, bottom: 0,
        width: "min(480px, 100vw)", background: v.surface,
        borderLeft: `1px solid ${v.border}`, zIndex: 200,
        transform: "translateX(0)", transition: "transform 0.3s cubic-bezier(.4,0,.2,1)",
        overflowY: "auto", padding: 32,
      }}
    >
      <button
        onClick={onClose}
        style={{
          background: "none", border: `1px solid ${v.border}`, color: v.muted,
          fontFamily: fontMono, fontSize: 10, padding: "6px 12px", cursor: "pointer",
          marginBottom: 24, letterSpacing: "0.1em",
        }}
      >
        \u2190 Close
      </button>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ fontFamily: fontSerif, fontSize: 26, fontWeight: 300, color: v.bone }}>{s.name}</div>
        <AreaFlagButton areaName={s.name} stateCode={s.fips} className="mt-1 opacity-60 hover:opacity-100" iconOnly />
      </div>
      <div style={{ fontSize: 10, color: v.muted, letterSpacing: "0.15em", marginBottom: 24, fontFamily: fontMono }}>
        FIPS {s.fips} · Pop. {s.pop} · Portability {s.port}%
      </div>

      {/* Benefits */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: v.amber, marginBottom: 10, fontFamily: fontMono }}>Benefits</div>
        <Row label="Medicaid" value={s.exp ? "Expanded" : "Not Expanded"} color={s.exp ? v.green : v.red} />
        <Row label="UI Maximum" value={`$${s.ui}/week`} color={uiColor(s.ui)} />
        <Row label="UI Duration" value={`${s.uiWk} weeks`} color={uiWkColor(s.uiWk)} />
        <Row label="Minimum Wage" value={`$${s.wage.toFixed(2)}/hr`} color={wageColor(s.wage)} />
        <Row label="TANF (family of 3)" value={`$${s.tanf}/month`} color={tanfColor(s.tanf)} />
      </div>

      {/* Legal Windows */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: v.amber, marginBottom: 10, fontFamily: fontMono }}>Legal Windows</div>
        <Row label="Wage SOL" value={`${s.wageSol} years`} color={wageSolColor(s.wageSol)} />
        <Row label="Civil Rights SOL" value={`${s.crSol} days`} color={crSolColor(s.crSol)} />
        <Row label="LGBTQ+ State Protection" value={s.lgbtq ? "Yes" : "No \u2014 EEOC only"} color={s.lgbtq ? v.green : v.red} />
      </div>

      {/* Tribal Nations */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: v.amber, marginBottom: 10, fontFamily: fontMono }}>Tribal Nations</div>
        <div style={{ padding: "8px 0", display: "flex", flexWrap: "wrap", gap: 6 }}>
          {s.tribes.length > 0
            ? s.tribes.map((t, i) => (
                <span key={i} style={{ fontSize: 9, padding: "3px 8px", border: `1px solid ${v.border}`, color: v.muted, letterSpacing: "0.08em", background: "rgba(255,255,255,0.02)", fontFamily: fontMono }}>{t}</span>
              ))
            : <span style={{ color: v.muted, fontSize: 11, fontFamily: fontMono }}>None documented in registry</span>
          }
        </div>
      </div>

      {/* LumenSend Actions */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: v.amber, marginBottom: 10, fontFamily: fontMono }}>Take Action via LumenSend</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button
            onClick={() => navigateTo(`/lumensend?type=inquiry&state=${encodeURIComponent(s.name)}`)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              fontFamily: fontMono, fontSize: 10, padding: "8px 12px",
              background: "rgba(210,153,34,0.08)", color: v.amber,
              border: `1px solid rgba(210,153,34,0.25)`,
              cursor: "pointer", transition: "all 0.15s", textAlign: "left",
            }}
            onMouseEnter={e => { (e.target as HTMLElement).style.background = "rgba(210,153,34,0.18)"; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.background = "rgba(210,153,34,0.08)"; }}
          >
            <Send size={11} />
            Inquire About Benefits in {s.name}
          </button>
          <button
            onClick={() => navigateTo(`/lumensend?type=appeal&state=${encodeURIComponent(s.name)}`)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              fontFamily: fontMono, fontSize: 10, padding: "8px 12px",
              background: "rgba(200,64,64,0.06)", color: v.red,
              border: `1px solid rgba(200,64,64,0.2)`,
              cursor: "pointer", transition: "all 0.15s", textAlign: "left",
            }}
            onMouseEnter={e => { (e.target as HTMLElement).style.background = "rgba(200,64,64,0.14)"; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.background = "rgba(200,64,64,0.06)"; }}
          >
            <Send size={11} />
            Appeal a Denial in {s.name}
          </button>
          <button
            onClick={() => navigateTo(`/lumensend?type=complaint&state=${encodeURIComponent(s.name)}`)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              fontFamily: fontMono, fontSize: 10, padding: "8px 12px",
              background: v.surface, color: v.smoke,
              border: `1px solid ${v.border}`,
              cursor: "pointer", transition: "all 0.15s", textAlign: "left",
            }}
            onMouseEnter={e => { (e.target as HTMLElement).style.background = v.border; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.background = v.surface; }}
          >
            <Send size={11} />
            File a Complaint in {s.name}
          </button>
        </div>
      </div>

      {/* Critical Intake Flags */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: v.amber, marginBottom: 10, fontFamily: fontMono }}>Critical Intake Flags</div>
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {s.alerts.map((a, i) => {
            const isCrit = /critical|lowest|floor|only|shortest|longest/i.test(a);
            return (
              <div key={i} style={{
                fontSize: 10, padding: "8px 10px",
                borderLeft: `2px solid ${isCrit ? v.red : v.amber}`,
                background: isCrit ? "rgba(200,64,64,0.06)" : "rgba(200,120,32,0.06)",
                color: v.smoke, lineHeight: 1.6, fontFamily: fontMono,
              }}>
                {a}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Backdrop overlay ───────────────────────────────────────────────────
function DrawerBackdrop({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  if (!visible) return null;
  return (
    <div
      onClick={onClick}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 199,
        cursor: "pointer",
      }}
    />
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════
export default function AnomalyViewfinder() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [panel, setPanel] = useState<PanelId>("anomalies");
  const [sortKey, setSortKey] = useState<SortKey>("state");
  const [filter, setFilter] = useState("");
  const [selectedState, setSelectedState] = useState<StateData | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Scroll to top on panel change
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [panel]);

  // ── Sorted / filtered data ──
  const sortedStates = useMemo(() => {
    const sorted = [...STATES];
    if (sortKey === "state") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortKey === "ui") sorted.sort((a, b) => a.ui - b.ui);
    else if (sortKey === "tanf") sorted.sort((a, b) => a.tanf - b.tanf);
    else if (sortKey === "wage") sorted.sort((a, b) => a.wage - b.wage);
    else if (sortKey === "port") sorted.sort((a, b) => a.port - b.port);
    return sorted;
  }, [sortKey]);

  const filteredStates = useMemo(() => {
    if (!filter) return [...STATES].sort((a, b) => a.name.localeCompare(b.name));
    const lower = filter.toLowerCase();
    return STATES.filter(
      (s) => s.name.toLowerCase().includes(lower) || s.flags.some((f) => f.toLowerCase().includes(lower))
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [filter]);

  const closeDrawer = useCallback(() => setSelectedState(null), []);

  const navItems: { id: PanelId; label: string }[] = [
    { id: "anomalies", label: "Anomalies" },
    { id: "patterns", label: "Hidden Patterns" },
    { id: "compare", label: "State Comparisons" },
    { id: "spotlight", label: "State Spotlight" },
    { id: "about", label: "About" },
  ];

  return (
    <div style={{ background: v.bg, color: v.bone, fontFamily: fontMono, fontSize: 12, lineHeight: 1.6, minHeight: "100vh", position: "relative", overflowX: "hidden" }}>
      {/* Scanline texture */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999,
        background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
      }} />
      {/* Ambient glow */}
      <div style={{
        position: "fixed", top: "-20%", left: "-10%", width: "50%", height: "50%",
        background: "radial-gradient(ellipse, rgba(200,120,32,0.06) 0%, transparent 70%)",
        pointerEvents: "none", zIndex: 0,
      }} />

      {/* ── MASTHEAD ── */}
      <div style={{
        position: "relative", zIndex: 10,
        padding: "36px 48px 28px",
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        borderBottom: `1px solid ${v.border}`, gap: 32,
        flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.3em", textTransform: "uppercase", color: v.amber, display: "flex", alignItems: "center", gap: 8, fontFamily: fontMono }}>
            <span style={{ fontSize: 8 }}>\u25c8</span> Luminari \u00b7 Forensic Document Intelligence
          </div>
          <div style={{ fontFamily: fontSerif, fontSize: "clamp(22px, 4vw, 38px)", fontWeight: 300, color: v.bone, letterSpacing: "-0.02em", lineHeight: 1 }}>
            Anomaly <span style={{ color: v.gold, fontStyle: "italic" }}>Viewfinder</span>
          </div>
          <div style={{ fontSize: 11, color: v.muted, maxWidth: 360, lineHeight: 1.6, marginTop: 4, fontFamily: fontMono }}>
            A public lens on the patterns, traps, and structural irregularities embedded in the United States benefit system — revealed by comparing all 50 states simultaneously.
          </div>
          {/* Voice Readout — accessibility */}
          <div style={{ marginTop: 12 }}>
            <VoiceReadout
              text={`Anomaly Viewfinder. A public lens on the patterns, traps, and structural irregularities embedded in the United States benefit system, revealed by comparing all 50 states simultaneously. This registry documents ${ANOMALIES.length} documented anomalies and ${PATTERNS.length} hidden patterns across all 50 states. Use the navigation tabs to explore anomalies, hidden patterns, state comparisons, and state spotlights.`}
              label="Read overview aloud"
              compact={false}
            />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", paddingTop: 4 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", padding: "5px 10px", border: "1px solid rgba(88,160,88,0.3)", color: v.green, whiteSpace: "nowrap", fontFamily: fontMono }}>
            <span style={{ animation: "vf-blink 2s infinite" }}>\u25cf </span>Registry Active
          </div>
          <div style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", padding: "5px 10px", border: `1px solid ${v.border}`, color: v.smoke, whiteSpace: "nowrap", fontFamily: fontMono }}>50 States Indexed</div>
          <div style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", padding: "5px 10px", border: `1px solid ${v.border}`, color: v.smoke, whiteSpace: "nowrap", fontFamily: fontMono }}>March 2026</div>
          {/* Breadcrumb: Lighthouse > Viewfinder */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <button
              onClick={() => navigate("/lighthouse")}
              style={{ background: "none", border: "none", color: v.muted, fontFamily: fontMono, fontSize: 9, padding: 0, cursor: "pointer", letterSpacing: "0.1em", transition: "color 0.15s" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = v.gold; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = v.muted; }}
            >
              Lighthouse
            </button>
            <span style={{ color: v.muted, fontFamily: fontMono, fontSize: 8, opacity: 0.5 }}>/</span>
            <span style={{ color: v.gold, fontFamily: fontMono, fontSize: 9, letterSpacing: "0.1em" }}>Viewfinder</span>
            <div style={{ width: 1, height: 12, background: v.border, margin: "0 4px" }} />
            <button
              onClick={() => navigate("/civic-map")}
              style={{ background: "none", border: "none", color: v.muted, fontFamily: fontMono, fontSize: 9, padding: 0, cursor: "pointer", letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 3, opacity: 0.7, transition: "opacity 0.15s" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
            >
              <MapPin size={9} /> Civic Map
            </button>
            {isAuthenticated && (
              <>
                <div style={{ width: 1, height: 12, background: v.border, margin: "0 4px" }} />
                <button
                  onClick={() => navigate("/")}
                  style={{ background: "none", border: "none", color: v.gold, fontFamily: fontMono, fontSize: 9, padding: 0, cursor: "pointer", letterSpacing: "0.1em", opacity: 0.8, transition: "opacity 0.15s" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.8"; }}
                >
                  Dashboard
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── NAV ── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(13,13,15,0.95)", backdropFilter: "blur(8px)",
        borderBottom: `1px solid ${v.border}`,
        padding: "0 48px", display: "flex", gap: 0, overflowX: "auto",
      }}>
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setPanel(item.id)}
            style={{
              background: "none", border: "none",
              borderBottom: panel === item.id ? `1px solid ${v.gold}` : "1px solid transparent",
              color: panel === item.id ? v.gold : v.muted,
              fontFamily: fontMono, fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase",
              padding: "14px 18px 13px", cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* ── CONTENT ── */}
      <div ref={contentRef} style={{ position: "relative", zIndex: 10 }}>

        {/* ═══ ANOMALIES PANEL ═══ */}
        {panel === "anomalies" && (
          <div style={{ padding: 48, maxWidth: 1400 }}>
            <div style={{ marginBottom: 36 }}>
              <SectionLabel text="System Anomalies" />
              <div style={{ fontFamily: fontSerif, fontSize: "clamp(20px, 3vw, 32px)", fontWeight: 300, color: v.bone, lineHeight: 1.15, letterSpacing: "-0.01em", marginBottom: 10 }}>
                Things the system does that<br /><em style={{ fontStyle: "italic", color: v.gold }}>most people never see</em>
              </div>
              <div style={{ color: v.muted, fontSize: 12, maxWidth: 600, lineHeight: 1.7, fontFamily: fontMono }}>
                Each of these anomalies was discovered by comparing all 50 state registries simultaneously. Individually, they appear to be local policy. Together, they reveal how the system is structured.
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 1, background: v.border, border: `1px solid ${v.border}`, marginBottom: 48 }}>
              {ANOMALIES.map((a, i) => (
                <div key={i} style={{ background: v.bg, padding: 24, position: "relative", cursor: "default" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", background: sevColor[a.severity] }} />
                  <div style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 8, color: sevColor[a.severity], fontFamily: fontMono }}>{a.type}</div>
                  <div style={{ fontFamily: fontSerif, fontSize: 16, fontWeight: 300, color: v.bone, marginBottom: 8, lineHeight: 1.3 }}>{a.title}</div>
                  <div style={{ fontSize: 11, color: v.smoke, lineHeight: 1.75, marginBottom: 12, fontFamily: fontMono }}>{a.body}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {a.tags.map((t, j) => (
                      <span key={j} style={{ fontSize: 9, padding: "3px 8px", border: `1px solid ${v.border}`, color: v.muted, letterSpacing: "0.08em", background: "rgba(255,255,255,0.02)", fontFamily: fontMono }}>
                        {t.bold && <strong style={{ color: v.smoke, fontWeight: 500 }}>{t.bold}</strong>}{t.bold ? " " : ""}{t.label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ HIDDEN PATTERNS PANEL ═══ */}
        {panel === "patterns" && (
          <div style={{ padding: 48, maxWidth: 1400 }}>
            <div style={{ marginBottom: 36 }}>
              <SectionLabel text="Hidden Patterns" />
              <div style={{ fontFamily: fontSerif, fontSize: "clamp(20px, 3vw, 32px)", fontWeight: 300, color: v.bone, lineHeight: 1.15, letterSpacing: "-0.01em", marginBottom: 10 }}>
                What the 50-state view<br /><em style={{ fontStyle: "italic", color: v.gold }}>reveals that no single state can show</em>
              </div>
              <div style={{ color: v.muted, fontSize: 12, maxWidth: 600, lineHeight: 1.7, fontFamily: fontMono }}>
                These patterns only become visible when you look at all 50 states at once. Each one has real consequences for how people navigate — or get trapped in — the systems meant to serve them.
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1, background: v.border, border: `1px solid ${v.border}` }}>
              {PATTERNS.map((p, i) => (
                <div key={i} style={{ background: v.bg, display: "grid", gridTemplateColumns: "60px 1fr auto", gap: 0, alignItems: "stretch" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, letterSpacing: "0.1em", color: v.muted, borderRight: `1px solid ${v.border}`, padding: "20px 12px", fontFamily: fontMono }}>{p.num}</div>
                  <div style={{ padding: "20px 24px" }}>
                    <div style={{ fontFamily: fontSerif, fontSize: 15, fontWeight: 300, color: v.bone, marginBottom: 6, lineHeight: 1.3 }}>{p.headline}</div>
                    <div style={{ fontSize: 11, color: v.muted, lineHeight: 1.7, maxWidth: 680, fontFamily: fontMono }} dangerouslySetInnerHTML={{ __html: p.body.replace(/<b>/g, `<strong style="color:${v.smoke};font-weight:500">`).replace(/<\/b>/g, "</strong>") }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", padding: "20px 20px", borderLeft: `1px solid ${v.border}` }}>
                    <div style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", writingMode: "vertical-rl", textOrientation: "mixed", color: v.muted, fontFamily: fontMono }}>{p.category}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ COMPARE PANEL ═══ */}
        {panel === "compare" && (
          <div style={{ padding: 48, maxWidth: 1400 }}>
            <div style={{ marginBottom: 36 }}>
              <SectionLabel text="State Comparisons" />
              <div style={{ fontFamily: fontSerif, fontSize: "clamp(20px, 3vw, 32px)", fontWeight: 300, color: v.bone, lineHeight: 1.15, letterSpacing: "-0.01em", marginBottom: 10 }}>
                Same federal system.<br /><em style={{ fontStyle: "italic", color: v.gold }}>Radically different outcomes.</em>
              </div>
              <div style={{ color: v.muted, fontSize: 12, maxWidth: 600, lineHeight: 1.7, fontFamily: fontMono }}>
                Every row in this table is a real person's situation — the only variable is which state they happen to live in.
              </div>
            </div>

            {/* Sort controls */}
            <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 10, letterSpacing: "0.1em", color: v.muted, fontFamily: fontMono }}>Sort by:</span>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                style={{
                  background: "rgba(255,255,255,0.04)", border: `1px solid ${v.border}`, color: v.bone,
                  fontFamily: fontMono, fontSize: 11, padding: "9px 14px", outline: "none", cursor: "pointer", minWidth: 180,
                }}
              >
                <option value="state" style={{ background: v.bg }}>State Name</option>
                <option value="ui" style={{ background: v.bg }}>UI Max (low \u2192 high)</option>
                <option value="tanf" style={{ background: v.bg }}>TANF (low \u2192 high)</option>
                <option value="wage" style={{ background: v.bg }}>Min Wage (low \u2192 high)</option>
                <option value="port" style={{ background: v.bg }}>Portability</option>
              </select>
            </div>

            {/* Table */}
            <div style={{ overflowX: "auto", marginBottom: 48 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: fontMono }}>
                <thead>
                  <tr>
                    {["State", "Medicaid", "UI Max / Week", "UI Duration", "Min Wage", "TANF / Mo", "Wage SOL", "Civil Rights SOL", "Portability"].map((h) => (
                      <th key={h} style={{ textAlign: "left", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: v.amber, padding: "10px 16px", borderBottom: `1px solid ${v.border}`, fontWeight: 400, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedStates.map((s) => (
                    <tr key={s.fips} style={{ cursor: "pointer" }} onClick={() => { setSelectedState(s); }}>
                      <td style={{ padding: "10px 16px", borderBottom: `1px solid rgba(255,255,255,0.04)`, color: v.bone, fontWeight: 500 }}>{s.name}</td>
                      <td style={{ padding: "10px 16px", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                        <span style={{
                          display: "inline-block", fontSize: 9, padding: "2px 7px", letterSpacing: "0.08em",
                          background: s.exp ? "rgba(90,143,90,0.15)" : "rgba(200,64,64,0.12)",
                          color: s.exp ? v.green : v.red,
                          border: `1px solid ${s.exp ? "rgba(90,143,90,0.2)" : "rgba(200,64,64,0.2)"}`,
                        }}>{s.exp ? "Expanded" : "Not Expanded"}</span>
                      </td>
                      <td style={{ padding: "10px 16px", borderBottom: `1px solid rgba(255,255,255,0.04)`, color: uiColor(s.ui) }}>${s.ui}</td>
                      <td style={{ padding: "10px 16px", borderBottom: `1px solid rgba(255,255,255,0.04)`, color: uiWkColor(s.uiWk) }}>{s.uiWk} wks</td>
                      <td style={{ padding: "10px 16px", borderBottom: `1px solid rgba(255,255,255,0.04)`, color: wageColor(s.wage) }}>${s.wage.toFixed(2)}</td>
                      <td style={{ padding: "10px 16px", borderBottom: `1px solid rgba(255,255,255,0.04)`, color: tanfColor(s.tanf) }}>{s.tanf > 0 ? `$${s.tanf}` : "\u2014"}</td>
                      <td style={{ padding: "10px 16px", borderBottom: `1px solid rgba(255,255,255,0.04)`, color: wageSolColor(s.wageSol) }}>{s.wageSol} yrs</td>
                      <td style={{ padding: "10px 16px", borderBottom: `1px solid rgba(255,255,255,0.04)`, color: crSolColor(s.crSol) }}>{s.crSol} days</td>
                      <td style={{ padding: "10px 16px", borderBottom: `1px solid rgba(255,255,255,0.04)`, color: portColor(s.port) }}>{s.port}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══ SPOTLIGHT PANEL ═══ */}
        {panel === "spotlight" && (
          <div style={{ padding: 48, maxWidth: 1400 }}>
            <div style={{ marginBottom: 36 }}>
              <SectionLabel text="State Spotlight" />
              <div style={{ fontFamily: fontSerif, fontSize: "clamp(20px, 3vw, 32px)", fontWeight: 300, color: v.bone, lineHeight: 1.15, letterSpacing: "-0.01em", marginBottom: 10 }}>
                Select a state to see its<br /><em style={{ fontStyle: "italic", color: v.gold }}>key flags and anomalies</em>
              </div>
              <div style={{ color: v.muted, fontSize: 12, maxWidth: 600, lineHeight: 1.7, fontFamily: fontMono }}>
                Click any state to open its detailed profile — critical deadlines, coverage gaps, unique provisions, and what it means for someone navigating the system there.
              </div>
            </div>

            {/* Search */}
            <div style={{ marginBottom: 28, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <input
                type="text"
                placeholder="Filter states..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                style={{
                  background: "rgba(255,255,255,0.04)", border: `1px solid ${v.border}`, color: v.bone,
                  fontFamily: fontMono, fontSize: 12, padding: "10px 16px", outline: "none", flex: 1, minWidth: 240,
                  transition: "border-color 0.15s",
                }}
              />
            </div>

            {/* Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 1, background: v.border, border: `1px solid ${v.border}` }}>
              {filteredStates.map((s) => {
                const isSelected = selectedState?.fips === s.fips;
                const pct = ((s.port - 49) / (58 - 49)) * 100;
                return (
                  <div
                    key={s.fips}
                    onClick={() => setSelectedState(s)}
                    style={{
                      background: isSelected ? "rgba(232,168,32,0.06)" : v.bg,
                      padding: "20px 22px", cursor: "pointer", transition: "background 0.15s", position: "relative",
                      outline: isSelected ? "1px solid rgba(232,168,32,0.2)" : "none",
                      outlineOffset: "-1px",
                    }}
                  >
                    <div style={{ fontSize: 11, letterSpacing: "0.08em", color: v.bone, marginBottom: 4, fontFamily: fontMono }}>{s.name}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                      {s.flags.slice(0, 3).map((f, i) => {
                        const c = flagClass(f);
                        return (
                          <span key={i} style={{ fontSize: 9, padding: "2px 6px", letterSpacing: "0.06em", background: flagBg(c), color: c, border: `1px solid ${flagBorder(c)}`, fontFamily: fontMono }}>{f}</span>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 10, color: v.muted, display: "flex", alignItems: "center", gap: 6, fontFamily: fontMono }}>
                      {s.port}%
                      <div style={{ height: 2, background: "rgba(255,255,255,0.06)", flex: 1, maxWidth: 80, position: "relative", overflow: "hidden" }}>
                        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: v.amber }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ ABOUT PANEL ═══ */}
        {panel === "about" && (
          <div style={{ padding: 48, maxWidth: 1400 }}>
            <div style={{ marginBottom: 36 }}>
              <SectionLabel text="About This Tool" />
              <div style={{ fontFamily: fontSerif, fontSize: "clamp(20px, 3vw, 32px)", fontWeight: 300, color: v.bone, lineHeight: 1.15, letterSpacing: "-0.01em", marginBottom: 10 }}>
                What the Anomaly Viewfinder<br /><em style={{ fontStyle: "italic", color: v.gold }}>is and how it works</em>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, maxWidth: 960 }}>
              <div>
                <h3 style={{ fontFamily: fontSerif, fontWeight: 300, fontSize: 18, color: v.bone, marginBottom: 10 }}>What this is</h3>
                <p style={{ fontSize: 12, color: v.muted, lineHeight: 1.8, marginBottom: 10, fontFamily: fontMono }}>
                  The Luminari Anomaly Viewfinder is a public-facing layer of the Luminari forensic document intelligence platform. It surfaces patterns, traps, and structural irregularities that are embedded in the US benefit and legal system — invisible when you look at one state, unmistakable when you look at all 50 simultaneously.
                </p>
                <p style={{ fontSize: 12, color: v.muted, lineHeight: 1.8, marginBottom: 10, fontFamily: fontMono }}>
                  The underlying registry contains detailed profiles of all 50 states: programs, contacts, deadlines, SOLs, tribal nations, community populations, legal aid resources, and critical intake flags — built and validated against primary sources.
                </p>
              </div>

              <div>
                <h3 style={{ fontFamily: fontSerif, fontWeight: 300, fontSize: 18, color: v.bone, marginBottom: 10 }}>Who it's for</h3>
                <p style={{ fontSize: 12, color: v.muted, lineHeight: 1.8, marginBottom: 10, fontFamily: fontMono }}>
                  This tool is designed for <strong style={{ color: v.smoke, fontWeight: 500 }}>advocates, organizers, tribal nations, legal aid staff, policy researchers, and journalists</strong> who need to understand not just how one state works, but how states compare — and what that comparison reveals about how the system was designed and who it was designed for.
                </p>
                <p style={{ fontSize: 12, color: v.muted, lineHeight: 1.8, marginBottom: 10, fontFamily: fontMono }}>
                  It is also a tool for <strong style={{ color: v.smoke, fontWeight: 500 }}>communities navigating the system</strong> — particularly those in legal aid deserts, non-expansion states, rural isolation, or tribal jurisdictions where the standard system was never built with them in mind.
                </p>
              </div>

              <div>
                <h3 style={{ fontFamily: fontSerif, fontWeight: 300, fontSize: 18, color: v.bone, marginBottom: 10 }}>Methodology</h3>
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                  {[
                    "All 50 state registries built from primary sources: state agency websites, statute texts, FIPS data, federal program documentation.",
                    "Portability hypothesis validated across all 50 states: 49\u201358% of navigation knowledge transfers across state lines. Mississippi establishes the floor at 49%.",
                    "Anomalies identified through cross-state comparison — only visible when all states are in the same data model simultaneously.",
                    "Tribal tier structure derived from service delivery patterns across ~350 federally recognized tribes represented in the registry.",
                    "All data reflects conditions as of March 2026. Policy changes frequently — verify critical deadlines at point of use.",
                  ].map((text, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, fontSize: 11, color: v.muted, padding: "8px 0", borderBottom: `1px solid ${v.border}`, fontFamily: fontMono }}>
                      <span style={{ color: v.amber, minWidth: 20 }}>0{i + 1}</span>
                      {text}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 style={{ fontFamily: fontSerif, fontWeight: 300, fontSize: 18, color: v.bone, marginBottom: 10 }}>The portability finding</h3>
                <p style={{ fontSize: 12, color: v.muted, lineHeight: 1.8, marginBottom: 10, fontFamily: fontMono }}>
                  The most significant structural discovery in building this registry: <strong style={{ color: v.smoke, fontWeight: 500 }}>roughly half of the knowledge needed to navigate any US state's benefit system is identical across all 50 states</strong>. The federal floor — SNAP, Medicaid, UI, FLSA, EEOC, HUD — is universal. The other half is state-specific: deadlines, thresholds, SOLs, local agencies, community populations, tribal structures.
                </p>
                <p style={{ fontSize: 12, color: v.muted, lineHeight: 1.8, marginBottom: 10, fontFamily: fontMono }}>
                  This means navigation systems don't need to be rebuilt from scratch in every state. They need a <strong style={{ color: v.smoke, fontWeight: 500 }}>universal base layer</strong> and a <strong style={{ color: v.smoke, fontWeight: 500 }}>state-specific adaptation layer</strong>. That's the architecture this platform is built on.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── DETAIL DRAWER ── */}
      <DrawerBackdrop visible={!!selectedState} onClick={closeDrawer} />
      {selectedState && <DetailDrawer state={selectedState} onClose={closeDrawer} />}

      {/* ── GLOBAL STYLES (blink animation) ── */}
      <style>{`
        @keyframes vf-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

// ── Section label component ────────────────────────────────────────────
function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{
      fontSize: 9, letterSpacing: "0.3em", textTransform: "uppercase", color: v.amber,
      marginBottom: 10, display: "flex", alignItems: "center", gap: 10, fontFamily: fontMono,
    }}>
      {text}
      <span style={{ flex: 1, height: 1, background: "rgba(200,120,32,0.15)", maxWidth: 80 }} />
    </div>
  );
}
