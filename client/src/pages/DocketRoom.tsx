import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Scale, BookOpen, Users, Shield, Search, Eye,
  Landmark, FileText, ArrowRight, ChevronRight, ExternalLink,
  Filter, Loader2, Building2, Globe, AlertTriangle, Gavel,
  GitCompare, ScrollText, ChevronDown, ChevronUp, Link2,
  Send, X,
} from "lucide-react";
import { VoiceReadout } from "@/components/VoiceReadout";
import { DocketBillDetailWorkspace } from "@/components/DocketBillDetailWorkspace";
import {
  resolve_docket_lifecycle,
  type docket_lifecycle_state as lifecycle_state,
  type docket_source_freshness_state,
} from "@shared/docket-lifecycle";

/* ═══════════════════════════════════════════════════════════════════════
   THE DOCKET ROOM — Structural Legislative Analysis
   Core Principle: Reveal structure. Interpret nothing. Judge nothing.
   Persuade no one.
   ═══════════════════════════════════════════════════════════════════════ */

// ── Design tokens ─────────────────────────────────────────────────────
const dk = {
  bg: "#0f1114",
  bgGrad: "radial-gradient(ellipse at 50% 0%, rgba(56,100,160,0.06) 0%, rgba(15,17,20,0) 70%)",
  slate: "#1a1e24",
  slateMid: "#232830",
  slateLight: "#2d333b",
  paper: "#e8ecf0",
  cream: "#d0d7de",
  ink: "#0f1114",
  muted: "#7d8590",
  rule: "#30363d",
  steel: "#4a8cc7",
  steelSoft: "rgba(74,140,199,0.12)",
  steelBorder: "rgba(74,140,199,0.20)",
  steelBright: "#58a6ff",
  copper: "#d29922",
  copperSoft: "rgba(210,153,34,0.12)",
  green: "#3fb950",
  red: "#f85149",
  amber: "#d29922",
  teal: "#39d2c0",
  purple: "#a371f7",
  cardBg: "rgba(26,30,36,0.80)",
  cardBorder: "rgba(74,140,199,0.10)",
  sectionBg: "rgba(26,30,36,0.50)",
};

const fontSerif = "'Cormorant Garamond', serif";
const fontMono = "'IBM Plex Mono', monospace";
const fontSans = "'Inter', system-ui, sans-serif";

// ── Section label map ────────────────────────────────────────────────
const SECTION_ICONS: Record<string, any> = {
  summary: BookOpen,
  actors: Users,
  impacts: Shield,
  implementation: Building2,
  loopholes: AlertTriangle,
  comparative: GitCompare,
  sources: Link2,
};

const SECTION_LABELS: Record<string, string> = {
  summary: "Plain-Language Summary",
  actors: "Actor Ledger",
  impacts: "Impact Grid",
  implementation: "Implementation Dock",
  loopholes: "Loophole Lantern",
  comparative: "Comparative Bay",
  sources: "Source Ledger",
};

const ACTOR_TYPE_LABELS: Record<string, string> = {
  sponsor: "Sponsor",
  cosponsor: "Co-Sponsor",
  committee: "Committee",
  implementing_agency: "Implementing Agency",
  regulatory_body: "Regulatory Body",
  lobbyist_org: "Lobbyist / Industry Group",
  advocacy_group: "Advocacy Group",
  opposition_group: "Opposition Group",
  executive_signatory: "Executive Signatory",
  judicial_body: "Judicial Body",
};

const IMPACT_CAT_LABELS: Record<string, string> = {
  population: "Population",
  industry: "Industry",
  government_agency: "Government Agency",
  geographic: "Geographic",
};

const JURISDICTION_LEVEL_LABELS: Record<string, string> = {
  federal: "Federal",
  state: "State",
  county: "County",
  city: "City / Municipal",
  tribal: "Tribal",
};

const LAW_TYPE_LABELS: Record<string, string> = {
  statute: "Statute",
  ordinance: "Ordinance",
  regulation: "Regulation",
  executive_order: "Executive Order",
  ballot_measure: "Ballot Measure",
  proposed_bill: "Proposed Bill",
  constitutional_amendment: "Constitutional Amendment",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  enacted: { label: "Enacted", color: dk.green },
  proposed: { label: "Proposed", color: dk.amber },
  repealed: { label: "Repealed", color: dk.red },
  amended: { label: "Amended", color: dk.steelBright },
  under_review: { label: "Under Review", color: dk.purple },
};

