import { useAuth } from "@/core/hooks/useAuth";
import { useLocation } from "wouter";
import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Upload, FileText, Network, BarChart3,
  Search, Sparkles, ChevronRight, FlaskConical,
  Link2, CalendarClock, Eye, Target, Layers,
  Loader2, AlertTriangle, Briefcase, Clock,
  Filter, Plus, ArrowRight, BookOpen,
} from "lucide-react";
import { getLoginUrl } from "@/const";

/* ═══════════════════════════════════════════════════════════════════════
   EVIDENCE LAB — Where You Examine the Facts
   
   Stations:
   1. Document Upload — upload and process new evidence
   2. Entity Explorer — people, organizations, roles
   3. Timeline Builder — chronological event timeline
   4. Proof Frameworks — map evidence to legal elements
   5. Findings — contradictions, patterns, anomalies
   ═══════════════════════════════════════════════════════════════════════ */

const lb = {
  bg: "#0c0e14",
  cardBg: "rgba(168,85,247,0.03)",
  cardBorder: "rgba(168,85,247,0.12)",
  purple: "#a855f7",
  violet: "#8b5cf6",
  lavender: "#c4b5fd",
  cream: "#f5edd6",
  muted: "#8b8070",
  gold: "#d4a017",
  cyan: "#06b6d4",
  green: "#22c55e",
  red: "#ef4444",
  amber: "#f59e0b",
};
const fontSerif = "'Cormorant Garamond', serif";
const fontSans = "'DM Sans', sans-serif";
const fontMono = "'JetBrains Mono', monospace";

interface LabStation {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
  href: string;
  color: string;
  requiresCase: boolean;
  stat?: string;
}

