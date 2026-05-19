import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
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

function urgencyColor(urgency: string) {
  switch (urgency) {
    case "expired": return { bg: c.redBg, border: c.redBorder, text: c.red, label: "EXPIRED" };
    case "critical": return { bg: c.redBg, border: c.redBorder, text: c.red, label: "CRITICAL" };
    case "warning": return { bg: c.goldBg, border: c.goldBorder, text: c.gold, label: "WARNING" };
    case "safe": return { bg: c.greenBg, border: c.greenBorder, text: c.green, label: "SAFE" };
    default: return { bg: c.purpleBg, border: c.purpleBorder, text: c.purple, label: "NO DEADLINE" };
  }
}

export default function DeadlineCalculator() {
  const { isAuthenticated } = useAuth();
  const [incidentDate, setIncidentDate] = useState("");
  const [selectedAgency, setSelectedAgency] = useState<string>("");
  const agencies = trpc.enforcementIntel.listAgencies.useQuery();

  const { data: deadlines, isLoading } = trpc.enforcementIntel.calculateDeadline.useQuery(
    { incidentDate, agencyShort: selectedAgency || undefined },
    { enabled: !!incidentDate }
  );

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

  return (
    <div style={{ minHeight: "100vh", background: c.bg, color: c.paper }}>
      {/* Header */}
      <div style={{
        background: c.surface, borderBottom: `1px solid ${c.border}`,
        padding: "16px 24px", display: "flex", alignItems: "center", gap: 16,
      }}>
        <Link href="/enforcement-intel" style={{ color: c.muted, textDecoration: "none", fontSize: 13 }}>
          ← Enforcement Intel
        </Link>
        <div style={{ width: 1, height: 20, background: c.border }} />
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: c.paper }}>
            Filing Deadline Calculator
          </h1>
          <p style={{ fontSize: 12, color: c.muted, margin: "2px 0 0 0" }}>
            Compute remaining days for agency complaint filings based on incident date
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
        {/* Input Section */}
        <div style={{
          background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12,
          padding: 24, marginBottom: 24,
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontFamily: fontMono, color: c.teal, textTransform: "uppercase", marginBottom: 8 }}>
                Incident Date
              </label>
              <input
                type="date"
                value={incidentDate}
                max={today}
                onChange={e => setIncidentDate(e.target.value)}
                style={{
                  width: "100%", padding: "10px 14px", background: c.surfaceAlt,
                  border: `1px solid ${c.border}`, borderRadius: 8, color: c.paper,
                  fontSize: 14, fontFamily: fontMono, outline: "none",
                }}
              />
              <p style={{ fontSize: 11, color: c.dim, marginTop: 4 }}>
                Date of the discriminatory act, safety violation, or consumer harm
              </p>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontFamily: fontMono, color: c.teal, textTransform: "uppercase", marginBottom: 8 }}>
                Agency Filter (Optional)
              </label>
              <select
                value={selectedAgency}
                onChange={e => setSelectedAgency(e.target.value)}
                style={{
                  width: "100%", padding: "10px 14px", background: c.surfaceAlt,
                  border: `1px solid ${c.border}`, borderRadius: 8, color: c.paper,
                  fontSize: 14, outline: "none",
                }}
              >
                <option value="">All Agencies</option>
                {agencies.data && agencies.data.map((a: any) => (
                  <option key={a.id} value={a.agencyName}>{a.agencyName}</option>
                ))}
                {!agencies.data && <>
                  <option value="EEOC">EEOC</option>
                  <option value="HUD">HUD</option>
                  <option value="OSHA">OSHA</option>
                  <option value="FTC">FTC</option>
                </>}
              </select>
            </div>
          </div>
        </div>

        {/* Results */}
        {!incidentDate && (
          <div style={{
            background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12,
            padding: 48, textAlign: "center",
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⏱</div>
            <p style={{ color: c.muted, fontSize: 14 }}>
              Enter an incident date above to calculate filing deadlines across all agencies
            </p>
          </div>
        )}

        {incidentDate && isLoading && (
          <div style={{ textAlign: "center", padding: 48, color: c.muted }}>
            Calculating deadlines...
          </div>
        )}

        {deadlines && deadlines.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {deadlines.map((d, i) => {
              const uc = urgencyColor(d.urgency);
              return (
                <div key={i} style={{
                  background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12,
                  overflow: "hidden",
                }}>
                  {/* Agency Header */}
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "16px 20px", borderBottom: `1px solid ${c.border}`,
                    background: uc.bg,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{
                        background: uc.bg, border: `1px solid ${uc.border}`,
                        borderRadius: 6, padding: "4px 10px", fontSize: 12,
                        fontFamily: fontMono, fontWeight: 700, color: uc.text,
                      }}>
                        {d.agencyShort}
                      </span>
                      <span style={{ color: c.paper, fontSize: 15, fontWeight: 600 }}>
                        {d.formName}
                      </span>
                    </div>
                    <span style={{
                      background: uc.bg, border: `1px solid ${uc.border}`,
                      borderRadius: 20, padding: "4px 14px", fontSize: 11,
                      fontFamily: fontMono, fontWeight: 700, color: uc.text,
                      textTransform: "uppercase", letterSpacing: 1,
                    }}>
                      {uc.label}
                    </span>
                  </div>

                  {/* Deadline Details */}
                  <div style={{ padding: 20 }}>
                    {d.noDeadline ? (
                      <div style={{
                        background: c.purpleBg, border: `1px solid ${c.purpleBorder}`,
                        borderRadius: 8, padding: 16, textAlign: "center",
                      }}>
                        <p style={{ color: c.purple, fontSize: 14, fontWeight: 600, margin: 0 }}>
                          No Strict Filing Deadline
                        </p>
                        <p style={{ color: c.muted, fontSize: 12, margin: "6px 0 0 0" }}>
                          {d.filingDeadlineText}
                        </p>
                      </div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        {/* Primary Deadline */}
                        <div style={{
                          background: c.surfaceAlt, borderRadius: 8, padding: 16,
                          border: `1px solid ${c.border}`,
                        }}>
                          <span style={{ color: c.dim, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase" }}>
                            Primary Deadline
                          </span>
                          <div style={{ marginTop: 8 }}>
                            <span style={{
                              fontSize: 32, fontWeight: 800, fontFamily: fontMono,
                              color: d.primaryDaysRemaining !== null && d.primaryDaysRemaining < 0 ? c.red
                                : d.primaryDaysRemaining !== null && d.primaryDaysRemaining <= 30 ? c.red
                                : d.primaryDaysRemaining !== null && d.primaryDaysRemaining <= 90 ? c.gold
                                : c.green,
                            }}>
                              {d.primaryDaysRemaining !== null ? (
                                d.primaryDaysRemaining < 0 ? `${Math.abs(d.primaryDaysRemaining)}` : d.primaryDaysRemaining
                              ) : "—"}
                            </span>
                            <span style={{ color: c.muted, fontSize: 12, marginLeft: 6 }}>
                              {d.primaryDaysRemaining !== null && d.primaryDaysRemaining < 0 ? "days overdue" : "days remaining"}
                            </span>
                          </div>
                          <div style={{ marginTop: 8, fontSize: 12, color: c.muted }}>
                            <span style={{ fontFamily: fontMono }}>{d.primaryDeadlineDays}</span> days from incident
                            {d.primaryDeadlineDate && (
                              <span> · Due <span style={{ color: c.paper, fontFamily: fontMono }}>{d.primaryDeadlineDate}</span></span>
                            )}
                          </div>
                        </div>

                        {/* Extended Deadline */}
                        <div style={{
                          background: c.surfaceAlt, borderRadius: 8, padding: 16,
                          border: `1px solid ${c.border}`,
                        }}>
                          <span style={{ color: c.dim, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase" }}>
                            Extended Deadline
                          </span>
                          {d.extendedDeadlineDays ? (
                            <>
                              <div style={{ marginTop: 8 }}>
                                <span style={{
                                  fontSize: 32, fontWeight: 800, fontFamily: fontMono,
                                  color: d.extendedDaysRemaining !== null && d.extendedDaysRemaining < 0 ? c.red
                                    : d.extendedDaysRemaining !== null && d.extendedDaysRemaining <= 30 ? c.red
                                    : d.extendedDaysRemaining !== null && d.extendedDaysRemaining <= 90 ? c.gold
                                    : c.green,
                                }}>
                                  {d.extendedDaysRemaining !== null ? (
                                    d.extendedDaysRemaining < 0 ? `${Math.abs(d.extendedDaysRemaining)}` : d.extendedDaysRemaining
                                  ) : "—"}
                                </span>
                                <span style={{ color: c.muted, fontSize: 12, marginLeft: 6 }}>
                                  {d.extendedDaysRemaining !== null && d.extendedDaysRemaining < 0 ? "days overdue" : "days remaining"}
                                </span>
                              </div>
                              <div style={{ marginTop: 8, fontSize: 12, color: c.muted }}>
                                <span style={{ fontFamily: fontMono }}>{d.extendedDeadlineDays}</span> days from incident
                                {d.extendedDeadlineDate && (
                                  <span> · Due <span style={{ color: c.paper, fontFamily: fontMono }}>{d.extendedDeadlineDate}</span></span>
                                )}
                              </div>
                              {d.extendedCondition && (
                                <div style={{
                                  marginTop: 8, background: c.goldBg, border: `1px solid ${c.goldBorder}`,
                                  borderRadius: 4, padding: "4px 8px", fontSize: 11, color: c.gold,
                                }}>
                                  Condition: {d.extendedCondition}
                                </div>
                              )}
                            </>
                          ) : (
                            <div style={{ marginTop: 8, color: c.dim, fontSize: 13 }}>
                              {d.extendedCondition || "No extended deadline available"}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Timeline Bar */}
                    {!d.noDeadline && d.primaryDeadlineDays && d.primaryDaysRemaining !== null && (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: c.dim, marginBottom: 4 }}>
                          <span>Incident: {d.incidentDate}</span>
                          <span>Deadline: {d.primaryDeadlineDate}</span>
                        </div>
                        <div style={{
                          height: 8, background: c.surfaceAlt, borderRadius: 4,
                          overflow: "hidden", border: `1px solid ${c.border}`,
                        }}>
                          <div style={{
                            height: "100%",
                            width: `${Math.min(100, Math.max(0, (d.daysSinceIncident / d.primaryDeadlineDays) * 100))}%`,
                            background: d.primaryDaysRemaining < 0 ? c.red
                              : d.primaryDaysRemaining <= 30 ? `linear-gradient(90deg, ${c.gold}, ${c.red})`
                              : d.primaryDaysRemaining <= 90 ? `linear-gradient(90deg, ${c.green}, ${c.gold})`
                              : c.green,
                            borderRadius: 4,
                            transition: "width 0.5s ease",
                          }} />
                        </div>
                        <div style={{ fontSize: 10, color: c.dim, marginTop: 4, textAlign: "center" }}>
                          {d.daysSinceIncident} of {d.primaryDeadlineDays} days elapsed ({Math.round((d.daysSinceIncident / d.primaryDeadlineDays) * 100)}%)
                        </div>
                      </div>
                    )}

                    {/* Raw filing deadline text */}
                    <div style={{
                      marginTop: 12, padding: "8px 12px", background: c.surfaceAlt,
                      borderRadius: 6, border: `1px solid ${c.border}`,
                    }}>
                      <span style={{ color: c.dim, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase" }}>
                        Official Filing Deadline
                      </span>
                      <p style={{ color: c.muted, fontSize: 12, margin: "4px 0 0 0", lineHeight: 1.5 }}>
                        {d.filingDeadlineText}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Disclaimer */}
        {incidentDate && deadlines && (
          <div style={{
            marginTop: 24, padding: 16, background: c.surfaceAlt,
            border: `1px solid ${c.border}`, borderRadius: 8,
          }}>
            <p style={{ color: c.dim, fontSize: 11, margin: 0, lineHeight: 1.6 }}>
              <strong style={{ color: c.gold }}>Disclaimer:</strong> These calculations are estimates based on standard federal filing deadlines.
              Actual deadlines may vary based on state deferral agreements, tolling provisions, equitable exceptions,
              and specific circumstances. Consult with a qualified attorney for precise deadline determinations.
              Extended deadlines may apply in deferral states or under specific conditions noted above.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
