import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  Shield, Loader2, Search, X, ChevronDown, ChevronRight,
  FileText, BookOpen, DollarSign, Target, Building2,
  ExternalLink, AlertTriangle, Scale, Clock, Gavel, Timer,
} from "lucide-react";
import { Link } from "wouter";
import { LayerNavBar } from "@/components/LayerNavBar";

/* ═══════════════════════════════════════════════════════════════════════
   ENFORCEMENT INTELLIGENCE HUB
   
   Unified view of agency forms, regulatory guidance, enforcement
   penalties, and viability rules. The operational intelligence layer
   that connects legal theory to enforcement practice.
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
  amberBorder: "rgba(245,158,11,0.3)",
  green: "#34d399",
  greenBg: "rgba(52,211,153,0.06)",
  greenBorder: "rgba(52,211,153,0.25)",
  blue: "#3b82f6",
  blueBg: "rgba(59,130,246,0.06)",
  blueBorder: "rgba(59,130,246,0.25)",
};

const fontSerif = "'Playfair Display', Georgia, serif";
const fontSans = "'Inter', system-ui, sans-serif";
const fontMono = "'JetBrains Mono', 'Fira Code', monospace";

type Tab = "forms" | "guidance" | "penalties" | "viability";

const TABS: { key: Tab; label: string; icon: typeof Shield; color: string }[] = [
  { key: "forms", label: "Agency Forms", icon: FileText, color: c.teal },
  { key: "guidance", label: "Regulatory Guidance", icon: BookOpen, color: c.purple },
  { key: "penalties", label: "Enforcement Penalties", icon: DollarSign, color: c.red },
  { key: "viability", label: "Viability Rules", icon: Target, color: c.amber },
];

export default function EnforcementIntel() {
  const [tab, setTab] = useState<Tab>("forms");
  const [search, setSearch] = useState("");
  const [filterAgency, setFilterAgency] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: forms, isLoading: loadingForms } = trpc.enforcementIntel.listForms.useQuery();
  const { data: guidance, isLoading: loadingGuidance } = trpc.enforcementIntel.listGuidance.useQuery();
  const { data: penalties, isLoading: loadingPenalties } = trpc.enforcementIntel.listPenalties.useQuery();
  const { data: viability, isLoading: loadingViability } = trpc.enforcementIntel.listViabilityRules.useQuery();
  const { data: stats } = trpc.enforcementIntel.stats.useQuery();

  const isLoading = loadingForms || loadingGuidance || loadingPenalties || loadingViability;

  // Get unique agencies from current tab
  const agencies = useMemo(() => {
    const items = tab === "forms" ? forms : tab === "guidance" ? guidance : tab === "penalties" ? penalties : viability;
    if (!items) return [];
    return [...new Set(items.map((i: any) => i.agency_short))].sort();
  }, [tab, forms, guidance, penalties, viability]);

  // Filter current tab data
  const filteredData = useMemo(() => {
    const items = tab === "forms" ? forms : tab === "guidance" ? guidance : tab === "penalties" ? penalties : viability;
    if (!items) return [];
    let result = items as any[];
    if (filterAgency) result = result.filter(i => i.agency_short === filterAgency);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(i =>
        JSON.stringify(i).toLowerCase().includes(q)
      );
    }
    return result;
  }, [tab, forms, guidance, penalties, viability, filterAgency, search]);

  if (isLoading) {
    return (
      <div style={{ background: c.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <Loader2 size={32} style={{ color: c.teal, animation: "spin 1s linear infinite" }} />
          <p style={{ color: c.muted, fontFamily: fontSans, marginTop: 12 }}>Loading enforcement intelligence...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: c.bg, minHeight: "100vh", padding: "24px 32px", fontFamily: fontSans }}>
      {/* Back nav */}
      <LayerNavBar label="Enforcement Intel" route="/enforcement-intel" />
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Gavel size={22} style={{ color: c.teal }} />
          <h1 style={{ fontFamily: fontSerif, color: c.paper, fontSize: 28, margin: 0 }}>
            Enforcement Intelligence Hub
          </h1>
        </div>
        <p style={{ color: c.muted, fontSize: 14, margin: 0, maxWidth: 700 }}>
          Operational intelligence connecting legal theory to enforcement practice. Agency filing forms,
          regulatory guidance documents, penalty structures, and viability assessments for each enforcement pathway.
        </p>
        <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
          <Link href="/deadline-calculator" style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: c.amberBg, border: `1px solid ${c.amberBorder}`,
            borderRadius: 8, padding: "6px 14px", textDecoration: "none",
            color: c.amber, fontSize: 12, fontFamily: fontMono,
          }}>
            <Timer size={14} />
            Filing Deadline Calculator
          </Link>
          <Link href="/doctrine-graph" style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: c.tealBg, border: `1px solid ${c.tealBorder}`,
            borderRadius: 8, padding: "6px 14px", textDecoration: "none",
            color: c.teal, fontSize: 12, fontFamily: fontMono,
          }}>
            Doctrine Graph
          </Link>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Forms", value: stats?.forms ?? 0, color: c.teal },
          { label: "Guidance", value: stats?.guidance ?? 0, color: c.purple },
          { label: "Penalties", value: stats?.penalties ?? 0, color: c.red },
          { label: "Viability Rules", value: stats?.viability_rules ?? 0, color: c.amber },
          { label: "Doctrines", value: stats?.doctrines ?? 0, color: c.gold },
          { label: "Barriers", value: stats?.barriers ?? 0, color: c.blue },
          { label: "Signals", value: stats?.signals ?? 0, color: c.green },
        ].map(s => (
          <div key={s.label} style={{
            background: c.cardBg, border: `1px solid ${c.cardBorder}`,
            borderRadius: 8, padding: "6px 14px", display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ color: s.color, fontFamily: fontMono, fontSize: 18, fontWeight: 700 }}>{s.value}</span>
            <span style={{ color: c.muted, fontSize: 11 }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: `1px solid ${c.cardBorder}`, paddingBottom: 4 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setExpandedId(null); setFilterAgency(null); }}
            style={{
              background: tab === t.key ? t.color + "15" : "transparent",
              border: `1px solid ${tab === t.key ? t.color + "40" : "transparent"}`,
              borderRadius: "8px 8px 0 0", padding: "8px 16px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              color: tab === t.key ? t.color : c.muted, fontSize: 13,
              fontFamily: fontSans, fontWeight: tab === t.key ? 600 : 400,
              transition: "all 0.2s",
            }}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: c.cardBg, border: `1px solid ${c.cardBorder}`,
          borderRadius: 8, padding: "6px 12px", flex: "1 1 200px", maxWidth: 300,
        }}>
          <Search size={14} style={{ color: c.muted }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${TABS.find(t => t.key === tab)?.label.toLowerCase()}...`}
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

        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {agencies.map(a => (
            <button
              key={a}
              onClick={() => setFilterAgency(filterAgency === a ? null : a)}
              style={{
                background: filterAgency === a ? c.tealBg : "transparent",
                border: `1px solid ${filterAgency === a ? c.tealBorder : c.cardBorder}`,
                borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                color: filterAgency === a ? c.teal : c.muted, fontSize: 11,
                fontFamily: fontMono, transition: "all 0.2s", fontWeight: 600,
              }}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filteredData.map((item: any) => {
          const isExpanded = expandedId === item.id;
          return (
            <div
              key={item.id}
              style={{
                background: c.cardBg,
                border: `1px solid ${isExpanded ? TABS.find(t => t.key === tab)!.color + "40" : c.cardBorder}`,
                borderRadius: 10, overflow: "hidden", transition: "border-color 0.2s",
              }}
            >
              {/* Item header */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                style={{
                  width: "100%", background: "none", border: "none", cursor: "pointer",
                  padding: "14px 16px", display: "flex", alignItems: "center", gap: 12,
                  textAlign: "left",
                }}
              >
                {isExpanded ? (
                  <ChevronDown size={16} style={{ color: TABS.find(t => t.key === tab)!.color, flexShrink: 0 }} />
                ) : (
                  <ChevronRight size={16} style={{ color: c.muted, flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{
                      color: c.teal, fontSize: 10, fontFamily: fontMono, fontWeight: 700,
                      background: c.tealBg, padding: "1px 6px", borderRadius: 4,
                    }}>
                      {item.agency_short}
                    </span>
                    {item.pipeline_category && (
                      <span style={{
                        color: c.gold, fontSize: 9, fontFamily: fontMono,
                        background: c.goldBg, padding: "1px 6px", borderRadius: 4,
                      }}>
                        {item.pipeline_category}
                      </span>
                    )}
                  </div>
                  <h3 style={{ color: c.paper, fontSize: 14, margin: 0, fontWeight: 600 }}>
                    {tab === "forms" ? item.form_name :
                     tab === "guidance" ? item.document_title :
                     tab === "penalties" ? item.violation_type :
                     item.claim_type}
                  </h3>
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div style={{ padding: "0 16px 16px 44px" }}>
                  {/* Forms */}
                  {tab === "forms" && (
                    <>
                      <p style={{ color: c.paper, fontSize: 13, lineHeight: 1.6, margin: "0 0 12px 0" }}>
                        {item.purpose}
                      </p>
                      {item.form_number && (
                        <div style={{ marginBottom: 8 }}>
                          <span style={{ color: c.muted, fontSize: 10, fontFamily: fontMono }}>Form: </span>
                          <span style={{ color: c.paper, fontSize: 12, fontFamily: fontMono }}>{item.form_number}</span>
                        </div>
                      )}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                        {item.required_fields && (
                          <div style={{ background: c.tealBg, border: `1px solid ${c.tealBorder}`, borderRadius: 8, padding: 12 }}>
                            <span style={{ color: c.teal, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase" }}>Required Fields</span>
                            <ul style={{ margin: "6px 0 0 0", padding: "0 0 0 16px" }}>
                              {(item.required_fields as string[]).map((f: string, i: number) => (
                                <li key={i} style={{ color: c.paper, fontSize: 12, lineHeight: 1.6 }}>{f}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {item.supporting_documents && (
                          <div style={{ background: c.purpleBg, border: `1px solid ${c.purpleBorder}`, borderRadius: 8, padding: 12 }}>
                            <span style={{ color: c.purple, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase" }}>Supporting Documents</span>
                            <ul style={{ margin: "6px 0 0 0", padding: "0 0 0 16px" }}>
                              {(item.supporting_documents as string[]).map((d: string, i: number) => (
                                <li key={i} style={{ color: c.paper, fontSize: 12, lineHeight: 1.6 }}>{d}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                      {item.submission_methods && (
                        <div style={{ marginBottom: 12 }}>
                          <span style={{ color: c.muted, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase" }}>Submission Methods</span>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                            {(item.submission_methods as string[]).map((m: string, i: number) => (
                              <span key={i} style={{
                                background: c.cardBg, border: `1px solid ${c.cardBorder}`,
                                borderRadius: 4, padding: "3px 8px", fontSize: 11, color: c.paper,
                              }}>
                                {m}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {item.filing_deadline && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                          <Clock size={12} style={{ color: c.amber }} />
                          <span style={{ color: c.amber, fontSize: 12 }}>{item.filing_deadline}</span>
                        </div>
                      )}
                      {item.link && (
                        <a href={item.link} target="_blank" rel="noopener noreferrer" style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          color: c.blue, fontSize: 12, textDecoration: "none",
                        }}>
                          <ExternalLink size={12} /> Official filing page
                        </a>
                      )}
                    </>
                  )}

                  {/* Guidance */}
                  {tab === "guidance" && (
                    <>
                      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                        <span style={{
                          background: c.purpleBg, border: `1px solid ${c.purpleBorder}`,
                          borderRadius: 4, padding: "2px 8px", fontSize: 10, color: c.purple,
                          fontFamily: fontMono,
                        }}>
                          {item.guidance_type.replace(/_/g, " ")}
                        </span>
                        {item.publication_date && (
                          <span style={{ color: c.muted, fontSize: 11 }}>{item.publication_date}</span>
                        )}
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <span style={{ color: c.muted, fontSize: 10, fontFamily: fontMono }}>Issue Area: </span>
                        <span style={{ color: c.paper, fontSize: 13 }}>{item.issue_area}</span>
                      </div>
                      {item.authority_basis && (
                        <div style={{ marginBottom: 12 }}>
                          <span style={{ color: c.muted, fontSize: 10, fontFamily: fontMono }}>Authority: </span>
                          <span style={{ color: c.gold, fontSize: 12 }}>{item.authority_basis}</span>
                        </div>
                      )}
                      {item.key_rules && (
                        <div style={{
                          background: c.purpleBg, border: `1px solid ${c.purpleBorder}`,
                          borderRadius: 8, padding: 12, marginBottom: 12,
                        }}>
                          <span style={{ color: c.purple, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase" }}>Key Rules</span>
                          <ul style={{ margin: "6px 0 0 0", padding: "0 0 0 16px" }}>
                            {(item.key_rules as string[]).map((r: string, i: number) => (
                              <li key={i} style={{ color: c.paper, fontSize: 12, lineHeight: 1.6 }}>{r}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {item.citation && (
                        <div style={{ marginBottom: 8 }}>
                          <span style={{ color: c.muted, fontSize: 10, fontFamily: fontMono }}>Citation: </span>
                          <span style={{ color: c.paper, fontSize: 12, fontFamily: fontMono }}>{item.citation}</span>
                        </div>
                      )}
                      {item.document_link && (
                        <a href={item.document_link} target="_blank" rel="noopener noreferrer" style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          color: c.blue, fontSize: 12, textDecoration: "none",
                        }}>
                          <ExternalLink size={12} /> Visit agency website
                        </a>
                      )}
                    </>
                  )}

                  {/* Penalties */}
                  {tab === "penalties" && (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                        {item.statutory_max_penalty && (
                          <div style={{ background: c.redBg, border: `1px solid ${c.redBorder}`, borderRadius: 8, padding: 12 }}>
                            <span style={{ color: c.red, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase" }}>Max Penalty</span>
                            <p style={{ color: c.paper, fontSize: 12, margin: "6px 0 0 0", lineHeight: 1.4 }}>{item.statutory_max_penalty}</p>
                          </div>
                        )}
                        {item.average_penalty && (
                          <div style={{ background: c.amberBg, border: `1px solid ${c.amberBorder}`, borderRadius: 8, padding: 12 }}>
                            <span style={{ color: c.amber, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase" }}>Average</span>
                            <p style={{ color: c.paper, fontSize: 12, margin: "6px 0 0 0", lineHeight: 1.4 }}>{item.average_penalty}</p>
                          </div>
                        )}
                        {item.typical_settlement_range && (
                          <div style={{ background: c.greenBg, border: `1px solid ${c.greenBorder}`, borderRadius: 8, padding: 12 }}>
                            <span style={{ color: c.green, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase" }}>Settlement Range</span>
                            <p style={{ color: c.paper, fontSize: 12, margin: "6px 0 0 0", lineHeight: 1.4 }}>{item.typical_settlement_range}</p>
                          </div>
                        )}
                      </div>
                      {item.additional_remedies && (
                        <div style={{ marginBottom: 12 }}>
                          <span style={{ color: c.muted, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase" }}>Additional Remedies</span>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                            {(item.additional_remedies as string[]).map((r: string, i: number) => (
                              <span key={i} style={{
                                background: c.blueBg, border: `1px solid ${c.blueBorder}`,
                                borderRadius: 4, padding: "2px 8px", fontSize: 11, color: c.blue,
                              }}>
                                {r}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {item.notable_cases && (item.notable_cases as string[]).length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <span style={{ color: c.muted, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase" }}>Notable Cases</span>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                            {(item.notable_cases as string[]).map((nc: string, i: number) => (
                              <div key={i} style={{
                                background: "rgba(255,255,255,0.02)", borderRadius: 6, padding: "6px 10px",
                                display: "flex", alignItems: "center", gap: 6,
                              }}>
                                <Scale size={12} style={{ color: c.gold, flexShrink: 0 }} />
                                <span style={{ color: c.paper, fontSize: 12 }}>{nc}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {item.notes && (
                        <p style={{ color: c.muted, fontSize: 12, lineHeight: 1.5, margin: 0, fontStyle: "italic" }}>
                          {item.notes}
                        </p>
                      )}
                    </>
                  )}

                  {/* Viability */}
                  {tab === "viability" && (
                    <>
                      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                        <span style={{
                          background: c.amberBg, border: `1px solid ${c.amberBorder}`,
                          borderRadius: 4, padding: "2px 8px", fontSize: 10, color: c.amber,
                          fontFamily: fontMono,
                        }}>
                          Trigger: {item.trigger_strength}
                        </span>
                        <span style={{
                          background: c.tealBg, border: `1px solid ${c.tealBorder}`,
                          borderRadius: 4, padding: "2px 8px", fontSize: 10, color: c.teal,
                          fontFamily: fontMono,
                        }}>
                          Actionability: {item.historical_actionability}
                        </span>
                        <span style={{
                          background: c.blueBg, border: `1px solid ${c.blueBorder}`,
                          borderRadius: 4, padding: "2px 8px", fontSize: 10, color: c.blue,
                          fontFamily: fontMono,
                        }}>
                          {item.jurisdiction}
                        </span>
                      </div>
                      {item.minimum_intake_threshold && (
                        <div style={{
                          background: c.tealBg, border: `1px solid ${c.tealBorder}`,
                          borderRadius: 8, padding: 12, marginBottom: 12,
                        }}>
                          <span style={{ color: c.teal, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase" }}>Minimum Intake Threshold</span>
                          <p style={{ color: c.paper, fontSize: 12, margin: "6px 0 0 0", lineHeight: 1.5 }}>{item.minimum_intake_threshold}</p>
                        </div>
                      )}
                      {item.deadline_dependency && (
                        <div style={{
                          display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 12,
                        }}>
                          <Clock size={14} style={{ color: c.amber, marginTop: 2, flexShrink: 0 }} />
                          <div>
                            <span style={{ color: c.amber, fontSize: 10, fontFamily: fontMono, textTransform: "uppercase" }}>Deadline</span>
                            <p style={{ color: c.paper, fontSize: 12, margin: "4px 0 0 0", lineHeight: 1.5 }}>{item.deadline_dependency}</p>
                          </div>
                        </div>
                      )}
                      {item.recommended_channel && (
                        <div style={{ marginBottom: 12 }}>
                          <span style={{ color: c.muted, fontSize: 10, fontFamily: fontMono }}>Recommended Channel: </span>
                          <span style={{ color: c.green, fontSize: 12 }}>{item.recommended_channel}</span>
                        </div>
                      )}
                      {item.notes && (
                        <p style={{ color: c.muted, fontSize: 12, lineHeight: 1.5, margin: 0, fontStyle: "italic" }}>
                          {item.notes}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredData.length === 0 && (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Shield size={40} style={{ color: c.muted, marginBottom: 12 }} />
          <p style={{ color: c.muted, fontSize: 14 }}>No records match your search criteria.</p>
        </div>
      )}
    </div>
  );
}