export default function EvidenceLab() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const { cases: userCases, currentCase, currentCaseId, setCurrentCaseId, isLoading: casesLoading } = useCase();
  const hasCase = !!userCases?.length;
  const caseId = currentCase?.id;
  const showNoActiveCase = isAuthenticated && !casesLoading && hasCase && !currentCase && currentCaseId !== null;

  // Fetch evidence stats if we have a case
  const evidenceQuery = trpc.workbench.overview.useQuery(
    { caseId: caseId! },
    { enabled: !!caseId }
  );
  const counts = evidenceQuery.data?.counts;

  const stations: LabStation[] = [
    {
      id: "upload",
      icon: Upload,
      title: "Document Upload",
      description: "Register exact source documents, then explicitly run the governed Intake Spine to reconstruct receipt-bound entities, chronology, and claim candidates.",
      href: "/upload",
      color: lb.purple,
      requiresCase: true,
      stat: counts ? `${counts.documents} docs` : undefined,
    },
    {
      id: "entities",
      icon: Network,
      title: "Entity Explorer",
      description: "Browse extracted people, organizations, agencies, and their roles. Deduplicate and merge entities across documents.",
      href: "/entities",
      color: lb.cyan,
      requiresCase: true,
      stat: counts ? `${counts.entities} entities` : undefined,
    },
    {
      id: "timeline",
      icon: BarChart3,
      title: "Timeline Builder",
      description: "Chronological view of all extracted events. Identify gaps, overlaps, and suspicious timing patterns.",
      href: "/timeline",
      color: "#14b8a6",
      requiresCase: true,
      stat: counts ? `${counts.events} events` : undefined,
    },
    {
      id: "proof",
      icon: Target,
      title: "Proof Frameworks",
      description: "Map your evidence to the legal elements required to prove each claim. See what's strong and what needs more support.",
      href: "/proof-frameworks",
      color: lb.green,
      requiresCase: true,
      stat: counts ? `${counts.proofLinks} links` : undefined,
    },
    {
      id: "findings",
      icon: Sparkles,
      title: "Findings & Anomalies",
      description: "Review contradictions, missing records, timing anomalies, and pattern matches detected by the engine.",
      href: "/findings",
      color: lb.red,
      requiresCase: true,
      stat: counts ? `${counts.findings} findings` : undefined,
    },
    {
      id: "evidence-items",
      icon: FlaskConical,
      title: "Evidence Registry",
      description: "Cataloged evidence items with proof element links and event connections. The forensic core of your case.",
      href: "/claim-elements",
      color: lb.violet,
      requiresCase: true,
      stat: counts ? `${counts.evidence} items` : undefined,
    },
    {
      id: "network",
      icon: Layers,
      title: "Network Graph",
      description: "Visual relationship map showing connections between entities, events, and claims. See the full picture.",
      href: "/network",
      color: lb.amber,
      requiresCase: true,
      stat: counts ? `${counts.relationships} links` : undefined,
    },
    {
      id: "contradiction",
      icon: Eye,
      title: "Contradiction Scoring",
      description: "Automated scoring of contradictions between documents, statements, and official records.",
      href: "/contradiction-scoring",
      color: "#f43f5e",
      requiresCase: false,
    },
  ];

  const handleStationClick = (station: LabStation) => {
    if (!isAuthenticated) {
      window.location.href = getLoginUrl();
      return;
    }
    if (station.requiresCase && !hasCase) {
      navigate("/welcome");
      return;
    }
    navigate(station.href);
  };

  return (
    <div className="min-h-screen" style={{ background: lb.bg, fontFamily: fontSans }}>
      {/* ── Header ── */}
      <header style={{
        padding: "14px 24px",
        borderBottom: `1px solid ${lb.cardBorder}`,
        background: "rgba(12,14,20,0.9)",
        backdropFilter: "blur(12px)",
        position: "sticky",
        top: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={() => navigate("/workshop")} style={{
            background: "none", border: "none", cursor: "pointer",
            color: lb.muted, display: "flex", alignItems: "center", gap: 4,
            fontFamily: fontMono, fontSize: 11,
          }}>
            <ArrowLeft size={14} /> Workshop
          </button>
          <div style={{ width: 1, height: 20, background: lb.cardBorder }} />
          <FlaskConical size={16} color={lb.purple} />
          <span style={{ fontFamily: fontSerif, fontSize: 18, fontWeight: 600, color: lb.cream }}>
            Evidence Lab
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {currentCase && (
            <button
              onClick={() => navigate(`/workbench/${currentCase.id}`)}
              style={{
                background: "none", border: `1px solid ${lb.cardBorder}`,
                borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
                fontFamily: fontMono, fontSize: 11, color: lb.muted,
              }}
            >
              <Briefcase size={12} /> {currentCase.name?.slice(0, 30)} <ChevronRight size={12} />
            </button>
          )}
        </div>
      </header>

      {/* ── Intro ── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px 16px" }}>
        <p style={{ fontFamily: fontSerif, fontSize: 22, color: lb.lavender, fontWeight: 500, lineHeight: 1.4, marginBottom: 8 }}>
          Where you examine the facts.
        </p>
        <p style={{ fontFamily: fontSans, fontSize: 14, color: lb.muted, lineHeight: 1.6, maxWidth: 600 }}>
          Register source evidence, explicitly run governed reconstruction, review receipt-bound projections, and map evidence to proof frameworks.
          The forensic core of the platform.
        </p>
      </div>

      {/* ── No Active Case State ── */}
      {showNoActiveCase && (
        <div
          data-state="no_active_case"
          style={{
            maxWidth: 900,
            margin: "0 auto 24px",
            padding: "0 24px",
          }}
        >
          <div style={{
            border: `1px solid ${lb.amber}40`,
            background: `${lb.amber}10`,
            borderRadius: 10,
            padding: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <AlertTriangle size={18} color={lb.amber} />
              <div>
                <p style={{ fontFamily: fontSans, fontSize: 14, color: lb.cream, margin: 0 }}>
                  No active case selected.
                </p>
                <p style={{ fontFamily: fontSans, fontSize: 12, color: lb.muted, margin: "2px 0 0" }}>
                  Choose a case before opening case-specific evidence tools.
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setCurrentCaseId(userCases?.[0]?.id ?? null)}>
              Use first case
            </Button>
          </div>
        </div>
      )}

      {/* ── Stats Bar (if case active) ── */}
      {counts && (
        <div style={{
          maxWidth: 900, margin: "0 auto", padding: "0 24px 24px",
          display: "flex", gap: 16, flexWrap: "wrap",
        }}>
          {[
            { label: "Documents", value: counts.documents, color: lb.purple },
            { label: "Entities", value: counts.entities, color: lb.cyan },
            { label: "Events", value: counts.events, color: "#14b8a6" },
            { label: "Findings", value: counts.findings, color: lb.red },
            { label: "Evidence", value: counts.evidence, color: lb.green },
            { label: "Proof Links", value: counts.proofLinks, color: lb.violet },
          ].map((s) => (
            <div key={s.label} style={{
              display: "flex", alignItems: "center", gap: 6,
              fontFamily: fontMono, fontSize: 11,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} />
              <span style={{ color: lb.cream }}>{s.value}</span>
              <span style={{ color: lb.muted, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Station Grid ── */}
      <div style={{
        maxWidth: 900, margin: "0 auto", padding: "0 24px 80px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 14,
      }}>
        {stations.map((station) => (
          <button
            key={station.id}
            onClick={() => handleStationClick(station)}
            style={{
              background: lb.cardBg,
              border: `1px solid ${lb.cardBorder}`,
              borderRadius: 10,
              padding: "18px 20px",
              cursor: "pointer",
              textAlign: "left" as const,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              transition: "all 0.2s",
              position: "relative",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: `${station.color}10`, border: `1px solid ${station.color}20`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <station.icon size={20} color={station.color} />
              </div>
              {station.stat && (
                <span style={{
                  fontFamily: fontMono, fontSize: 10, color: station.color,
                  background: `${station.color}12`, padding: "2px 8px", borderRadius: 100,
                }}>
                  {station.stat}
                </span>
              )}
            </div>
            <div>
              <h3 style={{ fontFamily: fontSans, fontSize: 15, fontWeight: 600, color: lb.cream, marginBottom: 4 }}>
                {station.title}
              </h3>
              <p style={{ fontFamily: fontSans, fontSize: 12, color: lb.muted, lineHeight: 1.5 }}>
                {station.description}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: "auto" }}>
              <span style={{ fontFamily: fontMono, fontSize: 10, color: station.color }}>Open</span>
              <ArrowRight size={12} color={station.color} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
