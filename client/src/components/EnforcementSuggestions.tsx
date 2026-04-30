import { trpc } from "@/lib/trpc";
import { Link } from "wouter";

const c = {
  bg: "#0a0e17", surface: "#111827", surfaceAlt: "#1a2236",
  border: "#1e293b", borderHover: "#334155",
  paper: "#e2e8f0", muted: "#94a3b8", dim: "#64748b",
  teal: "#2dd4bf", tealBg: "rgba(45,212,191,0.08)", tealBorder: "rgba(45,212,191,0.2)",
  gold: "#f59e0b", goldBg: "rgba(245,158,11,0.08)", goldBorder: "rgba(245,158,11,0.2)",
  red: "#ef4444", redBg: "rgba(239,68,68,0.08)", redBorder: "rgba(239,68,68,0.2)",
  green: "#34d399", greenBg: "rgba(52,211,153,0.08)", greenBorder: "rgba(52,211,153,0.2)",
  purple: "#a78bfa", purpleBg: "rgba(167,139,250,0.08)", purpleBorder: "rgba(167,139,250,0.2)",
};

const fontMono = "'JetBrains Mono', 'Fira Code', monospace";

/**
 * EnforcementSuggestions — Shows relevant enforcement resources for a case's missing records.
 * Designed to be embedded in case detail views, CDA analysis, or Case Repair.
 */
