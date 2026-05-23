import { useState } from "react";
import { useAuth } from "@/core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useLocation, useSearch } from "wouter";
import { useCase } from "@/contexts/CaseContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Wrench, FlaskConical, FileText, Eye, Users,
  ArrowRight, ArrowLeft, Lamp, ChevronRight,
  Shield, Scale, Compass, MessageCircle,
  Sparkles, Target, Search, BookOpen,
  Network, BarChart3, MapPin, Gavel,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════
   THE WORKSHOP FLOOR — Collaborative Problem-Solving Environment
   Five stations: Repair Bench, Evidence Lab, Shop Office, Diagnostics,
   Community Board. Free movement between stations.
   ═══════════════════════════════════════════════════════════════════════ */

const ws = {
  bg: "#0f1419",
  warmBg: "#1a1610",
  cardBg: "rgba(255,248,235,0.03)",
  cardBorder: "rgba(212,180,80,0.12)",
  gold: "#d4a017",
  amber: "#c9952a",
  warm: "#e8c87a",
  cream: "#f5edd6",
  muted: "#8b8070",
};

const fontSerif = "'Cormorant Garamond', serif";
const fontSans = "'DM Sans', sans-serif";

interface Station {
  id: string;
  icon: React.ElementType;
  title: string;
  metaphor: string;
  description: string;
  tools: { label: string; href: string; icon: React.ElementType }[];
  color: string;
  borderColor: string;
  bgColor: string;
  requiresAuth: boolean;
  requiresCase: boolean;
}

const STATIONS: Station[] = [
  {
    id: "repair-bench",
    icon: Wrench,
    title: "Repair Bench",
    metaphor: "Where you fix what's broken",
    description: "Guided case resolution — describe your problem, match it to a claim type, build your proof, and get action steps. This is where most people start.",
    tools: [
      { label: "Case Resolution", href: "/resolve", icon: Target },
      { label: "Guided Intake", href: "/guided-intake", icon: Compass },
      { label: "Benefits Navigator", href: "/benefits", icon: Shield },
      { label: "Deadline Calculator", href: "/deadline-calculator", icon: Scale },
    ],
    color: "text-cyan-400",
    borderColor: "border-cyan-500/20",
    bgColor: "bg-cyan-500/5",
    requiresAuth: true,
    requiresCase: false,
  },
  {
    id: "evidence-lab",
    icon: FlaskConical,
    title: "Evidence Lab",
    metaphor: "Where you examine the facts",
    description: "Upload documents, extract entities, build timelines, and map evidence to proof frameworks. The forensic core of the platform.",
    tools: [
      { label: "Evidence Lab Hub", href: "/evidence-lab", icon: FlaskConical },
      { label: "Document Upload", href: "/upload", icon: FileText },
      { label: "Entity Explorer", href: "/entities", icon: Network },
      { label: "Timeline Builder", href: "/timeline", icon: BarChart3 },
      { label: "Proof Frameworks", href: "/proof-frameworks", icon: Search },
      { label: "Findings", href: "/findings", icon: Sparkles },
    ],
    color: "text-purple-400",
    borderColor: "border-purple-500/20",
    bgColor: "bg-purple-500/5",
    requiresAuth: true,
    requiresCase: true,
  },
  {
    id: "shop-office",
    icon: FileText,
    title: "Shop Office",
    metaphor: "Where you file the paperwork",
    description: "Generate filings, FOIA requests, appeals, and formal letters. Track submissions and deadlines. The administrative arm of your case.",
    tools: [
      { label: "Shop Office Hub", href: "/shop-office", icon: FileText },
      { label: "Filing Generator", href: "/filing-generator", icon: Gavel },
      { label: "LumenSend", href: "/lumensend", icon: MessageCircle },
      { label: "FOIA Tracking", href: "/foia", icon: Search },
      { label: "Statement of Facts", href: "/narrative", icon: BookOpen },
      { label: "Presentations", href: "/presentations", icon: FileText },
    ],
    color: "text-amber-400",
    borderColor: "border-amber-500/20",
    bgColor: "bg-amber-500/5",
    requiresAuth: true,
    requiresCase: true,
  },
  {
    id: "diagnostics",
    icon: Eye,
    title: "Diagnostics Bay",
    metaphor: "Where you see the bigger picture",
    description: "Structural analysis of systemic patterns — barrier clusters, doctrine graphs, enforcement pathways, contradiction scoring. See how your case connects to larger patterns.",
    tools: [
      { label: "Structural Diagnostics", href: "/diagnostics", icon: Eye },
      { label: "Doctrine Graph", href: "/doctrine-graph", icon: Network },
      { label: "Barrier Analysis", href: "/barriers", icon: Shield },
      { label: "Signal Registry", href: "/signal-registry", icon: Target },
      { label: "Enforcement Intel", href: "/enforcement-intel", icon: Scale },
      { label: "Contradiction Scoring", href: "/contradiction-scoring", icon: Search },
    ],
    color: "text-emerald-400",
    borderColor: "border-emerald-500/20",
    bgColor: "bg-emerald-500/5",
    requiresAuth: false,
    requiresCase: false,
  },
  {
    id: "community",
    icon: Users,
    title: "Community Board",
    metaphor: "Where you connect with others",
    description: "The Lighthouse community hub — ask for help, share resources, find legal clinics, browse unclaimed money databases, and connect with people who've been where you are.",
    tools: [
      { label: "Lighthouse Hub", href: "/lighthouse", icon: Lamp },
      { label: "Resource Directory", href: "/resources", icon: MapPin },
      { label: "Civic Map", href: "/civic-map", icon: MapPin },
      { label: "Legal Library", href: "/legal-library", icon: BookOpen },
      { label: "Agency Metrics", href: "/agency-metrics", icon: BarChart3 },
      { label: "Civil Gideon", href: "/civil-gideon", icon: Scale },
    ],
    color: "text-rose-400",
    borderColor: "border-rose-500/20",
    bgColor: "bg-rose-500/5",
    requiresAuth: false,
    requiresCase: false,
  },
];

