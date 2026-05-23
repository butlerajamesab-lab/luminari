import { useState, useEffect } from "react";
import { useAuth } from "@/core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Lamp, ArrowRight, ChevronRight, Users, Heart,
  MessageCircle, Lightbulb, MapPin, Compass,
  Wrench, BookOpen, Eye, Shield, Scale,
  Sparkles, Send, Info, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

/* ═══════════════════════════════════════════════════════════════════════
   THE MUDROOM — Calm Entry Layer
   "How are you today? What obstacle is in your way?"

   Purpose: arrival, orientation, progressive discovery.
   Users should not be forced into intake immediately.
   The Mudroom should feel like arriving at a place where someone
   offers tea or coffee before helping.
   ═══════════════════════════════════════════════════════════════════════ */

// ── Design tokens ─────────────────────────────────────────────────────

const mr = {
  bg: "#0f1419",
  warmBg: "#1a1610",
  cardBg: "rgba(255,248,235,0.03)",
  cardBorder: "rgba(212,180,80,0.12)",
  gold: "#d4a017",
  goldSoft: "rgba(212,160,23,0.10)",
  amber: "#c9952a",
  warm: "#e8c87a",
  cream: "#f5edd6",
  muted: "#8b8070",
  green: "#2d8a56",
  teal: "#0e7490",
  navy: "#1a3a5c",
  purple: "#6b21a8",
};

const fontSerif = "'Cormorant Garamond', serif";
const fontSans = "'DM Sans', sans-serif";

// ── Did You Know facts ────────────────────────────────────────────────

const DID_YOU_KNOW = [
  { text: "Every state holds unclaimed property — old bank accounts, insurance payouts, foreclosure surplus. It takes 2 minutes to check.", color: mr.green },
  { text: "You can request your own government records for free under FOIA. Agencies must respond within 20 business days.", color: mr.teal },
  { text: "Many wage theft claims can be filed without a lawyer. State labor boards handle the investigation.", color: mr.amber },
  { text: "Tenants in most states can withhold rent for uninhabitable conditions — but the process matters.", color: mr.navy },
  { text: "Administrative appeals for denied benefits have higher success rates than most people expect.", color: mr.purple },
  { text: "Free legal clinics exist in every state. Many handle eviction defense, benefits appeals, and wage claims.", color: mr.green },
];

// ── Community preview items ───────────────────────────────────────────

const COMMUNITY_PREVIEW = [
  { type: "help", text: "Looking for help understanding my lease termination notice in Phoenix", time: "2h ago" },
  { type: "resource", text: "Free HVAC certification prep — no experience needed (MO, PA, AZ)", time: "5h ago" },
  { type: "success", text: "Got my denied disability benefits reversed after filing an appeal", time: "1d ago" },
  { type: "help", text: "Has anyone dealt with wage theft from a staffing agency in WA?", time: "1d ago" },
];

// ── Pipeline category previews ────────────────────────────────────────

const PIPELINE_PREVIEW = [
  { icon: Shield, label: "Insurance & Benefits", count: 12, color: "text-blue-400" },
  { icon: Scale, label: "Legal & Civil Rights", count: 18, color: "text-amber-400" },
  { icon: MapPin, label: "Housing & Property", count: 9, color: "text-emerald-400" },
  { icon: Wrench, label: "Employment & Labor", count: 14, color: "text-purple-400" },
  { icon: Heart, label: "Health & Safety", count: 8, color: "text-rose-400" },
  { icon: Users, label: "Family & Community", count: 11, color: "text-cyan-400" },
];

// ── Door definitions ──────────────────────────────────────────────────

interface Door {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  href: string;
  color: string;
  borderColor: string;
  bgColor: string;
}

const DOORS: Door[] = [
  {
    icon: Lamp,
    title: "Enter the Lighthouse",
    subtitle: "Orientation hub — see what the platform can do",
    href: "/lighthouse",
    color: "text-amber-400",
    borderColor: "border-amber-500/20",
    bgColor: "bg-amber-500/5 hover:bg-amber-500/10",
  },
  {
    icon: Compass,
    title: "Explore Pipelines",
    subtitle: "Browse by life domain — housing, employment, benefits, rights",
    href: "/categories",
    color: "text-emerald-400",
    borderColor: "border-emerald-500/20",
    bgColor: "bg-emerald-500/5 hover:bg-emerald-500/10",
  },
  {
    icon: Wrench,
    title: "Join the Workshop",
    subtitle: "Repair Bench, Evidence Lab, Shop Office, Diagnostics",
    href: "/workshop",
    color: "text-cyan-400",
    borderColor: "border-cyan-500/20",
    bgColor: "bg-cyan-500/5 hover:bg-cyan-500/10",
  },
  {
    icon: Eye,
    title: "Verify Integrity",
    subtitle: "Check governance chain, view public log, download verification script",
    href: "/verify",
    color: "text-teal-400",
    borderColor: "border-teal-500/20",
    bgColor: "bg-teal-500/5 hover:bg-teal-500/10",
  },
];