// ── Docket List View ─────────────────────────────────────────────────

function DocketList({ onSelect }: { onSelect: (id: string) => void }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterLevel, setFilterLevel] = useState<string>("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const queryInput = useMemo(() => ({
    search: debouncedSearch || undefined,
    jurisdictionLevel: (filterLevel || undefined) as any,
  }), [debouncedSearch, filterLevel]);

  const { data: entries, isLoading } = trpc.docket.list.useQuery(queryInput);
  const { data: stats } = trpc.docket.stats.useQuery();

  return (
    <div style={{ minHeight: "100vh", background: dk.bg }}>
      {/* Header */}
      <div style={{
        background: dk.bgGrad,
        borderBottom: `1px solid ${dk.rule}`,
        padding: "3rem 0 2rem",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
            <Gavel size={28} style={{ color: dk.steel }} />
            <h1 style={{
              fontFamily: fontSerif,
              fontSize: "2.25rem",
              fontWeight: 600,
              color: dk.paper,
              letterSpacing: "-0.02em",
              margin: 0,
            }}>
              The Docket Room
            </h1>
          </div>
          <p style={{
            fontFamily: fontSans,
            fontSize: "0.95rem",
            color: dk.muted,
            maxWidth: 600,
            lineHeight: 1.6,
            margin: "0.5rem 0 0",
          }}>
            Structural analysis of laws and proposals. Reveals mechanics, actors, and documented facts.
            <br />
            <span style={{ fontStyle: "italic", color: dk.steel, opacity: 0.7 }}>
              Reveal structure. Interpret nothing. Judge nothing. Persuade no one.
            </span>
          </p>

          <p style={{ fontFamily: fontSans, fontSize: "0.84rem", color: dk.cream, lineHeight: 1.6, margin: "1.25rem 0 0", maxWidth: 760 }}>
            Follow legislation while it can still change. Status colors describe procedure only: active movement, an approaching action, completion, or inactivity. Effective dates and source freshness are shown separately.
          </p>

          {/* Stats bar */}
          {stats && (
            <div style={{
              display: "flex", gap: "2rem", marginTop: "1.5rem",
              fontFamily: fontMono, fontSize: "0.8rem", color: dk.muted,
              flexWrap: "wrap",
            }}>
              <span><strong style={{ color: dk.paper }}>{stats.total}</strong> curated analysis records (official source bills are browsed below)</span>
              {Object.entries(stats.byLevel || {}).map(([level, count]) => (
                <span key={level}>
                  <strong style={{ color: dk.steelBright }}>{count as number}</strong> {JURISDICTION_LEVEL_LABELS[level] || level}
                </span>
              ))}
            </div>
          )}

          {/* Search official bills */}
          <div style={{
            display: "flex", gap: "0.75rem", marginTop: "1.25rem",
            alignItems: "center",
          }}>
            <div style={{
              flex: 1, position: "relative",
            }}>
              <Search size={15} style={{
                position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)",
                color: dk.muted, pointerEvents: "none",
              }} />
              <input
                ref={searchRef}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search bill number (HB1000), title, or source ID..."
                style={{
                  width: "100%", padding: "0.6rem 0.75rem 0.6rem 2.25rem",
                  background: dk.slate, border: `1px solid ${dk.rule}`, borderRadius: "6px",
                  color: dk.paper, fontFamily: fontSans, fontSize: "0.9rem",
                  outline: "none", transition: "border-color 0.15s",
                }}
                onFocus={e => e.currentTarget.style.borderColor = dk.steel}
                onBlur={e => e.currentTarget.style.borderColor = dk.rule}
              />
              {searchTerm && (
                <button
                  onClick={() => { setSearchTerm(""); searchRef.current?.focus(); }}
                  style={{
                    position: "absolute", right: "0.5rem", top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", color: dk.muted,
                    padding: "0.2rem", display: "flex", alignItems: "center",
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{
        maxWidth: 1100, margin: "0 auto", padding: "1rem 1.5rem",
        display: "flex", alignItems: "center", gap: "0.75rem",
        flexWrap: "wrap",
      }}>
        <Filter size={14} style={{ color: dk.muted }} />
        <span style={{ fontFamily: fontMono, fontSize: "0.75rem", color: dk.muted }}>Level:</span>
        {["", "federal", "state", "county", "city", "tribal"].map(level => (
          <button
            key={level}
            onClick={() => setFilterLevel(level)}
            style={{
              fontFamily: fontMono,
              fontSize: "0.75rem",
              padding: "0.3rem 0.75rem",
              borderRadius: "4px",
              border: `1px solid ${filterLevel === level ? dk.steel : dk.rule}`,
              background: filterLevel === level ? dk.steelSoft : "transparent",
              color: filterLevel === level ? dk.steelBright : dk.muted,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {level === "" ? "All" : JURISDICTION_LEVEL_LABELS[level] || level}
          </button>
        ))}
        {(debouncedSearch || filterLevel) && (
          <button
            onClick={() => { setSearchTerm(""); setFilterLevel(""); }}
            style={{
              fontFamily: fontMono, fontSize: "0.7rem",
              padding: "0.25rem 0.6rem", borderRadius: "4px",
              border: `1px solid ${dk.red}44`, background: `${dk.red}11`,
              color: dk.red, cursor: "pointer",
              marginLeft: "auto",
            }}
          >
            Clear all filters
          </button>
        )}
      </div>

      {/* LegiScan Docket Bill Feed */}
      {(!filterLevel || filterLevel === "federal" || filterLevel === "state") && <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 1.5rem" }}>
        <DocketBillFeed level={filterLevel} keyword={debouncedSearch} />
      </div>}

      {/* Seattle Legistar Live Feed */}
      {(!filterLevel || filterLevel === "city") && <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 1.5rem 1.5rem" }}>
        <LegistarLiveFeed keyword={debouncedSearch || undefined} />
      </div>}

      {/* Entry cards */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 1.5rem 3rem" }}>
        {isLoading ? (
          <div style={{ textAlign: "center", padding: "4rem 0", color: dk.muted }}>
            <Loader2 size={24} className="animate-spin" style={{ margin: "0 auto 1rem" }} />
            <p style={{ fontFamily: fontMono, fontSize: "0.85rem" }}>Loading docket entries...</p>
          </div>
        ) : !entries || entries.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem 0", color: dk.muted }}>
            <Gavel size={32} style={{ margin: "0 auto 1rem", opacity: 0.3 }} />
            <p style={{ fontFamily: fontSans, fontSize: "0.95rem" }}>
              {debouncedSearch ? `No entries matching "${debouncedSearch}"` : "No entries found."}
            </p>
            {debouncedSearch && (
              <button
                onClick={() => setSearchTerm("")}
                style={{
                  fontFamily: fontMono, fontSize: "0.8rem",
                  padding: "0.4rem 1rem", borderRadius: "4px",
                  border: `1px solid ${dk.rule}`, background: dk.slateMid,
                  color: dk.muted, cursor: "pointer", marginTop: "0.5rem",
                }}
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {entries.map((entry) => {
              const statusInfo = STATUS_LABELS[entry.status] || { label: entry.status, color: dk.muted };
              return (
                <button
                  key={entry.id}
                  onClick={() => onSelect(entry.id)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "1rem",
                    padding: "1.25rem 1.5rem",
                    background: dk.cardBg,
                    border: `1px solid ${dk.cardBorder}`,
                    borderRadius: "8px",
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = dk.steel;
                    (e.currentTarget as HTMLElement).style.background = dk.slateMid;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = dk.cardBorder;
                    (e.currentTarget as HTMLElement).style.background = dk.cardBg;
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: "8px",
                    background: dk.steelSoft,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, marginTop: "0.1rem",
                  }}>
                    <Scale size={18} style={{ color: dk.steelBright }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <h3 style={{
                        fontFamily: fontSerif,
                        fontSize: "1.15rem",
                        fontWeight: 600,
                        color: dk.paper,
                        margin: 0,
                      }}>
                        {entry.title}
                      </h3>
                      <span style={{
                        fontFamily: fontMono,
                        fontSize: "0.65rem",
                        padding: "0.15rem 0.5rem",
                        borderRadius: "3px",
                        background: `${statusInfo.color}22`,
                        color: statusInfo.color,
                        border: `1px solid ${statusInfo.color}44`,
                      }}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <div style={{
                      display: "flex", gap: "1rem", marginTop: "0.5rem",
                      fontFamily: fontMono, fontSize: "0.72rem", color: dk.muted,
                      flexWrap: "wrap",
                    }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                        <Globe size={11} />
                        {entry.jurisdiction}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                        <Landmark size={11} />
                        {JURISDICTION_LEVEL_LABELS[entry.jurisdictionLevel] || entry.jurisdictionLevel}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                        <ScrollText size={11} />
                        {LAW_TYPE_LABELS[entry.lawType] || entry.lawType}
                      </span>
                      {entry.dateEnacted && (
                        <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                          <Gavel size={11} />
                          Enacted {entry.dateEnacted}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={18} style={{ color: dk.muted, flexShrink: 0, marginTop: "0.5rem" }} />
                </button>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

// ── Collapsible Section ──────────────────────────────────────────────

function Section({ id, children, defaultOpen = true }: { id: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = SECTION_ICONS[id] || BookOpen;
  const label = SECTION_LABELS[id] || id;

  return (
    <div style={{
      background: dk.sectionBg,
      border: `1px solid ${dk.cardBorder}`,
      borderRadius: "8px",
      overflow: "hidden",
      marginBottom: "1rem",
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: "0.75rem",
          width: "100%", padding: "1rem 1.25rem",
          background: "transparent", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{
          width: 32, height: 32, borderRadius: "6px",
          background: dk.steelSoft,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={16} style={{ color: dk.steelBright }} />
        </div>
        <span style={{
          fontFamily: fontSerif,
          fontSize: "1.1rem",
          fontWeight: 600,
          color: dk.paper,
          flex: 1,
        }}>
          {label}
        </span>
        {open ? <ChevronUp size={16} style={{ color: dk.muted }} /> : <ChevronDown size={16} style={{ color: dk.muted }} />}
      </button>
      {open && (
        <div style={{ padding: "0 1.25rem 1.25rem", borderTop: `1px solid ${dk.rule}` }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Docket Detail View ───────────────────────────────────────────────

function DocketDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [, navigateTo] = useLocation();
  const { data, isLoading } = trpc.docket.getFullAnalysis.useQuery({ id });

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", background: dk.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={24} className="animate-spin" style={{ color: dk.steel }} />
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ minHeight: "100vh", background: dk.bg, padding: "4rem", textAlign: "center", color: dk.muted }}>
        Entry not found.
      </div>
    );
  }

  const { entry, actors, impacts, sources, componentAvailability } = data;
  const statusInfo = STATUS_LABELS[entry.status] || { label: entry.status, color: dk.muted };

  // Group actors by type
  const actorsByType: Record<string, typeof actors> = {};
  for (const a of actors) {
    const t = a.actorType;
    if (!actorsByType[t]) actorsByType[t] = [];
    actorsByType[t].push(a);
  }

  // Group impacts by category
  const impactsByCat: Record<string, typeof impacts> = {};
  for (const i of impacts) {
    const c = i.impactCategory;
    if (!impactsByCat[c]) impactsByCat[c] = [];
    impactsByCat[c].push(i);
  }

  return (
    <div style={{ minHeight: "100vh", background: dk.bg }}>
      {/* Header */}
      <div style={{
        background: dk.bgGrad,
        borderBottom: `1px solid ${dk.rule}`,
        padding: "2rem 0 2rem",
      }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 1.5rem" }}>
          <button
            onClick={onBack}
            style={{
              fontFamily: fontMono, fontSize: "0.75rem", color: dk.steel,
              background: "transparent", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", gap: "0.3rem",
              marginBottom: "1rem", padding: 0,
            }}
          >
            <ArrowRight size={12} style={{ transform: "rotate(180deg)" }} />
            Back to Docket Room
          </button>

          <h1 style={{
            fontFamily: fontSerif,
            fontSize: "1.85rem",
            fontWeight: 600,
            color: dk.paper,
            letterSpacing: "-0.02em",
            margin: "0 0 0.75rem",
            lineHeight: 1.3,
          }}>
            {entry.title}
          </h1>

          <div style={{
            display: "flex", gap: "0.75rem", flexWrap: "wrap",
            fontFamily: fontMono, fontSize: "0.72rem",
          }}>
            <span style={{
              padding: "0.2rem 0.6rem", borderRadius: "3px",
              background: `${statusInfo.color}22`, color: statusInfo.color,
              border: `1px solid ${statusInfo.color}44`,
            }}>
              {statusInfo.label}
            </span>
            <span style={{
              padding: "0.2rem 0.6rem", borderRadius: "3px",
              background: dk.steelSoft, color: dk.steelBright,
              border: `1px solid ${dk.steelBorder}`,
            }}>
              {JURISDICTION_LEVEL_LABELS[entry.jurisdictionLevel] || entry.jurisdictionLevel}
            </span>
            <span style={{
              padding: "0.2rem 0.6rem", borderRadius: "3px",
              background: dk.steelSoft, color: dk.cream,
              border: `1px solid ${dk.rule}`,
            }}>
              {entry.jurisdiction}
            </span>
            <span style={{
              padding: "0.2rem 0.6rem", borderRadius: "3px",
              background: dk.copperSoft, color: dk.copper,
              border: `1px solid rgba(210,153,34,0.25)`,
            }}>
              {LAW_TYPE_LABELS[entry.lawType] || entry.lawType}
            </span>
          </div>

          {/* Date row */}
          <div style={{
            display: "flex", gap: "1.5rem", marginTop: "0.75rem",
            fontFamily: fontMono, fontSize: "0.72rem", color: dk.muted,
          }}>
            {entry.dateIntroduced && <span>Introduced: {entry.dateIntroduced}</span>}
            {entry.dateEnacted && <span>Enacted: {entry.dateEnacted}</span>}
            {entry.dateEffective && <span>Effective: {entry.dateEffective}</span>}
          </div>

          {/* Voice Readout */}
          {(entry.summary || entry.title) && (
            <div style={{ marginTop: "1rem" }}>
              <VoiceReadout
                text={[
                  `${entry.title}.`,
                  entry.summary ? `Summary: ${entry.summary}` : "",
                  (entry.keyChanges as string[] | null)?.length
                    ? `Key changes: ${(entry.keyChanges as string[]).join(". ")}`
                    : "",
                ].filter(Boolean).join(" ")}
                label="Read this entry aloud"
                className="text-xs"
              />
            </div>
          )}

          {/* LumenSend Action Buttons */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "1rem" }}>
            <button
              onClick={() => navigateTo(`/lumensend?type=inquiry&context=docket_entry&contextId=${entry.id}&state=${entry.jurisdiction || ''}`)}
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.4rem",
                fontFamily: fontMono, fontSize: "0.72rem",
                padding: "0.35rem 0.75rem", borderRadius: "4px",
                background: "rgba(210,153,34,0.12)", color: dk.copper,
                border: `1px solid rgba(210,153,34,0.3)`,
                cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = "rgba(210,153,34,0.22)"; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = "rgba(210,153,34,0.12)"; }}
            >
              <Send size={11} />
              Write to Legislator
            </button>
            <button
              onClick={() => navigateTo(`/lumensend?type=complaint&context=docket_entry&contextId=${entry.id}&state=${entry.jurisdiction || ''}`)}
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.4rem",
                fontFamily: fontMono, fontSize: "0.72rem",
                padding: "0.35rem 0.75rem", borderRadius: "4px",
                background: dk.steelSoft, color: dk.steelBright,
                border: `1px solid ${dk.steelBorder}`,
                cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = dk.steelBorder; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = dk.steelSoft; }}
            >
              <Send size={11} />
              File Public Comment
            </button>
          </div>

          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
            {entry.primarySourceUrl && (
              <a
                href={entry.primarySourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.3rem",
                  fontFamily: fontMono, fontSize: "0.72rem", color: dk.steel,
                  textDecoration: "none",
                }}
              >
                <ExternalLink size={11} />
                Primary Source
              </a>
            )}
            {entry.sourceDocumentUrl && (
              <a
                href={entry.sourceDocumentUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.3rem",
                  fontFamily: fontMono, fontSize: "0.72rem", color: dk.copper,
                  textDecoration: "none",
                }}
              >
                <FileText size={11} />
                {entry.sourceDocumentName || "Source Document"}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Sections */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "1.5rem" }}>

        {/* 1. Plain-Language Summary */}
        <Section id="summary" defaultOpen={true}>
          <div style={{ paddingTop: "1rem" }}>
            {entry.summary && (
              <p style={{
                fontFamily: fontSans, fontSize: "0.92rem", color: dk.cream,
                lineHeight: 1.75, margin: "0 0 1rem",
                whiteSpace: "pre-wrap",
              }}>
                {entry.summary}
              </p>
            )}
            {(entry.keyChanges as string[] | null)?.length ? (
              <div>
                <h4 style={{
                  fontFamily: fontMono, fontSize: "0.75rem", color: dk.muted,
                  textTransform: "uppercase", letterSpacing: "0.05em",
                  margin: "1rem 0 0.5rem",
                }}>
                  Key Changes
                </h4>
                <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                  {(entry.keyChanges as string[]).map((change, i) => (
                    <li key={i} style={{
                      fontFamily: fontSans, fontSize: "0.88rem", color: dk.cream,
                      lineHeight: 1.65, marginBottom: "0.4rem",
                    }}>
                      {change}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </Section>

        {/* 2. Actor Ledger */}
        <Section id="actors" defaultOpen={true}>
          <div style={{ paddingTop: "1rem" }}>
            {Object.keys(actorsByType).length === 0 ? (
              <p style={{ fontFamily: fontMono, fontSize: "0.8rem", color: dk.muted, fontStyle: "italic" }}>
                {componentAvailability.actors
                  ? "No actors documented for this entry."
                  : "Actor-ledger storage is not established for this registry."}
              </p>
            ) : (
              Object.entries(actorsByType).map(([type, typeActors]) => (
                <div key={type} style={{ marginBottom: "1.25rem" }}>
                  <h4 style={{
                    fontFamily: fontMono, fontSize: "0.72rem", color: dk.steel,
                    textTransform: "uppercase", letterSpacing: "0.05em",
                    margin: "0 0 0.5rem",
                    display: "flex", alignItems: "center", gap: "0.4rem",
                  }}>
                    <Users size={12} />
                    {ACTOR_TYPE_LABELS[type] || type}
                    <span style={{ color: dk.muted }}>({typeActors.length})</span>
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {typeActors.map((actor: any) => (
                      <div key={actor.id} style={{
                        padding: "0.6rem 0.85rem",
                        background: dk.slate,
                        borderRadius: "6px",
                        border: `1px solid ${dk.rule}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                          <span style={{
                            fontFamily: fontSans, fontSize: "0.88rem", fontWeight: 500, color: dk.paper,
                          }}>
                            {actor.actorName}
                          </span>
                          {actor.affiliation && (
                            <span style={{
                              fontFamily: fontMono, fontSize: "0.68rem", color: dk.muted,
                              padding: "0.1rem 0.4rem", borderRadius: "3px",
                              background: "rgba(255,255,255,0.04)",
                            }}>
                              {actor.affiliation}
                            </span>
                          )}
                        </div>
                        {actor.role && (
                          <p style={{
                            fontFamily: fontSans, fontSize: "0.8rem", color: dk.muted,
                            margin: "0.25rem 0 0",
                          }}>
                            {actor.role}
                          </p>
                        )}
                        {actor.sourceUrl && (
                          <a
                            href={actor.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontFamily: fontMono, fontSize: "0.65rem", color: dk.steel,
                              textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.2rem",
                              marginTop: "0.2rem",
                            }}
                          >
                            <ExternalLink size={9} /> source
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </Section>

        {/* 3. Impact Grid */}
        <Section id="impacts" defaultOpen={true}>
          <div style={{ paddingTop: "1rem" }}>
            {Object.keys(impactsByCat).length === 0 ? (
              <p style={{ fontFamily: fontMono, fontSize: "0.8rem", color: dk.muted, fontStyle: "italic" }}>
                {componentAvailability.impacts
                  ? "No impacts documented for this entry."
                  : "Impact-grid storage is not established for this registry."}
              </p>
            ) : (
              Object.entries(impactsByCat).map(([cat, catImpacts]) => (
                <div key={cat} style={{ marginBottom: "1.25rem" }}>
                  <h4 style={{
                    fontFamily: fontMono, fontSize: "0.72rem", color: dk.copper,
                    textTransform: "uppercase", letterSpacing: "0.05em",
                    margin: "0 0 0.5rem",
                    display: "flex", alignItems: "center", gap: "0.4rem",
                  }}>
                    <Shield size={12} />
                    {IMPACT_CAT_LABELS[cat] || cat}
                    <span style={{ color: dk.muted }}>({catImpacts.length})</span>
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {catImpacts.map((impact: any) => (
                      <div key={impact.id} style={{
                        padding: "0.6rem 0.85rem",
                        background: dk.slate,
                        borderRadius: "6px",
                        border: `1px solid ${dk.rule}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                          <span style={{
                            fontFamily: fontSans, fontSize: "0.88rem", fontWeight: 500, color: dk.paper,
                          }}>
                            {impact.affectedEntity}
                          </span>
                          {impact.scope && (
                            <span style={{
                              fontFamily: fontMono, fontSize: "0.68rem", color: dk.teal,
                              padding: "0.1rem 0.4rem", borderRadius: "3px",
                              background: "rgba(57,210,192,0.08)",
                            }}>
                              {impact.scope}
                            </span>
                          )}
                        </div>
                        {impact.impactDescription && (
                          <p style={{
                            fontFamily: fontSans, fontSize: "0.82rem", color: dk.cream,
                            margin: "0.3rem 0 0", lineHeight: 1.6,
                          }}>
                            {impact.impactDescription}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </Section>

        {/* 4. Implementation Dock */}
        <Section id="implementation" defaultOpen={false}>
          <div style={{ paddingTop: "1rem" }}>
            <JsonArrayList label="Implementing Agencies" items={entry.implementationAgencies as string[] | null} icon={Building2} color={dk.green} />
            <JsonArrayList label="Administrative Steps" items={entry.adminSteps as string[] | null} icon={FileText} color={dk.steelBright} />
            <JsonArrayList label="Compliance Obligations" items={entry.complianceObligations as string[] | null} icon={Shield} color={dk.copper} />
            <JsonArrayList label="Rollout Timeline" items={entry.rolloutTimeline as string[] | null} icon={ScrollText} color={dk.teal} />
          </div>
        </Section>

        {/* 5. Loophole Lantern */}
        <Section id="loopholes" defaultOpen={false}>
          <div style={{ paddingTop: "1rem" }}>
            <JsonArrayList label="Structural Exemptions" items={entry.structuralExemptions as string[] | null} icon={AlertTriangle} color={dk.amber} />
            <JsonArrayList label="Enforcement Gaps" items={entry.enforcementGaps as string[] | null} icon={Eye} color={dk.red} />
            <JsonArrayList label="Reporting Gaps" items={entry.reportingGaps as string[] | null} icon={FileText} color={dk.red} />
            <JsonArrayList label="Delegated Authority / Carve-outs" items={entry.delegatedAuthority as string[] | null} icon={Gavel} color={dk.purple} />
          </div>
        </Section>

        {/* 6. Comparative Bay */}
        <Section id="comparative" defaultOpen={false}>
          <div style={{ paddingTop: "1rem" }}>
            {/* Similar Laws */}
            {(entry.similarLaws as any[] | null)?.length ? (
              <div style={{ marginBottom: "1.25rem" }}>
                <h4 style={{
                  fontFamily: fontMono, fontSize: "0.72rem", color: dk.teal,
                  textTransform: "uppercase", letterSpacing: "0.05em",
                  margin: "0 0 0.5rem",
                }}>
                  Similar Laws in Other Jurisdictions
                </h4>
                {(entry.similarLaws as any[]).map((law, i) => (
                  <div key={i} style={{
                    padding: "0.5rem 0.85rem", marginBottom: "0.4rem",
                    background: dk.slate, borderRadius: "6px", border: `1px solid ${dk.rule}`,
                  }}>
                    <span style={{ fontFamily: fontSans, fontSize: "0.85rem", fontWeight: 500, color: dk.paper }}>
                      {law.title}
                    </span>
                    <span style={{
                      fontFamily: fontMono, fontSize: "0.68rem", color: dk.muted,
                      marginLeft: "0.5rem",
                    }}>
                      ({law.jurisdiction})
                    </span>
                    {law.note && (
                      <p style={{ fontFamily: fontSans, fontSize: "0.78rem", color: dk.cream, margin: "0.2rem 0 0", lineHeight: 1.5 }}>
                        {law.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            {/* Historical Precedents */}
            {(entry.historicalPrecedents as any[] | null)?.length ? (
              <div style={{ marginBottom: "1.25rem" }}>
                <h4 style={{
                  fontFamily: fontMono, fontSize: "0.72rem", color: dk.purple,
                  textTransform: "uppercase", letterSpacing: "0.05em",
                  margin: "0 0 0.5rem",
                }}>
                  Historical Precedents
                </h4>
                {(entry.historicalPrecedents as any[]).map((p, i) => (
                  <div key={i} style={{
                    padding: "0.5rem 0.85rem", marginBottom: "0.4rem",
                    background: dk.slate, borderRadius: "6px", border: `1px solid ${dk.rule}`,
                  }}>
                    <span style={{ fontFamily: fontSans, fontSize: "0.85rem", fontWeight: 500, color: dk.paper }}>
                      {p.title}
                    </span>
                    <span style={{
                      fontFamily: fontMono, fontSize: "0.68rem", color: dk.muted,
                      marginLeft: "0.5rem",
                    }}>
                      ({p.year})
                    </span>
                    {p.note && (
                      <p style={{ fontFamily: fontSans, fontSize: "0.78rem", color: dk.cream, margin: "0.2rem 0 0", lineHeight: 1.5 }}>
                        {p.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            {/* Implementation Variations */}
            <JsonArrayList label="Implementation Variations" items={entry.implementationVariations as string[] | null} icon={GitCompare} color={dk.steelBright} />
          </div>
        </Section>

        {/* 7. Source Ledger */}
        <Section id="sources" defaultOpen={false}>
          <div style={{ paddingTop: "1rem" }}>
            {sources.length === 0 ? (
              <p style={{ fontFamily: fontMono, fontSize: "0.8rem", color: dk.muted, fontStyle: "italic" }}>
                {componentAvailability.sources
                  ? "No sources documented for this entry."
                  : "Source-ledger storage is not established for this registry."}
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {sources.map((src: any) => (
                  <div key={src.id} style={{
                    padding: "0.6rem 0.85rem",
                    background: dk.slate,
                    borderRadius: "6px",
                    border: `1px solid ${dk.rule}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <span style={{
                        fontFamily: fontMono, fontSize: "0.65rem",
                        padding: "0.1rem 0.4rem", borderRadius: "3px",
                        background: dk.steelSoft, color: dk.steelBright,
                        textTransform: "uppercase",
                      }}>
                        {src.sourceType.replace(/_/g, " ")}
                      </span>
                      <span style={{
                        fontFamily: fontSans, fontSize: "0.85rem", fontWeight: 500, color: dk.paper,
                      }}>
                        {src.title}
                      </span>
                    </div>
                    {src.citation && (
                      <p style={{
                        fontFamily: fontMono, fontSize: "0.72rem", color: dk.muted,
                        margin: "0.2rem 0 0",
                      }}>
                        {src.citation}
                      </p>
                    )}
                    {src.url && (
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontFamily: fontMono, fontSize: "0.65rem", color: dk.steel,
                          textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.2rem",
                          marginTop: "0.2rem",
                        }}
                      >
                        <ExternalLink size={9} /> {src.url.length > 60 ? src.url.substring(0, 60) + "..." : src.url}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>

        {/* Principle reminder footer */}
        <div style={{
          textAlign: "center", padding: "2rem 0 1rem",
          fontFamily: fontMono, fontSize: "0.72rem", color: dk.muted,
          fontStyle: "italic", opacity: 0.6,
        }}>
          Reveal structure. Interpret nothing. Judge nothing. Persuade no one.
        </div>
      </div>
    </div>
  );
}

// ── Helper: render a JSON string[] as a labeled list ─────────────────

function JsonArrayList({ label, items, icon: Icon, color }: {
  label: string;
  items: string[] | null;
  icon: any;
  color: string;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <h4 style={{
        fontFamily: fontMono, fontSize: "0.72rem", color,
        textTransform: "uppercase", letterSpacing: "0.05em",
        margin: "0 0 0.5rem",
        display: "flex", alignItems: "center", gap: "0.4rem",
      }}>
        <Icon size={12} />
        {label}
      </h4>
      <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
        {items.map((item, i) => (
          <li key={i} style={{
            fontFamily: fontSans, fontSize: "0.85rem", color: dk.cream,
            lineHeight: 1.6, marginBottom: "0.3rem",
          }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export default function DocketRoom() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (selectedId !== null) {
    return <DocketDetail id={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return <DocketList onSelect={setSelectedId} />;
}
