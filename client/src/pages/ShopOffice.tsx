import { useAuth } from "@/core/hooks/useAuth";
import { useLocation } from "wouter";
import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, FileText, Gavel, MessageCircle, Search,
  BookOpen, ChevronRight, Send, CalendarClock, Briefcase,
  FolderOpen, Clock, ArrowRight, Printer, Mail,
  FileCheck, PenTool, AlertTriangle, Shield,
  ClipboardList, Receipt, FileSignature, Stamp,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════
   SHOP OFFICE — Where You File the Paperwork
   
   Desks:
   1. Filing Generator — complaints, appeals, formal filings
   2. LumenSend — pre-filled letters and communications
   3. FOIA Tracking — record requests and tracking
   4. Statement of Facts — formal narrative generation
   5. Deadline Calculator — SOL and filing deadlines
   6. Presentations — case presentations and summaries
   
   Per Prompt A: "The Shop Office is where paperwork gets done. Forms desk,
   document editor, submission panel, deadline tracker, records cabinet."
   ═══════════════════════════════════════════════════════════════════════ */

const so = {
  bg: "#0f1210",
  cardBg: "rgba(212,180,80,0.03)",
  cardBorder: "rgba(212,180,80,0.12)",
  gold: "#d4a017",
  amber: "#c9952a",
  warm: "#e8c87a",
  cream: "#f5edd6",
  muted: "#8b8070",
  green: "#22c55e",
  red: "#ef4444",
  cyan: "#06b6d4",
  purple: "#a855f7",
};
const fontSerif = "'Cormorant Garamond', serif";
const fontSans = "'DM Sans', sans-serif";
const fontMono = "'JetBrains Mono', monospace";

interface Desk {
  id: string;
  icon: React.ElementType;
  title: string;
  metaphor: string;
  description: string;
  href: string;
  color: string;
  requiresCase: boolean;
  capabilities: string[];
}

const DESKS: Desk[] = [
  {
    id: "filing",
    icon: Gavel,
    title: "Filing Generator",
    metaphor: "Draft your formal filings",
    description: "Generate complaint letters, appeals, administrative filings, and formal grievances. Auto-populated from your case data with proper legal formatting.",
    href: "/filing-generator",
    color: so.gold,
    requiresCase: true,
    capabilities: ["Complaint letters", "Appeals", "Grievances", "Administrative filings"],
  },
  {
    id: "lumensend",
    icon: Send,
    title: "LumenSend",
    metaphor: "Send your communications",
    description: "Pre-filled letters to agencies, insurers, and officials. Track delivery status and response deadlines. Print or send digitally.",
    href: "/lumensend",
    color: "#34d399",
    requiresCase: true,
    capabilities: ["Agency letters", "Insurer communications", "Delivery tracking", "Print/send"],
  },
  {
    id: "foia",
    icon: FolderOpen,
    title: "FOIA & Records Requests",
    metaphor: "Request the records you need",
    description: "Generate FOIA requests, track submissions, monitor response deadlines, and manage the records cabinet. Never miss a deadline.",
    href: "/foia",
    color: so.amber,
    requiresCase: true,
    capabilities: ["FOIA generation", "Deadline tracking", "Response monitoring", "Records cabinet"],
  },
  {
    id: "narrative",
    icon: BookOpen,
    title: "Statement of Facts",
    metaphor: "Tell your story in order",
    description: "Generate a formal chronological narrative from your case evidence. Suitable for legal proceedings, complaints, and advocacy.",
    href: "/narrative",
    color: so.purple,
    requiresCase: true,
    capabilities: ["Chronological narrative", "Evidence-backed", "Legal formatting", "Export"],
  },
  {
    id: "deadlines",
    icon: CalendarClock,
    title: "Deadline Calculator",
    metaphor: "Check the source record",
    description: "Review source-bound agency filing-deadline records. Missing operative values stay unavailable so the workspace never guesses a legal date.",
    href: "/deadline-calculator",
    color: so.red,
    requiresCase: false,
    capabilities: ["Agency forms", "Source deadline text", "Authority links", "Missing-value safety"],
  },
  {
    id: "presentations",
    icon: FileText,
    title: "Case Presentations",
    metaphor: "Present your case clearly",
    description: "Build structured presentations summarizing your case, evidence, and findings. Export for meetings, hearings, or advocacy.",
    href: "/presentations",
    color: so.cyan,
    requiresCase: true,
    capabilities: ["Slide builder", "Evidence summaries", "Export PDF", "Hearing prep"],
  },
];

