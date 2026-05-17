import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { CommitToCase } from "@/components/CommitToCase";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Library,
  Search,
  BookOpen,
  Scale,
  Shield,
  FileText,
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  Plus,
  X,
  Loader2,
  Filter,
  ExternalLink,
  Gavel,
  Eye,
  Clock,
  Tag,
  Send,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════
   LEGAL LIBRARY — The Law Belongs to Everyone
   
   Pure legal information. Statutes, regulations, case law, enforcement
   records, and systemic contradictions — organized by jurisdiction and
   domain. No advice. No conclusions. Just the law, made accessible.
   ═══════════════════════════════════════════════════════════════════════ */

const ll = {
  bg: "#0c0f14",
  paper: "#f0ece4",
  muted: "rgba(240,236,228,0.55)",
  cardBg: "rgba(255,255,255,0.03)",
  cardBorder: "rgba(255,255,255,0.08)",
  purple: "#a855f7",
  purpleBg: "rgba(168,85,247,0.08)",
  purpleBorder: "rgba(168,85,247,0.25)",
  gold: "#D4A017",
  goldBorder: "rgba(212,160,23,0.3)",
  teal: "#0e7490",
  red: "#ef4444",
  amber: "#f59e0b",
  blue: "#3b82f6",
};

const fontSerif = "'Playfair Display', Georgia, serif";
const fontSans = "'Inter', system-ui, sans-serif";
const fontMono = "'JetBrains Mono', 'Fira Code', monospace";

const DOMAINS = [
  "housing", "employment", "wages", "insurance", "benefits", "civil_rights",
  "family", "consumer", "foia", "healthcare", "education", "immigration",
  "criminal_justice", "environmental", "disability", "tribal", "utilities",
  "tax", "voting", "other",
] as const;

const DOMAIN_LABELS: Record<string, string> = {
  housing: "Housing", employment: "Employment", wages: "Wages & Labor",
  insurance: "Insurance", benefits: "Public Benefits", civil_rights: "Civil Rights",
  family: "Family Law", consumer: "Consumer Protection", foia: "FOIA / Public Records",
  healthcare: "Healthcare", education: "Education", immigration: "Immigration",
  criminal_justice: "Criminal Justice", environmental: "Environmental",
  disability: "Disability Rights", tribal: "Tribal Law", utilities: "Utilities",
  tax: "Tax", voting: "Voting Rights", other: "Other",
};

const DOMAIN_COLORS: Record<string, string> = {
  housing: "#f59e0b", employment: "#3b82f6", wages: "#10b981", insurance: "#8b5cf6",
  benefits: "#06b6d4", civil_rights: "#ef4444", family: "#ec4899", consumer: "#f97316",
  foia: "#14b8a6", healthcare: "#6366f1", education: "#84cc16", immigration: "#a855f7",
  criminal_justice: "#dc2626", environmental: "#22c55e", disability: "#0ea5e9",
  tribal: "#d97706", utilities: "#64748b", tax: "#475569", voting: "#7c3aed", other: "#6b7280",
};