export function EnforcementSuggestions({ caseId }: { caseId: number }) {
  const { data, isLoading } = trpc.enforcementIntel.suggestResourcesForCase.useQuery(
    { caseId },
    { enabled: !!caseId }
  );

  if (isLoading) {
    return (
      <div style={{
        background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10,
        padding: 20, textAlign: "center", color: c.muted, fontSize: 13,
      }}>
        Loading enforcement suggestions...
      </div>
    );
  }

  if (!data || data.gaps.length === 0) {
    return (
      <div style={{
        background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10,
        padding: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ color: c.teal, fontSize: 14 }}>⚡</span>
          <span style={{ color: c.paper, fontSize: 13, fontWeight: 600 }}>Enforcement Resources</span>
        </div>
        <p style={{ color: c.dim, fontSize: 12, margin: 0 }}>
          No missing records detected for this case. Enforcement suggestions will appear when gaps are identified.
        </p>
      </div>
    );
  }

  const suggestions = 'forms' in data.suggestions ? data.suggestions : { forms: [] as any[], guidance: [] as any[], penalties: [] as any[], viabilityRules: [] as any[] };
  const totalResources = (suggestions.forms?.length || 0) + (suggestions.guidance?.length || 0) +
    (suggestions.penalties?.length || 0) + (suggestions.viabilityRules?.length || 0);

  return (
    <div style={{
      background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 18px", borderBottom: `1px solid ${c.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: c.tealBg,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>⚡</span>
          <div>
            <span style={{ color: c.paper, fontSize: 14, fontWeight: 700 }}>
              Enforcement Intelligence Cross-Link
            </span>
            <span style={{ color: c.muted, fontSize: 11, marginLeft: 8 }}>
              {data.gaps.length} gap{data.gaps.length !== 1 ? "s" : ""} detected · {totalResources} resources matched
            </span>
          </div>
        </div>
        <Link href="/enforcement-intel" style={{ color: c.teal, fontSize: 11, textDecoration: "none", fontFamily: fontMono }}>
          View All →
        </Link>
      </div>

      {/* Gaps Summary */}
      <div style={{ padding: "12px 18px", borderBottom: `1px solid ${c.border}` }}>
        <span style={{ color: c.dim, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase" }}>
          Detected Gaps
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {data.gaps.map((g: any) => (
            <span key={g.id} style={{
              background: g.severity === "critical" ? c.redBg : g.severity === "high" ? c.goldBg : c.surfaceAlt,
              border: `1px solid ${g.severity === "critical" ? c.redBorder : g.severity === "high" ? c.goldBorder : c.border}`,
              borderRadius: 6, padding: "3px 8px", fontSize: 11,
              color: g.severity === "critical" ? c.red : g.severity === "high" ? c.gold : c.muted,
            }}>
              {g.label || g.recordType} ({g.domain})
            </span>
          ))}
        </div>
      </div>

      {/* Suggested Forms */}
      {suggestions.forms && suggestions.forms.length > 0 && (
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${c.border}` }}>
          <span style={{ color: c.teal, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase", fontWeight: 700 }}>
            Recommended Filing Forms
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {suggestions.forms.map((f: any) => (
              <div key={f.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: c.surfaceAlt, borderRadius: 6, padding: "8px 12px",
                border: `1px solid ${c.border}`,
              }}>
                <div>
                  <span style={{
                    background: c.tealBg, border: `1px solid ${c.tealBorder}`,
                    borderRadius: 4, padding: "2px 6px", fontSize: 10,
                    fontFamily: fontMono, color: c.teal, marginRight: 8,
                  }}>
                    {f.agencyShort}
                  </span>
                  <span style={{ color: c.paper, fontSize: 12, fontWeight: 600 }}>{f.formName}</span>
                  {f.formNumber && (
                    <span style={{ color: c.dim, fontSize: 11, marginLeft: 6 }}>({f.formNumber})</span>
                  )}
                </div>
                <Link href="/deadline-calculator" style={{
                  color: c.teal, fontSize: 10, textDecoration: "none", fontFamily: fontMono,
                }}>
                  Check Deadline →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Guidance */}
      {suggestions.guidance && suggestions.guidance.length > 0 && (
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${c.border}` }}>
          <span style={{ color: c.gold, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase", fontWeight: 700 }}>
            Relevant Regulatory Guidance
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {suggestions.guidance.map((g: any) => (
              <div key={g.id} style={{
                display: "flex", alignItems: "center", gap: 8,
                background: c.surfaceAlt, borderRadius: 6, padding: "6px 12px",
                border: `1px solid ${c.border}`,
              }}>
                <span style={{
                  background: c.goldBg, border: `1px solid ${c.goldBorder}`,
                  borderRadius: 4, padding: "2px 6px", fontSize: 10,
                  fontFamily: fontMono, color: c.gold,
                }}>
                  {g.agencyShort}
                </span>
                <span style={{ color: c.paper, fontSize: 12 }}>{g.documentTitle}</span>
                <span style={{ color: c.dim, fontSize: 10, marginLeft: "auto" }}>{g.guidanceType}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Penalties & Viability */}
      <div style={{ padding: "12px 18px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {suggestions.penalties && suggestions.penalties.length > 0 && (
          <div>
            <span style={{ color: c.red, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase", fontWeight: 700 }}>
              Applicable Penalties ({suggestions.penalties.length})
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
              {suggestions.penalties.slice(0, 4).map((p: any) => (
                <div key={p.id} style={{
                  fontSize: 11, color: c.muted, padding: "4px 8px",
                  background: c.surfaceAlt, borderRadius: 4, border: `1px solid ${c.border}`,
                }}>
                  <span style={{ color: c.red, fontFamily: fontMono, fontSize: 10 }}>{p.agencyShort}</span>
                  {" "}{p.violationType}
                </div>
              ))}
              {suggestions.penalties.length > 4 && (
                <Link href="/enforcement-intel" style={{ color: c.dim, fontSize: 10, textDecoration: "none" }}>
                  +{suggestions.penalties.length - 4} more →
                </Link>
              )}
            </div>
          </div>
        )}
        {suggestions.viabilityRules && suggestions.viabilityRules.length > 0 && (
          <div>
            <span style={{ color: c.green, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase", fontWeight: 700 }}>
              Viability Assessment ({suggestions.viabilityRules.length})
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
              {suggestions.viabilityRules.map((v: any) => (
                <div key={v.id} style={{
                  fontSize: 11, color: c.muted, padding: "4px 8px",
                  background: c.surfaceAlt, borderRadius: 4, border: `1px solid ${c.border}`,
                }}>
                  <span style={{ color: c.green, fontFamily: fontMono, fontSize: 10 }}>{v.agencyShort}</span>
                  {" "}{v.claimType} — {v.recommendedChannel}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * GapResourceSuggestions — Standalone component for a single domain/gap type.
 * Use in CDA analysis or pipeline views.
 */
export function GapResourceSuggestions({ domain, gapType }: { domain: string; gapType?: string }) {
  const { data, isLoading } = trpc.enforcementIntel.suggestResourcesForGap.useQuery(
    { domain, gapType },
    { enabled: !!domain }
  );

  if (isLoading) return <div style={{ color: c.muted, fontSize: 12, padding: 8 }}>Loading suggestions...</div>;
  if (!data || data.totalResources === 0) return null;

  return (
    <div style={{
      background: c.tealBg, border: `1px solid ${c.tealBorder}`, borderRadius: 8,
      padding: 12, marginTop: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ color: c.teal, fontSize: 11, fontFamily: fontMono, fontWeight: 700 }}>
          ⚡ {data.totalResources} ENFORCEMENT RESOURCES
        </span>
        <span style={{ color: c.dim, fontSize: 10 }}>for {domain}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {data.forms.map((f: any) => (
          <span key={`f-${f.id}`} style={{
            background: c.surfaceAlt, border: `1px solid ${c.border}`,
            borderRadius: 4, padding: "2px 6px", fontSize: 10, color: c.teal,
          }}>
            📋 {f.agencyShort}: {f.formName}
          </span>
        ))}
        {data.guidance.slice(0, 3).map((g: any) => (
          <span key={`g-${g.id}`} style={{
            background: c.surfaceAlt, border: `1px solid ${c.border}`,
            borderRadius: 4, padding: "2px 6px", fontSize: 10, color: c.gold,
          }}>
            📖 {g.agencyShort}: {g.documentTitle}
          </span>
        ))}
        {data.penalties.length > 0 && (
          <span style={{
            background: c.surfaceAlt, border: `1px solid ${c.border}`,
            borderRadius: 4, padding: "2px 6px", fontSize: 10, color: c.red,
          }}>
            ⚖️ {data.penalties.length} penalties
          </span>
        )}
        {data.barriers.length > 0 && (
          <span style={{
            background: c.surfaceAlt, border: `1px solid ${c.border}`,
            borderRadius: 4, padding: "2px 6px", fontSize: 10, color: c.purple,
          }}>
            🛡️ {data.barriers.length} barriers
          </span>
        )}
      </div>
    </div>
  );
}
