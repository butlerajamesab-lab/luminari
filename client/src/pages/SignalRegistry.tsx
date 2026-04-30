import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  Radio, Loader2, Search, X, ChevronDown, ChevronRight,
  Zap, Target, BookOpen, AlertTriangle, MapPin, ArrowRight,
} from "lucide-react";
import { CommitToCase, FlagArea } from "@/components/CommitToCase";
import { NextStepBar } from "@/components/NextStepBar";
import { LayerNavBar } from "@/components/LayerNavBar";

/* ═══════════════════════════════════════════════════════════════════════
   SIGNAL REGISTRY
   
   Two views:
   1. Registry Signals — 59 per-jurisdiction signal instances
   2. Signal Types — 5 master signal type definitions
   ═══════════════════════════════════════════════════════════════════════ */

const c = {
  bg: "#0c0f14",
  paper: "#f0ece4",
  muted: "rgba(240,236,228,0.55)",
  cardBg: "rgba(255,255,255,0.03)",
  cardBorder: "rgba(255,255,255,0.08)",
  purple: "#a855f7",
  purpleBg: "rgba(168,85,247,0.08)",
  purpleBorder: "rgba(168,85,247,0.25)",
  gold: "#D4A017",
  goldBg: "rgba(212,160,23,0.08)",
  goldBorder: "rgba(212,160,23,0.3)",
  teal: "#0e7490",
  tealBg: "rgba(14,116,144,0.08)",
  tealBorder: "rgba(14,116,144,0.3)",
  red: "#ef4444",
  redBg: "rgba(239,68,68,0.06)",
  amber: "#f59e0b",
  amberBg: "rgba(245,158,11,0.08)",
  green: "#34d399",
  greenBg: "rgba(52,211,153,0.06)",
  blue: "#3b82f6",
  blueBg: "rgba(59,130,246,0.08)",
};

const fontSerif = "'Playfair Display', Georgia, serif";
const fontSans = "'Inter', system-ui, sans-serif";
const fontMono = "'JetBrains Mono', 'Fira Code', monospace";

const SEVERITY_COLORS: Record<string, { color: string; bg: string; border: string; label: string }> = {
  critical: { color: c.red, bg: c.redBg, border: "rgba(239,68,68,0.3)", label: "Critical" },
  high: { color: c.amber, bg: c.amberBg, border: "rgba(245,158,11,0.3)", label: "High" },
  medium: { color: c.gold, bg: c.goldBg, border: c.goldBorder, label: "Medium" },
  low: { color: c.teal, bg: c.tealBg, border: c.tealBorder, label: "Low" },
  informational: { color: c.muted, bg: c.cardBg, border: c.cardBorder, label: "Info" },
};

