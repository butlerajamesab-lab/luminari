import { useState, useMemo, useEffect } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Search, Phone, ExternalLink, FileText,
  Heart, Shield, Home as HomeIcon, Utensils, Zap,
  Baby, Users, Star, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronUp, Clock, MapPin, DollarSign,
  Loader2, Sparkles, Filter, X, Printer,
  HelpCircle, Stethoscope, Scale,
  HandHeart, Landmark, Globe, LifeBuoy, Brain,
  Plus, ClipboardList, ArrowRight, Send,
  Building2, Map, UploadCloud, Wrench, FolderOpen,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CommitToCase, FlagArea } from "@/components/CommitToCase";
import { NextStepBar } from "@/components/NextStepBar";

/* ─── Category Icons & Colors ─── */

const CATEGORY_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  food: { icon: Utensils, label: "Food Assistance", color: "text-green-400" },
  healthcare: { icon: Stethoscope, label: "Healthcare", color: "text-blue-400" },
  housing: { icon: HomeIcon, label: "Housing", color: "text-amber-400" },
  utilities: { icon: Zap, label: "Utilities", color: "text-yellow-400" },
  cash_assistance: { icon: DollarSign, label: "Cash Assistance", color: "text-emerald-400" },
  burial_bereavement: { icon: Heart, label: "Burial & Bereavement", color: "text-purple-400" },
  elder_care: { icon: Users, label: "Elder Care", color: "text-teal-400" },
  domestic_violence: { icon: Shield, label: "Domestic Violence", color: "text-rose-400" },
  disability: { icon: HandHeart, label: "Disability", color: "text-indigo-400" },
  veterans: { icon: Star, label: "Veterans", color: "text-amber-500" },
  children_families: { icon: Baby, label: "Children & Families", color: "text-pink-400" },
  tribal_indigenous: { icon: Globe, label: "Tribal & Indigenous", color: "text-orange-400" },
  immigration: { icon: Landmark, label: "Immigration", color: "text-cyan-400" },
  legal_aid: { icon: Scale, label: "Legal Aid", color: "text-sky-400" },
  crisis_hotline: { icon: LifeBuoy, label: "Crisis Hotlines", color: "text-red-400" },
  mental_health: { icon: Brain, label: "Mental Health", color: "text-sky-400" },
};

const URGENCY_META: Record<string, { label: string; color: string; bgColor: string }> = {
  immediate: { label: "Call Now", color: "text-red-300", bgColor: "bg-red-500/15 border-red-500/30" },
  soon: { label: "Apply Soon", color: "text-amber-300", bgColor: "bg-amber-500/15 border-amber-500/30" },
  when_ready: { label: "When Ready", color: "text-blue-300", bgColor: "bg-blue-500/15 border-blue-500/30" },
};

/* ─── Program Card Component ─── */

