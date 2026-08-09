import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Lightbulb,
  Scale,
  Briefcase,
  Coins,
  HandHeart,
  MessageCircle,
  Megaphone,
  Sparkles,
  ArrowRight,
  ChevronRight,
  ExternalLink,
  ClipboardList,
  GraduationCap,
  Search,
  MapPin,
  Eye,
  Shield,
  BookOpen,
  Users,
  Heart,
  FileText,
  Home,
  Phone,
  Globe,
  ThumbsUp,
  Plus,
  X,
  Loader2,
  CheckCircle2,
  Clock,
  Filter,
  Send,
  Library,
  AlertTriangle,
  Info,
  AlertCircle,
  ChevronDown,
  Wrench,
  Compass,
  DoorOpen,
} from "lucide-react";
import { toast } from "sonner";
import { useWorldIndex } from "@/hooks/useWorldIndex";

/* ═══════════════════════════════════════════════════════════════════════
   THE LIGHTHOUSE — Community Hub
   A warm, inviting bulletin-board for the community Luminari serves.
   Cork-board aesthetic with lighthouse beacon motif.
   Now wired to persistent database via tRPC.
   ═══════════════════════════════════════════════════════════════════════ */

// ── Design tokens ─────────────────────────────────────────────────────

const lh = {
  bg: "#1a1408",
  bgGrad: "radial-gradient(ellipse at 50% 0%, rgba(212,160,23,0.08) 0%, rgba(26,20,8,0) 70%)",
  cork: "#2a1f12",
  corkLight: "#352816",
  paper: "#f7f2e8",
  cream: "#ede7d9",
  ink: "#1a1410",
  muted: "#8b7e6e",
  rule: "#c8bfb0",
  gold: "#d4a017",
  goldSoft: "rgba(212,160,23,0.15)",
  goldBorder: "rgba(212,160,23,0.25)",
  amber: "#b7770d",
  warm: "#e8c87a",
  beacon: "#ffd54f",
  red: "#c0392b",
  green: "#2d8a56",
  navy: "#1a3a5c",
  teal: "#0e7490",
  purple: "#6b21a8",
  cardBg: "rgba(247,242,232,0.04)",
  cardBorder: "rgba(212,160,23,0.12)",
};

const fontSerif = "'Cormorant Garamond', serif";
const fontMono = "'DM Mono', monospace";
const fontSans = "'DM Sans', sans-serif";

// ── Types ─────────────────────────────────────────────────────────────

interface StationCard {
  id: string;
  icon: React.ElementType;
  title: string;
  subtitle: string;
  description: string;
  color: string;
  items: StationItem[];
  comingSoon?: boolean;
}

interface StationItem {
  label: string;
  description?: string;
  href?: string;
  action?: string;
  icon?: React.ElementType;
}

// ── Fallback spotlight data (used when DB is empty) ──────────────────

const fallbackSpotlight = [
  {
    id: 0,
    eyebrow: "THIS MONTH'S FOCUS",
    title: "Know Your Rights: Tenant Edition",
    description: "Facing an eviction notice? Dealing with unsafe living conditions? Learn what protections exist in your state and how to use them.",
    color: lh.gold,
    cta: "Learn More",
    href: null,
    active: true,
    sortOrder: 0,
    startDate: null,
    endDate: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 0,
    eyebrow: "DID YOU KNOW?",
    title: "Arizona Has $900M+ in Unclaimed Property",
    description: "Money from old bank accounts, insurance payouts, and foreclosure surplus sits waiting. It takes 2 minutes to check if any belongs to you.",
    color: lh.green,
    cta: "Check Now",
    href: null,
    active: true,
    sortOrder: 1,
    startDate: null,
    endDate: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 0,
    eyebrow: "UPCOMING WORKSHOP",
    title: "Free Trade Skills Workshop — HVAC Certification",
    description: "Partner organizations are offering free HVAC certification prep courses. No experience needed. Available in MO, PA, and AZ.",
    color: lh.teal,
    cta: "View Details",
    href: null,
    active: true,
    sortOrder: 2,
    startDate: null,
    endDate: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

// ── Station data ──────────────────────────────────────────────────────

const stations: StationCard[] = [
  {
    id: "find-help",
    icon: ClipboardList,
    title: "Find Help Now",
    subtitle: "Intake Forms & Filing Templates",
    description: "Pre-built templates for the most common filings. Pick your situation, fill in the details, and get a document ready to submit — powered by LumenSend.",
    color: lh.red,
    items: [
      { label: "Eviction Defense", description: "Answer to unlawful detainer, habitability complaints", icon: Home, action: "lumensend:appeal" },
      { label: "Wage Theft Complaint", description: "Unpaid wages, overtime violations, final paycheck", icon: Briefcase, action: "lumensend:complaint" },
      { label: "Benefits Appeal", description: "SNAP denial, Medicaid termination, TANF reduction", icon: Shield, action: "lumensend:appeal" },
      { label: "Insurance Claim Denial", description: "Health, auto, homeowner claim disputes", icon: FileText, action: "lumensend:complaint" },
      { label: "FOIA Request", description: "Public records requests to government agencies", icon: Search, action: "lumensend:inquiry" },
      { label: "Fair Hearing Request", description: "Administrative hearing for benefits decisions", icon: Scale, action: "lumensend:demand" },
    ],
  },
  {
    id: "know-rights",
    icon: BookOpen,
    title: "Know Your Rights",
    subtitle: "Legal Info, Workshops & Clinics",
    description: "Understand what protections exist in your state. Find free legal clinics and upcoming know-your-rights workshops near you.",
    color: lh.navy,
    items: [
      { label: "Tenant Rights by State", description: "Eviction protections, repair rights, security deposits", icon: Home },
      { label: "Worker Rights", description: "Minimum wage, overtime, workplace safety, retaliation", icon: Briefcase },
      { label: "Benefits Eligibility", description: "SNAP, Medicaid, TANF, WIC qualification guides", icon: Shield },
      { label: "Legal Aid Clinics", description: "Free legal help in your area", icon: Scale },
      { label: "Workshop Calendar", description: "Upcoming know-your-rights sessions", icon: GraduationCap },
    ],
  },
  {
    id: "jobs",
    icon: Briefcase,
    title: "Job Board",
    subtitle: "Opportunities & Apprenticeships",
    description: "Vetted job postings, trade apprenticeships, and workforce development programs. Especially strong in skilled trades.",
    color: lh.teal,
    items: [
      { label: "Trade Apprenticeships", description: "HVAC, electrical, plumbing, welding", icon: GraduationCap },
      { label: "Entry-Level Positions", description: "No experience required", icon: Briefcase },
      { label: "Workforce Development", description: "Job training programs and certifications", icon: BookOpen },
      { label: "Resume Help", description: "Free resume review and interview prep", icon: FileText },
    ],
  },
  {
    id: "unclaimed",
    icon: Coins,
    title: "Unclaimed Money",
    subtitle: "Funds You May Be Owed",
    description: "Every state holds unclaimed property — old bank accounts, insurance payouts, foreclosure surplus. Check if money is waiting for you.",
    color: lh.green,
    items: [
      { label: "Arizona", href: "https://unclaimed.az.gov/", icon: MapPin },
      { label: "California", href: "https://www.sco.ca.gov/upd_msg.html", icon: MapPin },
      { label: "Missouri", href: "https://treasurer.mo.gov/unclaimedproperty/", icon: MapPin },
      { label: "Oregon", href: "https://unclaimed.oregon.gov/", icon: MapPin },
      { label: "Pennsylvania", href: "https://www.patreasury.gov/unclaimed-property/", icon: MapPin },
      { label: "Washington", href: "https://ucp.dor.wa.gov/", icon: MapPin },
      { label: "MissingMoney.com (All States)", href: "https://www.missingmoney.com/", icon: Globe },
      { label: "Foreclosure Surplus Funds", description: "Check your county clerk's office", icon: Search },
    ],
  },
  {
    id: "resources",
    icon: HandHeart,
    title: "Community Resources",
    subtitle: "Mutual Aid & Support Services",
    description: "Food pantries, shelters, DV organizations, health clinics, and tribal resources organized by state and county.",
    color: lh.purple,
    items: [
      { label: "Food Assistance", description: "Pantries, meal programs, SNAP offices", icon: Heart },
      { label: "Housing & Shelter", description: "Emergency shelter, transitional housing", icon: Home },
      { label: "Domestic Violence", description: "Hotlines, safe houses, legal advocacy", icon: Phone },
      { label: "Health Clinics", description: "Free and sliding-scale health services", icon: Shield },
      { label: "Tribal Resources", description: "Services for tribal communities in all 6 states", icon: Users },
      { label: "211 Helpline", href: "https://www.211.org/", description: "Connect to local services 24/7", icon: Phone },
    ],
  },
  {
    id: "community",
    icon: MessageCircle,
    title: "Community Board",
    subtitle: "Help Wanted & Help Offered",
    description: "A place to ask for help, offer skills, share resources, and connect with neighbors. The digital break room.",
    color: lh.amber,
    items: [
      { label: "Ask for Help", description: "Post what you need — someone may be able to help", icon: Megaphone },
      { label: "Offer Help", description: "Share your skills, time, or resources", icon: HandHeart },
      { label: "Skill Shares", description: "Teach or learn something new", icon: GraduationCap },
      { label: "Resource Sharing", description: "Tools, supplies, transportation", icon: Users },
    ],
  },
];

// ── Lighthouse Beacon SVG ─────────────────────────────────────────────

function LighthouseBeacon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g opacity="0.3">
        <line x1="24" y1="8" x2="24" y2="2" stroke={lh.beacon} strokeWidth="2" strokeLinecap="round" />
        <line x1="24" y1="8" x2="18" y2="3" stroke={lh.beacon} strokeWidth="1.5" strokeLinecap="round" />
        <line x1="24" y1="8" x2="30" y2="3" stroke={lh.beacon} strokeWidth="1.5" strokeLinecap="round" />
        <line x1="24" y1="8" x2="14" y2="5" stroke={lh.beacon} strokeWidth="1" strokeLinecap="round" />
        <line x1="24" y1="8" x2="34" y2="5" stroke={lh.beacon} strokeWidth="1" strokeLinecap="round" />
      </g>
      <circle cx="24" cy="12" r="4" fill={lh.beacon} opacity="0.6" />
      <circle cx="24" cy="12" r="2" fill={lh.beacon} />
      <path d="M20 14 L22 14 L21 38 L18 42 L30 42 L27 38 L26 14 L28 14" fill="none" stroke={lh.warm} strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="22" y="20" width="4" height="3" rx="0.5" fill={lh.goldSoft} stroke={lh.warm} strokeWidth="0.5" />
      <rect x="22" y="26" width="4" height="3" rx="0.5" fill={lh.goldSoft} stroke={lh.warm} strokeWidth="0.5" />
      <line x1="16" y1="42" x2="32" y2="42" stroke={lh.warm} strokeWidth="2" strokeLinecap="round" />
      <line x1="19" y1="14" x2="29" y2="14" stroke={lh.warm} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ── Pin component ─────────────────────────────────────────────────────

function PushPin({ color = lh.gold, style }: { color?: string; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        background: `radial-gradient(circle at 35% 35%, ${color}, ${color}88)`,
        boxShadow: `0 2px 4px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.3)`,
        ...style,
      }}
    />
  );
}