export default function SignalRegistry() {
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | number | null>(null);
  const [activeTab, setActiveTab] = useState<"registry" | "types">("registry");

  // Signal type catalog (5 types from signal_registry)
  const { data: signalTypes, isLoading: loadingTypes } = trpc.enforcementIntel.listSignals.useQuery();
  // Per-jurisdiction signal instances (59 rows from registry_signals)
  const { data: registrySignals, isLoading: loadingRegistry } = trpc.enforcementIntel.listRegistrySignals.useQuery({ limit: 200 });

  const isLoading = loadingTypes || loadingRegistry;

  // Unique categories
  const categories = useMemo(() => {
    if (!registrySignals) return [];
    return [...new Set(registrySignals.map(s => s.category).filter(Boolean))].sort() as string[];
  }, [registrySignals]);

  const filteredRegistry = useMemo(() => {
    if (!registrySignals) return [];
    let result = registrySignals;
    if (filterCategory) result = result.filter(s => s.category === filterCategory);
    if (filterSeverity) result = result.filter(s => s.severity === filterSeverity);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(s =>
        (s.signalType ?? "").toLowerCase().includes(q) ||
        (s.category ?? "").toLowerCase().includes(q) ||
        (s.jurisdictionId ?? "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [registrySignals, filterCategory, filterSeverity, search]);

  const filteredTypes = useMemo(() => {
    if (!signalTypes) return [];
    if (!search) return signalTypes;
    const q = search.toLowerCase();
    return signalTypes.filter(s =>
      s.signalType.toLowerCase().includes(q) ||
      s.domain.toLowerCase().includes(q)
    );
  }, [signalTypes, search]);

  if (isLoading) {
    return (
      <div style={{ background: c.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <Loader2 size={32} style={{ color: c.amber, animation: "spin 1s linear infinite" }} />
          <p style={{ color: c.muted, fontFamily: fontSans, marginTop: 12 }}>Loading signal registry...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: c.bg, minHeight: "100vh", padding: "24px 32px", fontFamily: fontSans }}>
      <LayerNavBar label="Signal Registry" route="/signal-registry" />
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Radio size={22} style={{ color: c.amber }} />
          <h1 style={{ fontFamily: fontSerif, color: c.paper, fontSize: 28, margin: 0 }}>
            Signal Registry
          </h1>
        </div>
        <p style={{ color: c.muted, fontSize: 14, margin: 0, maxWidth: 700 }}>
          Live signal catalog spanning {registrySignals?.length ?? 0} jurisdiction-specific instances across{" "}
          {categories.length} categories, plus {signalTypes?.length ?? 0} master signal type definitions.
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { value: registrySignals?.length ?? 0, label: "Registry Signals", color: c.amber },
          { value: signalTypes?.length ?? 0, label: "Signal Types", color: c.purple },
          { value: categories.length, label: "Categories", color: c.teal },
          { value: [...new Set(registrySignals?.map(s => s.jurisdictionId) ?? [])].length, label: "Jurisdictions", color: c.blue },
        ].map(stat => (
          <div key={stat.label} style={{
            background: c.cardBg, border: `1px solid ${c.cardBorder}`,
            borderRadius: 8, padding: "8px 16px", display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ color: stat.color, fontFamily: fontMono, fontSize: 20, fontWeight: 700 }}>
              {stat.value}
            </span>
            <span style={{ color: c.muted, fontSize: 12 }}>{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${c.cardBorder}`, paddingBottom: 0 }}>
        {[
          { key: "registry", label: `Registry Signals (${registrySignals?.length ?? 0})` },
          { key: "types", label: `Signal Types (${signalTypes?.length ?? 0})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "8px 16px", fontSize: 13, fontFamily: fontSans,
              color: activeTab === tab.key ? c.amber : c.muted,
              borderBottom: activeTab === tab.key ? `2px solid ${c.amber}` : "2px solid transparent",
              transition: "all 0.2s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: c.cardBg, border: `1px solid ${c.cardBorder}`,
          borderRadius: 8, padding: "6px 12px", flex: "1 1 200px", maxWidth: 300,
        }}>
          <Search size={14} style={{ color: c.muted }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={activeTab === "registry" ? "Search by type, category, jurisdiction..." : "Search signals..."}
            style={{
              background: "transparent", border: "none", outline: "none",
              color: c.paper, fontFamily: fontSans, fontSize: 13, width: "100%",
            }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <X size={14} style={{ color: c.muted }} />
            </button>
          )}
        </div>

        {activeTab === "registry" && (
          <>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(filterCategory === cat ? null : cat)}
                  style={{
                    background: filterCategory === cat ? c.tealBg : "transparent",
                    border: `1px solid ${filterCategory === cat ? c.tealBorder : c.cardBorder}`,
                    borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                    color: filterCategory === cat ? c.teal : c.muted, fontSize: 11,
                    fontFamily: fontSans, transition: "all 0.2s",
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {["critical", "high", "medium", "low"].map(sev => {
                const sc = SEVERITY_COLORS[sev];
                return (
                  <button
                    key={sev}
                    onClick={() => setFilterSeverity(filterSeverity === sev ? null : sev)}
                    style={{
                      background: filterSeverity === sev ? sc.bg : "transparent",
                      border: `1px solid ${filterSeverity === sev ? sc.border : c.cardBorder}`,
                      borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                      color: filterSeverity === sev ? sc.color : c.muted, fontSize: 11,
                      fontFamily: fontSans, transition: "all 0.2s", textTransform: "capitalize",
                    }}
                  >
                    {sc.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Registry Signals Tab */}
      {activeTab === "registry" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filteredRegistry.map(s => {
            const isExpanded = expandedId === s.id;
            const severity = SEVERITY_COLORS[s.severity ?? "medium"] || SEVERITY_COLORS.medium;
            return (
              <div
                key={s.id}
                style={{
                  background: c.cardBg, border: `1px solid ${isExpanded ? c.amber + "50" : c.cardBorder}`,
                  borderRadius: 10, overflow: "hidden", transition: "border-color 0.2s",
                }}
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : s.id)}
                  style={{
                    width: "100%", background: "none", border: "none", cursor: "pointer",
                    padding: "12px 16px", display: "flex", alignItems: "center", gap: 12,
                    textAlign: "left",
                  }}
                >
                  {isExpanded ? (
                    <ChevronDown size={14} style={{ color: c.amber, flexShrink: 0 }} />
                  ) : (
                    <ChevronRight size={14} style={{ color: c.muted, flexShrink: 0 }} />
                  )}
                  <Zap size={14} style={{ color: c.amber, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ color: c.paper, fontSize: 13, fontWeight: 600 }}>
                        {s.signalType ?? "Unknown Signal"}
                      </span>
                      {s.category && (
                        <span style={{
                          background: c.tealBg, border: `1px solid ${c.tealBorder}`,
                          borderRadius: 4, padding: "1px 6px", fontSize: 10, color: c.teal,
                        }}>
                          {s.category}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                      <MapPin size={10} style={{ color: c.muted }} />
                      <span style={{ color: c.muted, fontSize: 11 }}>{s.jurisdictionId}</span>
                    </div>
                  </div>
                  {s.severity && (
                    <span style={{
                      background: severity.bg, color: severity.color,
                      border: `1px solid ${severity.border}`,
                      padding: "2px 8px", borderRadius: 10, fontSize: 10, fontFamily: fontMono,
                      textTransform: "capitalize",
                    }}>
                      {severity.label}
                    </span>
                  )}
                </button>

                {isExpanded && (
                  <div style={{ padding: "0 16px 16px 44px" }}>
                    {s.sourceReference && (
                      <div style={{ marginBottom: 10 }}>
                        <span style={{ color: c.gold, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase" }}>
                          Source Reference
                        </span>
                        <p style={{ color: c.paper, fontSize: 12, margin: "4px 0 0 0", lineHeight: 1.5 }}>
                          {s.sourceReference}
                        </p>
                      </div>
                    )}
                    {s.fingerprint && (
                      <div style={{ marginBottom: 10 }}>
                        <span style={{ color: c.muted, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase" }}>
                          Fingerprint
                        </span>
                        <code style={{ display: "block", color: c.teal, fontSize: 11, fontFamily: fontMono, marginTop: 4 }}>
                          {s.fingerprint}
                        </code>
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${c.cardBorder}` }}>
                      <a
                        href={`/workshop?signal=${encodeURIComponent(s.signalType ?? "")}&jurisdiction=${encodeURIComponent(s.jurisdictionId)}`}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          background: c.amberBg, border: `1px solid ${c.goldBorder}`,
                          borderRadius: 6, padding: "6px 12px", fontSize: 12, color: c.amber,
                          textDecoration: "none", transition: "all 0.2s",
                        }}
                      >
                        <ArrowRight size={12} />
                        Use in Workshop
                      </a>
                      <a
                        href="/litigation-barriers"
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          background: "transparent", border: `1px solid ${c.cardBorder}`,
                          borderRadius: 6, padding: "6px 12px", fontSize: 12, color: c.muted,
                          textDecoration: "none",
                        }}
                      >
                        Check Barriers
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filteredRegistry.length === 0 && (
            <div style={{ textAlign: "center", padding: 48 }}>
              <Radio size={40} style={{ color: c.muted, marginBottom: 12 }} />
              <p style={{ color: c.muted, fontSize: 14 }}>No registry signals match your filters.</p>
            </div>
          )}
        </div>
      )}

      {/* Signal Types Tab */}
      {activeTab === "types" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredTypes.map(s => {
            const isExpanded = expandedId === s.id;
            const severity = SEVERITY_COLORS[(s as any).severity ?? "medium"] || SEVERITY_COLORS.medium;
            return (
              <div
                key={s.id}
                style={{
                  background: c.cardBg, border: `1px solid ${isExpanded ? c.amber + "50" : c.cardBorder}`,
                  borderRadius: 10, overflow: "hidden", transition: "border-color 0.2s",
                }}
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : s.id)}
                  style={{
                    width: "100%", background: "none", border: "none", cursor: "pointer",
                    padding: "14px 16px", display: "flex", alignItems: "center", gap: 12,
                    textAlign: "left",
                  }}
                >
                  {isExpanded ? (
                    <ChevronDown size={16} style={{ color: c.amber, flexShrink: 0 }} />
                  ) : (
                    <ChevronRight size={16} style={{ color: c.muted, flexShrink: 0 }} />
                  )}
                  <Zap size={16} style={{ color: c.amber, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ color: c.paper, fontSize: 14, margin: 0, fontWeight: 600 }}>
                      {s.signalType}
                    </h3>
                    <span style={{ color: c.muted, fontSize: 11 }}>{s.domain}</span>
                  </div>
                  <span style={{
                    background: c.amberBg, color: c.amber,
                    padding: "2px 8px", borderRadius: 10, fontSize: 10, fontFamily: fontMono,
                  }}>
                    {(s.triggerPatterns as string[]).length} triggers
                  </span>
                </button>

                {isExpanded && (
                  <div style={{ padding: "0 16px 16px 44px" }}>
                    {/* Trigger patterns */}
                    <div style={{ marginBottom: 12 }}>
                      <span style={{ color: c.amber, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase" }}>
                        Trigger Patterns
                      </span>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                        {(s.triggerPatterns as string[]).map((p, i) => (
                          <div key={i} style={{
                            display: "flex", alignItems: "flex-start", gap: 8,
                            background: c.amberBg, borderRadius: 6, padding: "6px 10px",
                          }}>
                            <Target size={12} style={{ color: c.amber, marginTop: 2, flexShrink: 0 }} />
                            <span style={{ color: c.paper, fontSize: 12, lineHeight: 1.5 }}>{p}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Linked doctrines */}
                    {s.linkedDoctrine && (s.linkedDoctrine as string[]).length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <span style={{ color: c.purple, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase" }}>
                          Linked Doctrines
                        </span>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                          {(s.linkedDoctrine as string[]).map((d, i) => (
                            <a
                              key={i}
                              href="/doctrine-graph"
                              style={{
                                background: c.purpleBg, border: `1px solid ${c.purpleBorder}`,
                                borderRadius: 4, padding: "3px 8px", fontSize: 11, color: c.purple,
                                textDecoration: "none",
                              }}
                            >
                              {d}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Explanation */}
                    {s.explanation && (
                      <div style={{
                        background: c.tealBg, border: `1px solid ${c.tealBorder}`,
                        borderRadius: 8, padding: 12,
                      }}>
                        <span style={{ color: c.teal, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase" }}>
                          Explanation
                        </span>
                        <p style={{ color: c.paper, fontSize: 12, margin: "6px 0 0 0", lineHeight: 1.5 }}>
                          {s.explanation}
                        </p>
                      </div>
                    )}

                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, paddingTop: 12, borderTop: `1px solid ${c.cardBorder}` }}>
                      <CommitToCase type="signal" itemId={s.id} signalType={(s.signalType as any) || "structural"} label="Commit Signal to Case" />
                      <FlagArea location="signal_registry" targetId={s.id} targetType="signal" message={`Review signal: ${s.name}`} />
                      <a
                        href={`/workshop?signalType=${encodeURIComponent(s.signalType)}`}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          background: c.amberBg, border: `1px solid ${c.goldBorder}`,
                          borderRadius: 6, padding: "6px 12px", fontSize: 12, color: c.amber,
                          textDecoration: "none",
                        }}
                      >
                        <ArrowRight size={12} />
                        Open in Workshop
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filteredTypes.length === 0 && (
            <div style={{ textAlign: "center", padding: 48 }}>
              <Radio size={40} style={{ color: c.muted, marginBottom: 12 }} />
              <p style={{ color: c.muted, fontSize: 14 }}>No signal types match your search.</p>
            </div>
          )}
        </div>
      )}

      <NextStepBar
        context="Signals reviewed. Promote key signals to your case or explore the patterns they reveal."
        steps={[
          { label: "Explore Patterns", href: "/patterns", icon: "search", variant: "primary", description: "See recurring patterns across signals" },
          { label: "Litigation Barriers", href: "/litigation-barriers", icon: "shield", description: "Check what structural obstacles apply" },
          { label: "Control Room", href: "/control-room", icon: "map", description: "Review your committed case state" },
        ]}
      />
    </div>
  );
}