export default function LegalLibrary() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDomain, setSelectedDomain] = useState<string>("");
  const [selectedJurisdiction, setSelectedJurisdiction] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"statutes" | "case_law" | "enforcement" | "contradictions">("statutes");

  // Fetch stats
  const statsQuery = trpc.legalLibrary.stats.useQuery();
  const stats = statsQuery.data;

  // Search statutes
  const searchStatutes = trpc.legalLibrary.searchStatutes.useQuery(
    {
      query: searchQuery || undefined,
      domain: selectedDomain || undefined,
      jurisdiction: selectedJurisdiction || undefined,
    },
    { enabled: activeTab === "statutes" }
  );

  // Search case law
  const searchCaseLaw = trpc.legalLibrary.searchCaseLaw.useQuery(
    {
      query: searchQuery || undefined,
      domain: selectedDomain || undefined,
      jurisdiction: selectedJurisdiction || undefined,
    },
    { enabled: activeTab === "case_law" }
  );

  // List contradictions
  const contradictions = trpc.legalLibrary.listContradictions.useQuery(
    { domain: selectedDomain || undefined },
    { enabled: activeTab === "contradictions" }
  );

  // List enforcement records
  const enforcement = trpc.legalLibrary.searchEnforcement.useQuery(
    {
      domain: selectedDomain || undefined,
      jurisdiction: selectedJurisdiction || undefined,
    },
    { enabled: activeTab === "enforcement" }
  );

  const tabs = [
    { key: "statutes" as const, label: "Statutes & Regulations", icon: BookOpen, count: stats?.statutes || 0 },
    { key: "case_law" as const, label: "Case Law", icon: Gavel, count: stats?.caseLaw || 0 },
    { key: "enforcement" as const, label: "Enforcement Records", icon: Shield, count: stats?.enforcementRecords || 0 },
    { key: "contradictions" as const, label: "Systemic Contradictions", icon: AlertTriangle, count: stats?.contradictions || 0 },
  ];

  return (
    <div style={{ minHeight: "100vh", background: ll.bg, color: ll.paper }}>
      {/* Header */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 24px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <button
            onClick={() => navigate("/lighthouse")}
            style={{
              background: "none", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              fontFamily: fontMono, fontSize: 11, color: ll.muted,
            }}
          >
            <ChevronRight size={12} style={{ transform: "rotate(180deg)" }} /> Back to Lighthouse
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => navigate("/architecture")}
              style={{
                background: "none", border: `1px solid ${ll.purpleBorder}`, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 5,
                fontFamily: fontMono, fontSize: 11, color: ll.purple,
                padding: "4px 10px", borderRadius: 6,
              }}
            >
              ← Architecture Map
            </button>
            <button
              onClick={() => navigate("/workshop?from=Legal+Library&layer=%2Flegal-library")}
              style={{
                background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 5,
                fontFamily: fontMono, fontSize: 11, color: "#10b981",
                padding: "4px 10px", borderRadius: 6,
              }}
            >
              ⚒ Open in Workshop
            </button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: ll.purpleBg, border: `1px solid ${ll.purpleBorder}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Library size={24} color={ll.purple} />
          </div>
          <div>
            <h1 style={{ fontFamily: fontSerif, fontSize: 28, fontWeight: 700, color: ll.paper, lineHeight: 1.2 }}>
              Legal Library
            </h1>
            <p style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: ll.purple }}>
              The law belongs to everyone
            </p>
          </div>
        </div>

        <p style={{ fontFamily: fontSans, fontSize: 14, color: ll.muted, lineHeight: 1.7, maxWidth: 700, marginBottom: 8 }}>
          Statutes, regulations, case law, and enforcement records — organized by jurisdiction and domain. 
          This is legal information, not legal advice. For guidance specific to your situation, consult with a licensed attorney.
        </p>

        {/* Civil Gideon link */}
        <button
          onClick={() => navigate("/civil-gideon")}
          style={{
            background: "rgba(239,68,68,0.08)", border: `1px solid rgba(239,68,68,0.25)`,
            borderRadius: 6, padding: "8px 16px", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 8, marginBottom: 32,
          }}
        >
          <Scale size={14} color="#ef4444" />
          <span style={{ fontFamily: fontSans, fontSize: 12, color: "#fca5a5" }}>
            Why can't everyone access legal help? Read about the Civil Right to Counsel movement
          </span>
          <ArrowRight size={12} color="#ef4444" />
        </button>

        {/* Stats bar */}
        {stats && (
          <div style={{
            display: "flex", gap: 24, marginBottom: 24, flexWrap: "wrap",
            padding: "12px 20px", background: ll.cardBg, border: `1px solid ${ll.cardBorder}`,
            borderRadius: 8,
          }}>
            {[
              { label: "Statutes", value: stats.statutes, color: ll.purple },
              { label: "Case Law", value: stats.caseLaw, color: ll.gold },
              { label: "Enforcement", value: stats.enforcementRecords, color: ll.teal },
              { label: "Contradictions", value: stats.contradictions, color: ll.red },
              { label: "Weak Joints", value: stats.weakJoints, color: ll.amber },
            ].map((s) => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: fontMono, fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</span>
                <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: ll.muted }}>{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Search and filters */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 250 }}>
            <Search size={14} color={ll.muted} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search statutes, case law, regulations..."
              style={{
                width: "100%", background: "rgba(255,255,255,0.05)",
                border: `1px solid ${ll.cardBorder}`, borderRadius: 6,
                padding: "10px 12px 10px 36px", color: ll.paper,
                fontFamily: fontSans, fontSize: 13,
              }}
            />
          </div>
          <select
            value={selectedDomain}
            onChange={(e) => setSelectedDomain(e.target.value)}
            style={{
              background: "rgba(255,255,255,0.05)", border: `1px solid ${ll.cardBorder}`,
              borderRadius: 6, padding: "8px 12px", color: ll.paper,
              fontFamily: fontSans, fontSize: 13, minWidth: 160,
            }}
          >
            <option value="" style={{ background: ll.bg }}>All Domains</option>
            {DOMAINS.map((d) => (
              <option key={d} value={d} style={{ background: ll.bg }}>{DOMAIN_LABELS[d]}</option>
            ))}
          </select>
          <input
            type="text"
            value={selectedJurisdiction}
            onChange={(e) => setSelectedJurisdiction(e.target.value.toUpperCase())}
            placeholder="State (e.g. OR)"
            maxLength={2}
            style={{
              background: "rgba(255,255,255,0.05)", border: `1px solid ${ll.cardBorder}`,
              borderRadius: 6, padding: "8px 12px", color: ll.paper,
              fontFamily: fontSans, fontSize: 13, width: 100, textAlign: "center",
            }}
          />
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: `1px solid ${ll.cardBorder}`, paddingBottom: 0 }}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  background: active ? ll.purpleBg : "transparent",
                  border: "none",
                  borderBottom: active ? `2px solid ${ll.purple}` : "2px solid transparent",
                  padding: "10px 16px",
                  cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 8,
                  color: active ? ll.purple : ll.muted,
                  fontFamily: fontMono, fontSize: 11,
                  transition: "all 0.2s",
                }}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
                <span style={{
                  background: active ? "rgba(168,85,247,0.2)" : "rgba(255,255,255,0.06)",
                  borderRadius: 10, padding: "1px 8px", fontSize: 10,
                }}>{tab.count}</span>
              </button>
            );
          })}
        </div>

        {/* Content area */}
        <div style={{ minHeight: 400, paddingBottom: 80 }}>
          {/* Statutes tab */}
          {activeTab === "statutes" && (
            <div>
              {searchStatutes.isLoading && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 24, color: ll.muted }}>
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Searching statutes...
                </div>
              )}
              {searchStatutes.data && searchStatutes.data.length === 0 && (
                <EmptyState
                  title="No statutes found"
                  description={stats?.statutes === 0
                    ? "The Legal Library is being built. Statutes will be added as the registry grows. In the meantime, explore the state-by-state Critical Alerts in the Lighthouse."
                    : "Try adjusting your search terms or filters."}
                  icon={BookOpen}
                />
              )}
              {searchStatutes.data?.map((s: any) => (
                <StatuteCard key={s.id} statute={s} navigate={navigate} />
              ))}
            </div>
          )}

          {/* Case Law tab */}
          {activeTab === "case_law" && (
            <div>
              {searchCaseLaw.isLoading && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 24, color: ll.muted }}>
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Searching case law...
                </div>
              )}
              {searchCaseLaw.data && searchCaseLaw.data.length === 0 && (
                <EmptyState
                  title="No case law found"
                  description={stats?.caseLaw === 0
                    ? "Case law entries will be added as the Legal Library grows. Key holdings from landmark cases affecting benefits, housing, and civil rights will be documented here."
                    : "Try adjusting your search terms or filters."}
                  icon={Gavel}
                />
              )}
              {searchCaseLaw.data?.map((c: any) => (
                <CaseLawCard key={c.id} caseLaw={c} navigate={navigate} />
              ))}
            </div>
          )}

          {/* Enforcement tab */}
          {activeTab === "enforcement" && (
            <div>
              {enforcement.isLoading && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 24, color: ll.muted }}>
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Loading enforcement records...
                </div>
              )}
              {enforcement.data && enforcement.data.length === 0 && (
                <EmptyState
                  title="No enforcement records found"
                  description={stats?.enforcementRecords === 0
                    ? "Enforcement records document how agencies actually respond to complaints — response times, outcomes, and patterns. This data will be populated as the system processes real-world interactions."
                    : "Try adjusting your jurisdiction filter."}
                  icon={Shield}
                />
              )}
              {enforcement.data?.map((e: any) => (
                <EnforcementCard key={e.id} record={e} />
              ))}
            </div>
          )}

          {/* Contradictions tab */}
          {activeTab === "contradictions" && (
            <div>
              {contradictions.isLoading && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 24, color: ll.muted }}>
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Loading contradictions...
                </div>
              )}
              {contradictions.data && contradictions.data.length === 0 && (
                <EmptyState
                  title="No systemic contradictions documented yet"
                  description="Systemic contradictions are documented inconsistencies between legal doctrines — where the law's own rules disagree with each other. These are being cataloged as the Legal Library grows."
                  icon={AlertTriangle}
                  extra={
                    <button
                      onClick={() => navigate("/civil-gideon")}
                      style={{
                        background: "rgba(239,68,68,0.1)", border: `1px solid rgba(239,68,68,0.3)`,
                        borderRadius: 6, padding: "10px 20px", cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 8, marginTop: 16,
                      }}
                    >
                      <Scale size={14} color="#ef4444" />
                      <span style={{ fontFamily: fontSans, fontSize: 13, color: "#fca5a5" }}>
                        Read about the systemic contradictions in the Civil Gideon report
                      </span>
                    </button>
                  }
                />
              )}
              {contradictions.data?.map((c: any) => (
                <ContradictionCard key={c.id} contradiction={c} />
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function EmptyState({ title, description, icon: Icon, extra }: { title: string; description: string; icon: any; extra?: React.ReactNode }) {
  return (
    <div style={{
      background: ll.cardBg, border: `1px solid ${ll.cardBorder}`,
      borderRadius: 10, padding: "48px 32px", textAlign: "center",
    }}>
      <Icon size={32} color={ll.muted} style={{ marginBottom: 16 }} />
      <h3 style={{ fontFamily: fontSerif, fontSize: 18, color: ll.paper, marginBottom: 8 }}>{title}</h3>
      <p style={{ fontFamily: fontSans, fontSize: 13, color: ll.muted, lineHeight: 1.6, maxWidth: 500, margin: "0 auto" }}>{description}</p>
      {extra}
    </div>
  );
}

function StatuteCard({ statute, navigate }: { statute: any; navigate: (path: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const domains = Array.isArray(statute.domains) ? statute.domains : (typeof statute.domains === "string" ? (() => { try { const p = JSON.parse(statute.domains); return Array.isArray(p) ? p : []; } catch { return []; } })() : []);
  return (
    <div style={{
      background: ll.cardBg, border: `1px solid ${ll.cardBorder}`,
      borderRadius: 8, padding: "16px 20px", marginBottom: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontFamily: fontMono, fontSize: 12, fontWeight: 600, color: ll.purple }}>{statute.citation}</span>
            <span style={{ fontFamily: fontMono, fontSize: 10, color: ll.muted }}>{statute.jurisdiction}</span>
            {statute.effectiveDate && (
              <span style={{ fontFamily: fontMono, fontSize: 10, color: ll.muted }}>
                <Clock size={10} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} />
                {new Date(statute.effectiveDate).toLocaleDateString()}
              </span>
            )}
          </div>
          <h4 style={{ fontFamily: fontSans, fontSize: 14, fontWeight: 600, color: ll.paper, marginBottom: 4 }}>{statute.title}</h4>
          {domains.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
              {domains.map((d: string) => (
                <span key={d} style={{
                  background: `${DOMAIN_COLORS[d] || "#6b7280"}15`,
                  border: `1px solid ${DOMAIN_COLORS[d] || "#6b7280"}40`,
                  borderRadius: 4, padding: "1px 8px",
                  fontFamily: fontMono, fontSize: 9, color: DOMAIN_COLORS[d] || "#6b7280",
                }}>{DOMAIN_LABELS[d] || d}</span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
        >
          <ChevronDown size={16} color={ll.muted} style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
        </button>
      </div>
      {expanded && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${ll.cardBorder}`, paddingTop: 12 }}>
          {/* Summary */}
          {statute.summary && (
            <div style={{ marginBottom: 10 }}>
              <span style={{ fontFamily: fontMono, fontSize: 9, color: ll.teal, textTransform: "uppercase", letterSpacing: "0.1em" }}>Summary</span>
              <p style={{ fontFamily: fontSans, fontSize: 13, color: ll.paper, lineHeight: 1.6, marginTop: 4 }}>{statute.summary}</p>
            </div>
          )}
          {/* Key Provisions (verbatim statutory language) */}
          {statute.keyProvisions && (() => {
            let provisions: any[] = [];
            try {
              const parsed = typeof statute.keyProvisions === "string" ? JSON.parse(statute.keyProvisions) : statute.keyProvisions;
              provisions = Array.isArray(parsed) ? parsed : [];
            } catch { provisions = []; }
            return provisions.length > 0 ? (
              <div style={{ marginBottom: 10 }}>
                <span style={{ fontFamily: fontMono, fontSize: 9, color: "#a855f7", textTransform: "uppercase", letterSpacing: "0.1em" }}>Key Provisions (Verbatim)</span>
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                  {provisions.map((prov: any, i: number) => (
                    <div key={i} style={{
                      padding: "10px 14px", borderRadius: 6,
                      borderLeft: `3px solid ${ll.purple}`,
                      background: "rgba(168,85,247,0.04)",
                    }}>
                      {typeof prov === "string" ? (
                        <p style={{ fontFamily: fontMono, fontSize: 12, color: ll.paper, lineHeight: 1.6 }}>{prov}</p>
                      ) : (
                        <>
                          {prov.section && <span style={{ fontFamily: fontMono, fontSize: 10, color: ll.purple, display: "block", marginBottom: 4 }}>{prov.section}</span>}
                          <p style={{ fontFamily: fontMono, fontSize: 12, color: ll.paper, lineHeight: 1.6 }}>{prov.text || prov.provision || JSON.stringify(prov)}</p>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null;
          })()}
          {statute.keyRequirements && (
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontFamily: fontMono, fontSize: 9, color: ll.gold, textTransform: "uppercase", letterSpacing: "0.1em" }}>Key Requirements</span>
              <p style={{ fontFamily: fontSans, fontSize: 13, color: ll.paper, lineHeight: 1.6, marginTop: 4 }}>{statute.keyRequirements}</p>
            </div>
          )}
          {statute.deadlines && (
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontFamily: fontMono, fontSize: 9, color: ll.red, textTransform: "uppercase", letterSpacing: "0.1em" }}>Deadlines</span>
              <p style={{ fontFamily: fontSans, fontSize: 13, color: "#fca5a5", lineHeight: 1.6, marginTop: 4 }}>{statute.deadlines}</p>
            </div>
          )}
          {statute.fullText && (
            <div style={{ marginTop: 8, marginBottom: 8 }}>
              <span style={{ fontFamily: fontMono, fontSize: 9, color: ll.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Statutory Text</span>
              <div style={{
                fontFamily: fontMono, fontSize: 12, color: ll.muted, lineHeight: 1.7,
                marginTop: 4, padding: "12px 16px",
                background: "rgba(255,255,255,0.02)", borderRadius: 6,
                maxHeight: 300, overflow: "auto",
                whiteSpace: "pre-wrap",
              }}>
                {statute.fullText}
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button
              onClick={() => navigate(`/lumensend?type=appeal&context=${encodeURIComponent(statute.citation)}`)}
              style={{
                background: "rgba(52,211,153,0.1)", border: `1px solid rgba(52,211,153,0.3)`,
                borderRadius: 4, padding: "6px 12px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
                fontFamily: fontMono, fontSize: 10, color: "#34d399",
              }}
            >
              <Send size={10} /> Cite in LumenSend
            </button>
            <CommitToCase type="statute" itemId={statute.id} label="Attach to Case" size="sm" />
          </div>
        </div>
      )}
    </div>
  );
}

function CaseLawCard({ caseLaw, navigate }: { caseLaw: any; navigate: (path: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  // Parse statutesInterpreted
  const statutes: string[] = (() => {
    if (!caseLaw.statutesInterpreted) return [];
    try {
      const parsed = typeof caseLaw.statutesInterpreted === "string" ? JSON.parse(caseLaw.statutesInterpreted) : caseLaw.statutesInterpreted;
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  })();

  // Parse domains
  const domains: string[] = (() => {
    if (!caseLaw.domains) return [];
    try {
      const parsed = typeof caseLaw.domains === "string" ? JSON.parse(caseLaw.domains) : caseLaw.domains;
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  })();

  // Parse keyQuotes (may be JSON array of objects or a plain string)
  const quotes: Array<{ quote: string; page?: string; significance?: string; context?: string }> = (() => {
    if (!caseLaw.keyQuotes) return [];
    try {
      const parsed = typeof caseLaw.keyQuotes === "string" ? JSON.parse(caseLaw.keyQuotes) : caseLaw.keyQuotes;
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch { return []; }
  })();
  const hasStructuredQuotes = quotes.length > 0;

  // Derive claim types from domains (what claims this case supports)
  const DOMAIN_CLAIM_MAP: Record<string, string[]> = {
    benefits: ["SSDI Appeal", "SSI Denial", "Medicaid Termination", "Benefits Denial"],
    housing: ["Eviction Defense", "Housing Discrimination", "Fair Housing Act"],
    employment: ["Employment Discrimination", "Wrongful Termination", "FMLA Violation"],
    wages: ["Wage Theft", "Minimum Wage Violation", "Overtime Denial"],
    civil_rights: ["42 USC § 1983 Civil Rights", "Equal Protection", "Due Process"],
    family: ["Parental Rights", "Child Custody", "Termination of Parental Rights"],
    criminal_justice: ["Police Accountability", "Excessive Force", "False Arrest"],
    consumer: ["Predatory Lending", "Debt Collection Abuse", "Consumer Fraud"],
    healthcare: ["Medical Denial", "Disability Discrimination", "ADA Violation"],
    foia: ["FOIA Request", "Public Records Access"],
    disability: ["ADA Accommodation", "Disability Discrimination", "SSI/SSDI"],
  };
  const relatedClaims = domains.flatMap(d => DOMAIN_CLAIM_MAP[d] || []).slice(0, 4);

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        background: expanded ? "rgba(212,160,23,0.04)" : ll.cardBg,
        border: `1px solid ${expanded ? ll.goldBorder : ll.cardBorder}`,
        borderRadius: 8, padding: "16px 20px", marginBottom: 8,
        cursor: "pointer", transition: "all 0.15s ease",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = ll.goldBorder; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = expanded ? ll.goldBorder : ll.cardBorder; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ fontFamily: fontMono, fontSize: 12, fontWeight: 600, color: ll.gold }}>{caseLaw.citation}</span>
            {caseLaw.court && <span style={{ fontFamily: fontMono, fontSize: 10, color: ll.muted }}>{caseLaw.court}</span>}
            {caseLaw.jurisdiction && (
              <span style={{
                fontFamily: fontMono, fontSize: 9, padding: "1px 7px", borderRadius: 4,
                background: "rgba(14,116,144,0.1)", border: "1px solid rgba(14,116,144,0.25)", color: ll.teal,
              }}>{caseLaw.jurisdiction}</span>
            )}
            {caseLaw.yearDecided && <span style={{ fontFamily: fontMono, fontSize: 10, color: ll.muted }}>({caseLaw.yearDecided})</span>}
          </div>
          <h4 style={{ fontFamily: fontSans, fontSize: 14, fontWeight: 600, color: ll.paper, marginBottom: 4 }}>{caseLaw.caseName}</h4>
          {/* Domain badges */}
          {domains.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
              {domains.map((d: string) => (
                <span key={d} style={{
                  background: `${DOMAIN_COLORS[d] || "#6b7280"}15`,
                  border: `1px solid ${DOMAIN_COLORS[d] || "#6b7280"}40`,
                  borderRadius: 4, padding: "1px 8px",
                  fontFamily: fontMono, fontSize: 9, color: DOMAIN_COLORS[d] || "#6b7280",
                }}>{DOMAIN_LABELS[d] || d}</span>
              ))}
            </div>
          )}
          {/* Statutes interpreted badges (visible even when collapsed) */}
          {statutes.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
              {statutes.map((s: string, i: number) => (
                <span key={i} style={{
                  background: "rgba(168,85,247,0.08)", border: `1px solid rgba(168,85,247,0.25)`,
                  borderRadius: 4, padding: "1px 8px",
                  fontFamily: fontMono, fontSize: 9, color: ll.purple,
                }}>{s}</span>
              ))}
            </div>
          )}
        </div>
        <ChevronDown size={16} color={ll.muted} style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s", flexShrink: 0, marginLeft: 8 }} />
      </div>
      {expanded && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${ll.cardBorder}`, paddingTop: 12 }} onClick={e => e.stopPropagation()}>
          {/* Holding — the doctrine */}
          {caseLaw.holding && (
            <div style={{ marginBottom: 12, padding: "12px 16px", background: "rgba(212,160,23,0.06)", borderRadius: 6, borderLeft: `3px solid ${ll.gold}` }}>
              <span style={{ fontFamily: fontMono, fontSize: 9, color: ll.gold, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>Holding / Doctrine</span>
              <p style={{ fontFamily: fontSans, fontSize: 13, color: ll.paper, lineHeight: 1.7, margin: 0 }}>{caseLaw.holding}</p>
            </div>
          )}
          {/* Structured key quotes */}
          {hasStructuredQuotes ? (
            <div style={{ marginBottom: 10 }}>
              <span style={{ fontFamily: fontMono, fontSize: 9, color: ll.purple, textTransform: "uppercase", letterSpacing: "0.1em" }}>Key Quotes</span>
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 8 }}>
                {quotes.map((q, i) => (
                  <div key={i} style={{
                    borderLeft: `3px solid ${ll.gold}`, background: "rgba(212,160,23,0.04)",
                    padding: "10px 14px", borderRadius: "0 6px 6px 0",
                  }}>
                    <p style={{ fontFamily: fontSerif, fontSize: 13, fontStyle: "italic", color: ll.paper, lineHeight: 1.7 }}>
                      "{q.quote}"
                    </p>
                    <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                      {q.page && <span style={{ fontFamily: fontMono, fontSize: 9, color: ll.muted }}>p. {q.page}</span>}
                      {(q.significance || q.context) && (
                        <span style={{ fontFamily: fontSans, fontSize: 10, color: ll.muted }}>{q.significance || q.context}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : caseLaw.keyQuotes ? (
            <div style={{ marginBottom: 10 }}>
              <span style={{ fontFamily: fontMono, fontSize: 9, color: ll.purple, textTransform: "uppercase", letterSpacing: "0.1em" }}>Key Quotes</span>
              <div style={{
                fontFamily: fontSerif, fontSize: 13, fontStyle: "italic", color: ll.muted,
                lineHeight: 1.7, marginTop: 4, padding: "12px 16px",
                borderLeft: `3px solid ${ll.gold}`, background: "rgba(212,160,23,0.04)",
              }}>
                {caseLaw.keyQuotes}
              </div>
            </div>
          ) : null}
          {caseLaw.subsequentHistory && (
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontFamily: fontMono, fontSize: 9, color: ll.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Subsequent History</span>
              <p style={{ fontFamily: fontSans, fontSize: 12, color: ll.muted, lineHeight: 1.5, marginTop: 4 }}>{caseLaw.subsequentHistory}</p>
            </div>
          )}
          {/* Statutes interpreted - detailed view */}
          {statutes.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <span style={{ fontFamily: fontMono, fontSize: 9, color: ll.teal, textTransform: "uppercase", letterSpacing: "0.1em" }}>Statutes Interpreted</span>
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                {statutes.map((s: string, i: number) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 10px", borderRadius: 4,
                    background: "rgba(14,116,144,0.06)", border: `1px solid rgba(14,116,144,0.15)`,
                  }}>
                    <Scale size={10} color={ll.teal} />
                    <span style={{ fontFamily: fontMono, fontSize: 11, color: ll.paper }}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Related claim types this case supports */}
          {relatedClaims.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <span style={{ fontFamily: fontMono, fontSize: 9, color: ll.amber, textTransform: "uppercase", letterSpacing: "0.1em" }}>Supports These Claim Types</span>
              <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {relatedClaims.map((claim, i) => (
                  <span key={i} style={{
                    background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
                    borderRadius: 4, padding: "3px 10px",
                    fontFamily: fontMono, fontSize: 10, color: ll.amber,
                  }}>{claim}</span>
                ))}
              </div>
            </div>
          )}
          {/* Action paths */}
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <button
              onClick={() => navigate(`/lumensend?type=appeal&context=${encodeURIComponent(caseLaw.citation + " — " + caseLaw.caseName)}`)}
              style={{
                background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.3)",
                borderRadius: 4, padding: "6px 12px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
                fontFamily: fontMono, fontSize: 10, color: "#34d399",
              }}
            >
              <Send size={10} /> Cite in LumenSend
            </button>
            <CommitToCase type="statute" itemId={caseLaw.id} label="Attach to Case" size="sm" />
            {caseLaw.sourceUrl && (
              <a
                href={caseLaw.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{
                  background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)",
                  borderRadius: 4, padding: "6px 12px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                  fontFamily: fontMono, fontSize: 10, color: ll.blue,
                  textDecoration: "none",
                }}
              >
                <ExternalLink size={10} /> Full Opinion
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EnforcementCard({ record }: { record: any }) {
  const [expanded, setExpanded] = useState(false);

  const AGENCY_CONTACT: Record<string, { url: string; phone?: string; address?: string }> = {
    "HUD": { url: "https://www.hud.gov/program_offices/fair_housing_equal_opp/online-complaint", phone: "1-800-669-9777", address: "451 7th St SW, Washington, DC 20410" },
    "EEOC": { url: "https://publicportal.eeoc.gov/Portal/Login.aspx", phone: "1-800-669-4000", address: "131 M Street NE, Washington, DC 20507" },
    "DOL": { url: "https://www.dol.gov/agencies/whd/contact/complaints", phone: "1-866-487-9243", address: "200 Constitution Ave NW, Washington, DC 20210" },
    "NLRB": { url: "https://www.nlrb.gov/about-nlrb/what-we-do/file-a-case", phone: "1-844-762-6572", address: "1015 Half Street SE, Washington, DC 20570" },
    "CFPB": { url: "https://www.consumerfinance.gov/complaint/", phone: "1-855-411-2372", address: "1700 G Street NW, Washington, DC 20552" },
    "SSA": { url: "https://www.ssa.gov/agency/contact/", phone: "1-800-772-1213", address: "6401 Security Blvd, Baltimore, MD 21235" },
    "CMS": { url: "https://www.cms.gov/about-cms/contact-cms", phone: "1-800-633-4227", address: "7500 Security Blvd, Baltimore, MD 21244" },
  };
  const agencyKey = Object.keys(AGENCY_CONTACT).find(k => record.agency?.includes(k));
  const agencyInfo = agencyKey ? AGENCY_CONTACT[agencyKey] : null;

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        background: expanded ? "rgba(14,116,144,0.04)" : ll.cardBg,
        border: `1px solid ${expanded ? "rgba(14,116,144,0.3)" : ll.cardBorder}`,
        borderRadius: 8, padding: "16px 20px", marginBottom: 8,
        cursor: "pointer", transition: "all 0.15s ease",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(14,116,144,0.3)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = expanded ? "rgba(14,116,144,0.3)" : ll.cardBorder; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Shield size={14} color={ll.teal} />
        <span style={{ fontFamily: fontSans, fontSize: 14, fontWeight: 600, color: ll.paper }}>{record.agency}</span>
        {record.jurisdiction && (
          <span style={{
            fontFamily: fontMono, fontSize: 9, padding: "1px 7px", borderRadius: 4,
            background: "rgba(14,116,144,0.1)", border: "1px solid rgba(14,116,144,0.25)", color: ll.teal,
          }}>{record.jurisdiction}</span>
        )}
        <ChevronDown size={14} color={ll.muted} style={{ marginLeft: "auto", transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontFamily: fontMono, fontSize: 11, color: ll.muted }}>
          Type: <span style={{ color: ll.paper }}>{record.complaintType}</span>
        </span>
        <span style={{ fontFamily: fontMono, fontSize: 11, color: ll.muted }}>
          Outcome: <span style={{ color: record.outcome === "resolved" ? "#34d399" : record.outcome === "dismissed" ? ll.red : ll.amber }}>{record.outcome}</span>
        </span>
        {record.requiredResponseDays && (
          <span style={{ fontFamily: fontMono, fontSize: 11, color: ll.muted }}>
            Required: <span style={{ color: ll.paper }}>{record.requiredResponseDays}d</span>
          </span>
        )}
        {record.observedResponseDays && (
          <span style={{ fontFamily: fontMono, fontSize: 11, color: ll.muted }}>
            Actual: <span style={{ color: record.observedResponseDays > (record.requiredResponseDays || 999) ? ll.red : "#34d399" }}>{record.observedResponseDays}d</span>
          </span>
        )}
      </div>
      {record.notes && (
        <p style={{ fontFamily: fontSans, fontSize: 12, color: ll.muted, lineHeight: 1.5 }}>{record.notes}</p>
      )}
      {expanded && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${ll.cardBorder}`, paddingTop: 12 }} onClick={e => e.stopPropagation()}>
          {agencyInfo && (
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontFamily: fontMono, fontSize: 9, color: ll.teal, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8 }}>Contact Information</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {agencyInfo.phone && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: fontMono, fontSize: 10, color: ll.muted, minWidth: 60 }}>Phone</span>
                    <a href={`tel:${agencyInfo.phone}`} onClick={e => e.stopPropagation()} style={{ fontFamily: fontMono, fontSize: 11, color: "#34d399", textDecoration: "none" }}>{agencyInfo.phone}</a>
                  </div>
                )}
                {agencyInfo.address && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <span style={{ fontFamily: fontMono, fontSize: 10, color: ll.muted, minWidth: 60 }}>Address</span>
                    <span style={{ fontFamily: fontSans, fontSize: 11, color: ll.paper }}>{agencyInfo.address}</span>
                  </div>
                )}
              </div>
            </div>
          )}
          {record.statutoryRequirement && (
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontFamily: fontMono, fontSize: 9, color: ll.gold, textTransform: "uppercase", letterSpacing: "0.1em" }}>Statutory Requirement</span>
              <p style={{ fontFamily: fontSans, fontSize: 12, color: ll.paper, lineHeight: 1.5, marginTop: 4 }}>{record.statutoryRequirement}</p>
            </div>
          )}
          {record.patternDescription && (
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontFamily: fontMono, fontSize: 9, color: ll.red, textTransform: "uppercase", letterSpacing: "0.1em" }}>Documented Pattern</span>
              <p style={{ fontFamily: fontSans, fontSize: 12, color: "#fca5a5", lineHeight: 1.5, marginTop: 4 }}>{record.patternDescription}</p>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {agencyInfo?.url && (
              <a
                href={agencyInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{
                  background: "rgba(14,116,144,0.1)", border: "1px solid rgba(14,116,144,0.3)",
                  borderRadius: 4, padding: "6px 12px",
                  display: "flex", alignItems: "center", gap: 6,
                  fontFamily: fontMono, fontSize: 10, color: ll.teal,
                  textDecoration: "none",
                }}
              >
                <ExternalLink size={10} /> File Complaint
              </a>
            )}
            <CommitToCase type="statute" itemId={record.id} label="Add to Case" size="sm" />
          </div>
        </div>
      )}
    </div>
  );
}
function ContradictionCard({ contradiction }: { contradiction: any }) {
  return (
    <div style={{
      background: "rgba(239,68,68,0.04)", border: `1px solid rgba(239,68,68,0.2)`,
      borderRadius: 8, padding: "20px 24px", marginBottom: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <AlertTriangle size={16} color={ll.red} />
        <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: ll.red }}>
          Systemic Contradiction
        </span>
        {contradiction.reformStatus && (
          <span style={{
            fontFamily: fontMono, fontSize: 9, padding: "2px 8px", borderRadius: 4,
            background: contradiction.reformStatus === "active" ? "rgba(52,211,153,0.15)" : "rgba(245,158,11,0.15)",
            color: contradiction.reformStatus === "active" ? "#34d399" : "#fcd34d",
          }}>
            {contradiction.reformStatus}
          </span>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, marginBottom: 12 }}>
        <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
          <span style={{ fontFamily: fontMono, fontSize: 9, color: ll.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Doctrine A</span>
          <p style={{ fontFamily: fontSans, fontSize: 13, color: ll.paper, lineHeight: 1.5, marginTop: 4 }}>{contradiction.doctrineA}</p>
          {contradiction.citationA && <p style={{ fontFamily: fontMono, fontSize: 10, color: ll.purple, marginTop: 4 }}>{contradiction.citationA}</p>}
        </div>
        <div style={{ display: "flex", alignItems: "center", color: ll.red, fontFamily: fontMono, fontSize: 18 }}>vs</div>
        <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
          <span style={{ fontFamily: fontMono, fontSize: 9, color: ll.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Doctrine B</span>
          <p style={{ fontFamily: fontSans, fontSize: 13, color: ll.paper, lineHeight: 1.5, marginTop: 4 }}>{contradiction.doctrineB}</p>
          {contradiction.citationB && <p style={{ fontFamily: fontMono, fontSize: 10, color: ll.purple, marginTop: 4 }}>{contradiction.citationB}</p>}
        </div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontFamily: fontMono, fontSize: 9, color: ll.amber, textTransform: "uppercase", letterSpacing: "0.1em" }}>The Contradiction</span>
        <p style={{ fontFamily: fontSans, fontSize: 13, color: ll.paper, lineHeight: 1.6, marginTop: 4 }}>{contradiction.contradictionDescription}</p>
      </div>
      {contradiction.harm && (
        <div>
          <span style={{ fontFamily: fontMono, fontSize: 9, color: ll.red, textTransform: "uppercase", letterSpacing: "0.1em" }}>Who This Harms</span>
          <p style={{ fontFamily: fontSans, fontSize: 13, color: "#fca5a5", lineHeight: 1.6, marginTop: 4 }}>{contradiction.harm}</p>
        </div>
      )}
    </div>
  );
}