export default function Mudroom() {
  const { isAuthenticated, user } = useAuth();
  const [, navigate] = useLocation();
  const [conversationText, setConversationText] = useState("");
  const [dykIndex, setDykIndex] = useState(0);

  // Rotate Did You Know every 8 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setDykIndex((i) => (i + 1) % DID_YOU_KNOW.length);
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  const currentDyk = DID_YOU_KNOW[dykIndex];

  const handleConversationStart = () => {
    if (!conversationText.trim()) {
      toast.info("Take your time. Describe what's happening in your own words.");
      return;
    }
    // Navigate to the guided intake with the text pre-filled
    const encoded = encodeURIComponent(conversationText.trim());
    if (isAuthenticated) {
      navigate(`/resolve?description=${encoded}`);
    } else {
      navigate(`/welcome?description=${encoded}`);
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{
        background: `linear-gradient(180deg, ${mr.warmBg} 0%, ${mr.bg} 40%)`,
        fontFamily: fontSans,
      }}
    >
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <Lamp className="h-5 w-5 text-amber-400" />
          <span
            className="text-lg tracking-wide"
            style={{ fontFamily: fontSerif, color: mr.warm }}
          >
            Luminari
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

      {/* ── Welcome section ─────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 pt-8 pb-4">
        <div className="text-center mb-10">
          <p
            className="text-sm tracking-widest uppercase mb-4"
            style={{ color: mr.muted, letterSpacing: "0.2em" }}
          >
            Welcome
          </p>
          <h1
            className="text-3xl md:text-4xl font-light mb-3"
            style={{ fontFamily: fontSerif, color: mr.cream }}
          >
            How are you today?
          </h1>
          <p
            className="text-lg md:text-xl font-light"
            style={{ fontFamily: fontSerif, color: mr.warm }}
          >
            What obstacle is in your way?
          </p>
        </div>

        {/* ── Conversation entry ─────────────────────────────────── */}
        <Card
          className="border max-w-2xl mx-auto mb-12"
          style={{
            background: mr.cardBg,
            borderColor: mr.cardBorder,
          }}
        >
          <CardContent className="p-5">
            <Textarea
              value={conversationText}
              onChange={(e) => setConversationText(e.target.value)}
              placeholder="Describe what's happening in your own words. There's no wrong way to say it..."
              className="min-h-[100px] bg-transparent border-none resize-none text-base placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:ring-offset-0"
              style={{ color: mr.cream, fontFamily: fontSans }}
            />
            <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: `1px solid ${mr.cardBorder}` }}>
              <p className="text-xs" style={{ color: mr.muted }}>
                Your words stay private. We'll help you find the right path.
              </p>
              <Button
                size="sm"
                onClick={handleConversationStart}
                className="gap-1.5"
                style={{
                  background: `linear-gradient(135deg, ${mr.gold}, ${mr.amber})`,
                  color: "#1a1408",
                  fontWeight: 600,
                }}
              >
                <Send className="h-3.5 w-3.5" />
                Let's Start
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Three-panel section: Community / Pipeline Map / Did You Know ── */}
      <div className="max-w-6xl mx-auto px-4 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* Left Wall: Community Board Preview */}
          <Card
            className="border"
            style={{ background: mr.cardBg, borderColor: mr.cardBorder }}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <MessageCircle className="h-4 w-4 text-amber-400" />
                <span className="text-sm font-medium" style={{ color: mr.warm }}>
                  Community Board
                </span>
              </div>
              <div className="space-y-2.5">
                {COMMUNITY_PREVIEW.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 p-2 rounded-md transition-colors cursor-pointer"
                    style={{ background: "rgba(255,255,255,0.02)" }}
                    onClick={() => navigate("/lighthouse")}
                  >
                    <div className="mt-0.5">
                      {item.type === "help" && <Users className="h-3.5 w-3.5 text-blue-400" />}
                      {item.type === "resource" && <Sparkles className="h-3.5 w-3.5 text-emerald-400" />}
                      {item.type === "success" && <Heart className="h-3.5 w-3.5 text-rose-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs leading-relaxed line-clamp-2" style={{ color: mr.cream }}>
                        {item.text}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: mr.muted }}>
                        {item.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="flex items-center gap-1 text-xs mt-3 transition-colors"
                style={{ color: mr.gold }}
                onClick={() => navigate("/lighthouse")}
              >
                View full board <ChevronRight className="h-3 w-3" />
              </button>
            </CardContent>
          </Card>

          {/* Back Wall: Pipeline Map Preview */}
          <Card
            className="border"
            style={{ background: mr.cardBg, borderColor: mr.cardBorder }}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Compass className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-medium" style={{ color: mr.warm }}>
                  Pipeline Map
                </span>
              </div>
              <div className="space-y-2">
                {PIPELINE_PREVIEW.map((cat, i) => (
                  <button
                    key={i}
                    className="w-full flex items-center gap-2.5 p-2 rounded-md transition-colors text-left"
                    style={{ background: "rgba(255,255,255,0.02)" }}
                    onClick={() => navigate("/categories")}
                  >
                    <cat.icon className={`h-4 w-4 ${cat.color}`} />
                    <span className="text-xs flex-1" style={{ color: mr.cream }}>
                      {cat.label}
                    </span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-muted-foreground/20 text-muted-foreground">
                      {cat.count}
                    </Badge>
                  </button>
                ))}
              </div>
              <button
                className="flex items-center gap-1 text-xs mt-3 transition-colors"
                style={{ color: mr.gold }}
                onClick={() => navigate("/categories")}
              >
                Explore all pipelines <ChevronRight className="h-3 w-3" />
              </button>
            </CardContent>
          </Card>

          {/* Right Wall: Did You Know Panel */}
          <Card
            className="border"
            style={{ background: mr.cardBg, borderColor: mr.cardBorder }}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="h-4 w-4 text-amber-400" />
                <span className="text-sm font-medium" style={{ color: mr.warm }}>
                  Did You Know?
                </span>
              </div>
              <div
                className="p-3 rounded-md mb-3 transition-all duration-500"
                style={{ background: `${currentDyk.color}10`, border: `1px solid ${currentDyk.color}20` }}
              >
                <p className="text-sm leading-relaxed" style={{ color: mr.cream }}>
                  {currentDyk.text}
                </p>
              </div>
              <div className="flex justify-center gap-1.5 mb-3">
                {DID_YOU_KNOW.map((_, i) => (
                  <button
                    key={i}
                    className="w-1.5 h-1.5 rounded-full transition-all"
                    style={{
                      background: i === dykIndex ? mr.gold : `${mr.muted}40`,
                    }}
                    onClick={() => setDykIndex(i)}
                  />
                ))}
              </div>
              <div
                className="p-2.5 rounded-md"
                style={{ background: "rgba(255,255,255,0.02)" }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Info className="h-3.5 w-3.5 text-cyan-400" />
                  <span className="text-xs font-medium" style={{ color: mr.cream }}>
                    Quick Tip
                  </span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: mr.muted }}>
                  You don't need to know the legal name for your problem. Describe what happened and we'll help you find the right framework.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Doors ───────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 pb-8">
        <p
          className="text-center text-sm mb-5 tracking-wide"
          style={{ color: mr.muted }}
        >
          Or step through a door
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {DOORS.map((door) => (
            <button
              key={door.href}
              className={`flex flex-col items-start p-5 rounded-lg border transition-all text-left ${door.bgColor} ${door.borderColor}`}
              onClick={() => navigate(door.href)}
            >
              <door.icon className={`h-6 w-6 mb-3 ${door.color}`} />
              <span className="text-sm font-medium text-foreground mb-1">
                {door.title}
              </span>
              <span className="text-xs text-muted-foreground leading-relaxed">
                {door.subtitle}
              </span>
              <div className="flex items-center gap-1 mt-3">
                <span className="text-xs" style={{ color: mr.gold }}>Enter</span>
                <ArrowRight className="h-3 w-3" style={{ color: mr.gold }} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Support the Workshop ─────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 pb-12">
        <div
          className="text-center py-6 rounded-lg border"
          style={{
            background: mr.cardBg,
            borderColor: mr.cardBorder,
          }}
        >
          <p className="text-sm mb-1" style={{ color: mr.cream, fontFamily: fontSerif }}>
            If this place helped you today,
          </p>
          <p className="text-sm mb-3" style={{ color: mr.warm, fontFamily: fontSerif }}>
            you can help keep it open for others.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="text-xs border-amber-500/20 text-amber-400 hover:bg-amber-500/10"
            onClick={() => toast.info("Donation support coming soon. Thank you for your interest.")}
          >
            <Heart className="h-3.5 w-3.5 mr-1.5" />
            Support the Workshop
          </Button>
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="text-center pb-8">
        <p className="text-xs" style={{ color: mr.muted }}>
          Luminari — a civic workshop where people repair obstacles in their lives
        </p>
      </footer>
    </div>
  );
}