export default function ShopOffice() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const { cases: userCases, currentCase, currentCaseId, setCurrentCaseId, isLoading: casesLoading } = useCase();
  const hasCase = !!userCases?.length;
  const hasActiveCase = !!currentCase;
  const caseId = currentCase?.id;
  const showNoActiveCase = isAuthenticated && !casesLoading && hasCase && !currentCase && currentCaseId !== null;

  // Shop Office uses the integer case workspace contract. The UUID Workbench
  // overview is a separate surface and must not be used as a silent stats
  // fallback here.
  const foiaQuery = trpc.foiaRequests.caseSummary.useQuery(
    { caseId: caseId! },
    { enabled: !!caseId }
  );
  const foiaRequestCount = foiaQuery.data?.total ?? 0;

  const handleDeskClick = (desk: Desk) => {
    if (desk.requiresCase && isAuthenticated && !hasActiveCase) {
      navigate(hasCase ? "/cases" : "/welcome");
      return;
    }
    navigate(desk.href);
  };

  return (
    <div className="min-h-screen" style={{ background: so.bg, fontFamily: fontSans }}>
      {/* ── Header ── */}
      <header style={{
        padding: "14px 24px",
        borderBottom: `1px solid ${so.cardBorder}`,
        background: "rgba(15,18,16,0.9)",
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
            color: so.muted, display: "flex", alignItems: "center", gap: 4,
            fontFamily: fontMono, fontSize: 11,
          }}>
            <ArrowLeft size={14} /> Workshop
          </button>
          <div style={{ width: 1, height: 20, background: so.cardBorder }} />
          <FileText size={16} color={so.gold} />
          <span style={{ fontFamily: fontSerif, fontSize: 18, fontWeight: 600, color: so.cream }}>
            Shop Office
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {currentCase && (
            <button
              onClick={() => navigate(`/workbench/${currentCase.id}`)}
              style={{
                background: "none", border: `1px solid ${so.cardBorder}`,
                borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
                fontFamily: fontMono, fontSize: 11, color: so.muted,
              }}
            >
              <Briefcase size={12} /> {currentCase.name?.slice(0, 30)} <ChevronRight size={12} />
            </button>
          )}
        </div>
      </header>

      {/* ── Intro ── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px 16px" }}>
        <p style={{ fontFamily: fontSerif, fontSize: 22, color: so.warm, fontWeight: 500, lineHeight: 1.4, marginBottom: 8 }}>
          Where you file the paperwork.
        </p>
        <p style={{ fontFamily: fontSans, fontSize: 14, color: so.muted, lineHeight: 1.6, maxWidth: 600 }}>
          Generate filings, FOIA requests, appeals, and formal letters. Track submissions and deadlines. 
          The administrative arm of your case.
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
            border: `1px solid ${so.amber}40`,
            background: `${so.amber}10`,
            borderRadius: 10,
            padding: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <AlertTriangle size={18} color={so.amber} />
              <div>
                <p style={{ fontFamily: fontSans, fontSize: 14, color: so.cream, margin: 0 }}>
                  No active case selected.
                </p>
                <p style={{ fontFamily: fontSans, fontSize: 12, color: so.muted, margin: "2px 0 0" }}>
                  Choose a case before opening case-specific paperwork tools.
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setCurrentCaseId(userCases?.[0]?.id ?? null)}>
              Use first case
            </Button>
          </div>
        </div>
      )}

      {/* ── Quick Stats ── */}
      {hasActiveCase && foiaRequestCount > 0 && (
        <div style={{
          maxWidth: 900, margin: "0 auto", padding: "0 24px 24px",
          display: "flex", gap: 16, flexWrap: "wrap",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            fontFamily: fontMono, fontSize: 11,
          }}>
            <FolderOpen size={12} color={so.amber} />
            <span style={{ color: so.cream }}>{foiaRequestCount}</span>
            <span style={{ color: so.muted, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em" }}>FOIA Requests</span>
          </div>
        </div>
      )}

      {/* ── Desk Grid ── */}
      <div style={{
        maxWidth: 900, margin: "0 auto", padding: "0 24px 80px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 14,
      }}>
        {DESKS.map((desk) => (
          <button
            key={desk.id}
            onClick={() => handleDeskClick(desk)}
            style={{
              background: so.cardBg,
              border: `1px solid ${so.cardBorder}`,
              borderRadius: 10,
              padding: "20px",
              cursor: "pointer",
              textAlign: "left" as const,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              transition: "all 0.2s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: `${desk.color}10`, border: `1px solid ${desk.color}20`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <desk.icon size={20} color={desk.color} />
              </div>
              {desk.requiresCase && !hasActiveCase && (
                <span style={{
                  fontFamily: fontMono, fontSize: 8, color: so.muted,
                  background: "rgba(255,255,255,0.04)", padding: "2px 6px", borderRadius: 100,
                }}>
                  Requires case
                </span>
              )}
            </div>
            <div>
              <h3 style={{ fontFamily: fontSans, fontSize: 15, fontWeight: 600, color: so.cream, marginBottom: 2 }}>
                {desk.title}
              </h3>
              <p style={{ fontFamily: fontSans, fontSize: 11, color: desk.color, fontStyle: "italic", marginBottom: 6 }}>
                {desk.metaphor}
              </p>
              <p style={{ fontFamily: fontSans, fontSize: 12, color: so.muted, lineHeight: 1.5 }}>
                {desk.description}
              </p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: "auto" }}>
              {desk.capabilities.map((cap) => (
                <span key={cap} style={{
                  fontFamily: fontMono, fontSize: 8, letterSpacing: "0.04em",
                  color: so.muted, background: "rgba(255,255,255,0.03)",
                  padding: "2px 6px", borderRadius: 100,
                }}>
                  {cap}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>

      {/* ── Quick Actions Bar ── */}
      <div style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        padding: "12px 24px",
        background: "rgba(15,18,16,0.95)",
        backdropFilter: "blur(12px)",
        borderTop: `1px solid ${so.cardBorder}`,
        display: "flex",
        justifyContent: "center",
        gap: 12,
      }}>
        <Button variant="outline" size="sm" onClick={() => handleDeskClick(DESKS[0])} className="text-xs">
          <Gavel className="h-3.5 w-3.5 mr-1.5" /> New Filing
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleDeskClick(DESKS[1])} className="text-xs">
          <Send className="h-3.5 w-3.5 mr-1.5" /> Send Letter
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleDeskClick(DESKS[2])} className="text-xs">
          <FolderOpen className="h-3.5 w-3.5 mr-1.5" /> FOIA Request
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate("/deadline-calculator")} className="text-xs">
          <CalendarClock className="h-3.5 w-3.5 mr-1.5" /> Deadlines
        </Button>
      </div>
    </div>
  );
}
