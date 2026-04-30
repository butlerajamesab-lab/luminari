import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useCase } from "@/contexts/CaseContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Search,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Shield,
  Scale,
  FileText,
  Building2,
  Gavel,
  Clock,
  ChevronDown,
  ChevronRight,
  Loader2,
  Sparkles,
  Target,
  Network,
  Lightbulb,
  ArrowUpRight,
  Eye,
  Layers,
  Plus,
  Paperclip,
  Trash2,
  Link2,
  CircleDot,
  CircleCheck,
  CircleAlert,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { InterpretationPanel } from "@/components/InterpretationPanel";

// ─── Resolution Pipeline Steps ───
type PipelineStep = "problem" | "claims" | "proof" | "barriers" | "agency" | "action";

const STEP_META: Record<PipelineStep, { label: string; icon: React.ElementType; description: string }> = {
  problem: { label: "Describe", icon: Search, description: "What happened to you?" },
  claims: { label: "Claims", icon: Target, description: "Legal claims that match your situation" },
  proof: { label: "Proof", icon: Scale, description: "Evidence you'll need to build your case" },
  barriers: { label: "Barriers", icon: AlertTriangle, description: "Obstacles that could block your path" },
  agency: { label: "Where to File", icon: Building2, description: "Agencies and courts for your case" },
  action: { label: "Next Action", icon: ArrowRight, description: "Your recommended next step" },
};

const PIPELINE_ORDER: PipelineStep[] = ["problem", "claims", "proof", "barriers", "agency", "action"];

// ─── Jurisdiction Detection ───
const JURISDICTION_STORAGE_KEY = "luminari-jurisdiction";

/** Known jurisdictions for autocomplete */
const KNOWN_JURISDICTIONS = [
  "Federal", "WA", "CA", "NY", "TX", "FL", "IL",
  "Federal/State", "Tribal/Federal",
  "AK", "AL", "AR", "AZ", "CO", "CT", "DC", "DE",
  "GA", "HI", "IA", "ID", "IN", "KS", "KY", "LA",
  "MA", "MD", "ME", "MI", "MN", "MO", "MS", "MT",
  "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "OH",
  "OK", "OR", "PA", "RI", "SC", "SD", "TN", "UT",
  "VA", "VT", "WI", "WV", "WY",
];

/** Attempt to extract jurisdiction from case domain string */
function inferJurisdictionFromDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;
  const d = domain.trim();
  // Check for state abbreviations (e.g. "SDNY" → NY, "WA" → WA)
  const stateMatch = d.match(/\b([A-Z]{2})\b/);
  if (stateMatch) {
    const abbr = stateMatch[1];
    if (KNOWN_JURISDICTIONS.includes(abbr)) return abbr;
  }
  // Check for state names
  const stateNames: Record<string, string> = {
    "washington": "WA", "california": "CA", "new york": "NY", "texas": "TX",
    "florida": "FL", "illinois": "IL", "oregon": "OR", "ohio": "OH",
    "michigan": "MI", "georgia": "GA", "pennsylvania": "PA",
    "colorado": "CO", "arizona": "AZ", "minnesota": "MN",
  };
  const lower = d.toLowerCase();
  for (const [name, abbr] of Object.entries(stateNames)) {
    if (lower.includes(name)) return abbr;
  }
  // Check for federal indicators
  if (/\b(federal|SDNY|EDNY|CDCA|NDCA|SDTX)\b/i.test(d)) return "Federal";
  return null;
}