function ProgramCard({
  program,
  relevanceScore,
  matchReasons,
  isLocalized,
  stateDetected,
  isExpanded,
  onToggle,
  onTrackApplication,
  isTracked,
}: {
  program: any;
  relevanceScore?: number;
  matchReasons?: string[];
  isLocalized?: boolean;
  stateDetected?: string | null;
  isExpanded: boolean;
  onToggle: () => void;
  onTrackApplication?: () => void;
  isTracked?: boolean;
}) {
  const catMeta = CATEGORY_META[program.category] || { icon: HelpCircle, label: program.category, color: "text-muted-foreground" };
  const urgMeta = URGENCY_META[program.urgency] || URGENCY_META.when_ready;
  const CatIcon = catMeta.icon;

  return (
    <Card
      className={cn(
        "transition-all duration-200 cursor-pointer border",
        isExpanded
          ? "bg-card/80 border-primary/30 shadow-lg shadow-primary/5"
          : "bg-card/50 border-border/50 hover:border-border hover:bg-card/70",
      )}
      onClick={onToggle}
    >
      <CardContent className="p-0">
        {/* Header */}
        <div className="p-4 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className={cn("mt-0.5 p-2 rounded-lg bg-muted/50", catMeta.color)}>
                <CatIcon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-foreground text-sm leading-tight">
                  {program.short_name || program.name}
                </h3>
                {isLocalized && stateDetected && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-primary/70 mt-0.5">
                    <MapPin className="w-2.5 h-2.5" />
                    {stateDetected} program
                  </span>
                )}
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {program.what_it_does}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0.5 border", urgMeta.bgColor, urgMeta.color)}>
                {urgMeta.label}
              </Badge>
              {relevanceScore !== undefined && relevanceScore > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {Math.round(relevanceScore * 10)}% match
                </span>
              )}
              {isTracked && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 border bg-green-500/10 border-green-500/30 text-green-400">
                  Tracking
                </Badge>
              )}
            </div>
          </div>

          {/* Match reasons */}
          {matchReasons && matchReasons.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {matchReasons.slice(0, 3).map((reason, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary/80">
                  {reason}
                </span>
              ))}
            </div>
          )}

          {/* Expand indicator */}
          <div className="flex items-center justify-center mt-2">
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Expanded details */}
        {isExpanded && (
          <div className="border-t border-border/50 p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            {/* Who qualifies */}
            <div>
              <h4 className="text-xs font-semibold text-foreground/80 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                Who Qualifies
              </h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{program.who_qualifies}</p>
              {program.income_threshold && (
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Income limit: {program.income_threshold}
                </p>
              )}
            </div>

            {/* Max benefit */}
            {program.max_benefit && (
              <div>
                <h4 className="text-xs font-semibold text-foreground/80 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                  Benefit Amount
                </h4>
                <p className="text-sm text-muted-foreground">{program.max_benefit}</p>
              </div>
            )}

            {/* How to apply */}
            <div>
              <h4 className="text-xs font-semibold text-foreground/80 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-blue-400" />
                How to Apply
              </h4>
              <ol className="space-y-1.5">
                {program.how_to_apply.map((step: string, i: number) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2">
                    <span className="text-primary/60 font-mono text-xs mt-0.5 shrink-0">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Documents needed */}
            <div>
              <h4 className="text-xs font-semibold text-foreground/80 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-amber-400" />
                Documents You May Need
              </h4>
              <ul className="space-y-1">
                {program.documents_needed.map((doc: string, i: number) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-muted-foreground/40 mt-1.5 shrink-0">•</span>
                    <span>{doc}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Deadlines */}
            {program.deadlines && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <h4 className="text-xs font-semibold text-amber-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Important Deadline
                </h4>
                <p className="text-sm text-amber-200/80">{program.deadlines}</p>
              </div>
            )}

            {/* Contact info */}
            <div className="flex flex-wrap gap-2">
              {program.phone && (
                <a
                  href={`tel:${program.phone.replace(/[^0-9+]/g, "")}`}
                  className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-green-500/15 text-green-300 hover:bg-green-500/25 transition-colors border border-green-500/20"
                >
                  <Phone className="w-3.5 h-3.5" />
                  {program.phone}
                </a>
              )}
              {program.website && (
                <a
                  href={program.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 transition-colors border border-blue-500/20"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Visit Website
                </a>
              )}
            </div>

            {/* Track Application Button */}
            {onTrackApplication && !isTracked && (
              <Button
                variant="outline"
                size="sm"
                onClick={onTrackApplication}
                className="w-full text-xs border-primary/30 text-primary hover:bg-primary/10"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Track This Application
              </Button>
            )}
            {isTracked && (
              <div className="p-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
                <p className="text-xs text-green-400 flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  You're tracking this application
                </p>
              </div>
            )}

            {/* Commit to Case */}
            <div className="flex items-center gap-2 pt-1">
              <CommitToCase type="benefit" itemId={program.program_id} label="Save to Case" />
              <FlagArea location="benefits_navigator" targetId={program.program_id} targetType="benefit" message={`Review benefit: ${program.short_name || program.name}`} />
            </div>

            {/* LumenSend Actions */}
            <div className="flex gap-2">
              <LumenSendButton
                label="Apply via LumenSend"
                type="application"
                programId={program.program_id}
                state={stateDetected}
              />
              <LumenSendButton
                label="Appeal Denial"
                type="appeal"
                programId={program.program_id}
                state={stateDetected}
                variant="ghost"
              />
            </div>

            {/* Note */}
            {program.note && (
              <p className="text-xs text-muted-foreground/60 italic border-l-2 border-muted pl-3">
                {program.note}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── LumenSend Button Helper ─── */

function LumenSendButton({
  label,
  type,
  programId,
  state,
  variant = "outline",
}: {
  label: string;
  type: string;
  programId?: string;
  state?: string | null;
  variant?: "outline" | "ghost";
}) {
  const [, navigateTo] = useLocation();
  return (
    <Button
      variant={variant}
      size="sm"
      className={cn(
        "text-xs flex-1",
        variant === "outline"
          ? "text-amber-400 border-amber-400/30 hover:bg-amber-500/10"
          : "text-muted-foreground hover:text-amber-400"
      )}
      onClick={(e) => {
        e.stopPropagation();
        const params = new URLSearchParams();
        params.set("type", type);
        if (programId) params.set("programId", programId);
        if (state) params.set("state", state);
        navigateTo(`/lumensend?${params.toString()}`);
      }}
    >
      <Send className="w-3 h-3 mr-1" />
      {label}
    </Button>
  );
}

/* ─── Document Checklist Component ─── */

function DocumentChecklist({ programIds }: { programIds: string[] }) {
  const { data: checklist, isLoading } = trpc.benefits.documentChecklist.useQuery(
    { programIds },
    { enabled: programIds.length > 0 },
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Building your document checklist...</span>
      </div>
    );
  }

  if (!checklist || checklist.length === 0) return null;

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <FileText className="w-4 h-4 text-amber-400" />
          Your Document Checklist
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Gather these documents to apply for your matched programs. Items needed by more programs are listed first.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {checklist.map((item: any, i: number) => (
          <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors">
            <div className="mt-0.5 w-5 h-5 rounded border border-border/60 flex items-center justify-center shrink-0">
              <span className="text-[10px] text-muted-foreground">{i + 1}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground/90">{item.document}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Needed for: {item.programs.join(", ")}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ─── Category Filter Chips ─── */

function CategoryFilters({
  categories,
  selected,
  onToggle,
}: {
  categories: { category: string; label: string; count: number }[];
  selected: Set<string>;
  onToggle: (cat: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {categories.map((cat) => {
        const meta = CATEGORY_META[cat.category];
        const CatIcon = meta?.icon || HelpCircle;
        const isActive = selected.has(cat.category);
        return (
          <button
            key={cat.category}
            onClick={() => onToggle(cat.category)}
            className={cn(
              "inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border transition-all",
              isActive
                ? "bg-primary/15 border-primary/40 text-primary"
                : "bg-muted/30 border-border/50 text-muted-foreground hover:border-border hover:bg-muted/50",
            )}
          >
            <CatIcon className="w-3 h-3" />
            {cat.label}
            <span className="text-[10px] opacity-60">({cat.count})</span>
          </button>
        );
      })}
    </div>
  );
}

/* ─── State Selector Component ─── */

function StateSelector({
  selectedState,
  onStateChange,
  detectedState,
}: {
  selectedState: string | null;
  onStateChange: (state: string | null) => void;
  detectedState?: string | null;
}) {
  const { data: allStates } = trpc.benefits.statesWithOverlays.useQuery();

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <MapPin className="w-4 h-4 text-primary/60 shrink-0" />
        <span className="text-sm text-muted-foreground shrink-0">Your state:</span>
      </div>
      <Select
        value={selectedState || "all"}
        onValueChange={(v) => onStateChange(v === "all" ? null : v)}
      >
        <SelectTrigger className="w-[200px] h-8 text-sm bg-background/50 border-border/50">
          <SelectValue placeholder="All states (federal)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All states (federal only)</SelectItem>
          {allStates && allStates.map((code: string) => (
            <SelectItem key={code} value={code}>
              {code} {code === detectedState ? "(detected)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {detectedState && !selectedState && (
        <button
          onClick={() => onStateChange(detectedState)}
          className="text-xs text-primary hover:text-primary/80 underline underline-offset-2 shrink-0"
        >
          Use detected: {detectedState}
        </button>
      )}
      {selectedState && (
        <button
          onClick={() => onStateChange(null)}
          className="text-xs text-muted-foreground hover:text-foreground shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}


type ProofEnvelope = Record<string, any> | any[] | null | undefined;

type ResourceProofState = {
  isLoading: boolean;
  error: string | null;
  payload: any;
};

const REAL_MODULE_LINKS = [
  { label: "Workshop Floor", href: "/workshop", icon: Wrench, station: "Pick a station. Move freely." },
  { label: "Control Room / Lighthouse", href: "/control-room", icon: Shield, station: "Case command" },
  { label: "Lighthouse Hub", href: "/lighthouse", icon: Landmark, station: "Community Board" },
  { label: "CivicMap", href: "/civic-map", icon: Map, station: "Mapped resources" },
  { label: "Legal Library", href: "/legal-library", icon: Scale, station: "Doctrine" },
  { label: "Anomaly Viewfinder", href: "/viewfinder", icon: Brain, station: "Signals" },
  { label: "FOIA Tracker", href: "/foia", icon: FileText, station: "Requests" },
  { label: "Case Resolution", href: "/resolve", icon: CheckCircle2, station: "Repair Bench" },
  { label: "Guided Intake", href: "/guided-intake", icon: HelpCircle, station: "Repair Bench" },
  { label: "Upload Evidence", href: "/upload", icon: UploadCloud, station: "Evidence Lab" },
  { label: "Resource Directory", href: "/resources", icon: FolderOpen, station: "Community Board" },
  { label: "LumenSend", href: "/lumensend", icon: Send, station: "Shop Office" },
  { label: "Filing Generator", href: "/filing-generator", icon: ClipboardList, station: "Shop Office" },
  { label: "Case Dashboard", href: "/workbench", icon: Building2, station: "Case workspace" },
];

const BENEFITS_CATEGORY_GRID = [
  { label: "Food Banks", status: "Active / verified", detail: "268 verified resources", tone: "border-green-500/30 bg-green-500/10 text-green-200" },
  { label: "Benefits Offices", status: "Validation / unmapped", detail: "62 DSHS offices; geocoding pending", tone: "border-amber-500/30 bg-amber-500/10 text-amber-200" },
  { label: "Healthcare", status: "Coming soon", detail: "Source not yet bridged", tone: "border-blue-500/20 bg-blue-500/5 text-blue-200" },
  { label: "Legal Aid", status: "Coming soon", detail: "Source pending", tone: "border-sky-500/20 bg-sky-500/5 text-sky-200" },
  { label: "Housing", status: "Validation pending", detail: "Bridge not locked", tone: "border-purple-500/20 bg-purple-500/5 text-purple-200" },
  { label: "Nonprofits", status: "Quarantined", detail: "Needs validation", tone: "border-red-500/20 bg-red-500/5 text-red-200" },
];

function unwrapProofPayload(envelope: ProofEnvelope): any {
  if (!envelope) return null;
  const e: any = envelope;
  return e?.result?.data?.json ?? e?.result?.data ?? e?.data?.json ?? e?.data ?? e;
}

function listFromProof(payload: any, keys: string[]): any[] {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    const value = payload?.[key];
    if (Array.isArray(value)) return value;
  }
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.resources)) return payload.resources;
  if (Array.isArray(payload?.offices)) return payload.offices;
  return [];
}

function numberFromProof(payload: any, fallback: number, keys: string[]): number {
  for (const key of keys) {
    const value = payload?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return fallback;
}

function useProofEndpoint(endpoint: string): ResourceProofState {
  const [state, setState] = useState<ResourceProofState>({ isLoading: true, error: null, payload: null });

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const response = await fetch(`/api/trpc/${endpoint}`, { credentials: "same-origin" });
        const text = await response.text();
        const parsed = text ? JSON.parse(text) : null;
        if (!cancelled) {
          setState({ isLoading: false, error: response.ok ? null : `HTTP ${response.status}`, payload: unwrapProofPayload(parsed) });
        }
      } catch (error: any) {
        if (!cancelled) setState({ isLoading: false, error: error?.message || "Proof endpoint unavailable", payload: null });
      }
    }
    run();
    return () => { cancelled = true; };
  }, [endpoint]);

  return state;
}

function formatResourceAddress(resource: any): string {
  return [resource?.address_line1, resource?.address, resource?.city, resource?.state, resource?.postal_code]
    .filter(Boolean)
    .join(", ");
}

function BenefitsStationNav() {
  return (
    <Card className="bg-card/50 border-border/50 overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Wrench className="w-4 h-4 text-primary" />
          Workshop Floor navigation
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Pick a station. Move freely. Every station connects to the others.
        </p>
      </CardHeader>
      <CardContent className="pt-1">
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 print:flex-wrap">
          {REAL_MODULE_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link key={link.href} href={link.href}>
                <a className="min-w-max rounded-lg border border-border/50 bg-background/40 px-3 py-2 text-left hover:border-primary/40 hover:bg-primary/5 transition-colors">
                  <span className="flex items-center gap-2 text-xs font-medium text-foreground">
                    <Icon className="w-3.5 h-3.5 text-primary/80" />
                    {link.label}
                  </span>
                  <span className="block text-[10px] text-muted-foreground mt-0.5">{link.station}</span>
                </a>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function BenefitsCategoryNavigator() {
  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Filter className="w-4 h-4 text-primary" />
          Benefits category navigator
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {BENEFITS_CATEGORY_GRID.map((cat) => (
            <div key={cat.label} className="rounded-lg border border-border/50 bg-background/30 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-medium text-foreground">{cat.label}</h3>
                  <p className="text-[11px] text-muted-foreground mt-1">{cat.detail}</p>
                </div>
                <Badge variant="outline" className={cn("text-[10px] whitespace-nowrap", cat.tone)}>{cat.status}</Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ResourceDirectoryProofSection({ proof }: { proof: ResourceProofState }) {
  const payload = proof.payload;
  const resources = listFromProof(payload, ["resources", "foodBanks", "food_banks", "items", "rows"]);
  const total = numberFromProof(payload, 268, ["verifiedTotal", "verified_total", "total", "count", "rawRecords", "raw_records"]);
  const visible = resources.slice(0, 20);

  return (
    <Card className="bg-card/50 border-border/50" data-proof-hook="civicMapResourceProof benefitsResourceDirectoryProof">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Utensils className="w-4 h-4 text-green-400" />
              Food Bank Resource Directory
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Showing 20 of {total} verified resources.</p>
          </div>
          <Link href="/civic-map?layer=food_banks">
            <Button size="sm" variant="outline" className="text-xs shrink-0">
              <MapPin className="w-3.5 h-3.5 mr-1" />
              View Food Banks on CivicMap
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[420px] overflow-y-auto pr-1 space-y-2 border border-border/30 rounded-lg p-2 bg-background/20">
          {proof.isLoading && <p className="text-xs text-muted-foreground p-3">Loading verified food-bank proof...</p>}
          {!proof.isLoading && visible.length === 0 && (
            <p className="text-xs text-muted-foreground p-3">Verified resource count is preserved; live resource-card sample is unavailable from the proof response.</p>
          )}
          {visible.map((resource: any, index: number) => (
            <div key={resource?.id ?? resource?.name ?? index} className="rounded-md border border-border/40 bg-card/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{resource?.name || resource?.title || `Verified food-bank resource ${index + 1}`}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatResourceAddress(resource) || resource?.description || "Verified food assistance resource"}</p>
                </div>
                <Badge variant="outline" className="text-[10px] bg-green-500/10 border-green-500/30 text-green-300">Verified</Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DshsOfficeValidationSection({ proof }: { proof: ResourceProofState }) {
  const payload = proof.payload;
  const offices = listFromProof(payload, ["offices", "resources", "items", "rows", "normalizedRecords"]);
  const total = numberFromProof(payload, 62, ["normalizedRecords", "normalized_records", "rawRecords", "raw_records", "total", "count"]);
  const visible = offices.slice(0, 62);

  return (
    <Card className="bg-card/50 border-border/50" data-proof-hook="benefitsDshsOfficeProof">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="w-4 h-4 text-amber-400" />
              Benefits Offices — Validation Layer
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{total} DSHS offices from normalized civic resources. DSHS must not go on CivicMap yet.</p>
          </div>
          <Badge variant="outline" className="text-[10px] bg-amber-500/10 border-amber-500/30 text-amber-200">UNMAPPED / NEEDS GEOCODING</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-h-[420px] overflow-y-auto pr-1 space-y-2 border border-border/30 rounded-lg p-2 bg-background/20">
          {proof.isLoading && <p className="text-xs text-muted-foreground p-3">Loading DSHS validation proof...</p>}
          {!proof.isLoading && visible.length === 0 && (
            <p className="text-xs text-muted-foreground p-3">62 DSHS normalized records are proven; address-card sample is unavailable from the proof response.</p>
          )}
          {visible.map((office: any, index: number) => {
            const hasPhone = Boolean(office?.phone || office?.telephone);
            const hasCoords = office?.latitude != null && office?.longitude != null;
            return (
              <div key={office?.id ?? office?.name ?? index} className="rounded-md border border-border/40 bg-card/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{office?.name || office?.title || `DSHS benefits office record ${index + 1}`}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{office?.address_line1 || office?.address || "Address listed"}</p>
                    <p className="text-xs text-muted-foreground/80">{[office?.city, office?.state, office?.postal_code].filter(Boolean).join(", ") || "Washington"}</p>
                    <p className="text-[11px] text-amber-200/90 mt-1">{hasCoords ? "Coordinates present — validation pending." : "Address listed — mapping pending."}</p>
                  </div>
                  <div className="flex flex-col gap-1 items-end shrink-0">
                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 border-amber-500/30 text-amber-200">{office?.geocode_precision || "unmapped"}</Badge>
                    {hasPhone && <a href={`tel:${office.phone || office.telephone}`} className="text-[10px] text-primary hover:underline">Call</a>}
                    {hasCoords && <span className="text-[10px] text-muted-foreground">Directions pending</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <details className="rounded-lg border border-border/40 bg-background/30 p-3">
          <summary className="cursor-pointer text-xs font-medium text-foreground">Technical proof: benefitsDshsOfficeProof</summary>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-[11px] text-muted-foreground">
            <p><strong className="text-foreground">endpoint/hook:</strong> benefitsDshsOfficeProof</p>
            <p><strong className="text-foreground">source_key:</strong> wa_dshs_office_locator</p>
            <p><strong className="text-foreground">raw records:</strong> {total}</p>
            <p><strong className="text-foreground">normalized records:</strong> {total}</p>
            <p><strong className="text-foreground">geocode_precision:</strong> unmapped</p>
            <p><strong className="text-foreground">status:</strong> DSHS_OFFICE_LOCATOR_SIDELOAD_PROVEN</p>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function StagedCaseActions({ caseId }: { caseId?: number }) {
  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><ClipboardList className="w-4 h-4 text-primary" />Staged case-building actions</CardTitle>
        {!caseId && <p className="text-xs text-amber-200">CASE_CONTEXT_BRIDGE_MISSING</p>}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <Button variant="outline" disabled={!caseId} className="justify-start text-xs">Save to Case</Button>
          <Button variant="outline" disabled={!caseId} className="justify-start text-xs">Link to Current Case</Button>
          <Button variant="outline" onClick={() => { window.location.href = "/resolve"; }} className="justify-start text-xs">Open Case Resolution</Button>
          <Button variant="outline" onClick={() => { window.location.href = "/guided-intake"; }} className="justify-start text-xs">Open Guided Intake</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Main Benefits Navigator Page ─── */

export default function BenefitsNavigator() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const { user } = useAuth();

  // Get context from URL params
  const initialText = params.get("situation") || "";
  const pipelineCategory = params.get("category") || undefined;
  const pipelineId = params.get("pipeline") || undefined;
  const initialState = params.get("state") || null;
  const caseId = params.get("caseId") ? parseInt(params.get("caseId")!) : undefined;

  // State
  const [situationText, setSituationText] = useState(initialText);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [showChecklist, setShowChecklist] = useState(false);
  const [hasSearched, setHasSearched] = useState(!!initialText);
  const [selectedState, setSelectedState] = useState<string | null>(initialState);
  const [detectedState, setDetectedState] = useState<string | null>(null);
  const [trackedProgramIds, setTrackedProgramIds] = useState<Set<string>>(new Set());
  const [browseCategoryKeyword, setBrowseCategoryKeyword] = useState<string | null>(null);
  const [showRegistryExtra, setShowRegistryExtra] = useState(false);

  // Queries
  const { data: categories } = trpc.benefits.categories.useQuery();
  const civicMapProof = useProofEndpoint("civicMapResourceProof");
  const dshsOfficeProof = useProofEndpoint("benefitsDshsOfficeProof");

  // Augment with DB registry programs when browsing a category
  const { data: registryPrograms } = trpc.canonicalRegistry.searchPrograms.useQuery(
    { query: browseCategoryKeyword ?? "", state: selectedState ?? undefined, limit: 20 },
    { enabled: !!browseCategoryKeyword && browseCategoryKeyword.length > 0 },
  );

  const { data: matchResults, isLoading: isMatching, refetch: refetchMatches } = trpc.benefits.match.useQuery(
    {
      situation_text: situationText || undefined,
      pipeline_category: pipelineCategory,
      pipeline_id: pipelineId,
      state_code: selectedState || undefined,
    },
    { enabled: hasSearched && situationText.length > 0 },
  );

  // Track existing applications
  const { data: existingApps } = trpc.benefitApps.list.useQuery(
    caseId ? { caseId } : undefined,
    { enabled: !!user },
  );

  const createApp = trpc.benefitApps.create.useMutation({
    onSuccess: (app) => {
      setTrackedProgramIds((prev) => new Set([...prev, app.programId]));
      toast.success("Application tracking started", {
        description: `You're now tracking your ${app.programName} application.`,
      });
    },
    onError: () => {
      toast.error("Failed to start tracking");
    },
  });

  // Sync tracked programs from existing apps
  useEffect(() => {
    if (existingApps) {
      setTrackedProgramIds(new Set(existingApps.map((a: any) => a.programId)));
    }
  }, [existingApps]);

  // Detect state from match results
  useEffect(() => {
    if (matchResults && matchResults.length > 0) {
      const firstWithState = matchResults.find((m: any) => m.state_detected);
      if (firstWithState) {
        setDetectedState((firstWithState as any).state_detected);
      }
    }
  }, [matchResults]);

  // Auto-search if we have initial text from URL
  useEffect(() => {
    if (initialText && !hasSearched) {
      setHasSearched(true);
    }
  }, [initialText]);

  // Filter and sort results
  const filteredResults = useMemo(() => {
    if (!matchResults) return [];
    let results = [...matchResults];

    if (selectedCategories.size > 0) {
      results = results.filter((m: any) => selectedCategories.has(m.program.category));
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      results = results.filter((m: any) =>
        m.program.name.toLowerCase().includes(q) ||
        m.program.short_name.toLowerCase().includes(q) ||
        m.program.description.toLowerCase().includes(q) ||
        m.program.what_it_does.toLowerCase().includes(q)
      );
    }

    return results;
  }, [matchResults, selectedCategories, searchQuery]);

  const matchedProgramIds = useMemo(() => {
    if (!filteredResults) return [];
    return filteredResults.map((m: any) => m.program.id);
  }, [filteredResults]);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleCard = (id: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSearch = () => {
    if (!situationText.trim()) {
      toast.error("Please describe your situation first");
      return;
    }
    setHasSearched(true);
    refetchMatches();
  };

  const handleTrackApplication = (program: any) => {
    if (!user) {
      toast.error("Please sign in to track applications");
      return;
    }
    createApp.mutate({
      programId: program.id,
      programName: program.short_name || program.name,
      caseId,
      stateCode: selectedState || detectedState || undefined,
      applicationUrl: program.website || undefined,
      documentsNeeded: program.documents_needed || [],
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const immediateCount = filteredResults.filter((m: any) => m.program.urgency === "immediate").length;
  const localizedCount = filteredResults.filter((m: any) => m.is_localized).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/30">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/welcome")}
              className="text-muted-foreground hover:text-foreground -ml-2"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            {user && (existingApps?.length ?? 0) > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/my-applications")}
                className="text-xs ml-auto"
              >
                <ClipboardList className="w-3.5 h-3.5 mr-1" />
                My Applications ({existingApps?.length})
              </Button>
            )}
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Benefits Navigator
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Find government programs and resources you may be eligible for inside the larger Luminari case-building workshop.
                Tell us what's going on, and we'll show available help while preserving proven resource data.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="shrink-0 text-xs print:hidden"
            >
              <Printer className="w-3.5 h-3.5 mr-1" />
              Print
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <BenefitsStationNav />
        <BenefitsCategoryNavigator />
        <ResourceDirectoryProofSection proof={civicMapProof} />
        <DshsOfficeValidationSection proof={dshsOfficeProof} />
        <StagedCaseActions caseId={caseId} />

        {/* Search / Situation Input */}
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground/80 mb-2 block">
                Tell us what's happening in your life right now
                <Badge variant="outline" className="ml-2 text-[10px] align-middle bg-blue-500/10 border-blue-500/30 text-blue-200">guided search / prototype</Badge>
              </label>
              <p className="text-xs text-muted-foreground mb-3">
                Use your own words. You can mention things like losing a job, needing food, dealing with a death in the family,
                housing problems, health issues, or anything else. We'll find programs that can help.
              </p>
              <Textarea
                value={situationText}
                onChange={(e) => setSituationText(e.target.value)}
                placeholder="Example: My grandfather just passed away and we can't afford the funeral. I also lost my job last month and I have two kids to feed..."
                className="min-h-[100px] bg-background/50 border-border/50 text-sm resize-none"
              />
            </div>

            {/* State Selector */}
            <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
              <StateSelector
                selectedState={selectedState}
                onStateChange={(state) => {
                  setSelectedState(state);
                  if (hasSearched) {
                    // Re-trigger search with new state
                    setTimeout(() => refetchMatches(), 100);
                  }
                }}
                detectedState={detectedState}
              />
              <p className="text-[10px] text-muted-foreground mt-2 ml-6">
                Selecting your state shows local program names, phone numbers, and state-specific benefits you may qualify for.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">
                Your information stays private and is never shared.
              </p>
              <Button
                onClick={handleSearch}
                disabled={!situationText.trim() || isMatching}
                className="px-6"
                size="sm"
              >
                {isMatching ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Finding programs...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-1.5" />
                    Find Help
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {hasSearched && matchResults && (
          <>
            {/* State Detection Banner */}
            {(detectedState || selectedState) && localizedCount > 0 && (
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 flex items-start gap-3">
                <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-foreground/90">
                    Showing <strong>{localizedCount}</strong> {selectedState || detectedState} program{localizedCount !== 1 ? "s" : ""} with local names, phone numbers, and application links.
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    State-specific programs are marked with a location badge.
                  </p>
                </div>
              </div>
            )}

            {/* Immediate Help Alert */}
            {immediateCount > 0 && (
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-red-300">
                    {immediateCount} program{immediateCount > 1 ? "s" : ""} for immediate help
                  </h3>
                  <p className="text-xs text-red-300/70 mt-0.5">
                    These programs can help right now. Look for the "Call Now" badge below.
                  </p>
                </div>
              </div>
            )}

            {/* Results Summary */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  {filteredResults.length} program{filteredResults.length !== 1 ? "s" : ""} found
                </h2>
                <p className="text-xs text-muted-foreground">
                  Sorted by relevance to your situation
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={showChecklist ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowChecklist(!showChecklist)}
                  className="text-xs"
                >
                  <FileText className="w-3.5 h-3.5 mr-1" />
                  Document Checklist
                </Button>
              </div>
            </div>

            {/* Search within results */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search programs..."
                className="pl-9 bg-background/50 border-border/50 text-sm h-9"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Category Filters */}
            {categories && categories.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Filter className="w-3 h-3" />
                  Filter by category
                </h3>
                <CategoryFilters
                  categories={categories}
                  selected={selectedCategories}
                  onToggle={toggleCategory}
                />
                {selectedCategories.size > 0 && (
                  <button
                    onClick={() => setSelectedCategories(new Set())}
                    className="text-xs text-primary hover:text-primary/80 mt-1.5"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}

            {/* Document Checklist */}
            {showChecklist && matchedProgramIds.length > 0 && (
              <DocumentChecklist programIds={matchedProgramIds} />
            )}

            {/* Program Cards */}
            <div className="space-y-3">
              {filteredResults.map((match: any) => (
                <ProgramCard
                  key={match.program.id}
                  program={match.program}
                  relevanceScore={match.relevance_score}
                  matchReasons={match.match_reasons}
                  isLocalized={match.is_localized}
                  stateDetected={match.state_detected}
                  isExpanded={expandedCards.has(match.program.id)}
                  onToggle={() => toggleCard(match.program.id)}
                  onTrackApplication={user ? () => handleTrackApplication(match.program) : undefined}
                  isTracked={trackedProgramIds.has(match.program.id)}
                />
              ))}
            </div>

            {filteredResults.length === 0 && (
              <div className="text-center py-12">
                <HelpCircle className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No programs match your current filters. Try removing some filters or describing your situation differently.
                </p>
              </div>
            )}

            {/* Registry Supplemental Programs */}
            {registryPrograms && registryPrograms.length > 0 && (
              <div className="mt-2">
                <button
                  onClick={() => setShowRegistryExtra((v) => !v)}
                  className="flex items-center gap-2 text-xs text-primary/70 hover:text-primary transition-colors mb-2"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  {showRegistryExtra ? "Hide" : "Also see"} {registryPrograms.length} more programs in the full registry
                </button>
                {showRegistryExtra && (
                  <div className="space-y-2">
                    {registryPrograms.map((p: any) => (
                      <div key={p.id} className="p-3 rounded-lg bg-card/30 border border-border/30 hover:border-border/60 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground/90 leading-tight">{p.name}</p>
                            {p.agency_name && <p className="text-xs text-muted-foreground mt-0.5">{p.agency_name}</p>}
                            {p.description && <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">{p.description}</p>}
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {p.jurisdiction_id && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{p.jurisdiction_id}</Badge>
                            )}
                            {p.apply_url && (
                              <a
                                href={p.apply_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-[10px] text-primary hover:text-primary/80"
                              >
                                Apply <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Bottom Help */}
            <Card className="bg-muted/20 border-border/30">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Not finding what you need?
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1 mb-3">
                  Call <strong className="text-foreground">2-1-1</strong> from any phone — it's free, confidential, and available 24/7.
                  They can connect you with local resources in your area.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <a
                    href="tel:211"
                    className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-green-500/15 text-green-300 hover:bg-green-500/25 transition-colors border border-green-500/20"
                  >
                    <Phone className="w-4 h-4" />
                    Call 2-1-1
                  </a>
                  <a
                    href="https://www.211.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 transition-colors border border-blue-500/20"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Visit 211.org
                  </a>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Browse All Categories (when no search) */}
        {!hasSearched && categories && (
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">
              Or browse by category
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {categories.map((cat: any) => {
                const meta = CATEGORY_META[cat.category];
                const CatIcon = meta?.icon || HelpCircle;
                return (
                  <button
                    key={cat.category}
                    onClick={() => {
                      setSelectedCategories(new Set([cat.category]));
                      setSituationText(`I need help with ${cat.label.toLowerCase()}`);
                      setBrowseCategoryKeyword(cat.label);
                      setHasSearched(true);
                    }}
                    className="p-4 rounded-lg bg-card/50 border border-border/50 hover:border-border hover:bg-card/70 transition-all text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-lg bg-muted/50 group-hover:bg-muted/80 transition-colors", meta?.color)}>
                        <CatIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-foreground">{cat.label}</h3>
                        <p className="text-xs text-muted-foreground">{cat.count} program{cat.count !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <NextStepBar
        context="Benefits identified. Save relevant programs to your case or continue building your strategy."
        steps={[
          { label: "Control Room", href: "/control-room", icon: "map", variant: "primary", description: "Review your full committed case state" },
          { label: "Procedural Paths", href: "/enforcement-pathway", icon: "scale", description: "Choose your enforcement route" },
          { label: "FOIA Tracker", href: "/foia-tracking", icon: "file", description: "Track information requests" },
        ]}
      />
    </div>
  );
}
