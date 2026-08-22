import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useWorldIndex } from "@/hooks/useWorldIndex";
import {
  ChevronRight,
  BarChart3,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  Target,
  Activity,
  Building2,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  FileText,
  Scale,
  Users,
  DollarSign,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════
   AGENCY PERFORMANCE DASHBOARD
   
   Surfaces agency_performance_metrics data with trend lines, gap gauges,
   and weak joint callouts. Designed to scale from EEOC to any agency.
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
  greenBg: "rgba(52,211,153,0.08)",
  greenBorder: "rgba(52,211,153,0.25)",
  blue: "#3b82f6",
};

const fontSerif = "'Playfair Display', Georgia, serif";
const fontSans = "'Inter', system-ui, sans-serif";
const fontMono = "'JetBrains Mono', 'Fira Code', monospace";

function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

function formatPercent(n: number | string | null | undefined): string {
  if (n == null) return "—";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "—";
  return `${num.toFixed(1)}%`;
}

function formatDollars(n: number | string | null | undefined): string {
  if (n == null) return "—";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "—";
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

function TrendArrow({ current, previous }: { current: number | null; previous: number | null }) {
  if (current == null || previous == null) return <Minus size={12} color={c.muted} />;
  const diff = current - previous;
  if (Math.abs(diff) < 0.5) return <Minus size={12} color={c.muted} />;
  if (diff > 0) return <ArrowUpRight size={12} color={c.green} />;
  return <ArrowDownRight size={12} color={c.red} />;
}

// Severity badge colors
const severityColors: Record<string, { bg: string; border: string; text: string }> = {
  critical: { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.4)", text: "#fca5a5" },
  high: { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.4)", text: "#fcd34d" },
  medium: { bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.4)", text: "#93c5fd" },
  low: { bg: "rgba(107,114,128,0.12)", border: "rgba(107,114,128,0.4)", text: "#9ca3af" },
};

export default function AgencyMetrics() {
  const [, navigate] = useLocation();
  const [selectedAgency, setSelectedAgency] = useState<string | null>(null);
  const allMetrics = trpc.agencyMetrics.getAll.useQuery();
  const statsQuery = trpc.agencyMetrics.stats.useQuery();
  // World Index: unified agency data
  const worldIndex = useWorldIndex();
  const worldAgencies = worldIndex.nodesByType["agency"] ?? [];

  // Group metrics by agency
  const agencyGroups = useMemo(() => {
    if (!allMetrics.data) return {};
    const groups: Record<string, typeof allMetrics.data> = {};
    for (const row of allMetrics.data) {
      const name = row.agencyName;
      if (!groups[name]) groups[name] = [];
      groups[name].push(row);
    }
    return groups;
  }, [allMetrics.data]);

  const agencyNames = Object.keys(agencyGroups);
  const activeAgency = selectedAgency || agencyNames[0] || null;
  const activeData = activeAgency ? (agencyGroups[activeAgency] || []) : [];
  // Sort by fiscal year ascending for charts
  const sortedData = [...activeData].sort((a, b) => a.fiscalYear - b.fiscalYear);
  const latestYear = sortedData[sortedData.length - 1];
  const previousYear = sortedData.length >= 2 ? sortedData[sortedData.length - 2] : null;

  // Weak joints for selected agency
  const weakJointsQuery = trpc.agencyMetrics.getAgencyWeakJoints.useQuery(
    { agencyName: activeAgency || "" },
    { enabled: !!activeAgency }
  );

  if (allMetrics.isLoading) {
    return (
      <div style={{ minHeight: "100vh", background: c.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={24} color={c.purple} style={{ animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: c.bg, color: c.paper }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 24px 80px" }}>
        {/* Breadcrumb */}
        <button
          onClick={() => navigate("/lighthouse")}
          style={{
            background: "none", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
            fontFamily: fontMono, fontSize: 11, color: c.muted, marginBottom: 24,
          }}
        >
          <ChevronRight size={12} style={{ transform: "rotate(180deg)" }} /> Back to Lighthouse
        </button>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: c.tealBg, border: `1px solid ${c.tealBorder}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <BarChart3 size={24} color={c.teal} />
          </div>
          <div>
            <h1 style={{ fontFamily: fontSerif, fontSize: 28, fontWeight: 700, color: c.paper, lineHeight: 1.2 }}>
              Agency Performance
            </h1>
            <p style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.teal }}>
              Enforcement accountability metrics
            </p>
          </div>
        </div>

        <p style={{ fontFamily: fontSans, fontSize: 14, color: c.muted, lineHeight: 1.7, maxWidth: 700, marginBottom: 32 }}>
          Federal enforcement agencies are required by statute to investigate complaints within specific timeframes 
          and to achieve measurable outcomes. This dashboard tracks what the data shows against what the law requires.
        </p>

        {agencyNames.length === 0 && !allMetrics.isLoading && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 12,
            background: c.amberBg, border: `1px solid ${c.goldBorder}`,
            borderRadius: 10, padding: "16px 18px", marginBottom: 20,
          }}>
            <AlertTriangle size={18} color={c.amber} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontFamily: fontSans, fontSize: 13, fontWeight: 600, color: c.paper, marginBottom: 4 }}>
                Performance metrics are not loaded for this surface.
              </p>
              <p style={{ fontFamily: fontSans, fontSize: 12, color: c.muted, lineHeight: 1.55 }}>
                The agency directory below is reference inventory from the World Index. It is not performance evidence and is not used to imply agency outcomes, timeliness, or compliance.
              </p>
            </div>
          </div>
        )}

        {/* World Index reference directory — supplemental only, never performance evidence */}
        {worldAgencies.length > 0 && agencyNames.length === 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Building2 size={16} color={c.teal} />
              <span style={{ fontFamily: fontMono, fontSize: 11, color: c.teal, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Agency / Oversight Directory — reference only ({worldAgencies.length})
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
              {worldAgencies.map(agency => (
                <div key={agency.id} style={{
                  background: c.cardBg, border: `1px solid ${c.cardBorder}`,
                  borderRadius: 10, padding: "16px 20px",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                      background: c.tealBg, border: `1px solid ${c.tealBorder}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Building2 size={18} color={c.teal} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: fontSans, fontSize: 13, fontWeight: 600, color: c.paper, marginBottom: 2 }}>
                        {agency.metadata?.name || agency.id}
                      </p>
                      <p style={{ fontFamily: fontMono, fontSize: 10, color: c.teal, marginBottom: 4 }}>
                        {agency.jurisdiction}
                      </p>
                      {agency.metadata?.function && (
                        <p style={{ fontFamily: fontSans, fontSize: 11, color: c.muted, lineHeight: 1.4 }}>
                          {agency.metadata.function}
                        </p>
                      )}
                      {agency.metadata?.statute_of_limitations && (
                        <p style={{ fontFamily: fontMono, fontSize: 10, color: c.gold, marginTop: 4 }}>
                          SOL: {agency.metadata.statute_of_limitations}
                        </p>
                      )}
                      {agency.metadata?.escalation && (
                        <p style={{ fontFamily: fontMono, fontSize: 10, color: c.muted, marginTop: 2 }}>
                          Escalation: {agency.metadata.escalation}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Global stats */}
        {statsQuery.data && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 32 }}>
            <StatBox icon={Building2} label="Agencies Tracked" value={statsQuery.data.agencies.toString()} color={c.teal} />
            <StatBox icon={Clock} label="Fiscal Years" value={statsQuery.data.years.toString()} color={c.gold} />
            <StatBox icon={Activity} label="Data Points" value={statsQuery.data.totalDataPoints.toString()} color={c.purple} />
          </div>
        )}

        {/* Agency selector */}
        {agencyNames.length > 1 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
            {agencyNames.map(name => {
              const abbr = agencyGroups[name]?.[0]?.agencyAbbreviation || name;
              const isActive = name === activeAgency;
              return (
                <button
                  key={name}
                  onClick={() => setSelectedAgency(name)}
                  style={{
                    background: isActive ? c.tealBg : "transparent",
                    border: `1px solid ${isActive ? c.tealBorder : c.cardBorder}`,
                    borderRadius: 6, padding: "8px 16px", cursor: "pointer",
                    fontFamily: fontMono, fontSize: 11, color: isActive ? c.teal : c.muted,
                    transition: "all 0.2s",
                  }}
                >
                  {abbr}
                </button>
              );
            })}
          </div>
        )}

        {activeAgency && latestYear && (
          <>
            {/* Agency header */}
            <div style={{
              background: c.cardBg, border: `1px solid ${c.cardBorder}`,
              borderRadius: 12, padding: "24px 28px", marginBottom: 20,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
                <div>
                  <h2 style={{ fontFamily: fontSerif, fontSize: 22, fontWeight: 700, color: c.paper, marginBottom: 4 }}>
                    {activeAgency}
                  </h2>
                  {latestYear.agencyAbbreviation && (
                    <span style={{ fontFamily: fontMono, fontSize: 11, color: c.teal }}>{latestYear.agencyAbbreviation}</span>
                  )}
                  {latestYear.statutoryAuthority && (
                    <p style={{ fontFamily: fontMono, fontSize: 11, color: c.muted, marginTop: 4 }}>
                      Authority: {latestYear.statutoryAuthority}
                    </p>
                  )}
                </div>
                <div style={{
                  background: c.purpleBg, border: `1px solid ${c.purpleBorder}`,
                  borderRadius: 8, padding: "8px 16px", textAlign: "center",
                }}>
                  <span style={{ fontFamily: fontMono, fontSize: 10, color: c.muted, display: "block" }}>Latest Data</span>
                  <span style={{ fontFamily: fontSerif, fontSize: 20, fontWeight: 700, color: c.purple }}>FY{latestYear.fiscalYear}</span>
                </div>
              </div>
            </div>

            {/* Key metrics grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
              <MetricCard
                label="Charges Filed"
                value={formatNumber(latestYear.chargesFiled)}
                previous={previousYear?.chargesFiled}
                current={latestYear.chargesFiled}
                icon={FileText}
                color={c.blue}
              />
              <MetricCard
                label="Charges Resolved"
                value={formatNumber(latestYear.chargesResolved)}
                previous={previousYear?.chargesResolved}
                current={latestYear.chargesResolved}
                icon={Target}
                color={c.green}
              />
              <MetricCard
                label="Backlog"
                value={formatNumber(latestYear.backlog)}
                previous={previousYear?.backlog}
                current={latestYear.backlog}
                icon={AlertTriangle}
                color={latestYear.backlog && latestYear.backlog > (latestYear.chargesFiled || 0) ? c.red : c.amber}
                invertTrend
              />
              <MetricCard
                label="Avg Processing Days"
                value={latestYear.avgProcessingDays ? `${latestYear.avgProcessingDays}d` : "—"}
                previous={previousYear?.avgProcessingDays}
                current={latestYear.avgProcessingDays}
                icon={Clock}
                color={c.gold}
                invertTrend
              />
              {latestYear.monetaryRelief && (
                <MetricCard
                  label="Monetary Relief"
                  value={formatDollars(latestYear.monetaryRelief)}
                  previous={previousYear?.monetaryRelief ? parseFloat(String(previousYear.monetaryRelief)) : null}
                  current={parseFloat(String(latestYear.monetaryRelief))}
                  icon={DollarSign}
                  color={c.green}
                />
              )}
              {latestYear.causePercentage && (
                <MetricCard
                  label="Cause Finding Rate"
                  value={formatPercent(latestYear.causePercentage)}
                  previous={previousYear?.causePercentage ? parseFloat(String(previousYear.causePercentage)) : null}
                  current={parseFloat(String(latestYear.causePercentage))}
                  icon={Scale}
                  color={c.purple}
                />
              )}
            </div>

            {/* Statutory deadline gap */}
            {latestYear.statutoryDeadlineDays && latestYear.avgProcessingDays && (
              <div style={{
                background: latestYear.avgProcessingDays > latestYear.statutoryDeadlineDays ? c.redBg : c.greenBg,
                border: `1px solid ${latestYear.avgProcessingDays > latestYear.statutoryDeadlineDays ? c.redBorder : c.greenBorder}`,
                borderRadius: 10, padding: "20px 24px", marginBottom: 20,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Clock size={16} color={latestYear.avgProcessingDays > latestYear.statutoryDeadlineDays ? c.red : c.green} />
                  <span style={{
                    fontFamily: fontMono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
                    color: latestYear.avgProcessingDays > latestYear.statutoryDeadlineDays ? c.red : c.green,
                  }}>
                    Statutory Deadline Compliance
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 16, alignItems: "center" }}>
                  <div>
                    <span style={{ fontFamily: fontMono, fontSize: 10, color: c.muted, display: "block" }}>Required by Law</span>
                    <span style={{ fontFamily: fontSerif, fontSize: 28, fontWeight: 700, color: c.paper }}>
                      {latestYear.statutoryDeadlineDays}
                    </span>
                    <span style={{ fontFamily: fontMono, fontSize: 11, color: c.muted }}> days</span>
                  </div>
                  <div style={{
                    width: 48, height: 48, borderRadius: "50%",
                    background: latestYear.avgProcessingDays > latestYear.statutoryDeadlineDays ? "rgba(239,68,68,0.15)" : "rgba(52,211,153,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: fontMono, fontSize: 14, fontWeight: 700,
                    color: latestYear.avgProcessingDays > latestYear.statutoryDeadlineDays ? c.red : c.green,
                  }}>
                    {latestYear.avgProcessingDays > latestYear.statutoryDeadlineDays ? "+" : ""}
                    {latestYear.gapDays ?? (latestYear.avgProcessingDays - latestYear.statutoryDeadlineDays)}d
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontFamily: fontMono, fontSize: 10, color: c.muted, display: "block" }}>Actual Average</span>
                    <span style={{ fontFamily: fontSerif, fontSize: 28, fontWeight: 700, color: c.paper }}>
                      {latestYear.avgProcessingDays}
                    </span>
                    <span style={{ fontFamily: fontMono, fontSize: 11, color: c.muted }}> days</span>
                  </div>
                </div>
              </div>
            )}

            {/* Outcome breakdown */}
            {(latestYear.causeFindings || latestYear.noReasonableCause || latestYear.administrativeClosure || latestYear.rightToSueIssued) && (
              <div style={{
                background: c.cardBg, border: `1px solid ${c.cardBorder}`,
                borderRadius: 10, padding: "20px 24px", marginBottom: 20,
              }}>
                <h3 style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.gold, marginBottom: 16 }}>
                  Resolution Outcomes — FY{latestYear.fiscalYear}
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                  {latestYear.causeFindings != null && (
                    <OutcomeBar
                      label="Cause Findings"
                      count={latestYear.causeFindings}
                      percent={latestYear.causePercentage ? parseFloat(String(latestYear.causePercentage)) : null}
                      color={c.green}
                    />
                  )}
                  {latestYear.noReasonableCause != null && (
                    <OutcomeBar
                      label="No Reasonable Cause"
                      count={latestYear.noReasonableCause}
                      percent={latestYear.noReasonableCausePercentage ? parseFloat(String(latestYear.noReasonableCausePercentage)) : null}
                      color={c.amber}
                    />
                  )}
                  {latestYear.administrativeClosure != null && (
                    <OutcomeBar
                      label="Administrative Closure"
                      count={latestYear.administrativeClosure}
                      percent={latestYear.administrativeClosurePercentage ? parseFloat(String(latestYear.administrativeClosurePercentage)) : null}
                      color={c.muted}
                    />
                  )}
                  {latestYear.rightToSueIssued != null && (
                    <OutcomeBar
                      label="Right to Sue Issued"
                      count={latestYear.rightToSueIssued}
                      percent={latestYear.rightToSuePercentage ? parseFloat(String(latestYear.rightToSuePercentage)) : null}
                      color={c.purple}
                    />
                  )}
                  {latestYear.conciliationSuccessRate && (
                    <OutcomeBar
                      label="Conciliation Success"
                      count={null}
                      percent={parseFloat(String(latestYear.conciliationSuccessRate))}
                      color={c.teal}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Year-over-year timeline */}
            {sortedData.length > 1 && (
              <div style={{
                background: c.cardBg, border: `1px solid ${c.cardBorder}`,
                borderRadius: 10, padding: "20px 24px", marginBottom: 20,
              }}>
                <h3 style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.teal, marginBottom: 16 }}>
                  Year-over-Year Trends
                </h3>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fontMono, fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: `1px solid ${c.cardBorder}`, color: c.muted, fontSize: 10 }}>FY</th>
                        <th style={{ textAlign: "right", padding: "8px 12px", borderBottom: `1px solid ${c.cardBorder}`, color: c.muted, fontSize: 10 }}>Filed</th>
                        <th style={{ textAlign: "right", padding: "8px 12px", borderBottom: `1px solid ${c.cardBorder}`, color: c.muted, fontSize: 10 }}>Resolved</th>
                        <th style={{ textAlign: "right", padding: "8px 12px", borderBottom: `1px solid ${c.cardBorder}`, color: c.muted, fontSize: 10 }}>Backlog</th>
                        <th style={{ textAlign: "right", padding: "8px 12px", borderBottom: `1px solid ${c.cardBorder}`, color: c.muted, fontSize: 10 }}>Avg Days</th>
                        <th style={{ textAlign: "right", padding: "8px 12px", borderBottom: `1px solid ${c.cardBorder}`, color: c.muted, fontSize: 10 }}>Cause %</th>
                        {sortedData.some(d => d.monetaryRelief) && (
                          <th style={{ textAlign: "right", padding: "8px 12px", borderBottom: `1px solid ${c.cardBorder}`, color: c.muted, fontSize: 10 }}>Relief</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedData.map((row, i) => {
                        const prev = i > 0 ? sortedData[i - 1] : null;
                        const deadlineExceeded = row.statutoryDeadlineDays && row.avgProcessingDays && row.avgProcessingDays > row.statutoryDeadlineDays;
                        return (
                          <tr key={row.fiscalYear} style={{ borderBottom: `1px solid ${c.cardBorder}` }}>
                            <td style={{ padding: "10px 12px", color: c.paper, fontWeight: 600 }}>FY{row.fiscalYear}</td>
                            <td style={{ padding: "10px 12px", textAlign: "right", color: c.paper }}>{formatNumber(row.chargesFiled)}</td>
                            <td style={{ padding: "10px 12px", textAlign: "right", color: c.paper }}>{formatNumber(row.chargesResolved)}</td>
                            <td style={{ padding: "10px 12px", textAlign: "right", color: row.backlog && row.backlog > (row.chargesFiled || 0) ? c.red : c.paper }}>
                              {formatNumber(row.backlog)}
                            </td>
                            <td style={{ padding: "10px 12px", textAlign: "right", color: deadlineExceeded ? c.red : c.paper }}>
                              {row.avgProcessingDays ?? "—"}
                              {deadlineExceeded && <span style={{ color: c.red, fontSize: 9 }}> !</span>}
                            </td>
                            <td style={{ padding: "10px 12px", textAlign: "right", color: c.paper }}>{formatPercent(row.causePercentage)}</td>
                            {sortedData.some(d => d.monetaryRelief) && (
                              <td style={{ padding: "10px 12px", textAlign: "right", color: c.green }}>{formatDollars(row.monetaryRelief)}</td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Visual trend bars */}
            {sortedData.length > 1 && (
              <div style={{
                background: c.cardBg, border: `1px solid ${c.cardBorder}`,
                borderRadius: 10, padding: "20px 24px", marginBottom: 20,
              }}>
                <h3 style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.purple, marginBottom: 16 }}>
                  Backlog Trend
                </h3>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
                  {sortedData.map(row => {
                    const maxBacklog = Math.max(...sortedData.map(d => d.backlog || 0));
                    const height = maxBacklog > 0 ? ((row.backlog || 0) / maxBacklog) * 100 : 0;
                    const overCapacity = row.backlog && row.chargesFiled && row.backlog > row.chargesFiled;
                    return (
                      <div key={row.fiscalYear} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <span style={{ fontFamily: fontMono, fontSize: 9, color: c.muted }}>{formatNumber(row.backlog)}</span>
                        <div style={{
                          width: "100%", maxWidth: 60,
                          height: `${Math.max(height, 4)}%`,
                          background: overCapacity
                            ? "linear-gradient(to top, rgba(239,68,68,0.3), rgba(239,68,68,0.6))"
                            : "linear-gradient(to top, rgba(14,116,144,0.2), rgba(14,116,144,0.5))",
                          borderRadius: "4px 4px 0 0",
                          border: `1px solid ${overCapacity ? c.redBorder : c.tealBorder}`,
                          transition: "height 0.3s ease",
                        }} />
                        <span style={{ fontFamily: fontMono, fontSize: 10, color: c.paper }}>{row.fiscalYear}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Weak joints section */}
            {weakJointsQuery.data && weakJointsQuery.data.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <h3 style={{
                  fontFamily: fontMono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
                  color: c.red, marginBottom: 12, display: "flex", alignItems: "center", gap: 8,
                }}>
                  <AlertTriangle size={14} /> Identified Weak Joints
                </h3>
                {weakJointsQuery.data.map((wj: any) => (
                  <div key={wj.id} style={{
                    background: c.redBg, border: `1px solid ${c.redBorder}`,
                    borderRadius: 8, padding: "16px 20px", marginBottom: 8,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      {wj.severity && (
                        <span style={{
                          fontFamily: fontMono, fontSize: 9, padding: "2px 8px", borderRadius: 4,
                          background: severityColors[wj.severity]?.bg || severityColors.medium.bg,
                          border: `1px solid ${severityColors[wj.severity]?.border || severityColors.medium.border}`,
                          color: severityColors[wj.severity]?.text || severityColors.medium.text,
                          textTransform: "uppercase", letterSpacing: "0.08em",
                        }}>
                          {wj.severity}
                        </span>
                      )}
                      <span style={{ fontFamily: fontMono, fontSize: 11, color: c.purple }}>{wj.statuteCitation}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 8 }}>
                      <div>
                        <span style={{ fontFamily: fontMono, fontSize: 9, color: c.green, textTransform: "uppercase", letterSpacing: "0.08em" }}>What Law Requires</span>
                        <p style={{ fontFamily: fontSans, fontSize: 12, color: c.paper, lineHeight: 1.5, marginTop: 4 }}>{wj.whatLawRequires}</p>
                      </div>
                      <div>
                        <span style={{ fontFamily: fontMono, fontSize: 9, color: c.red, textTransform: "uppercase", letterSpacing: "0.08em" }}>What Actually Happens</span>
                        <p style={{ fontFamily: fontSans, fontSize: 12, color: "#fca5a5", lineHeight: 1.5, marginTop: 4 }}>{wj.whatActuallyHappens}</p>
                      </div>
                    </div>
                    <p style={{ fontFamily: fontSans, fontSize: 12, color: c.muted, lineHeight: 1.5 }}>{wj.divergenceDescription}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Data confidence note */}
            {latestYear.dataConfidence && (
              <div style={{
                fontFamily: fontMono, fontSize: 10, color: c.muted,
                padding: "12px 16px", background: "rgba(255,255,255,0.02)",
                borderRadius: 6, marginBottom: 20,
              }}>
                Data confidence: {latestYear.dataConfidence === "A" ? "Official agency reports" : latestYear.dataConfidence === "B" ? "Derived from multiple sources" : "Estimated"} 
                {latestYear.sourceUrls && (
                  <span> — Sources: {typeof latestYear.sourceUrls === "string" ? latestYear.sourceUrls : JSON.stringify(latestYear.sourceUrls)}</span>
                )}
              </div>
            )}
          </>
        )}

        {/* Empty state */}
        {agencyNames.length === 0 && !allMetrics.isLoading && worldAgencies.length === 0 && (
          <div style={{
            background: c.cardBg, border: `1px solid ${c.cardBorder}`,
            borderRadius: 10, padding: "48px 32px", textAlign: "center",
          }}>
            <BarChart3 size={32} color={c.muted} style={{ marginBottom: 16 }} />
            <h3 style={{ fontFamily: fontSerif, fontSize: 18, color: c.paper, marginBottom: 8 }}>No performance metrics loaded</h3>
            <p style={{ fontFamily: fontSans, fontSize: 13, color: c.muted, lineHeight: 1.6 }}>
              Performance evidence will appear here when a governed agency-metrics dataset is available.
            </p>
          </div>
        )}

        {/* Navigation to Legal Library */}
        <button
          onClick={() => navigate("/legal-library")}
          style={{
            background: c.purpleBg, border: `1px solid ${c.purpleBorder}`,
            borderRadius: 8, padding: "12px 20px", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 8,
            fontFamily: fontMono, fontSize: 11, color: c.purple,
            marginTop: 24,
          }}
        >
          <Scale size={14} /> View Full Legal Library <ChevronRight size={12} />
        </button>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function StatBox({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div style={{
      background: `${color}10`, border: `1px solid ${color}30`,
      borderRadius: 8, padding: "16px 20px",
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <Icon size={20} color={color} />
      <div>
        <span style={{ fontFamily: fontSerif, fontSize: 22, fontWeight: 700, color: c.paper, display: "block" }}>{value}</span>
        <span style={{ fontFamily: fontMono, fontSize: 9, color: c.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
      </div>
    </div>
  );
}

function MetricCard({
  label, value, previous, current, icon: Icon, color, invertTrend,
}: {
  label: string; value: string; previous: number | null | undefined; current: number | null | undefined;
  icon: any; color: string; invertTrend?: boolean;
}) {
  const prev = previous ?? null;
  const curr = current ?? null;
  let trendColor = c.muted;
  if (prev != null && curr != null) {
    const diff = curr - prev;
    if (Math.abs(diff) >= 0.5) {
      trendColor = invertTrend ? (diff > 0 ? c.red : c.green) : (diff > 0 ? c.green : c.red);
    }
  }

  return (
    <div style={{
      background: c.cardBg, border: `1px solid ${c.cardBorder}`,
      borderRadius: 8, padding: "16px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Icon size={16} color={color} />
        {prev != null && curr != null && Math.abs(curr - prev) >= 0.5 && (
          <span style={{ fontFamily: fontMono, fontSize: 10, color: trendColor }}>
            {invertTrend
              ? (curr > prev ? <ArrowUpRight size={10} style={{ display: "inline" }} /> : <ArrowDownRight size={10} style={{ display: "inline" }} />)
              : (curr > prev ? <ArrowUpRight size={10} style={{ display: "inline" }} /> : <ArrowDownRight size={10} style={{ display: "inline" }} />)
            }
            {" "}{Math.abs(((curr - prev) / (prev || 1)) * 100).toFixed(1)}%
          </span>
        )}
      </div>
      <span style={{ fontFamily: fontSerif, fontSize: 24, fontWeight: 700, color: c.paper, display: "block" }}>{value}</span>
      <span style={{ fontFamily: fontMono, fontSize: 9, color: c.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
    </div>
  );
}

function OutcomeBar({ label, count, percent, color }: { label: string; count: number | null; percent: number | null; color: string }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontFamily: fontMono, fontSize: 10, color: c.muted }}>{label}</span>
        <span style={{ fontFamily: fontMono, fontSize: 10, color: c.paper }}>
          {count != null ? formatNumber(count) : ""}{percent != null ? ` (${percent.toFixed(1)}%)` : ""}
        </span>
      </div>
      <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${Math.min(percent || 0, 100)}%`,
          background: color, borderRadius: 3, transition: "width 0.5s ease",
        }} />
      </div>
    </div>
  );
}