export default function CaseResolutionLens() {
  const [, navigate] = useLocation();
  const { currentCase } = useCase();
  const [step, setStep] = useState<PipelineStep>("problem");
  const [problemText, setProblemText] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [jurisdictionSource, setJurisdictionSource] = useState<"auto" | "manual" | "stored">("manual");
  const [showJurisdictionSuggestions, setShowJurisdictionSuggestions] = useState(false);
  const jurisdictionRef = useRef<HTMLDivElement>(null);
  const [selectedClaimType, setSelectedClaimType] = useState("");
  const [selectedDomain, setSelectedDomain] = useState("");
  const [graphExpanded, setGraphExpanded] = useState(false);

  // ─── Evidence Layer State ───
  const [showAddEvidence, setShowAddEvidence] = useState(false);
  const [newEvidence, setNewEvidence] = useState({ title: "", evidenceType: "other", description: "", sourceName: "" });
  const [linkingEvidenceId, setLinkingEvidenceId] = useState<number | null>(null);
  const [linkingElement, setLinkingElement] = useState<{ frameworkId: number; elementNumber: number } | null>(null);

  // ─── Jurisdiction Auto-Detection ───
  // Priority: 1) Previously stored, 2) Case context, 3) Empty (manual)
  useEffect(() => {
    // Check localStorage first
    const stored = localStorage.getItem(JURISDICTION_STORAGE_KEY);
    if (stored) {
      setJurisdiction(stored);
      setJurisdictionSource("stored");
      return;
    }
    // Try to infer from current case domain
    if (currentCase) {
      const inferred = inferJurisdictionFromDomain((currentCase as any).domain);
      if (inferred) {
        setJurisdiction(inferred);
        setJurisdictionSource("auto");
        return;
      }
    }
  }, [currentCase]);

  // Persist jurisdiction when user changes it
  function updateJurisdiction(value: string) {
    setJurisdiction(value);
    setJurisdictionSource("manual");
    if (value) {
      localStorage.setItem(JURISDICTION_STORAGE_KEY, value);
    } else {
      localStorage.removeItem(JURISDICTION_STORAGE_KEY);
    }
  }

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (jurisdictionRef.current && !jurisdictionRef.current.contains(e.target as Node)) {
        setShowJurisdictionSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Filtered suggestions
  const jurisdictionSuggestions = useMemo(() => {
    if (!jurisdiction) return KNOWN_JURISDICTIONS.slice(0, 12);
    const lower = jurisdiction.toLowerCase();
    return KNOWN_JURISDICTIONS.filter(j => j.toLowerCase().includes(lower)).slice(0, 8);
  }, [jurisdiction]);

  const stepIndex = PIPELINE_ORDER.indexOf(step);

  // ─── Queries ───
  const claimsQuery = trpc.dualLens.matchClaims.useQuery(
    { problemDescription: problemText, jurisdiction: jurisdiction || undefined },
    { enabled: step !== "problem" && problemText.length > 4 }
  );

  const proofQuery = trpc.dualLens.getProofChecklist.useQuery(
    { claimType: selectedClaimType, domain: selectedDomain || undefined },
    { enabled: step === "proof" && !!selectedClaimType }
  );

  const barrierQuery = trpc.dualLens.getBarrierAlerts.useQuery(
    { claimType: selectedClaimType, jurisdiction: jurisdiction || undefined },
    { enabled: step === "barriers" && !!selectedClaimType }
  );

  const agencyQuery = trpc.dualLens.findAgencyAndForum.useQuery(
    { claimType: selectedClaimType, jurisdiction: jurisdiction || "Federal", domain: selectedDomain || undefined },
    { enabled: step === "agency" && !!selectedClaimType }
  );

  const actionQuery = trpc.dualLens.getNextAction.useQuery(
    { claimType: selectedClaimType, jurisdiction: jurisdiction || "Federal", domain: selectedDomain || undefined },
    { enabled: step === "action" && !!selectedClaimType }
  );

  const graphQuery = trpc.dualLens.expandNode.useQuery(
    { nodeId: selectedClaimType, nodeType: "claim" },
    { enabled: graphExpanded && !!selectedClaimType }
  );

  // Evidence queries (enabled when on proof step with a case)
  const evidenceListQuery = trpc.evidenceLayer.list.useQuery(
    { caseId: currentCase?.id ?? 0 },
    { enabled: !!currentCase && (step === "proof" || step === "action") }
  );

  // Evidence coverage per framework
  const firstFrameworkId = proofQuery.data?.frameworks?.[0]?.id;
  const coverageQuery = trpc.evidenceLayer.coverage.useQuery(
    { caseId: currentCase?.id ?? 0, frameworkId: firstFrameworkId ?? 0 },
    { enabled: !!currentCase && !!firstFrameworkId && step === "proof" }
  );

  const addEvidenceMutation = trpc.evidenceLayer.create.useMutation({
    onSuccess: () => {
      setShowAddEvidence(false);
      setNewEvidence({ title: "", evidenceType: "other", description: "", sourceName: "" });
      evidenceListQuery.refetch();
      coverageQuery.refetch();
    },
  });

  const deleteEvidenceMutation = trpc.evidenceLayer.delete.useMutation({
    onSuccess: () => {
      evidenceListQuery.refetch();
      coverageQuery.refetch();
    },
  });

  const linkToProofMutation = trpc.evidenceLayer.linkToProof.useMutation({
    onSuccess: () => {
      setLinkingEvidenceId(null);
      setLinkingElement(null);
      coverageQuery.refetch();
    },
  });

  // ─── Navigation ───
  function goNext() {
    const next = PIPELINE_ORDER[stepIndex + 1];
    if (next) setStep(next);
  }
  function goBack() {
    const prev = PIPELINE_ORDER[stepIndex - 1];
    if (prev) setStep(prev);
  }
  function startResolution() {
    if (problemText.trim().length > 4) {
      setStep("claims");
    }
  }
  function selectClaim(claimType: string) {
    setSelectedClaimType(claimType);
    setStep("proof");
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ─── Progress Bar ─── */}
      <div className="border-b border-border/50 bg-card/30 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center gap-1 overflow-x-auto">
            {PIPELINE_ORDER.map((s, i) => {
              const meta = STEP_META[s];
              const Icon = meta.icon;
              const isActive = s === step;
              const isComplete = i < stepIndex;
              const isAccessible = i <= stepIndex;

              return (
                <div key={s} className="flex items-center">
                  <button
                    onClick={() => isAccessible && setStep(s)}
                    disabled={!isAccessible}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-md"
                        : isComplete
                        ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                        : "text-muted-foreground/50"
                    }`}
                  >
                    {isComplete ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <Icon className="w-3.5 h-3.5" />
                    )}
                    <span className="hidden sm:inline">{meta.label}</span>
                  </button>
                  {i < PIPELINE_ORDER.length - 1 && (
                    <ChevronRight className={`w-3.5 h-3.5 mx-0.5 ${isComplete ? "text-emerald-400/50" : "text-muted-foreground/20"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── Main Content ─── */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Step 1: Problem Description */}
        {step === "problem" && (
          <div className="space-y-8">
            <div className="text-center space-y-3 pt-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-2">
                <Lightbulb className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">What happened to you?</h1>
              <p className="text-muted-foreground max-w-lg mx-auto">
                Describe your situation in plain language. We'll match it to legal claims, identify what proof you need,
                and show you exactly where to file.
              </p>
            </div>

            <Card className="max-w-2xl mx-auto border-primary/20">
              <CardContent className="pt-6 space-y-4">
                <Textarea
                  placeholder="Example: My landlord refused to rent to me because I use a wheelchair. I applied for an apartment and was told they don't accommodate disabled tenants..."
                  value={problemText}
                  onChange={(e) => setProblemText(e.target.value)}
                  className="min-h-[140px] text-base resize-none"
                  autoFocus
                />
                <div className="flex items-center gap-3">
                  <div className="flex-1 relative" ref={jurisdictionRef}>
                    <div className="relative">
                      <Input
                        placeholder="State or jurisdiction (e.g., WA, California, Federal)"
                        value={jurisdiction}
                        onChange={(e) => updateJurisdiction(e.target.value)}
                        onFocus={() => setShowJurisdictionSuggestions(true)}
                        className={`text-sm pr-20 ${
                          jurisdictionSource === "auto" ? "border-cyan-500/30" :
                          jurisdictionSource === "stored" ? "border-emerald-500/30" : ""
                        }`}
                      />
                      {jurisdiction && jurisdictionSource !== "manual" && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                          <Badge variant="outline" className={`text-[9px] ${
                            jurisdictionSource === "auto" ? "border-cyan-500/30 text-cyan-400" :
                            "border-emerald-500/30 text-emerald-400"
                          }`}>
                            {jurisdictionSource === "auto" ? "from case" : "remembered"}
                          </Badge>
                        </div>
                      )}
                    </div>
                    {showJurisdictionSuggestions && jurisdictionSuggestions.length > 0 && (
                      <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {jurisdictionSuggestions.map((j) => (
                          <button
                            key={j}
                            onClick={() => {
                              updateJurisdiction(j);
                              setShowJurisdictionSuggestions(false);
                            }}
                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                          >
                            {j}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={startResolution}
                    disabled={problemText.trim().length < 5}
                    size="lg"
                    className="gap-2"
                  >
                    Find My Claims <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Your description stays private. We match keywords against 97 legal claim types.
                </p>
              </CardContent>
            </Card>

            {/* Quick-start categories */}
            <div className="max-w-2xl mx-auto">
              <p className="text-xs text-muted-foreground mb-3 text-center">Or start from a common category:</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: "Housing Discrimination", icon: Building2, query: "housing discrimination refused rent disability" },
                  { label: "Employment Rights", icon: Gavel, query: "fired from job wrongful termination discrimination" },
                  { label: "Benefits Denial", icon: Shield, query: "disability benefits denied SSDI appeal" },
                  { label: "Civil Rights", icon: Scale, query: "civil rights violation discrimination equal protection" },
                ].map((cat) => (
                  <button
                    key={cat.label}
                    onClick={() => {
                      setProblemText(cat.query);
                      setStep("claims");
                    }}
                    className="flex items-center gap-2 p-3 rounded-lg border border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-all text-left text-sm"
                  >
                    <cat.icon className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-foreground/80">{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Claim Matches */}
        {step === "claims" && (
          <div className="space-y-6">
            <StepHeader
              title="Matching Legal Claims"
              description={`Based on: "${problemText.slice(0, 80)}${problemText.length > 80 ? "..." : ""}"`}
              onBack={goBack}
            />

            {claimsQuery.isLoading ? (
              <LoadingState message="Searching claim catalog..." />
            ) : claimsQuery.data?.matches && claimsQuery.data.matches.length > 0 ? (
              <div className="grid gap-3">
                {claimsQuery.data.matches.map((match: any) => (
                  <Card
                    key={match.id}
                    className={`cursor-pointer transition-all hover:border-primary/40 hover:shadow-md ${
                      match.confidence === "high"
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : match.confidence === "medium"
                        ? "border-amber-500/20 bg-amber-500/5"
                        : "border-border/50"
                    }`}
                    onClick={() => selectClaim(match.claimType)}
                  >
                    <CardContent className="py-4 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-sm truncate">{match.claimType}</h3>
                          <ConfidenceBadge level={match.confidence} />
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {match.statuteCitation || match.standardOfProof || "Click to explore proof requirements"}
                        </p>
                        <div className="flex gap-2 mt-1.5 flex-wrap">
                          {match.jurisdiction && <Badge variant="outline" className="text-[10px]">{match.jurisdiction}</Badge>}
                          {match.typicalForum && <Badge variant="outline" className="text-[10px]">{match.typicalForum}</Badge>}
                          {match.solYears && <Badge variant="outline" className="text-[10px]">SOL: {match.solYears}y</Badge>}
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <EmptyState message="No strong claim matches found. Try rephrasing your description with more specific details." />
            )}
          </div>
        )}

        {/* Step 3: Proof Checklist + Evidence Layer */}
        {step === "proof" && (
          <div className="space-y-6">
            <StepHeader
              title="Proof Checklist"
              description={`What you need to prove: ${selectedClaimType}`}
              onBack={goBack}
            />

            {/* Evidence Inventory */}
            {currentCase && (
              <Card className="border-emerald-500/20 bg-emerald-500/5">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Paperclip className="w-4 h-4 text-emerald-400" />
                      Your Evidence ({evidenceListQuery.data?.length || 0} items)
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowAddEvidence(true)}
                      className="gap-1.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 h-7 text-xs"
                    >
                      <Plus className="w-3 h-3" /> Add Evidence
                    </Button>
                  </div>
                  <CardDescription className="text-xs">
                    Add documents, records, and evidence you have. We'll map them to the proof elements below.
                  </CardDescription>
                </CardHeader>
                {evidenceListQuery.data && evidenceListQuery.data.length > 0 && (
                  <CardContent className="pt-0">
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {evidenceListQuery.data.map((ev: any) => (
                        <div key={ev.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/30 group">
                          <Paperclip className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{ev.title}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {ev.evidenceType.replace(/_/g, " ")}
                              {ev.sourceName && ` — ${ev.sourceName}`}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => deleteEvidenceMutation.mutate({ id: ev.id })}
                          >
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            )}

            {proofQuery.isLoading ? (
              <LoadingState message="Loading proof frameworks..." />
            ) : proofQuery.data?.frameworks && proofQuery.data.frameworks.length > 0 ? (
              <div className="space-y-4">
                {proofQuery.data.frameworks.map((fw: any) => {
                  const coverageMap = coverageQuery.data?.coverageMap || {};
                  return (
                    <Card key={fw.id} className="border-border/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Scale className="w-4 h-4 text-primary" />
                          {fw.claimType}
                        </CardTitle>
                        {fw.burdenOfProof && (
                          <CardDescription className="text-xs">
                            Burden: <span className="text-foreground/70">{fw.burdenOfProof}</span>
                          </CardDescription>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {/* Elements of Proof with Coverage Indicators */}
                        {fw.elementsOfProof && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground">ELEMENTS OF PROOF</p>
                            {(() => {
                              const elements = typeof fw.elementsOfProof === "string"
                                ? (() => { try { return JSON.parse(fw.elementsOfProof); } catch { return [fw.elementsOfProof]; } })()
                                : Array.isArray(fw.elementsOfProof) ? fw.elementsOfProof : [fw.elementsOfProof];
                              return elements.map((el: any, i: number) => {
                                const elementNum = i + 1;
                                const coverage = coverageMap[elementNum];
                                const hasCoverage = coverage && coverage.links && coverage.links.length > 0;
                                const coverageStrength = hasCoverage ? coverage.maxStrength : 0;

                                let CoverageIcon = CircleDot;
                                let coverageColor = "text-muted-foreground/40";
                                let coverageLabel = "No evidence linked";
                                if (coverageStrength >= 0.7) {
                                  CoverageIcon = CircleCheck;
                                  coverageColor = "text-emerald-400";
                                  coverageLabel = `${coverage.links.length} evidence item(s) — strong`;
                                } else if (coverageStrength > 0) {
                                  CoverageIcon = CircleAlert;
                                  coverageColor = "text-amber-400";
                                  coverageLabel = `${coverage.links.length} evidence item(s) — partial`;
                                }

                                return (
                                  <div key={i} className={`flex items-start gap-3 p-2.5 rounded-md transition-colors ${
                                    hasCoverage ? "bg-emerald-500/5 border border-emerald-500/10" : "bg-muted/30"
                                  }`}>
                                    <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
                                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                                        <span className="text-[10px] font-bold text-primary">{elementNum}</span>
                                      </div>
                                      <CoverageIcon className={`w-3.5 h-3.5 ${coverageColor}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm">{typeof el === "string" ? el : el.name || el.element || JSON.stringify(el)}</p>
                                      <p className={`text-[10px] mt-0.5 ${coverageColor}`}>{coverageLabel}</p>
                                    </div>
                                    {currentCase && evidenceListQuery.data && evidenceListQuery.data.length > 0 && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-primary shrink-0"
                                        onClick={() => {
                                          setLinkingElement({ frameworkId: fw.id, elementNumber: elementNum });
                                          setLinkingEvidenceId(null);
                                        }}
                                      >
                                        <Link2 className="w-3 h-3" /> Link
                                      </Button>
                                    )}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        )}

                        {/* Coverage Summary */}
                        {currentCase && coverageQuery.data && fw.elementsOfProof && (() => {
                          const elements = typeof fw.elementsOfProof === "string"
                            ? (() => { try { return JSON.parse(fw.elementsOfProof); } catch { return [fw.elementsOfProof]; } })()
                            : Array.isArray(fw.elementsOfProof) ? fw.elementsOfProof : [fw.elementsOfProof];
                          const total = elements.length;
                          const covered = Object.keys(coverageQuery.data.coverageMap || {}).length;
                          const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
                          return (
                            <div className="mt-3 pt-3 border-t border-border/30">
                              <div className="flex items-center justify-between mb-1.5">
                                <p className="text-[10px] font-semibold text-muted-foreground">EVIDENCE COVERAGE</p>
                                <p className="text-[10px] text-muted-foreground">{covered}/{total} elements ({pct}%)</p>
                              </div>
                              <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    pct >= 80 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500/60"
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              {pct < 100 && (
                                <p className="text-[10px] text-amber-400/80 mt-1.5">
                                  {total - covered} element{total - covered !== 1 ? "s" : ""} still need evidence. Add documents above, then link them.
                                </p>
                              )}
                            </div>
                          );
                        })()}

                        {/* Typical Evidence */}
                        {fw.typicalEvidence && (
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-1">TYPICAL EVIDENCE</p>
                            <p className="text-xs text-muted-foreground">
                              {typeof fw.typicalEvidence === "string" ? fw.typicalEvidence : JSON.stringify(fw.typicalEvidence)}
                            </p>
                          </div>
                        )}

                        {/* Common Defenses */}
                        {fw.commonDefenses && (
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-1">COMMON DEFENSES TO WATCH</p>
                            <p className="text-xs text-amber-400/80">
                              {typeof fw.commonDefenses === "string" ? fw.commonDefenses : JSON.stringify(fw.commonDefenses)}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
                <div className="flex justify-end">
                  <Button onClick={goNext} className="gap-2">
                    Check Barriers <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <EmptyState message="No proof frameworks found for this claim type. You may need to consult a legal professional." />
                <div className="flex justify-end">
                  <Button onClick={goNext} variant="outline" className="gap-2">
                    Skip to Barriers <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Add Evidence Dialog */}
            <Dialog open={showAddEvidence} onOpenChange={setShowAddEvidence}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Evidence</DialogTitle>
                  <DialogDescription>Describe a document, record, or piece of evidence you have.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Title</Label>
                    <Input
                      placeholder="e.g., Termination letter from HR"
                      value={newEvidence.title}
                      onChange={(e) => setNewEvidence(prev => ({ ...prev, title: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Type</Label>
                    <Select
                      value={newEvidence.evidenceType}
                      onValueChange={(v) => setNewEvidence(prev => ({ ...prev, evidenceType: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["email", "text_message", "letter", "notice", "policy_document", "medical_record",
                          "photo", "witness_statement", "call_log", "contract", "receipt", "government_form",
                          "court_filing", "audio_recording", "video_recording", "screenshot", "other"
                        ].map(t => (
                          <SelectItem key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Source</Label>
                    <Input
                      placeholder="e.g., Company HR department"
                      value={newEvidence.sourceName}
                      onChange={(e) => setNewEvidence(prev => ({ ...prev, sourceName: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Description</Label>
                    <Textarea
                      placeholder="Describe what this evidence shows..."
                      value={newEvidence.description}
                      onChange={(e) => setNewEvidence(prev => ({ ...prev, description: e.target.value }))}
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAddEvidence(false)}>Cancel</Button>
                  <Button
                    onClick={() => {
                      if (!currentCase || !newEvidence.title.trim()) return;
                      addEvidenceMutation.mutate({
                        caseId: currentCase.id,
                        title: newEvidence.title.trim(),
                        evidenceType: newEvidence.evidenceType,
                        description: newEvidence.description || undefined,
                        sourceName: newEvidence.sourceName || undefined,
                      });
                    }}
                    disabled={!newEvidence.title.trim() || addEvidenceMutation.isPending}
                    className="gap-1.5"
                  >
                    {addEvidenceMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Add
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Link Evidence to Proof Element Dialog */}
            <Dialog open={!!linkingElement} onOpenChange={(open) => { if (!open) { setLinkingElement(null); setLinkingEvidenceId(null); } }}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Link Evidence to Element #{linkingElement?.elementNumber}</DialogTitle>
                  <DialogDescription>Select which evidence item supports this proof element.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {evidenceListQuery.data?.map((ev: any) => (
                    <div
                      key={ev.id}
                      onClick={() => setLinkingEvidenceId(ev.id)}
                      className={`flex items-center gap-2 p-2.5 rounded-md cursor-pointer transition-colors ${
                        linkingEvidenceId === ev.id
                          ? "bg-primary/10 border border-primary/30"
                          : "bg-muted/30 hover:bg-muted/50"
                      }`}
                    >
                      <Paperclip className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{ev.title}</p>
                        <p className="text-[10px] text-muted-foreground">{ev.evidenceType.replace(/_/g, " ")}</p>
                      </div>
                      {linkingEvidenceId === ev.id && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setLinkingElement(null); setLinkingEvidenceId(null); }}>Cancel</Button>
                  <Button
                    onClick={() => {
                      if (!linkingEvidenceId || !linkingElement) return;
                      linkToProofMutation.mutate({
                        evidenceId: linkingEvidenceId,
                        frameworkId: linkingElement.frameworkId,
                        elementNumber: linkingElement.elementNumber,
                        relationshipStrength: "0.80",
                      });
                    }}
                    disabled={!linkingEvidenceId || linkToProofMutation.isPending}
                    className="gap-1.5"
                  >
                    {linkToProofMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                    Link
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Step 4: Barrier Alerts */}
        {step === "barriers" && (
          <div className="space-y-6">
            <StepHeader
              title="Barrier Alerts"
              description="Obstacles that could block or weaken your case"
              onBack={goBack}
            />

            {barrierQuery.isLoading ? (
              <LoadingState message="Scanning for barriers..." />
            ) : barrierQuery.data?.barriers && barrierQuery.data.barriers.length > 0 ? (
              <div className="space-y-3">
                {barrierQuery.data.barriers.map((b: any) => (
                  <Card key={b.id} className={`border-l-4 ${
                    b.severity === "critical" || b.severity === "high" ? "border-l-red-500 bg-red-500/5" :
                    b.severity === "medium" ? "border-l-amber-500 bg-amber-500/5" :
                    "border-l-blue-500 bg-blue-500/5"
                  }`}>
                    <CardContent className="py-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${
                          b.severity === "critical" || b.severity === "high" ? "text-red-500" :
                          b.severity === "medium" ? "text-amber-500" :
                          "text-blue-500"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm">{b.name || b.barrierType}</h4>
                          {b.description && <p className="text-xs text-muted-foreground mt-1">{b.description}</p>}
                          {b.whatItBlocks && (
                            <p className="text-xs text-red-400/80 mt-1">Blocks: {b.whatItBlocks}</p>
                          )}
                          {b.possibleWorkarounds && (
                            <div className="mt-2 p-2 rounded bg-muted/30">
                              <p className="text-xs">
                                <span className="font-medium text-emerald-400">Workaround: </span>
                                {typeof b.possibleWorkarounds === "string" ? b.possibleWorkarounds : JSON.stringify(b.possibleWorkarounds)}
                              </p>
                            </div>
                          )}
                        </div>
                        <Badge variant={b.severity === "critical" || b.severity === "high" ? "destructive" : "outline"} className="text-[10px] shrink-0">
                          {b.severity}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                <div className="flex justify-end">
                  <Button onClick={goNext} className="gap-2">
                    Find Where to File <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <Card className="border-emerald-500/30 bg-emerald-500/5">
                  <CardContent className="py-6 text-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                    <p className="text-sm font-medium">No major barriers detected</p>
                    <p className="text-xs text-muted-foreground mt-1">Your claim path appears clear. Proceed to filing.</p>
                  </CardContent>
                </Card>
                <div className="flex justify-end">
                  <Button onClick={goNext} className="gap-2">
                    Find Where to File <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 5: Agency & Forum */}
        {step === "agency" && (
          <div className="space-y-6">
            <StepHeader
              title="Where to File"
              description="Agencies and courts that handle your claim type"
              onBack={goBack}
            />

            {agencyQuery.isLoading ? (
              <LoadingState message="Finding agencies and forums..." />
            ) : (
              <div className="space-y-6">
                {/* Agencies */}
                {agencyQuery.data?.agencies && agencyQuery.data.agencies.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-primary" /> Administrative Agencies
                    </h3>
                    {agencyQuery.data.agencies.map((a: any) => (
                      <Card key={a.id} className="border-border/50 hover:border-primary/30 transition-all">
                        <CardContent className="py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-sm">{a.agency}</h4>
                              {a.agencyShort && <p className="text-xs text-primary/70">{a.agencyShort}</p>}
                              {a.statute && <p className="text-xs text-muted-foreground mt-0.5">Statute: {a.statute}</p>}
                              {a.complaintPathway && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.complaintPathway}</p>
                              )}
                              {a.responseTimelineDays && (
                                <p className="text-xs text-amber-400/80 mt-1">Response timeline: ~{a.responseTimelineDays} days</p>
                              )}
                            </div>
                            {a.domain && <Badge variant="outline" className="text-[10px] shrink-0">{a.domain}</Badge>}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Courts */}
                {agencyQuery.data?.courts && agencyQuery.data.courts.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Gavel className="w-4 h-4 text-primary" /> Courts
                    </h3>
                    {agencyQuery.data.courts.map((c: any) => (
                      <Card key={c.id} className="border-border/50">
                        <CardContent className="py-4">
                          <h4 className="font-semibold text-sm">{c.courtName}</h4>
                          <p className="text-xs text-muted-foreground">{c.courtType} — {c.jurisdiction}</p>
                          <div className="flex flex-wrap gap-3 mt-2">
                            {c.filingPortal && (
                              <a href={c.filingPortal} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                                Filing Portal <ArrowUpRight className="w-3 h-3" />
                              </a>
                            )}
                            {c.clerkPhone && <span className="text-xs text-muted-foreground">Clerk: {c.clerkPhone}</span>}
                            {c.filingFee && <span className="text-xs text-muted-foreground">Fee: {c.filingFee}</span>}
                          </div>
                          {c.address && <p className="text-xs text-muted-foreground mt-1">{c.address}</p>}
                          {c.proSeResources && (
                            <p className="text-xs text-emerald-400/80 mt-1">Pro se resources available</p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Workflows */}
                {agencyQuery.data?.workflows && agencyQuery.data.workflows.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <FileText className="w-4 h-4 text-primary" /> Filing Workflows
                    </h3>
                    {agencyQuery.data.workflows.map((w: any) => (
                      <Card key={w.id} className="border-border/50">
                        <CardContent className="py-4">
                          <h4 className="font-semibold text-sm">{w.title}</h4>
                          <p className="text-xs text-muted-foreground">{w.primaryAgency} — {w.jurisdiction}</p>
                          {w.estimatedDuration && <p className="text-xs text-muted-foreground mt-1">Duration: {w.estimatedDuration}</p>}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Deadlines */}
                {agencyQuery.data?.deadlines && agencyQuery.data.deadlines.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-500" /> Filing Deadlines
                    </h3>
                    {agencyQuery.data.deadlines.map((d: any) => (
                      <Card key={d.id} className="border-amber-500/20 bg-amber-500/5">
                        <CardContent className="py-3 flex items-center gap-3">
                          <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{d.deadlineType || d.claimType}</p>
                            <p className="text-xs text-muted-foreground">{d.triggerEvent} — {d.authority || d.jurisdiction}</p>
                          </div>
                          {d.timeLimitDays && (
                            <Badge className="bg-amber-500/20 text-amber-400 text-xs shrink-0">
                              {d.timeLimitDays} days
                            </Badge>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Escalation Routes */}
                {agencyQuery.data?.escalations && agencyQuery.data.escalations.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <ArrowUpRight className="w-4 h-4 text-primary" /> Escalation Routes
                    </h3>
                    {agencyQuery.data.escalations.map((e: any) => (
                      <Card key={e.id} className="border-border/50">
                        <CardContent className="py-4">
                          <h4 className="font-semibold text-sm">{e.title}</h4>
                          {e.triggerConditions && <p className="text-xs text-muted-foreground mt-1">{e.triggerConditions}</p>}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {(!agencyQuery.data?.agencies?.length && !agencyQuery.data?.courts?.length) && (
                  <EmptyState message="No specific agencies or courts found for this claim type and jurisdiction combination." />
                )}
                <div className="flex justify-end">
                  <Button onClick={goNext} className="gap-2">
                    Get My Next Action <Sparkles className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 6: Next Action */}
        {step === "action" && (
          <div className="space-y-6">
            <StepHeader
              title="Your Next Action"
              description="The recommended steps to move your case forward"
              onBack={goBack}
            />

            {actionQuery.isLoading ? (
              <LoadingState message="Generating your action plan..." />
            ) : actionQuery.data ? (
              <div className="space-y-6">
                {/* Urgent Deadline Alert */}
                {actionQuery.data.hasUrgentDeadline && actionQuery.data.nearestDeadlineDays && (
                  <Card className="border-red-500/30 bg-red-500/5">
                    <CardContent className="py-4 flex items-center gap-3">
                      <Clock className="w-5 h-5 text-red-500 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-red-400">Urgent Deadline</p>
                        <p className="text-xs text-muted-foreground">
                          You have approximately {actionQuery.data.nearestDeadlineDays} days to file. Act now.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Action Items */}
                {actionQuery.data.actions && actionQuery.data.actions.length > 0 && (
                  <div className="space-y-3">
                    {actionQuery.data.actions.map((action: any, i: number) => {
                      const urgencyColors: Record<string, string> = {
                        critical: "border-l-red-500 bg-red-500/5",
                        high: "border-l-amber-500 bg-amber-500/5",
                        medium: "border-l-blue-500 bg-blue-500/5",
                        low: "border-l-slate-500 bg-slate-500/5",
                      };
                      const typeIcons: Record<string, React.ElementType> = {
                        deadline: Clock,
                        filing: FileText,
                        evidence: Search,
                        consultation: Scale,
                        research: Lightbulb,
                      };
                      const TypeIcon = typeIcons[action.type] || Sparkles;

                      return (
                        <Card key={i} className={`border-l-4 ${urgencyColors[action.urgency] || urgencyColors.medium}`}>
                          <CardContent className="py-4">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                <TypeIcon className="w-4 h-4 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-semibold text-sm">{action.action}</h4>
                                  <Badge variant="outline" className="text-[10px]">{action.urgency}</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">{action.detail}</p>
                              </div>
                              <span className="text-xs text-muted-foreground/50 shrink-0">#{action.priority}</span>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}

                {/* Interpretation Panel */}
                <InterpretationPanel caseId={caseId} />

                {/* Pattern Bridge — handoff to Structural Diagnostics */}
                <Card className="border-purple-500/20 bg-purple-500/5">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-purple-500/10">
                          <Layers className="w-4 h-4 text-purple-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">See the broader institutional pattern</p>
                          <p className="text-xs text-muted-foreground">
                            Explore systemic barriers, doctrine clusters, and institutional signals related to{" "}
                            <span className="text-purple-400">{selectedClaimType}</span>
                            {jurisdiction && <> in <span className="text-purple-400">{jurisdiction}</span></>}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const params = new URLSearchParams();
                          params.set("claimType", selectedClaimType);
                          if (jurisdiction) params.set("jurisdiction", jurisdiction);
                          if (selectedDomain) params.set("domain", selectedDomain);
                          navigate(`/diagnostics?${params.toString()}`);
                        }}
                        className="gap-2 border-purple-500/30 text-purple-400 hover:bg-purple-500/10 shrink-0"
                      >
                        Structural Diagnostics <ArrowUpRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Start Over + Graph Toggle */}
                <div className="flex items-center justify-between">
                  <Button variant="outline" onClick={() => { setStep("problem"); setProblemText(""); setSelectedClaimType(""); setSelectedDomain(""); }} className="gap-2">
                    <ArrowLeft className="w-4 h-4" /> Start New Resolution
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setGraphExpanded(!graphExpanded)}
                    className="gap-2 text-muted-foreground"
                  >
                    <Network className="w-4 h-4" />
                    {graphExpanded ? "Hide" : "Explore"} Knowledge Graph
                    {graphExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </Button>
                </div>

                {/* Graph Expansion (Secondary) */}
                {graphExpanded && (
                  <Card className="border-border/30 bg-muted/10">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Network className="w-4 h-4 text-muted-foreground" />
                        Knowledge Graph — {selectedClaimType}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Connected nodes in the legal knowledge graph. This is a structural view — not your recommended path.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {graphQuery.isLoading ? (
                        <LoadingState message="Loading graph connections..." />
                      ) : graphQuery.data ? (
                        <div className="space-y-3">
                          <p className="text-xs text-muted-foreground">
                            {graphQuery.data.totalConnections} connections found
                          </p>
                          {graphQuery.data.outgoing.length > 0 && (
                            <div>
                              <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">OUTGOING EDGES</p>
                              <div className="space-y-1">
                                {graphQuery.data.outgoing.map((e: any, i: number) => (
                                  <div key={i} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/30">
                                    <Badge variant="outline" className="text-[9px]">{e.relationship}</Badge>
                                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                    <span className="text-foreground/70">{e.targetId}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {graphQuery.data.incoming.length > 0 && (
                            <div>
                              <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">INCOMING EDGES</p>
                              <div className="space-y-1">
                                {graphQuery.data.incoming.map((e: any, i: number) => (
                                  <div key={i} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/30">
                                    <span className="text-foreground/70">{e.sourceId}</span>
                                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                    <Badge variant="outline" className="text-[9px]">{e.relationship}</Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {graphQuery.data.totalConnections === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-4">No graph connections found for this node.</p>
                          )}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <EmptyState message="Could not generate an action plan. Try selecting a different claim type." />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shared Components ───

function StepHeader({ title, description, onBack }: { title: string; description: string; onBack: () => void }) {
  return (
    <div className="flex items-start gap-4">
      <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 mt-1">
        <ArrowLeft className="w-4 h-4" />
      </Button>
      <div>
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function ConfidenceBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    high: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    low: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    none: "bg-muted text-muted-foreground",
  };
  return <Badge variant="outline" className={`text-[10px] ${colors[level] || colors.none}`}>{level}</Badge>;
}

function LoadingState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card className="border-border/30">
      <CardContent className="py-8 text-center">
        <Eye className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}