export default function WorkshopFloor() {
  const { isAuthenticated, user } = useAuth();
  const { cases } = useCase();
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const searchParams = new URLSearchParams(searchStr);
  const fromLayer = searchParams.get("from");
  const layerRoute = searchParams.get("layer");
  const [expandedStation, setExpandedStation] = useState<string | null>(null);

  const hasCase = cases && cases.length > 0;

  const handleToolClick = (station: Station, href: string) => {
    if (station.requiresAuth && !isAuthenticated) {
      window.location.href = getLoginUrl();
      return;
    }
    navigate(href);
  };

  return (
    <div
      className="min-h-screen"
      style={{
        background: `linear-gradient(180deg, ${ws.warmBg} 0%, ${ws.bg} 40%)`,
        fontFamily: fontSans,
      }}
    >
      {/* ── Layer Context Banner ─────────────────────────────── */}
      {fromLayer && (
        <div className="flex items-center justify-between px-6 py-2 bg-cyan-950/60 border-b border-cyan-500/20">
          <div className="flex items-center gap-2 text-sm text-cyan-300">
            <Network className="h-4 w-4" />
            <span>Opened from <strong>{fromLayer}</strong> layer</span>
          </div>
          <button
            className="text-xs text-cyan-400 hover:text-cyan-200 transition-colors"
            onClick={() => layerRoute && navigate(layerRoute)}
          >
            ← Back to {fromLayer}
          </button>
        </div>
      )}
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-4">
        <button
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => navigate("/mudroom")}
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">Back to Mudroom</span>
        </button>
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5 text-cyan-400" />
          <span
            className="text-lg tracking-wide"
            style={{ fontFamily: fontSerif, color: ws.warm }}
          >
            Workshop Floor
          </span>
        </div>
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => navigate("/")}
            >
              My Workspace <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => window.location.href = getLoginUrl()}
            >
              Sign In
            </Button>
          )}
        </div>
      </header>

      {/* ── Title ───────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 pt-6 pb-8 text-center">
        <h1
          className="text-2xl md:text-3xl font-light mb-2"
          style={{ fontFamily: fontSerif, color: ws.cream }}
        >
          Pick a station. Move freely.
        </h1>
        <p className="text-sm" style={{ color: ws.muted }}>
          Every station connects to the others. Start wherever feels right.
        </p>
      </div>

      {/* ── Station Grid ────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {STATIONS.map((station) => {
            const isExpanded = expandedStation === station.id;
            const isLocked = station.requiresAuth && !isAuthenticated;
            const needsCase = station.requiresCase && !hasCase;

            return (
              <Card
                key={station.id}
                className={`border transition-all cursor-pointer ${station.borderColor} ${isExpanded ? "ring-1 ring-offset-0" : ""}`}
                style={{
                  background: ws.cardBg,
                  borderColor: undefined,
                  ...(isExpanded ? { ringColor: station.color } : {}),
                }}
                onClick={() => setExpandedStation(isExpanded ? null : station.id)}
              >
                <CardContent className="p-5">
                  {/* Station header */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`p-2 rounded-lg ${station.bgColor}`}>
                      <station.icon className={`h-5 w-5 ${station.color}`} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-foreground">
                        {station.title}
                      </h3>
                      <p className="text-xs italic" style={{ color: ws.muted, fontFamily: fontSerif }}>
                        {station.metaphor}
                      </p>
                    </div>
                    {isLocked && (
                      <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">
                        Sign in
                      </Badge>
                    )}
                    {!isLocked && needsCase && (
                      <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400">
                        Start a case
                      </Badge>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-xs leading-relaxed mb-3" style={{ color: ws.muted }}>
                    {station.description}
                  </p>

                  {/* Tools — always visible, expand for detail */}
                  <div className="space-y-1">
                    {station.tools.slice(0, isExpanded ? undefined : 3).map((tool) => (
                      <button
                        key={tool.href}
                        className="w-full flex items-center gap-2 p-2 rounded-md text-left transition-colors hover:bg-white/5"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToolClick(station, tool.href);
                        }}
                      >
                        <tool.icon className={`h-3.5 w-3.5 ${station.color}`} />
                        <span className="text-xs text-foreground">{tool.label}</span>
                        <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto" />
                      </button>
                    ))}
                    {!isExpanded && station.tools.length > 3 && (
                      <p className="text-[10px] text-center pt-1" style={{ color: ws.muted }}>
                        +{station.tools.length - 3} more tools
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* ── Quick access bar ────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 pb-12">
        <div
          className="flex flex-wrap items-center justify-center gap-3 p-4 rounded-lg border"
          style={{ background: ws.cardBg, borderColor: ws.cardBorder }}
        >
          <span className="text-xs" style={{ color: ws.muted }}>Quick access:</span>
          {[
            { label: "Lighthouse", href: "/lighthouse", icon: Lamp },
            { label: "Pipeline Explorer", href: "/categories", icon: Compass },
            { label: "Civic Map", href: "/civic-map", icon: MapPin },
            { label: "Legal Library", href: "/legal-library", icon: BookOpen },
            { label: "Docket Room", href: "/docket", icon: Gavel },
          ].map((link) => (
            <button
              key={link.href}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors hover:bg-white/5 text-muted-foreground hover:text-foreground"
              onClick={() => navigate(link.href)}
            >
              <link.icon className="h-3 w-3" />
              {link.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="text-center pb-8">
        <p className="text-xs" style={{ color: ws.muted }}>
          Luminari Workshop — tools for people repairing obstacles in their lives
        </p>
      </footer>
    </div>
  );
}