// ── Station Card Component ────────────────────────────────────────────

function StationCardView({ station, onExpand }: { station: StationCard; onExpand: (id: string) => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onExpand(station.id)}
      style={{
        background: lh.cardBg,
        border: `1px solid ${hovered ? lh.goldBorder : lh.cardBorder}`,
        borderRadius: 8,
        padding: "24px 20px 20px",
        cursor: "pointer",
        position: "relative",
        transition: "all 0.2s ease",
        transform: hovered ? "translateY(-2px)" : "none",
        boxShadow: hovered ? `0 8px 24px rgba(0,0,0,0.3), 0 0 0 1px ${lh.goldBorder}` : "0 2px 8px rgba(0,0,0,0.15)",
      }}
    >
      <div style={{ position: "absolute", top: 8, right: 12 }}>
        <PushPin color={station.color} />
      </div>

      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          background: `${station.color}15`,
          border: `1px solid ${station.color}25`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 14,
        }}
      >
        <station.icon size={20} color={station.color} />
      </div>

      <h3
        style={{
          fontFamily: fontSerif,
          fontSize: 19,
          fontWeight: 600,
          color: lh.paper,
          lineHeight: 1.2,
          marginBottom: 4,
        }}
      >
        {station.title}
      </h3>

      <p
        style={{
          fontFamily: fontMono,
          fontSize: 9,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: station.color,
          opacity: 0.7,
          marginBottom: 10,
        }}
      >
        {station.subtitle}
      </p>

      <p
        style={{
          fontFamily: fontSans,
          fontSize: 13,
          color: lh.muted,
          lineHeight: 1.5,
          marginBottom: 14,
        }}
      >
        {station.description}
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          color: hovered ? lh.gold : lh.muted,
          transition: "color 0.2s",
        }}
      >
        <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.05em" }}>
          {station.comingSoon ? "COMING SOON" : "EXPLORE"}
        </span>
        <ChevronRight size={12} />
      </div>

      {station.comingSoon && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            fontFamily: fontMono,
            fontSize: 8,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: lh.amber,
            background: `${lh.amber}18`,
            border: `1px solid ${lh.amber}30`,
            padding: "2px 8px",
            borderRadius: 100,
          }}
        >
          Coming Soon
        </div>
      )}
    </div>
  );
}

// ── Station Detail Panel ──────────────────────────────────────────────

