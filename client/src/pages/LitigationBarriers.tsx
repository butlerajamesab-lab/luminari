import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  Shield, Loader2, Search, X, AlertTriangle, ChevronDown, ChevronRight,
  Scale, Clock, FileText, Lock, Ban, Gavel,
} from "lucide-react";
import { CommitToCase, FlagArea } from "@/components/CommitToCase";
import { NextStepBar } from "@/components/NextStepBar";
import { LayerNavBar } from "@/components/LayerNavBar";

/* ═══════════════════════════════════════════════════════════════════════
   LITIGATION BARRIER EXPLORER
   
   Surfaces the litigation_barriers table — the structural obstacles that
   prevent people from accessing justice. Organized by barrier type with
   severity indicators and practical guidance.
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
  redBorder: "rgba(239,68,68,0.25)",
  amber: "#f59e0b",
  amberBg: "rgba(245,158,11,0.08)",
  green: "#34d399",
  blue: "#3b82f6",
};

const fontSerif = "'Playfair Display', Georgia, serif";
const fontSans = "'Inter', system-ui, sans-serif";
const fontMono = "'JetBrains Mono', 'Fira Code', monospace";

const BARRIER_TYPE_META: Record<string, { color: string; icon: typeof Shield; label: string; description: string }> = {
  jurisdictional: {
    color: c.blue, icon: Scale, label: "Jurisdictional",
    description: "Barriers related to which court or agency has authority to hear a case",
  },
  immunity: {
    color: c.red, icon: Shield, label: "Immunity",
    description: "Legal protections that shield certain parties from liability",
  },
  procedural: {
    color: c.amber, icon: FileText, label: "Procedural",
    description: "Technical requirements that must be met before a case can proceed",
  },
  timing: {
    color: c.teal, icon: Clock, label: "Timing",
    description: "Deadlines and time-based restrictions on filing claims",
  },
  evidentiary: {
    color: c.purple, icon: Gavel, label: "Evidentiary",
    description: "Standards of proof and evidence requirements that create hurdles",
  },
  contractual: {
    color: c.gold, icon: Lock, label: "Contractual",
    description: "Private agreements that limit access to courts or remedies",
  },
  weak_joint: {
    color: c.red, icon: AlertTriangle, label: "Weak Joints",
    description: "Gaps between what the law requires and what actually happens in practice — 32 documented divergences across jurisdictions",
  },
};

export default function LitigationBarriers() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | number | null>(null);

  // listAllBarriers returns 6 litigation_barriers + 32 legal_weak_joints combined (38 total)
  const { data: barriers, isLoading } = trpc.enforcementIntel.listAllBarriers.useQuery();

  const filtered = useMemo(() => {
    if (!barriers) return [];
    let result = barriers;
    if (filterType) result = result.filter(b => b.barrierType === filterType);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(b =>
        (b.name ?? '').toLowerCase().includes(q) ||
        (b.description ?? '').toLowerCase().includes(q) ||
        (b.domain ?? '').toLowerCase().includes(q) ||
        (b.legalBasis ?? '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [barriers, filterType, search]);

  // Group by type
  const grouped = useMemo(() => {
    const groups: Record<string, typeof filtered> = {};
    for (const b of filtered) {
      if (!groups[b.barrierType]) groups[b.barrierType] = [];
      groups[b.barrierType].push(b);
    }
    return groups;
  }, [filtered]);

  if (isLoading) {
    return (
      <div style={{ background: c.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <Loader2 size={32} style={{ color: c.red, animation: "spin 1s linear infinite" }} />
          <p style={{ color: c.muted, fontFamily: fontSans, marginTop: 12 }}>Loading barriers...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: c.bg, minHeight: "100vh", padding: "24px 32px", fontFamily: fontSans }}>
      <LayerNavBar label="Litigation Barriers" route="/litigation-barriers" />
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Ban size={22} style={{ color: c.red }} />
          <h1 style={{ fontFamily: fontSerif, color: c.paper, fontSize: 28, margin: 0 }}>
            Litigation Barrier Explorer
          </h1>
        </div>
        <p style={{ color: c.muted, fontSize: 14, margin: 0, maxWidth: 700 }}>
          Structural obstacles that prevent people from accessing justice. Understanding these barriers
          is the first step to navigating around them. Each barrier includes its legal basis,
          affected domains, and practical workarounds.
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        {Object.entries(BARRIER_TYPE_META).map(([type, meta]) => {
          const count = barriers?.filter(b => b.barrierType === type).length ?? 0;
          if (count === 0) return null;
          return (
            <button
              key={type}
              onClick={() => setFilterType(filterType === type ? null : type)}
              style={{
                background: filterType === type ? meta.color + "15" : c.cardBg,
                border: `1px solid ${filterType === type ? meta.color : c.cardBorder}`,
                borderRadius: 8, padding: "8px 16px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 10, transition: "all 0.2s",
              }}
            >
              <meta.icon size={16} style={{ color: meta.color }} />
              <span style={{ color: meta.color, fontFamily: fontMono, fontSize: 18, fontWeight: 700 }}>{count}</span>
              <span style={{ color: c.muted, fontSize: 12 }}>{meta.label}</span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        background: c.cardBg, border: `1px solid ${c.cardBorder}`,
        borderRadius: 8, padding: "8px 14px", marginBottom: 20, maxWidth: 400,
      }}>
        <Search size={14} style={{ color: c.muted }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search barriers..."
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

      {/* Barrier groups */}
      {Object.entries(grouped).map(([type, items]) => {
        const meta = BARRIER_TYPE_META[type] || { color: c.muted, icon: Shield, label: type, description: "" };
        return (
          <div key={type} style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <meta.icon size={18} style={{ color: meta.color }} />
              <h2 style={{ fontFamily: fontSerif, color: c.paper, fontSize: 20, margin: 0 }}>
                {meta.label} Barriers
              </h2>
              <span style={{
                background: meta.color + "15", color: meta.color,
                padding: "2px 8px", borderRadius: 10, fontSize: 11, fontFamily: fontMono,
              }}>
                {items.length}
              </span>
            </div>
            <p style={{ color: c.muted, fontSize: 12, margin: "0 0 12px 0" }}>{meta.description}</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map(b => {
                const isExpanded = expandedId === b.id;
                return (
                  <div
                    key={b.id}
                    style={{
                      background: c.cardBg, border: `1px solid ${isExpanded ? meta.color + "50" : c.cardBorder}`,
                      borderRadius: 10, overflow: "hidden", transition: "border-color 0.2s",
                    }}
                  >
                    {/* Barrier header */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : b.id)}
                      style={{
                        width: "100%", background: "none", border: "none", cursor: "pointer",
                        padding: "14px 16px", display: "flex", alignItems: "center", gap: 12,
                        textAlign: "left",
                      }}
                    >
                      {isExpanded ? (
                        <ChevronDown size={16} style={{ color: meta.color, flexShrink: 0 }} />
                      ) : (
                        <ChevronRight size={16} style={{ color: c.muted, flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {(b as any).barrierId && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{
                              color: meta.color, fontSize: 10, fontFamily: fontMono,
                              background: meta.color + "15", padding: "1px 6px", borderRadius: 4,
                            }}>
                              {(b as any).barrierId}
                            </span>
                          </div>
                        )}
                        <h3 style={{ color: c.paper, fontSize: 14, margin: 0, fontFamily: fontSans, fontWeight: 600 }}>
                          {b.name}
                        </h3>
                        {(b as any).jurisdiction && (
                          <span style={{ color: c.muted, fontSize: 11 }}>{(b as any).jurisdiction}</span>
                        )}
                      </div>
                      {/* Domain tags */}
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        {(() => {
                          const domainList = Array.isArray((b as any).domains)
                            ? (b as any).domains as string[]
                            : (b as any).domain ? [(b as any).domain as string] : [];
                          return domainList.slice(0, 3).map((d: string, i: number) => (
                            <span key={i} style={{
                              background: c.goldBg, border: `1px solid ${c.goldBorder}`,
                              borderRadius: 4, padding: "1px 6px", fontSize: 9, color: c.gold,
                            }}>
                              {d}
                            </span>
                          ));
                        })()}
                      </div>
                    </button>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div style={{ padding: "0 16px 16px 44px" }}>
                        {b.description && (
                          <p style={{ color: c.paper, fontSize: 13, lineHeight: 1.6, margin: "0 0 12px 0" }}>
                            {b.description}
                          </p>
                        )}

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          {b.leadingAuthorities && (b.leadingAuthorities as string[]).length > 0 && (
                          <div style={{
                              background: c.purpleBg, border: `1px solid ${c.purpleBorder}`,
                              borderRadius: 8, padding: 12,
                            }}>
                              <span style={{ color: c.purple, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase" }}>
                                Leading Authorities
                              </span>
                              <ul style={{ margin: "6px 0 0 0", padding: "0 0 0 16px" }}>
                                {(b.leadingAuthorities as string[]).map((a, i) => (
                                  <li key={i} style={{ color: c.paper, fontSize: 12, lineHeight: 1.6 }}>{a}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {b.whatItBlocks && (
                            <div style={{
                              background: c.redBg, border: `1px solid ${c.redBorder}`,
                              borderRadius: 8, padding: 12,
                            }}>
                              <span style={{ color: c.red, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase" }}>
                                What It Blocks
                              </span>
                              <p style={{ color: c.paper, fontSize: 12, margin: "6px 0 0 0", lineHeight: 1.5 }}>
                                {b.whatItBlocks}
                              </p>
                            </div>
                          )}
                        </div>

                        {b.possibleWorkarounds && (b.possibleWorkarounds as string[]).length > 0 && (
                          <div style={{ marginTop: 12 }}>
                            <span style={{ color: c.green, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase" }}>
                              Possible Workarounds
                            </span>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                              {(b.possibleWorkarounds as string[]).map((w, i) => (
                                <div key={i} style={{
                                  display: "flex", alignItems: "flex-start", gap: 8,
                                  background: "rgba(52,211,153,0.04)", borderRadius: 6, padding: "6px 10px",
                                }}>
                                  <span style={{ color: c.green, fontSize: 12, marginTop: 1 }}>→</span>
                                  <span style={{ color: c.paper, fontSize: 12, lineHeight: 1.5 }}>{w}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {b.linkedWeakJoints && (b.linkedWeakJoints as string[]).length > 0 && (
                          <div style={{ marginTop: 12 }}>
                            <span style={{ color: c.muted, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase" }}>
                              Linked Weak Joints
                            </span>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                              {(b.linkedWeakJoints as string[]).map((d, i) => (
                                <span key={i} style={{
                                  background: c.purpleBg, border: `1px solid ${c.purpleBorder}`,
                                  borderRadius: 4, padding: "2px 8px", fontSize: 11, color: c.purple,
                                }}>
                                  {d}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Commit to Case */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, paddingTop: 12, borderTop: `1px solid ${c.cardBorder}` }}>
                          <CommitToCase type="barrier" itemId={b.id} label="Log Barrier to Case" />
                          <FlagArea location="litigation_barriers" targetId={b.id} targetType="barrier" message={`Review barrier: ${b.name}`} />
                        </div>

                        {/* All domains */}
                        <div style={{ marginTop: 12 }}>
                          <span style={{ color: c.muted, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase" }}>
                            Affected Domains
                          </span>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                            {(Array.isArray(b.domains) ? b.domains : (typeof b.domains === "string" ? (() => { try { const p = JSON.parse(b.domains); return Array.isArray(p) ? p : []; } catch { return []; } })() : [])).map((d, i) => (
                              <span key={i} style={{
                                background: c.goldBg, border: `1px solid ${c.goldBorder}`,
                                borderRadius: 4, padding: "2px 8px", fontSize: 11, color: c.gold,
                              }}>
                                {d}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Ban size={40} style={{ color: c.muted, marginBottom: 12 }} />
          <p style={{ color: c.muted, fontSize: 14 }}>No barriers match your search criteria.</p>
        </div>
      )}
      <NextStepBar
        context="Barriers identified. Now validate your claim elements or choose a procedural path."
        steps={[
          { label: "Validate Claim", href: "/claim-validation", icon: "shield", variant: "primary", description: "Check which claim elements you can prove" },
          { label: "Procedural Paths", href: "/enforcement-pathway", icon: "scale", description: "See which enforcement routes are available" },
          { label: "Remedy Strategy", href: "/remedy-feasibility", icon: "gavel", description: "Assess what outcomes are achievable" },
        ]}
      />
    </div>
  );
}