function StationDetail({ station, onClose }: { station: StationCard; onClose: () => void }) {
  const [, navigate] = useLocation();
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: lh.cork,
          border: `1px solid ${lh.goldBorder}`,
          borderRadius: 12,
          width: "min(600px, 92vw)",
          maxHeight: "85vh",
          overflow: "auto",
          position: "relative",
        }}
      >
        <div style={{ height: 4, background: station.color, borderRadius: "12px 12px 0 0" }} />

        <div style={{ padding: "24px 28px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: `${station.color}18`,
                border: `1px solid ${station.color}30`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <station.icon size={22} color={station.color} />
            </div>
            <div>
              <h2 style={{ fontFamily: fontSerif, fontSize: 24, fontWeight: 600, color: lh.paper, lineHeight: 1.2 }}>
                {station.title}
              </h2>
              <p style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: station.color, opacity: 0.8 }}>
                {station.subtitle}
              </p>
            </div>
          </div>
          <p style={{ fontFamily: fontSans, fontSize: 14, color: lh.muted, lineHeight: 1.6, marginTop: 8 }}>
            {station.description}
          </p>
        </div>

        <div style={{ height: 1, background: lh.cardBorder, margin: "0 28px" }} />

        <div style={{ padding: "16px 28px 28px" }}>
          {station.items.map((item, i) => {
            const ItemIcon = item.icon || FileText;
            return (
              <div
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  if (item.href) {
                    window.open(item.href, "_blank");
                  } else if (item.action?.startsWith("lumensend:")) {
                    const docType = item.action.split(":")[1];
                    navigate(`/lumensend?type=${docType}`);
                  } else if (station.comingSoon) {
                    toast("Coming soon — this feature is being built.");
                  } else {
                    toast("Opening intake form...", { description: "This will guide you through the filing process." });
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 12px",
                  borderRadius: 8,
                  cursor: "pointer",
                  transition: "background 0.15s",
                  borderBottom: i < station.items.length - 1 ? `1px solid ${lh.cardBorder}` : "none",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = lh.cardBg; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    background: `${station.color}10`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <ItemIcon size={16} color={station.color} style={{ opacity: 0.7 }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: fontSans, fontSize: 14, fontWeight: 500, color: lh.paper, lineHeight: 1.3 }}>
                    {item.label}
                  </p>
                  {item.description && (
                    <p style={{ fontFamily: fontSans, fontSize: 12, color: lh.muted, lineHeight: 1.4, marginTop: 2 }}>
                      {item.description}
                    </p>
                  )}
                </div>
                {item.href ? (
                  <ExternalLink size={14} color={lh.muted} style={{ flexShrink: 0 }} />
                ) : (
                  <ArrowRight size={14} color={lh.muted} style={{ flexShrink: 0 }} />
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            width: 28,
            height: 28,
            borderRadius: 6,
            background: "rgba(255,255,255,0.05)",
            border: `1px solid ${lh.cardBorder}`,
            color: lh.muted,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: fontMono,
            fontSize: 14,
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

// ── Suggestion Board Component (Live DB) ─────────────────────────────

function SuggestionBoard() {
  const { isAuthenticated } = useAuth();
  const [suggestion, setSuggestion] = useState("");

  const utils = trpc.useUtils();
  const suggestionsQuery = trpc.lighthouse.suggestions.list.useQuery(
    { status: undefined, limit: 20, offset: 0 },
    { refetchOnWindowFocus: false }
  );
  const myVotesQuery = trpc.lighthouse.suggestions.myVotes.useQuery(
    undefined,
    { enabled: isAuthenticated, refetchOnWindowFocus: false }
  );

  const createMutation = trpc.lighthouse.suggestions.create.useMutation({
    onSuccess: () => {
      toast.success("Thank you! Your suggestion has been submitted.", {
        description: "We review every suggestion and add the best ideas to the board.",
      });
      setSuggestion("");
      utils.lighthouse.suggestions.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const voteMutation = trpc.lighthouse.suggestions.vote.useMutation({
    onSuccess: () => {
      utils.lighthouse.suggestions.list.invalidate();
      utils.lighthouse.suggestions.myVotes.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const unvoteMutation = trpc.lighthouse.suggestions.unvote.useMutation({
    onSuccess: () => {
      utils.lighthouse.suggestions.list.invalidate();
      utils.lighthouse.suggestions.myVotes.invalidate();
    },
  });

  const handleSubmit = () => {
    if (!suggestion.trim()) return;
    if (!isAuthenticated) {
      toast.error("Please sign in to submit a suggestion.");
      return;
    }
    createMutation.mutate({ content: suggestion.trim() });
  };

  const myVotedIds = new Set(myVotesQuery.data ?? []);
  const suggestions = suggestionsQuery.data ?? [];

  const statusColors: Record<string, string> = {
    pending: lh.muted,
    reviewed: lh.navy,
    accepted: lh.teal,
    implemented: lh.green,
    declined: lh.red,
  };

  return (
    <div
      style={{
        background: lh.cardBg,
        border: `1px solid ${lh.cardBorder}`,
        borderRadius: 8,
        padding: "20px 24px",
        position: "relative",
      }}
    >
      <div style={{ position: "absolute", top: 8, right: 12 }}>
        <PushPin color={lh.amber} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Megaphone size={18} color={lh.amber} />
        <h3 style={{ fontFamily: fontSerif, fontSize: 18, fontWeight: 600, color: lh.paper }}>
          Suggestion Board
        </h3>
      </div>

      <p style={{ fontFamily: fontSans, fontSize: 13, color: lh.muted, lineHeight: 1.5, marginBottom: 14 }}>
        What would help your community? Tell us what you'd like to see on this board.
      </p>

      {/* Submit form */}
      <div style={{ display: "flex", gap: 8, marginBottom: suggestions.length > 0 ? 20 : 0 }}>
        <input
          type="text"
          value={suggestion}
          onChange={(e) => setSuggestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder={isAuthenticated ? "I wish there was..." : "Sign in to submit a suggestion"}
          disabled={!isAuthenticated}
          style={{
            flex: 1,
            fontFamily: fontSans,
            fontSize: 13,
            color: lh.paper,
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${lh.cardBorder}`,
            borderRadius: 6,
            padding: "8px 12px",
            outline: "none",
            opacity: isAuthenticated ? 1 : 0.5,
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={!suggestion.trim() || createMutation.isPending}
          style={{
            fontFamily: fontMono,
            fontSize: 11,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: lh.paper,
            background: lh.goldSoft,
            border: `1px solid ${lh.goldBorder}`,
            borderRadius: 6,
            padding: "8px 16px",
            cursor: suggestion.trim() ? "pointer" : "not-allowed",
            opacity: suggestion.trim() ? 1 : 0.5,
            transition: "all 0.2s",
          }}
        >
          {createMutation.isPending ? "..." : "Submit"}
        </button>
      </div>

      {/* Existing suggestions */}
      {suggestions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {suggestions.map((s) => {
            const hasVoted = myVotedIds.has(s.id);
            return (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 6,
                  background: "rgba(255,255,255,0.02)",
                  border: `1px solid ${lh.cardBorder}`,
                }}
              >
                {/* Vote button */}
                <button
                  onClick={() => {
                    if (!isAuthenticated) {
                      toast.error("Please sign in to vote.");
                      return;
                    }
                    if (hasVoted) {
                      unvoteMutation.mutate({ suggestionId: s.id });
                    } else {
                      voteMutation.mutate({ suggestionId: s.id });
                    }
                  }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 2,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: "4px 6px",
                    borderRadius: 4,
                    minWidth: 36,
                    color: hasVoted ? lh.gold : lh.muted,
                    transition: "color 0.15s",
                  }}
                >
                  <ThumbsUp size={14} style={{ transform: hasVoted ? "scale(1.1)" : "none", transition: "transform 0.15s" }} />
                  <span style={{ fontFamily: fontMono, fontSize: 11 }}>{s.votes}</span>
                </button>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: fontSans, fontSize: 13, color: lh.paper, lineHeight: 1.5 }}>
                    {s.content}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <span
                      style={{
                        fontFamily: fontMono,
                        fontSize: 9,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: statusColors[s.status] ?? lh.muted,
                        background: `${statusColors[s.status] ?? lh.muted}15`,
                        padding: "1px 6px",
                        borderRadius: 100,
                      }}
                    >
                      {s.status}
                    </span>
                    <span style={{ fontFamily: fontMono, fontSize: 9, color: `${lh.muted}80` }}>
                      {new Date(s.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {s.adminNote && (
                    <p style={{ fontFamily: fontSans, fontSize: 12, color: lh.gold, marginTop: 6, fontStyle: "italic" }}>
                      Admin: {s.adminNote}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Job Board Panel (Live DB) ────────────────────────────────────────

function JobBoardPanel({ onClose }: { onClose: () => void }) {
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined);
  const jobsQuery = trpc.lighthouse.jobs.list.useQuery(
    { status: "active", category: categoryFilter as any, limit: 50 },
    { refetchOnWindowFocus: false }
  );

  const jobs = jobsQuery.data ?? [];
  const categories = ["trades", "healthcare", "social_services", "legal", "education", "technology", "general"];
  const categoryLabels: Record<string, string> = {
    trades: "Trades", healthcare: "Healthcare", social_services: "Social Services",
    legal: "Legal", education: "Education", technology: "Technology", general: "General",
  };
  const typeLabels: Record<string, string> = {
    full_time: "Full Time", part_time: "Part Time", apprenticeship: "Apprenticeship",
    internship: "Internship", training_program: "Training", volunteer: "Volunteer",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: lh.cork,
          border: `1px solid ${lh.goldBorder}`,
          borderRadius: 12,
          width: "min(700px, 92vw)",
          maxHeight: "85vh",
          overflow: "auto",
          position: "relative",
        }}
      >
        <div style={{ height: 4, background: lh.teal, borderRadius: "12px 12px 0 0" }} />

        <div style={{ padding: "24px 28px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: `${lh.teal}18`, border: `1px solid ${lh.teal}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Briefcase size={22} color={lh.teal} />
            </div>
            <div>
              <h2 style={{ fontFamily: fontSerif, fontSize: 24, fontWeight: 600, color: lh.paper, lineHeight: 1.2 }}>Job Board</h2>
              <p style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: lh.teal, opacity: 0.8 }}>
                Opportunities & Apprenticeships
              </p>
            </div>
          </div>

          {/* Category filter */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            <button
              onClick={() => setCategoryFilter(undefined)}
              style={{
                fontFamily: fontMono, fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase",
                color: !categoryFilter ? lh.paper : lh.muted,
                background: !categoryFilter ? lh.goldSoft : "transparent",
                border: `1px solid ${!categoryFilter ? lh.goldBorder : lh.cardBorder}`,
                borderRadius: 100, padding: "4px 12px", cursor: "pointer",
              }}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat === categoryFilter ? undefined : cat)}
                style={{
                  fontFamily: fontMono, fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase",
                  color: categoryFilter === cat ? lh.paper : lh.muted,
                  background: categoryFilter === cat ? lh.goldSoft : "transparent",
                  border: `1px solid ${categoryFilter === cat ? lh.goldBorder : lh.cardBorder}`,
                  borderRadius: 100, padding: "4px 12px", cursor: "pointer",
                }}
              >
                {categoryLabels[cat]}
              </button>
            ))}
          </div>
        </div>

        <div style={{ height: 1, background: lh.cardBorder, margin: "0 28px" }} />

        <div style={{ padding: "16px 28px 28px" }}>
          {jobsQuery.isLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: lh.muted }}>
              <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
              <p style={{ fontFamily: fontSans, fontSize: 13, marginTop: 8 }}>Loading jobs...</p>
            </div>
          ) : jobs.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40 }}>
              <Briefcase size={32} color={lh.muted} style={{ opacity: 0.3, marginBottom: 12 }} />
              <p style={{ fontFamily: fontSans, fontSize: 14, color: lh.muted }}>
                No job postings yet. Check back soon — we're building partnerships with employers and training programs.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {jobs.map((job) => (
                <div
                  key={job.id}
                  style={{
                    padding: "16px",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.02)",
                    border: `1px solid ${lh.cardBorder}`,
                    cursor: job.url ? "pointer" : "default",
                  }}
                  onClick={() => {
                    if (job.url) window.open(job.url, "_blank");
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div>
                      <h4 style={{ fontFamily: fontSans, fontSize: 15, fontWeight: 600, color: lh.paper, lineHeight: 1.3 }}>
                        {job.title}
                      </h4>
                      <p style={{ fontFamily: fontSans, fontSize: 13, color: lh.muted }}>{job.organization}</p>
                    </div>
                    {job.url && <ExternalLink size={14} color={lh.muted} />}
                  </div>
                  <p style={{ fontFamily: fontSans, fontSize: 13, color: lh.muted, lineHeight: 1.5, marginBottom: 8 }}>
                    {job.description.length > 200 ? job.description.slice(0, 200) + "..." : job.description}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <span style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: lh.teal, background: `${lh.teal}15`, padding: "2px 8px", borderRadius: 100 }}>
                      {typeLabels[job.jobType] ?? job.jobType}
                    </span>
                    {job.category !== "general" && (
                      <span style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: lh.gold, background: lh.goldSoft, padding: "2px 8px", borderRadius: 100 }}>
                        {categoryLabels[job.category] ?? job.category}
                      </span>
                    )}
                    {job.location && (
                      <span style={{ fontFamily: fontMono, fontSize: 9, color: lh.muted, display: "flex", alignItems: "center", gap: 3 }}>
                        <MapPin size={10} /> {job.location}{job.stateCode ? `, ${job.stateCode}` : ""}
                      </span>
                    )}
                    {job.remote && (
                      <span style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: lh.green, background: `${lh.green}15`, padding: "2px 8px", borderRadius: 100 }}>
                        Remote
                      </span>
                    )}
                    {job.compensation && (
                      <span style={{ fontFamily: fontMono, fontSize: 9, color: lh.green }}>
                        {job.compensation}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 16, right: 16, width: 28, height: 28, borderRadius: 6,
            background: "rgba(255,255,255,0.05)", border: `1px solid ${lh.cardBorder}`,
            color: lh.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: fontMono, fontSize: 14,
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

// ── Community Board Panel (Live DB) ──────────────────────────────────

function CommunityBoardPanel({ onClose }: { onClose: () => void }) {
  const { isAuthenticated } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined);
  const [newPost, setNewPost] = useState({ title: "", content: "", category: "general" as string, stateCode: "" });

  const utils = trpc.useUtils();
  const postsQuery = trpc.lighthouse.posts.list.useQuery(
    { category: categoryFilter as any, status: "active", limit: 50 },
    { refetchOnWindowFocus: false }
  );

  const createMutation = trpc.lighthouse.posts.create.useMutation({
    onSuccess: () => {
      toast.success("Post created!");
      setShowForm(false);
      setNewPost({ title: "", content: "", category: "general", stateCode: "" });
      utils.lighthouse.posts.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const posts = postsQuery.data ?? [];
  const categoryLabels: Record<string, string> = {
    ask_help: "Ask for Help", offer_help: "Offer Help", skill_share: "Skill Share",
    resource_share: "Resource Share", general: "General",
  };
  const categoryColors: Record<string, string> = {
    ask_help: lh.red, offer_help: lh.green, skill_share: lh.teal,
    resource_share: lh.purple, general: lh.muted,
  };
  const categoryIcons: Record<string, React.ElementType> = {
    ask_help: Megaphone, offer_help: HandHeart, skill_share: GraduationCap,
    resource_share: Users, general: MessageCircle,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: lh.cork,
          border: `1px solid ${lh.goldBorder}`,
          borderRadius: 12,
          width: "min(700px, 92vw)",
          maxHeight: "85vh",
          overflow: "auto",
          position: "relative",
        }}
      >
        <div style={{ height: 4, background: lh.amber, borderRadius: "12px 12px 0 0" }} />

        <div style={{ padding: "24px 28px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: `${lh.amber}18`, border: `1px solid ${lh.amber}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <MessageCircle size={22} color={lh.amber} />
              </div>
              <div>
                <h2 style={{ fontFamily: fontSerif, fontSize: 24, fontWeight: 600, color: lh.paper, lineHeight: 1.2 }}>Community Board</h2>
                <p style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: lh.amber, opacity: 0.8 }}>
                  Help Wanted & Help Offered
                </p>
              </div>
            </div>
            {isAuthenticated && (
              <button
                onClick={() => setShowForm(!showForm)}
                style={{
                  fontFamily: fontMono, fontSize: 11, letterSpacing: "0.05em",
                  color: lh.paper, background: lh.goldSoft, border: `1px solid ${lh.goldBorder}`,
                  borderRadius: 6, padding: "7px 14px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <Plus size={14} /> New Post
              </button>
            )}
          </div>

          {/* New post form */}
          {showForm && (
            <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${lh.cardBorder}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <input
                type="text"
                value={newPost.title}
                onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
                placeholder="Post title..."
                style={{
                  width: "100%", fontFamily: fontSans, fontSize: 14, color: lh.paper,
                  background: "rgba(255,255,255,0.04)", border: `1px solid ${lh.cardBorder}`,
                  borderRadius: 6, padding: "8px 12px", outline: "none", marginBottom: 8,
                }}
              />
              <textarea
                value={newPost.content}
                onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                placeholder="What's on your mind?"
                rows={3}
                style={{
                  width: "100%", fontFamily: fontSans, fontSize: 13, color: lh.paper,
                  background: "rgba(255,255,255,0.04)", border: `1px solid ${lh.cardBorder}`,
                  borderRadius: 6, padding: "8px 12px", outline: "none", resize: "vertical", marginBottom: 8,
                }}
              />
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  value={newPost.category}
                  onChange={(e) => setNewPost({ ...newPost, category: e.target.value })}
                  style={{
                    fontFamily: fontMono, fontSize: 11, color: lh.paper,
                    background: "rgba(255,255,255,0.04)", border: `1px solid ${lh.cardBorder}`,
                    borderRadius: 6, padding: "6px 10px", outline: "none",
                  }}
                >
                  {Object.entries(categoryLabels).map(([k, v]) => (
                    <option key={k} value={k} style={{ background: lh.cork }}>{v}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newPost.stateCode}
                  onChange={(e) => setNewPost({ ...newPost, stateCode: e.target.value.toUpperCase().slice(0, 2) })}
                  placeholder="State (e.g. MO)"
                  maxLength={2}
                  style={{
                    width: 80, fontFamily: fontMono, fontSize: 11, color: lh.paper,
                    background: "rgba(255,255,255,0.04)", border: `1px solid ${lh.cardBorder}`,
                    borderRadius: 6, padding: "6px 10px", outline: "none", textTransform: "uppercase",
                  }}
                />
                <div style={{ flex: 1 }} />
                <button
                  onClick={() => setShowForm(false)}
                  style={{ fontFamily: fontMono, fontSize: 11, color: lh.muted, background: "transparent", border: "none", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!newPost.title.trim() || !newPost.content.trim()) {
                      toast.error("Title and content are required.");
                      return;
                    }
                    createMutation.mutate({
                      title: newPost.title.trim(),
                      content: newPost.content.trim(),
                      category: newPost.category as any,
                      stateCode: newPost.stateCode || undefined,
                    });
                  }}
                  disabled={createMutation.isPending}
                  style={{
                    fontFamily: fontMono, fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase",
                    color: lh.paper, background: lh.goldSoft, border: `1px solid ${lh.goldBorder}`,
                    borderRadius: 6, padding: "6px 14px", cursor: "pointer",
                  }}
                >
                  {createMutation.isPending ? "Posting..." : "Post"}
                </button>
              </div>
            </div>
          )}

          {/* Category filter */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <button
              onClick={() => setCategoryFilter(undefined)}
              style={{
                fontFamily: fontMono, fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase",
                color: !categoryFilter ? lh.paper : lh.muted,
                background: !categoryFilter ? lh.goldSoft : "transparent",
                border: `1px solid ${!categoryFilter ? lh.goldBorder : lh.cardBorder}`,
                borderRadius: 100, padding: "4px 12px", cursor: "pointer",
              }}
            >
              All
            </button>
            {Object.entries(categoryLabels).map(([k, v]) => (
              <button
                key={k}
                onClick={() => setCategoryFilter(k === categoryFilter ? undefined : k)}
                style={{
                  fontFamily: fontMono, fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase",
                  color: categoryFilter === k ? lh.paper : lh.muted,
                  background: categoryFilter === k ? lh.goldSoft : "transparent",
                  border: `1px solid ${categoryFilter === k ? lh.goldBorder : lh.cardBorder}`,
                  borderRadius: 100, padding: "4px 12px", cursor: "pointer",
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div style={{ height: 1, background: lh.cardBorder, margin: "0 28px" }} />

        <div style={{ padding: "16px 28px 28px" }}>
          {postsQuery.isLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: lh.muted }}>
              <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
              <p style={{ fontFamily: fontSans, fontSize: 13, marginTop: 8 }}>Loading posts...</p>
            </div>
          ) : posts.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40 }}>
              <MessageCircle size={32} color={lh.muted} style={{ opacity: 0.3, marginBottom: 12 }} />
              <p style={{ fontFamily: fontSans, fontSize: 14, color: lh.muted }}>
                No posts yet. Be the first to share something with the community!
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {posts.map((post) => {
                const CatIcon = categoryIcons[post.category] ?? MessageCircle;
                const catColor = categoryColors[post.category] ?? lh.muted;
                return (
                  <div
                    key={post.id}
                    style={{
                      padding: "14px 16px",
                      borderRadius: 8,
                      background: "rgba(255,255,255,0.02)",
                      border: `1px solid ${lh.cardBorder}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <CatIcon size={14} color={catColor} />
                      <span style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: catColor }}>
                        {categoryLabels[post.category] ?? post.category}
                      </span>
                      {post.stateCode && (
                        <span style={{ fontFamily: fontMono, fontSize: 9, color: lh.muted, display: "flex", alignItems: "center", gap: 2 }}>
                          <MapPin size={9} /> {post.stateCode}
                        </span>
                      )}
                      <span style={{ fontFamily: fontMono, fontSize: 9, color: `${lh.muted}80`, marginLeft: "auto" }}>
                        {new Date(post.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <h4 style={{ fontFamily: fontSans, fontSize: 14, fontWeight: 600, color: lh.paper, lineHeight: 1.3, marginBottom: 4 }}>
                      {post.title}
                    </h4>
                    <p style={{ fontFamily: fontSans, fontSize: 13, color: lh.muted, lineHeight: 1.5 }}>
                      {post.content.length > 300 ? post.content.slice(0, 300) + "..." : post.content}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 16, right: 16, width: 28, height: 28, borderRadius: 6,
            background: "rgba(255,255,255,0.05)", border: `1px solid ${lh.cardBorder}`,
            color: lh.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: fontMono, fontSize: 14,
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

// ── State Quick Lookup — Layer 0 Critical Alerts ──────────────────────

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia", PR: "Puerto Rico", GU: "Guam", VI: "US Virgin Islands",
  AS: "American Samoa", MP: "Northern Mariana Islands",
};

function CanonicalCoreStats() {
  const { nodes, edges, isLoading, jurisdictions } = useWorldIndex();
  if (isLoading) return null;
  const typeCounts = nodes.reduce((acc: Record<string, number>, n) => {
    acc[n.type] = (acc[n.type] || 0) + 1;
    return acc;
  }, {});
  const stats = [
    { label: "Jurisdictions", value: jurisdictions.length, color: lh.gold },
    { label: "Programs", value: typeCounts["program"] || 0, color: lh.teal },
    { label: "Agencies", value: typeCounts["agency"] || 0, color: lh.navy },
    { label: "Signals", value: typeCounts["signal"] || 0, color: lh.amber },
    { label: "Workflows", value: typeCounts["workflow"] || 0, color: lh.purple },
    { label: "Relationships", value: edges.length, color: lh.green },
  ];
  return (
    <div style={{
      background: lh.cardBg,
      border: `1px solid ${lh.cardBorder}`,
      borderRadius: 10,
      padding: "20px 24px",
      marginBottom: 24,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Compass size={16} color={lh.gold} />
        <span style={{ fontFamily: fontSerif, fontSize: 15, color: lh.paper, fontWeight: 600 }}>
          Canonical Knowledge Core
        </span>
        <span style={{ fontFamily: fontMono, fontSize: 10, color: lh.muted, marginLeft: "auto" }}>
          {nodes.length} nodes · {edges.length} edges
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
        {stats.map((s) => (
          <div key={s.label} style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 8,
            padding: "12px 14px",
            textAlign: "center",
          }}>
            <div style={{ fontFamily: fontMono, fontSize: 20, fontWeight: 700, color: s.color }}>
              {s.value.toLocaleString()}
            </div>
            <div style={{ fontFamily: fontMono, fontSize: 10, color: lh.muted, marginTop: 2 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StateQuickLookup() {
  const [selectedState, setSelectedState] = useState<string>("");
  const [expanded, setExpanded] = useState(false);
  const [, navigate] = useLocation();

  const profileQuery = trpc.lighthouse.registry.stateProfile.useQuery(
    { stateCode: selectedState },
    { enabled: selectedState.length === 2 }
  );

  const profile = profileQuery.data;
  const flags = profile?.layer0Flags || [];
  const alertFlags = flags.filter((f: any) => f.severity === "alert");
  const warningFlags = flags.filter((f: any) => f.severity === "warning");
  const infoFlags = flags.filter((f: any) => f.severity === "info");

  const severityIcon = (sev: string) => {
    if (sev === "alert") return <AlertCircle size={14} color="#ef4444" />;
    if (sev === "warning") return <AlertTriangle size={14} color="#f59e0b" />;
    return <Info size={14} color="#3b82f6" />;
  };
  const severityBg = (sev: string) => {
    if (sev === "alert") return "rgba(239,68,68,0.08)";
    if (sev === "warning") return "rgba(245,158,11,0.08)";
    return "rgba(59,130,246,0.06)";
  };
  const severityBorder = (sev: string) => {
    if (sev === "alert") return "rgba(239,68,68,0.25)";
    if (sev === "warning") return "rgba(245,158,11,0.25)";
    return "rgba(59,130,246,0.15)";
  };
  const severityText = (sev: string) => {
    if (sev === "alert") return "#fca5a5";
    if (sev === "warning") return "#fcd34d";
    return "#93c5fd";
  };

  return (
    <div style={{
      background: lh.cardBg,
      border: `1px solid ${lh.cardBorder}`,
      borderRadius: 10,
      padding: "24px 28px",
      marginBottom: 40,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Shield size={18} color={lh.gold} />
          <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: lh.gold }}>Critical Alerts</span>
        </div>
        <span style={{ fontFamily: fontSans, fontSize: 12, color: lh.muted }}>Know before you file</span>
      </div>

      <p style={{ fontFamily: fontSans, fontSize: 13, color: lh.muted, lineHeight: 1.6, marginBottom: 16 }}>
        Select a state to see its critical policy alerts — filing deadlines, benefit traps, disqualification windows, and structural barriers that could affect your case.
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <select
          value={selectedState}
          onChange={(e) => { setSelectedState(e.target.value); setExpanded(false); }}
          style={{
            background: "rgba(255,255,255,0.05)",
            border: `1px solid ${lh.cardBorder}`,
            borderRadius: 6,
            padding: "8px 12px",
            color: lh.paper,
            fontFamily: fontSans,
            fontSize: 13,
            minWidth: 220,
            cursor: "pointer",
          }}
        >
          <option value="" style={{ background: lh.bg }}>Select a state or territory...</option>
          {Object.entries(STATE_NAMES).sort((a, b) => a[1].localeCompare(b[1])).map(([code, name]) => (
            <option key={code} value={code} style={{ background: lh.bg }}>{name} ({code})</option>
          ))}
        </select>
        {profileQuery.isLoading && <Loader2 size={16} color={lh.gold} style={{ animation: "spin 1s linear infinite" }} />}
      </div>

      {profile && (
        <div>
          {/* State header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ fontFamily: fontSerif, fontSize: 20, fontWeight: 600, color: lh.paper }}>
              {profile.stateName}
            </h3>
            <div style={{ display: "flex", gap: 12, fontFamily: fontMono, fontSize: 11, color: lh.muted }}>
              <span>{profile.programCount} programs</span>
              <span>{flags.length} flags</span>
              {profile.workflowCount > 0 && <span>{profile.workflowCount} workflows</span>}
            </div>
          </div>

          {/* Alert flags — always visible */}
          {alertFlags.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#ef4444", marginBottom: 8 }}>Critical Alerts</div>
              {alertFlags.map((f: any, i: number) => (
                <div key={i} style={{
                  background: severityBg("alert"),
                  border: `1px solid ${severityBorder("alert")}`,
                  borderRadius: 6,
                  padding: "10px 14px",
                  marginBottom: 6,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                }}>
                  {severityIcon("alert")}
                  <div>
                    <div style={{ fontFamily: fontSans, fontSize: 13, fontWeight: 600, color: severityText("alert"), marginBottom: 2 }}>{f.label}</div>
                    {f.detail && <div style={{ fontFamily: fontSans, fontSize: 12, color: lh.muted, lineHeight: 1.5 }}>{f.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Warning flags — always visible */}
          {warningFlags.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#f59e0b", marginBottom: 8 }}>Warnings</div>
              {warningFlags.map((f: any, i: number) => (
                <div key={i} style={{
                  background: severityBg("warning"),
                  border: `1px solid ${severityBorder("warning")}`,
                  borderRadius: 6,
                  padding: "10px 14px",
                  marginBottom: 6,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                }}>
                  {severityIcon("warning")}
                  <div>
                    <div style={{ fontFamily: fontSans, fontSize: 13, fontWeight: 600, color: severityText("warning"), marginBottom: 2 }}>{f.label}</div>
                    {f.detail && <div style={{ fontFamily: fontSans, fontSize: 12, color: lh.muted, lineHeight: 1.5 }}>{f.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Info flags — collapsible */}
          {infoFlags.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <button
                onClick={() => setExpanded(!expanded)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: 0,
                  marginBottom: 8,
                }}
              >
                <span style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#3b82f6" }}>Information ({infoFlags.length})</span>
                <ChevronDown size={12} color="#3b82f6" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }} />
              </button>
              {expanded && infoFlags.map((f: any, i: number) => (
                <div key={i} style={{
                  background: severityBg("info"),
                  border: `1px solid ${severityBorder("info")}`,
                  borderRadius: 6,
                  padding: "10px 14px",
                  marginBottom: 6,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                }}>
                  {severityIcon("info")}
                  <div>
                    <div style={{ fontFamily: fontSans, fontSize: 13, fontWeight: 600, color: severityText("info"), marginBottom: 2 }}>{f.label}</div>
                    {f.detail && <div style={{ fontFamily: fontSans, fontSize: 12, color: lh.muted, lineHeight: 1.5 }}>{f.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* No flags */}
          {flags.length === 0 && (
            <div style={{ fontFamily: fontSans, fontSize: 13, color: lh.muted, padding: "12px 0" }}>
              No critical alerts registered for this state yet. Registry data is being enriched continuously.
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button
              onClick={() => navigate(`/benefits?state=${selectedState}`)}
              style={{
                background: "rgba(14,116,144,0.12)",
                border: `1px solid rgba(14,116,144,0.3)`,
                borderRadius: 6,
                padding: "8px 16px",
                color: lh.teal,
                fontFamily: fontMono,
                fontSize: 11,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <BookOpen size={12} /> Browse Programs
            </button>
            <button
              onClick={() => navigate(`/lumensend?state=${selectedState}`)}
              style={{
                background: "rgba(52,211,153,0.12)",
                border: `1px solid rgba(52,211,153,0.3)`,
                borderRadius: 6,
                padding: "8px 16px",
                color: "#34d399",
                fontFamily: fontMono,
                fontSize: 11,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Send size={12} /> Draft Letter
            </button>
            <button
              onClick={() => navigate(`/viewfinder`)}
              style={{
                background: "rgba(232,168,32,0.12)",
                border: `1px solid rgba(232,168,32,0.3)`,
                borderRadius: 6,
                padding: "8px 16px",
                color: "#E8A820",
                fontFamily: fontMono,
                fontSize: 11,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Eye size={12} /> View Anomalies
            </button>
          </div>

          {/* Help contacts preview */}
          {profile.helpContacts.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: lh.muted, marginBottom: 8 }}>Quick Contacts</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
                {profile.helpContacts.slice(0, 6).map((c: any, i: number) => (
                  <div key={i} style={{
                    background: "rgba(255,255,255,0.03)",
                    border: `1px solid ${lh.cardBorder}`,
                    borderRadius: 6,
                    padding: "8px 12px",
                  }}>
                    <div style={{ fontFamily: fontSans, fontSize: 12, fontWeight: 600, color: lh.paper, marginBottom: 2 }}>{c.name || c.organization}</div>
                    {c.phone && <div style={{ fontFamily: fontMono, fontSize: 11, color: lh.teal }}>{c.phone}</div>}
                    {c.type && <div style={{ fontFamily: fontMono, fontSize: 9, color: lh.muted, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginTop: 2 }}>{c.type}</div>}
                  </div>
                ))}
              </div>
              {profile.helpContacts.length > 6 && (
                <div style={{ fontFamily: fontSans, fontSize: 12, color: lh.muted, marginTop: 6 }}>+ {profile.helpContacts.length - 6} more contacts</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────

export default function Lighthouse() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [expandedStation, setExpandedStation] = useState<string | null>(null);
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [showJobBoard, setShowJobBoard] = useState(false);
  const [showCommunityBoard, setShowCommunityBoard] = useState(false);

  // Fetch spotlight items from DB
  const spotlightQuery = trpc.lighthouse.spotlight.list.useQuery(
    { activeOnly: true },
    { refetchOnWindowFocus: false }
  );

  const spotlightItems = useMemo(() => {
    const dbItems = spotlightQuery.data;
    if (dbItems && dbItems.length > 0) return dbItems;
    return fallbackSpotlight;
  }, [spotlightQuery.data]);

  // spotlightRotation — Rotate spotlight every 8 seconds
  useEffect(() => {
    if (spotlightItems.length <= 1) return;
    const timer = setInterval(() => {
      setSpotlightIndex((prev) => (prev + 1) % spotlightItems.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [spotlightItems.length]);

  const spotlight = spotlightItems[spotlightIndex % spotlightItems.length];

  // Handle station expansion — intercept jobs and community to show live panels
  const handleStationExpand = (id: string) => {
    if (id === "jobs") {
      setShowJobBoard(true);
    } else if (id === "community") {
      setShowCommunityBoard(true);
    } else {
      setExpandedStation(id);
    }
  };

  const expandedStationData = stations.find((s) => s.id === expandedStation);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: lh.bg,
        color: lh.paper,
        position: "relative",
      }}
    >
      {/* Background gradient — beacon glow */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: lh.bgGrad,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Nav bar */}
      <nav
        style={{
          background: "rgba(15,10,5,0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${lh.goldBorder}`,
          padding: "0 40px",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{ fontFamily: fontSerif, fontSize: 22, fontWeight: 600, color: lh.paper, letterSpacing: "0.05em", cursor: "pointer" }}
            onClick={() => navigate("/")}
          >
            Lumina<em style={{ color: lh.gold, fontStyle: "italic" }}>ri</em>
          </div>
          <div
            style={{
              fontFamily: fontMono,
              fontSize: 9,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: lh.gold,
              background: lh.goldSoft,
              border: `1px solid ${lh.goldBorder}`,
              padding: "3px 10px",
              borderRadius: 100,
            }}
          >
            The Lighthouse
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => navigate("/mudroom")}
            style={{
              fontFamily: fontMono, fontSize: 11, letterSpacing: "0.05em",
              color: lh.muted, background: "transparent", border: "none", cursor: "pointer", padding: "6px 12px",
            }}
          >
            Mudroom
          </button>
          <button
            onClick={() => navigate("/workshop")}
            style={{
              fontFamily: fontMono, fontSize: 11, letterSpacing: "0.05em",
              color: "#06b6d4", background: "transparent", border: "none", cursor: "pointer", padding: "6px 12px",
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            <Wrench size={12} />
            Workshop
          </button>
          <button
            onClick={() => navigate("/categories")}
            style={{
              fontFamily: fontMono, fontSize: 11, letterSpacing: "0.05em",
              color: "#f59e0b", background: "transparent", border: "none", cursor: "pointer", padding: "6px 12px",
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            <Compass size={12} />
            Pipelines
          </button>
          <button
            onClick={() => navigate("/civic-map")}
            style={{
              fontFamily: fontMono, fontSize: 11, letterSpacing: "0.05em",
              color: lh.teal, background: "transparent", border: "none", cursor: "pointer", padding: "6px 12px",
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            <MapPin size={12} />
            Civic Map
          </button>
          <button
            onClick={() => navigate("/viewfinder")}
            style={{
              fontFamily: fontMono, fontSize: 11, letterSpacing: "0.05em",
              color: "#E8A820", background: "transparent", border: "none", cursor: "pointer", padding: "6px 12px",
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            <Eye size={12} />
            Viewfinder
          </button>
          <button
            onClick={() => navigate("/docket")}
            style={{
              fontFamily: fontMono, fontSize: 11, letterSpacing: "0.05em",
              color: "#4a8cc7", background: "transparent", border: "none", cursor: "pointer", padding: "6px 12px",
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            <Scale size={12} />
            Docket Room
          </button>
          {isAuthenticated ? (
            <button
              onClick={() => navigate("/")}
              style={{
                fontFamily: fontMono, fontSize: 11, letterSpacing: "0.05em",
                color: lh.paper, background: lh.goldSoft, border: `1px solid ${lh.goldBorder}`,
                borderRadius: 6, cursor: "pointer", padding: "6px 14px",
              }}
            >
              Dashboard
            </button>
          ) : (
            <button
              onClick={() => { window.location.href = getLoginUrl(); }}
              style={{
                fontFamily: fontMono, fontSize: 11, letterSpacing: "0.05em",
                color: lh.paper, background: lh.goldSoft, border: `1px solid ${lh.goldBorder}`,
                borderRadius: 6, cursor: "pointer", padding: "6px 14px",
              }}
            >
              Sign In
            </button>
          )}
        </div>
      </nav>

      {/* Content */}
      <div style={{ position: "relative", zIndex: 1, maxWidth: 1100, margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Hero — Lighthouse beacon with animated glow */}
        <div style={{ textAlign: "center", marginBottom: 56, position: "relative" }}>
          {/* Animated beacon glow */}
          <div style={{
            position: "absolute", top: -40, left: "50%", transform: "translateX(-50%)",
            width: 200, height: 200,
            background: "radial-gradient(circle, rgba(255,213,79,0.12) 0%, rgba(255,213,79,0.04) 40%, transparent 70%)",
            borderRadius: "50%",
            animation: "beacon-pulse 4s ease-in-out infinite",
            pointerEvents: "none",
          }} />
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20, position: "relative" }}>
            <LighthouseBeacon size={72} />
          </div>
          <h1
            style={{
              fontFamily: fontSerif,
              fontSize: "clamp(32px, 5vw, 48px)",
              fontWeight: 600,
              color: lh.paper,
              lineHeight: 1.1,
              marginBottom: 14,
              letterSpacing: "-0.01em",
            }}
          >
            The Lighthouse
          </h1>
          <p
            style={{
              fontFamily: fontSans,
              fontSize: 16,
              color: lh.muted,
              maxWidth: 540,
              margin: "0 auto",
              lineHeight: 1.65,
            }}
          >
            A community hub for finding help, knowing your rights, discovering opportunities,
            and connecting with people who care.
          </p>

          {/* Welcome message for unauthenticated visitors */}
          {!isAuthenticated && !authLoading && (
            <div style={{
              marginTop: 24,
              padding: "14px 24px",
              background: "rgba(212,160,23,0.06)",
              border: `1px solid ${lh.goldBorder}`,
              borderRadius: 10,
              maxWidth: 540,
              margin: "24px auto 0",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}>
              <Sparkles size={18} color={lh.gold} style={{ flexShrink: 0 }} />
              <p style={{ fontFamily: fontSans, fontSize: 13, color: lh.cream, lineHeight: 1.5, textAlign: "left" }}>
                Welcome to <strong style={{ color: lh.paper }}>Luminari</strong> — a forensic advocacy platform that helps people navigate complex systems.
                Everything here is free to explore. Sign in when you're ready to start a case.
              </p>
            </div>
          )}
        </div>

        {/* ── Platform Entry Points ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase" as const, color: lh.muted }}>Explore Luminari</span>
          <div style={{ flex: 1, height: 1, background: lh.cardBorder }} />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
            marginBottom: 48,
          }}
        >
          {/* Start a Case */}
          <button
            onClick={() => navigate("/welcome")}
            style={{
              background: lh.cardBg,
              border: `1px solid ${lh.cardBorder}`,
              borderRadius: 10,
              padding: "20px 24px",
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.2s",
              position: "relative",
              overflow: "hidden",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = lh.goldBorder;
              (e.currentTarget as HTMLElement).style.background = "rgba(212,160,23,0.06)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = lh.cardBorder;
              (e.currentTarget as HTMLElement).style.background = lh.cardBg;
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(212,160,23,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Scale size={18} color={lh.gold} />
              </div>
              <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: lh.gold }}>Engine</span>
            </div>
            <h3 style={{ fontFamily: fontSerif, fontSize: 18, fontWeight: 600, color: lh.paper, marginBottom: 6, lineHeight: 1.3 }}>
              Start a Case
            </h3>
            <p style={{ fontFamily: fontSans, fontSize: 13, color: lh.muted, lineHeight: 1.5 }}>
              Upload documents, run analysis, and let the engine surface what matters. Guided intake available.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 12, color: lh.gold, fontFamily: fontMono, fontSize: 11 }}>
              <span>Begin</span>
              <ArrowRight size={12} />
            </div>
          </button>

          {/* Civic Map */}
          <button
            onClick={() => navigate("/civic-map")}
            style={{
              background: lh.cardBg,
              border: `1px solid ${lh.cardBorder}`,
              borderRadius: 10,
              padding: "20px 24px",
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.2s",
              position: "relative",
              overflow: "hidden",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(14,116,144,0.35)";
              (e.currentTarget as HTMLElement).style.background = "rgba(14,116,144,0.06)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = lh.cardBorder;
              (e.currentTarget as HTMLElement).style.background = lh.cardBg;
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(14,116,144,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <MapPin size={18} color={lh.teal} />
              </div>
              <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: lh.teal }}>Resources</span>
            </div>
            <h3 style={{ fontFamily: fontSerif, fontSize: 18, fontWeight: 600, color: lh.paper, marginBottom: 6, lineHeight: 1.3 }}>
              Explore the Civic Map
            </h3>
            <p style={{ fontFamily: fontSans, fontSize: 13, color: lh.muted, lineHeight: 1.5 }}>
              Navigate state-by-state resources — legal aid, benefits offices, tribal services, and community programs.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 12, color: lh.teal, fontFamily: fontMono, fontSize: 11 }}>
              <span>Explore</span>
              <ArrowRight size={12} />
            </div>
          </button>

          {/* Docket Room */}
          <button
            onClick={() => navigate("/docket")}
            style={{
              background: lh.cardBg,
              border: `1px solid ${lh.cardBorder}`,
              borderRadius: 10,
              padding: "20px 24px",
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.2s",
              position: "relative",
              overflow: "hidden",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(74,140,199,0.35)";
              (e.currentTarget as HTMLElement).style.background = "rgba(74,140,199,0.06)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = lh.cardBorder;
              (e.currentTarget as HTMLElement).style.background = lh.cardBg;
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(74,140,199,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Scale size={18} color="#4a8cc7" />
              </div>
              <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#4a8cc7" }}>Legislation</span>
            </div>
            <h3 style={{ fontFamily: fontSerif, fontSize: 18, fontWeight: 600, color: lh.paper, marginBottom: 6, lineHeight: 1.3 }}>
              The Docket Room
            </h3>
            <p style={{ fontFamily: fontSans, fontSize: 13, color: lh.muted, lineHeight: 1.5 }}>
              Structural analysis of laws and proposals — actors, impacts, loopholes, and enforcement mechanics. No judgment, only structure.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 12, color: "#4a8cc7", fontFamily: fontMono, fontSize: 11 }}>
              <span>Examine</span>
              <ArrowRight size={12} />
            </div>
          </button>

          {/* LumenSend */}
          <button
            onClick={() => navigate("/lumensend")}
            style={{
              background: lh.cardBg,
              border: `1px solid ${lh.cardBorder}`,
              borderRadius: 10,
              padding: "20px 24px",
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.2s",
              position: "relative",
              overflow: "hidden",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(52,211,153,0.35)";
              (e.currentTarget as HTMLElement).style.background = "rgba(52,211,153,0.06)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = lh.cardBorder;
              (e.currentTarget as HTMLElement).style.background = lh.cardBg;
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(52,211,153,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Send size={18} color="#34d399" />
              </div>
              <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#34d399" }}>Action</span>
            </div>
            <h3 style={{ fontFamily: fontSerif, fontSize: 18, fontWeight: 600, color: lh.paper, marginBottom: 6, lineHeight: 1.3 }}>
              LumenSend
            </h3>
            <p style={{ fontFamily: fontSans, fontSize: 13, color: lh.muted, lineHeight: 1.5 }}>
              Generate and send pre-filled letters, complaints, appeals, and applications. The system was designed to work in tandem — LumenSend connects the dots.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 12, color: "#34d399", fontFamily: fontMono, fontSize: 11 }}>
              <span>Compose</span>
              <ArrowRight size={12} />
            </div>
          </button>

          {/* Legal Library */}
          <button
            onClick={() => navigate("/legal-library")}
            style={{
              background: lh.cardBg,
              border: `1px solid ${lh.cardBorder}`,
              borderRadius: 10,
              padding: "20px 24px",
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.2s",
              position: "relative",
              overflow: "hidden",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(168,85,247,0.35)";
              (e.currentTarget as HTMLElement).style.background = "rgba(168,85,247,0.06)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = lh.cardBorder;
              (e.currentTarget as HTMLElement).style.background = lh.cardBg;
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(168,85,247,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Library size={18} color="#a855f7" />
              </div>
              <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#a855f7" }}>Knowledge</span>
            </div>
            <h3 style={{ fontFamily: fontSerif, fontSize: 18, fontWeight: 600, color: lh.paper, marginBottom: 6, lineHeight: 1.3 }}>
              Legal Library
            </h3>
            <p style={{ fontFamily: fontSans, fontSize: 13, color: lh.muted, lineHeight: 1.5 }}>
              Statutes, regulations, case law, and enforcement records — organized by jurisdiction and domain. The law belongs to everyone.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 12, color: "#a855f7", fontFamily: fontMono, fontSize: 11 }}>
              <span>Research</span>
              <ArrowRight size={12} />
            </div>
          </button>

          {/* Workshop Floor */}
          <button
            onClick={() => navigate("/workshop")}
            style={{
              background: lh.cardBg,
              border: `1px solid ${lh.cardBorder}`,
              borderRadius: 10,
              padding: "20px 24px",
              cursor: "pointer",
              textAlign: "left" as const,
              transition: "all 0.2s",
              position: "relative" as const,
              overflow: "hidden" as const,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(6,182,212,0.35)";
              (e.currentTarget as HTMLElement).style.background = "rgba(6,182,212,0.06)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = lh.cardBorder;
              (e.currentTarget as HTMLElement).style.background = lh.cardBg;
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(6,182,212,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Wrench size={18} color="#06b6d4" />
              </div>
              <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#06b6d4" }}>Workshop</span>
            </div>
            <h3 style={{ fontFamily: fontSerif, fontSize: 18, fontWeight: 600, color: lh.paper, marginBottom: 6, lineHeight: 1.3 }}>
              Workshop Floor
            </h3>
            <p style={{ fontFamily: fontSans, fontSize: 13, color: lh.muted, lineHeight: 1.5 }}>
              Five stations for solving problems — Repair Bench, Evidence Lab, Shop Office, Diagnostics Bay, and Community Board. Pick a station, move freely.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 12, color: "#06b6d4", fontFamily: fontMono, fontSize: 11 }}>
              <span>Enter</span>
              <ArrowRight size={12} />
            </div>
          </button>

          {/* Pipeline Explorer */}
          <button
            onClick={() => navigate("/categories")}
            style={{
              background: lh.cardBg,
              border: `1px solid ${lh.cardBorder}`,
              borderRadius: 10,
              padding: "20px 24px",
              cursor: "pointer",
              textAlign: "left" as const,
              transition: "all 0.2s",
              position: "relative" as const,
              overflow: "hidden" as const,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(245,158,11,0.35)";
              (e.currentTarget as HTMLElement).style.background = "rgba(245,158,11,0.06)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = lh.cardBorder;
              (e.currentTarget as HTMLElement).style.background = lh.cardBg;
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(245,158,11,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Compass size={18} color="#f59e0b" />
              </div>
              <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#f59e0b" }}>Pipelines</span>
            </div>
            <h3 style={{ fontFamily: fontSerif, fontSize: 18, fontWeight: 600, color: lh.paper, marginBottom: 6, lineHeight: 1.3 }}>
              Pipeline Explorer
            </h3>
            <p style={{ fontFamily: fontSans, fontSize: 13, color: lh.muted, lineHeight: 1.5 }}>
              Where is the obstacle showing up in your life? Browse every pipeline category — insurance, housing, employment, family, benefits, and more.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 12, color: "#f59e0b", fontFamily: fontMono, fontSize: 11 }}>
              <span>Browse</span>
              <ArrowRight size={12} />
            </div>
          </button>

          {/* Viewfinder */}
          <button
            onClick={() => navigate("/viewfinder")}
            style={{
              background: lh.cardBg,
              border: `1px solid ${lh.cardBorder}`,
              borderRadius: 10,
              padding: "20px 24px",
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.2s",
              position: "relative",
              overflow: "hidden",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(232,168,32,0.35)";
              (e.currentTarget as HTMLElement).style.background = "rgba(232,168,32,0.06)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = lh.cardBorder;
              (e.currentTarget as HTMLElement).style.background = lh.cardBg;
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(232,168,32,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Eye size={18} color="#E8A820" />
              </div>
              <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#E8A820" }}>Patterns</span>
            </div>
            <h3 style={{ fontFamily: fontSerif, fontSize: 18, fontWeight: 600, color: lh.paper, marginBottom: 6, lineHeight: 1.3 }}>
              Anomaly Viewfinder
            </h3>
            <p style={{ fontFamily: fontSans, fontSize: 13, color: lh.muted, lineHeight: 1.5 }}>
              See what only becomes visible at national scale — structural anomalies, hidden patterns, and state-by-state comparisons.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 12, color: "#E8A820", fontFamily: fontMono, fontSize: 11 }}>
              <span>Investigate</span>
              <ArrowRight size={12} />
            </div>
          </button>
        </div>

        {/* ── Canonical Core Stats — connected to world index ── */}
        <CanonicalCoreStats />
        {/* ── State Quick Lookup — Layer 0 Critical Alerts ── */}
        <StateQuickLookup />

        {/* ── What is Luminari? (for newcomers) ── */}
        {!isAuthenticated && !authLoading && (
          <div style={{
            background: lh.cardBg,
            border: `1px solid ${lh.cardBorder}`,
            borderRadius: 10,
            padding: "28px 32px",
            marginBottom: 40,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 24,
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Scale size={16} color={lh.gold} />
                <span style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: lh.gold }}>The Engine</span>
              </div>
              <p style={{ fontFamily: fontSans, fontSize: 13, color: lh.muted, lineHeight: 1.6 }}>
                Register exact source documents, then explicitly run the governed Intake Spine to verify preservation and reconstruct receipt-bound entities, patterns, and chronology.
              </p>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <MapPin size={16} color={lh.teal} />
                <span style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: lh.teal }}>The Map</span>
              </div>
              <p style={{ fontFamily: fontSans, fontSize: 13, color: lh.muted, lineHeight: 1.6 }}>
                Every state has different rules, benefits, and deadlines. The Civic Map organizes them so you can find what applies to you.
              </p>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Eye size={16} color="#E8A820" />
                <span style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#E8A820" }}>The Viewfinder</span>
              </div>
              <p style={{ fontFamily: fontSans, fontSize: 13, color: lh.muted, lineHeight: 1.6 }}>
                Some patterns only become visible when you compare all 50 states at once. The Viewfinder shows what individual cases can't.
              </p>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Scale size={16} color="#4a8cc7" />
                <span style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#4a8cc7" }}>The Docket Room</span>
              </div>
              <p style={{ fontFamily: fontSans, fontSize: 13, color: lh.muted, lineHeight: 1.6 }}>
                Laws have structure. The Docket Room reveals who wrote them, who benefits, who enforces, and where the gaps are.
              </p>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Send size={16} color="#34d399" />
                <span style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#34d399" }}>LumenSend</span>
              </div>
              <p style={{ fontFamily: fontSans, fontSize: 13, color: lh.muted, lineHeight: 1.6 }}>
                Generate pre-filled letters, complaints, appeals, and applications. The system was designed to work in tandem — LumenSend connects the dots.
              </p>
            </div>
          </div>
        )}

        {/* Rotating Spotlight (DB-driven) */}
        {spotlight && (
          <div
            style={{
              background: `linear-gradient(135deg, ${spotlight.color}10 0%, transparent 60%)`,
              border: `1px solid ${spotlight.color}25`,
              borderRadius: 10,
              padding: "24px 28px",
              marginBottom: 40,
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Spotlight dots */}
            <div style={{ position: "absolute", top: 12, right: 16, display: "flex", gap: 6 }}>
              {spotlightItems.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setSpotlightIndex(i)}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: i === spotlightIndex % spotlightItems.length ? lh.gold : "rgba(255,255,255,0.15)",
                    border: "none",
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                />
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <Sparkles size={12} color={spotlight.color} />
              <span
                style={{
                  fontFamily: fontMono,
                  fontSize: 9,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: spotlight.color,
                }}
              >
                {spotlight.eyebrow}
              </span>
            </div>

            <h2
              style={{
                fontFamily: fontSerif,
                fontSize: 22,
                fontWeight: 600,
                color: lh.paper,
                lineHeight: 1.25,
                marginBottom: 8,
              }}
            >
              {spotlight.title}
            </h2>

            <p
              style={{
                fontFamily: fontSans,
                fontSize: 14,
                color: lh.muted,
                lineHeight: 1.6,
                maxWidth: 600,
                marginBottom: 14,
              }}
            >
              {spotlight.description}
            </p>

            <button
              onClick={() => {
                if (spotlight.href) {
                  window.open(spotlight.href, "_blank");
                } else {
                  toast("Feature coming soon — stay tuned!");
                }
              }}
              style={{
                fontFamily: fontMono,
                fontSize: 11,
                letterSpacing: "0.05em",
                color: spotlight.color,
                background: `${spotlight.color}15`,
                border: `1px solid ${spotlight.color}30`,
                borderRadius: 6,
                padding: "7px 16px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {spotlight.cta}
              <ArrowRight size={12} />
            </button>
          </div>
        )}

        {/* Section label */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <span
            style={{
              fontFamily: fontMono,
              fontSize: 10,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: lh.muted,
            }}
          >
            Stations
          </span>
          <div style={{ flex: 1, height: 1, background: lh.cardBorder }} />
          <span
            style={{
              fontFamily: fontMono,
              fontSize: 10,
              color: lh.muted,
            }}
          >
            {stations.length} available
          </span>
        </div>

        {/* Station grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 20,
            marginBottom: 40,
          }}
        >
          {stations.map((station) => (
            <StationCardView
              key={station.id}
              station={station}
              onExpand={handleStationExpand}
            />
          ))}
        </div>

        {/* Bottom section: Suggestion Board */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <span
            style={{
              fontFamily: fontMono,
              fontSize: 10,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: lh.muted,
            }}
          >
            Your Voice
          </span>
          <div style={{ flex: 1, height: 1, background: lh.cardBorder }} />
        </div>

        <SuggestionBoard />

        {/* Footer */}
        <div
          style={{
            textAlign: "center",
            marginTop: 60,
            paddingTop: 32,
            borderTop: `1px solid ${lh.cardBorder}`,
          }}
        >
          {/* Sign-in CTA for unauthenticated visitors */}
          {!isAuthenticated && !authLoading && (
            <div style={{ marginBottom: 28 }}>
              <p style={{ fontFamily: fontSans, fontSize: 14, color: lh.cream, lineHeight: 1.6, marginBottom: 14 }}>
                Ready to start? Create a free account to upload documents, run analysis, and build your case.
              </p>
              <button
                onClick={() => { window.location.href = getLoginUrl(); }}
                style={{
                  fontFamily: fontMono, fontSize: 12, letterSpacing: "0.05em",
                  color: lh.ink, background: lh.gold,
                  border: "none", borderRadius: 8, cursor: "pointer",
                  padding: "10px 28px",
                  fontWeight: 600,
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = lh.beacon; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = lh.gold; }}
              >
                Get Started — It's Free
              </button>
            </div>
          )}

          <p
            style={{
              fontFamily: fontSans,
              fontSize: 12,
              color: lh.muted,
              lineHeight: 1.6,
            }}
          >
            The Lighthouse is part of{" "}
            <span style={{ color: lh.gold, cursor: "pointer" }} onClick={() => navigate("/welcome")}>
              Luminari
            </span>{" "}
            — a forensic advocacy platform that helps people navigate complex systems.
          </p>
          <p
            style={{
              fontFamily: fontMono,
              fontSize: 9,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: `${lh.muted}80`,
              marginTop: 8,
            }}
          >
            Built with care for the communities that need it most.
          </p>
        </div>
      </div>

      {/* Station detail modal */}
      {expandedStationData && (
        <StationDetail
          station={expandedStationData}
          onClose={() => setExpandedStation(null)}
        />
      )}

      {/* Job Board modal (live DB) */}
      {showJobBoard && (
        <JobBoardPanel onClose={() => setShowJobBoard(false)} />
      )}

      {/* Community Board modal (live DB) */}
      {showCommunityBoard && (
        <CommunityBoardPanel onClose={() => setShowCommunityBoard(false)} />
      )}

      {/* Animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes beacon-pulse {
          0%, 100% { opacity: 0.6; transform: translateX(-50%) scale(1); }
          50% { opacity: 1; transform: translateX(-50%) scale(1.15); }
        }
      `}</style>
    </div>
  );
}
