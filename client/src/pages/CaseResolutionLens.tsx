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
  "Federal", "WA", "CA", "NY", "TX", "FL", "IL", "AS", "GU", "MP", "PR", "VI",
  "Federal/State", "Tribal/Federal",
  "AK", "AL", "AR", "AZ", "CO", "CT", "DC", "DE",
  "GA", "HI", "IA", "ID", "IN", "KS", "KY", "LA",
  "MA", "MD", "ME", "MI", "MN", "MO", "MS", "MT",
  "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "OH",
  "OK", "OR", "PA", "RI", "SC", "SD", "TN", "UT",
  "VA", "VT", "WI", "WV", "WY",
];

export default function CaseResolutionLens() {
  const [, navigate] = useLocation();
  const { currentCase: current_case, currentCaseId: current_case_id, isLoading: case_context_loading } = useCase();
  const [step, setStep] = useState<PipelineStep>("problem");
  const [problem_text, set_problem_text] = useState("");
  const [jurisdiction, set_jurisdiction] = useState("");
  const [jurisdiction_source, set_jurisdiction_source] = useState<"manual" | "stored" | "link">("manual");
  const previous_jurisdiction_case_id = useRef<number | null | undefined>(undefined);
  const [showJurisdictionSuggestions, setShowJurisdictionSuggestions] = useState(false);
  const jurisdictionRef = useRef<HTMLDivElement>(null);
  const [selected_claim_type, set_selected_claim_type] = useState("");
  const [selected_domain, set_selected_domain] = useState("");
  const [graphExpanded, setGraphExpanded] = useState(false);
  const [deadline_forum, set_deadline_forum] = useState("");
  const [deadline_trigger_event, set_deadline_trigger_event] = useState("");
  const [deadline_event_date, set_deadline_event_date] = useState("");

  useEffect(() => {
    set_deadline_forum("");
    set_deadline_trigger_event("");
    set_deadline_event_date("");
  }, [current_case_id, selected_claim_type]);

  useEffect(() => {
    const claim_type = new URLSearchParams(window.location.search).get("claim_type");
    if (claim_type) { set_selected_claim_type(claim_type); setStep("proof"); }
  }, []);

  // ─── Evidence Layer State ───
  const [showAddEvidence, setShowAddEvidence] = useState(false);
  const [newEvidence, setNewEvidence] = useState({ title: "", evidenceType: "other", description: "", sourceName: "" });
  const [linkingEvidenceId, setLinkingEvidenceId] = useState<number | null>(null);
  const [linkingElement, setLinkingElement] = useState<{ frameworkId: number; elementNumber: number } | null>(null);

  // Jurisdiction from a link is user-supplied context, not case metadata.
  // CaseContext has no authoritative jurisdiction field. A remembered value must
  // never silently become a new case's jurisdiction.
  useEffect(() => {
    if (case_context_loading) return;
    const first_context = previous_jurisdiction_case_id.current === undefined;
    const case_changed = !first_context && previous_jurisdiction_case_id.current !== current_case_id;
    previous_jurisdiction_case_id.current = current_case_id;
    if (case_changed) {
      set_jurisdiction("");
      set_jurisdiction_source("manual");
      return;
    }
    if (!first_context) return;
    const requested_jurisdiction = new URLSearchParams(window.location.search).get("jurisdiction");
    if (requested_jurisdiction && KNOWN_JURISDICTIONS.includes(requested_jurisdiction)) {
      set_jurisdiction(requested_jurisdiction);
      set_jurisdiction_source("link");
      return;
    }
    const stored = current_case_id == null ? localStorage.getItem(JURISDICTION_STORAGE_KEY) : null;
    if (stored) {
      set_jurisdiction(stored);
      set_jurisdiction_source("stored");
    }
  }, [current_case_id, case_context_loading]);

  // Persist jurisdiction when user changes it
  function update_jurisdiction(value: string) {
    set_jurisdiction(value);
    set_jurisdiction_source("manual");
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
  const claims_query = trpc.dualLens.match_claims.useQuery(
    { problem_description: problem_text, jurisdiction: jurisdiction || undefined, category: selected_domain || undefined },
    { enabled: step !== "problem" && problem_text.length > 4 }
  );

  const proof_query = trpc.dualLens.get_proof_checklist.useQuery(
    { claim_type: selected_claim_type, domain: selected_domain || undefined },
    { enabled: step === "proof" && !!selected_claim_type }
  );

  useEffect(() => {
    const reference = proof_query.data?.source_reference;
    if (reference && (reference.claim_type_id === selected_claim_type || reference.source_claim_id === selected_claim_type)) {
      set_selected_domain(reference.domain);
    }
  }, [proof_query.data?.source_reference, selected_claim_type]);

  const barrier_query = trpc.dualLens.get_barrier_alerts.useQuery(
    { claim_type: selected_claim_type, jurisdiction: jurisdiction || undefined, domain: selected_domain || undefined },
    { enabled: step === "barriers" && !!selected_claim_type }
  );

  const agency_query = trpc.dualLens.find_agency_and_forum.useQuery(
    {
      claim_type: selected_claim_type, jurisdiction, domain: selected_domain || undefined,
      forum: deadline_forum || undefined, trigger_event: deadline_trigger_event || undefined,
      event_date: deadline_event_date || undefined,
    },
    { enabled: step === "agency" && !!selected_claim_type }
  );

  const action_query = trpc.dualLens.get_next_action.useQuery(
    {
      claim_type: selected_claim_type, jurisdiction, domain: selected_domain || undefined,
      forum: deadline_forum || undefined, trigger_event: deadline_trigger_event || undefined,
      event_date: deadline_event_date || undefined,
    },
    { enabled: step === "action" && !!selected_claim_type }
  );

  const graphQuery = trpc.dualLens.expandNode.useQuery(
    { nodeId: selected_claim_type, nodeType: "claim" },
    { enabled: graphExpanded && !!selected_claim_type }
  );

  // Evidence queries (enabled when on proof step with a case)
  const evidenceListQuery = trpc.evidenceLayer.list.useQuery(
    { caseId: current_case?.id ?? 0 },
    { enabled: !!current_case && (step === "proof" || step === "action") }
  );

  // Evidence coverage per framework
  const firstFrameworkId = proof_query.data?.frameworks?.[0]?.id;
  const coverageQuery = trpc.evidenceLayer.coverage.useQuery(
    { caseId: current_case?.id ?? 0, frameworkId: firstFrameworkId ?? 0 },
    { enabled: !!current_case && !!firstFrameworkId && step === "proof" }
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
    if (problem_text.trim().length > 4) {
      setStep("claims");
    }
  }
  function select_claim(claim_type: string, domain?: string) {
    set_selected_claim_type(claim_type);
    set_selected_domain(domain ?? "");
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
                  value={problem_text}
                  onChange={(e) => set_problem_text(e.target.value)}
                  className="min-h-[140px] text-base resize-none"
                  autoFocus
                />
                <div className="flex items-center gap-3">
                  <div className="flex-1 relative" ref={jurisdictionRef}>
                    <div className="relative">
                      <Input
                        placeholder="State or jurisdiction (e.g., WA, California, Federal)"
                        value={jurisdiction}
                        onChange={(e) => update_jurisdiction(e.target.value)}
                        onFocus={() => setShowJurisdictionSuggestions(true)}
                        className={`text-sm pr-20 ${
                          jurisdiction_source === "link" ? "border-cyan-500/30" :
                          jurisdiction_source === "stored" ? "border-emerald-500/30" : ""
                        }`}
                      />
                      {jurisdiction && jurisdiction_source !== "manual" && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                          <Badge variant="outline" className={`text-[9px] ${
                            jurisdiction_source === "link" ? "border-cyan-500/30 text-cyan-400" :
                            "border-emerald-500/30 text-emerald-400"
                          }`}>
                            {jurisdiction_source === "link" ? "from link; confirm" : "remembered; confirm"}
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
                              update_jurisdiction(j);
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
                    disabled={problem_text.trim().length < 5}
                    size="lg"
                    className="gap-2"
                  >
                    Find My Claims <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  We search the existing claim catalog and its individually reviewed source references. Matches are topics to explore; legal applicability still needs review.
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
                      set_problem_text(cat.query);
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
              description={`Based on: "${problem_text.slice(0, 80)}${problem_text.length > 80 ? "..." : ""}"`}
              onBack={goBack}
            />

            {claims_query.isLoading ? (
              <LoadingState message="Searching claim catalog..." />
            ) : claims_query.error ? (
              <p role="alert">The claim catalog could not be read. <Button onClick={() => void claims_query.refetch()}>Retry catalog</Button></p>
            ) : claims_query.data?.matches && claims_query.data.matches.length > 0 ? (
              <div className="grid gap-3">
                {claims_query.data.matches.map((match: any) => (
                  <Card
                    key={match.id}
                    className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-md border-border/50"
                    onClick={() => select_claim(match.claim_type, match.domain)}
                  >
                    <CardContent className="py-4 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-sm truncate">{match.canonical_name}</h3>
                          <Badge variant="outline">Applicability unresolved</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {match.source_claim_id ? `${match.source_claim_id} · Individually reviewed source reference` : "Existing catalog topic; source crosswalk pending"}
                        </p>
                        <div className="flex gap-2 mt-1.5 flex-wrap">
                          {match.jurisdiction && <Badge variant="outline" className="text-[10px]">{match.jurisdiction}</Badge>}
                          {match.domain && <Badge variant="outline" className="text-[10px]">{match.domain}</Badge>}
                          <span className="text-xs text-muted-foreground">Matched terms: {match.matched_keywords.join(", ")}</span>
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
              description={`Source and proof references for: ${selected_claim_type}`}
              onBack={goBack}
            />

            {/* Evidence Inventory */}
            {current_case && (
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

            {proof_query.data?.source_reference && (
              <Card><CardHeader><CardTitle>Source checklist — legal verification pending</CardTitle></CardHeader><CardContent className="space-y-3">
                <p className="text-sm">{proof_query.data.source_reference.source_claim_id}: {proof_query.data.source_reference.canonical_name}. These are statements in the supplied document; they have not been established as the requirements for your case.</p>
                <ol className="list-decimal pl-5 text-sm">{proof_query.data.source_reference.elements.map(element => <li key={element.paragraph_start}>{element.text} (P{element.paragraph_start})</li>)}</ol>
                <p className="text-sm">Source proof framework: {proof_query.data.source_reference.proof_reference.text}</p>
                <p className="text-sm">Source intersections: {proof_query.data.source_reference.intersections_reference.text}</p>
                <p className="text-xs text-muted-foreground">{proof_query.data.source_context?.source.filename} · P{proof_query.data.source_reference.source_span.paragraph_start}–{proof_query.data.source_reference.source_span.paragraph_end}. Existing claim ID {proof_query.data.source_reference.existing_claim_catalog_id}. Evidence links require a separately reviewed proof-framework binding.</p>
                <Button onClick={goNext}>Review related barriers <ArrowRight className="w-4 h-4 ml-2" /></Button>
              </CardContent></Card>
            )}

            {proof_query.isLoading ? (
              <LoadingState message="Loading proof frameworks..." />
            ) : proof_query.error ? (
              <p role="alert">Proof references could not be read. <Button onClick={() => void proof_query.refetch()}>Retry proof references</Button></p>
            ) : proof_query.data?.frameworks && proof_query.data.frameworks.length > 0 ? (
              <div className="space-y-4">
                {proof_query.data.frameworks.map((fw: any) => {
                  const coverageMap = coverageQuery.data?.coverageMap || {};
                  return (
                    <Card key={fw.id} className="border-border/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Scale className="w-4 h-4 text-primary" />
                          {fw.claim_type}
                        </CardTitle>
                        {fw.burden_of_proof && (
                          <CardDescription className="text-xs">
                            Burden: <span className="text-foreground/70">{fw.burden_of_proof}</span>
                          </CardDescription>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {/* Elements of Proof with Coverage Indicators */}
                        {fw.elements_of_proof && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground">ELEMENTS OF PROOF</p>
                            {(() => {
                              const elements = typeof fw.elements_of_proof === "string"
                                ? (() => { try { return JSON.parse(fw.elements_of_proof); } catch { return [fw.elements_of_proof]; } })()
                                : Array.isArray(fw.elements_of_proof) ? fw.elements_of_proof : [fw.elements_of_proof];
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
                                    {current_case && evidenceListQuery.data && evidenceListQuery.data.length > 0 && (
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
                        {current_case && coverageQuery.data && fw.elements_of_proof && (() => {
                          const elements = typeof fw.elements_of_proof === "string"
                            ? (() => { try { return JSON.parse(fw.elements_of_proof); } catch { return [fw.elements_of_proof]; } })()
                            : Array.isArray(fw.elements_of_proof) ? fw.elements_of_proof : [fw.elements_of_proof];
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
                        {fw.typical_evidence && (
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-1">TYPICAL EVIDENCE</p>
                            <p className="text-xs text-muted-foreground">
                              {typeof fw.typical_evidence === "string" ? fw.typical_evidence : JSON.stringify(fw.typical_evidence)}
                            </p>
                          </div>
                        )}

                        {/* Common Defenses */}
                        {fw.common_defenses && (
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-1">COMMON DEFENSES TO WATCH</p>
                            <p className="text-xs text-amber-400/80">
                              {typeof fw.common_defenses === "string" ? fw.common_defenses : JSON.stringify(fw.common_defenses)}
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
            ) : proof_query.data?.source_reference ? null : (
              <div className="space-y-4">
                <EmptyState message="No exact proof-framework connection has been reviewed for this claim. Related claims in the same domain cannot establish its proof requirements." />
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
                      if (!current_case || !newEvidence.title.trim()) return;
                      addEvidenceMutation.mutate({
                        caseId: current_case.id,
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
              description="Related source topics and questions to check before deciding whether a barrier applies"
              onBack={goBack}
            />

            {!!barrier_query.data?.excluded_unverified_references && (
              <p className="mb-3 text-sm text-muted-foreground">{barrier_query.data.excluded_unverified_references} operational or legacy-derived references are not eligible for case alerts. Their records remain available in Structural Diagnostics.</p>
            )}
            {barrier_query.isLoading ? (
              <LoadingState message="Scanning for barriers..." />
            ) : barrier_query.error ? (
              <p role="alert" className="text-sm">Barrier references could not be read. Retry before drawing a conclusion. <Button variant="link" onClick={() => void barrier_query.refetch()}>Retry barrier references</Button></p>
            ) : barrier_query.data?.barriers && barrier_query.data.barriers.length > 0 ? (
              <div className="space-y-3">
                {barrier_query.data.barriers.map((b: any) => (
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
                          <h4 className="font-semibold text-sm">{b.name || b.barrier_type}</h4>
                          <p className="text-xs font-medium mt-1">Legal verification pending · Case applicability not assessed</p>
                          {b.description && <p className="text-xs text-muted-foreground mt-1">Source description: {b.description}</p>}
                          <ul className="list-disc pl-5 text-sm mt-2">{b.applicability_questions?.map((question: string) => <li key={question}>{question}</li>)}</ul>
                          {b.impact_reference?.text && (
                            <p className="text-xs text-red-400/80 mt-1">Source impact statement (unverified): {b.impact_reference?.text}</p>
                          )}
                          {b.mitigation_reference?.text && (
                            <div className="mt-2 p-2 rounded bg-muted/30">
                              <p className="text-xs">
                                <span className="font-medium text-emerald-400">Source mitigation statement (unverified): </span>
                                {typeof b.mitigation_reference?.text === "string" ? b.mitigation_reference?.text : JSON.stringify(b.mitigation_reference?.text)}
                              </p>
                            </div>
                          )}
                        </div>
                        <Badge variant={b.severity === "critical" || b.severity === "high" ? "destructive" : "outline"} className="text-[10px] shrink-0">
                          Source severity: {b.severity}
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
                <Card className="border-border/50 bg-card/50">
                  <CardContent className="py-6 text-center">
                    <Search className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm font-medium">No eligible barrier references matched</p>
                    <p className="text-xs text-muted-foreground mt-1">This catalog search does not establish that a case has no barriers. Check the governing requirements for your situation.</p>
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
              description="Review agency and court references for applicability to your claim"
              onBack={goBack}
            />

            {agency_query.isLoading ? (
              <LoadingState message="Finding agencies and forums..." />
            ) : agency_query.isError ? (
              <EmptyState message="Agency and deadline references could not be loaded. No conclusion can be drawn from this failed lookup." />
            ) : (
              <div className="space-y-6">
                <p className="text-xs text-muted-foreground">These are catalog references. Agency jurisdiction, eligibility and filing requirements still need confirmation.</p>
                {/* Agencies */}
                {agency_query.data?.agencies && agency_query.data.agencies.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-primary" /> Administrative Agencies
                    </h3>
                    {agency_query.data.agencies.map((a: any) => (
                      <Card key={a.id} className="border-border/50 hover:border-primary/30 transition-all">
                        <CardContent className="py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-sm">{a.agency}</h4>
                              {a.agency_short && <p className="text-xs text-primary/70">{a.agency_short}</p>}
                              {a.statute && <p className="text-xs text-muted-foreground mt-0.5">Statute: {a.statute}</p>}
                              {a.complaint_pathway && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.complaint_pathway}</p>
                              )}
                              {a.response_timeline_days && (
                                <p className="text-xs text-amber-400/80 mt-1">Source agency response interval: ~{a.response_timeline_days} days</p>
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
                {agency_query.data?.courts && agency_query.data.courts.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Gavel className="w-4 h-4 text-primary" /> Courts
                    </h3>
                    {agency_query.data.courts.map((c: any) => (
                      <Card key={c.id} className="border-border/50">
                        <CardContent className="py-4">
                          <h4 className="font-semibold text-sm">{c.court_name}</h4>
                          <p className="text-xs text-muted-foreground">{c.court_type} — {c.jurisdiction}</p>
                          <div className="flex flex-wrap gap-3 mt-2">
                            {c.filing_portal && (
                              <a href={c.filing_portal} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                                Filing Portal <ArrowUpRight className="w-3 h-3" />
                              </a>
                            )}
                            {c.clerk_phone && <span className="text-xs text-muted-foreground">Clerk: {c.clerk_phone}</span>}
                            {c.filing_fee && <span className="text-xs text-muted-foreground">Fee: {c.filing_fee}</span>}
                          </div>
                          {c.address && <p className="text-xs text-muted-foreground mt-1">{c.address}</p>}
                          {c.pro_se_resources && (
                            <p className="text-xs text-emerald-400/80 mt-1">Pro se resources available</p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Workflows */}
                {agency_query.data?.workflows && agency_query.data.workflows.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <FileText className="w-4 h-4 text-primary" /> Filing Workflows
                    </h3>
                    {agency_query.data.workflows.map((w: any) => (
                      <Card key={w.id} className="border-border/50">
                        <CardContent className="py-4">
                          <h4 className="font-semibold text-sm">{w.title}</h4>
                          <p className="text-xs text-muted-foreground">{w.primary_agency} — {w.jurisdiction}</p>
                          {w.estimated_duration && <p className="text-xs text-muted-foreground mt-1">Duration: {w.estimated_duration}</p>}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Source intervals remain references until applicability is established. */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-500" /> Deadline references to review
                  </h3>
                  <p className="text-xs text-muted-foreground">{agency_query.data?.deadline_assessment.message}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="deadline-jurisdiction">Jurisdiction to check</Label>
                      <Input id="deadline-jurisdiction" value={jurisdiction} onChange={event => update_jurisdiction(event.target.value)} placeholder="For example, CO or Colorado" />
                      <p className="text-xs text-muted-foreground">Confirm the jurisdiction for this situation; it is not established by the selected case.</p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="deadline-forum">Agency or court, if known</Label>
                      <Input id="deadline-forum" value={deadline_forum} onChange={event => set_deadline_forum(event.target.value)} placeholder="Name of agency or court" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="deadline-trigger">Event starting the time limit</Label>
                      <Input id="deadline-trigger" value={deadline_trigger_event} onChange={event => set_deadline_trigger_event(event.target.value)} placeholder="For example, receipt of a decision" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="deadline-event-date">Date of that event, if known</Label>
                      <Input id="deadline-event-date" type="date" value={deadline_event_date} onChange={event => set_deadline_event_date(event.target.value)} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">These details are context for review. Entering them does not establish a filing date.</p>
                  {agency_query.data?.deadlines.map(reference => (
                    <Card key={reference.id} className="border-amber-500/20 bg-amber-500/5">
                      <CardContent className="py-3 space-y-1">
                        <p className="text-sm font-medium">{reference.deadline_type} — {reference.jurisdiction}</p>
                        <p className="text-xs text-muted-foreground">Source trigger: {reference.trigger_event || "Not recorded"}</p>
                        <p className="text-xs text-muted-foreground">Authority reference: {reference.authority || "Not recorded"}</p>
                        <p className="text-xs text-muted-foreground">
                          Source interval: {reference.source_duration_days == null ? "Not recorded" : `${reference.source_duration_days} days`}. Days remaining have not been calculated.
                        </p>
                        {reference.extended_condition && <p className="text-xs text-muted-foreground">Possible extension condition in source: {reference.extended_condition}. Applicability is unverified.</p>}
                      </CardContent>
                    </Card>
                  ))}
                  <Button variant="outline" onClick={() => navigate("/deadline-calculator")}>Review agency filing instructions</Button>
                </div>

                {/* Escalation Routes */}
                {agency_query.data?.escalations && agency_query.data.escalations.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <ArrowUpRight className="w-4 h-4 text-primary" /> Escalation Routes
                    </h3>
                    {agency_query.data.escalations.map((e: any) => (
                      <Card key={e.id} className="border-border/50">
                        <CardContent className="py-4">
                          <h4 className="font-semibold text-sm">{e.title}</h4>
                          {e.trigger_conditions && <p className="text-xs text-muted-foreground mt-1">{e.trigger_conditions}</p>}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {(!agency_query.data?.agencies?.length && !agency_query.data?.courts?.length) && (
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

            {action_query.isLoading ? (
              <LoadingState message="Generating your action plan..." />
            ) : action_query.isError ? (
              <EmptyState message="Action references could not be loaded. Deadline applicability is unknown; retry the lookup." />
            ) : action_query.data ? (
              <div className="space-y-6">
                <Card className="border-amber-500/30 bg-amber-500/5">
                  <CardContent className="py-4 space-y-2">
                    <p className="text-sm font-semibold">Filing deadline not established</p>
                    <p className="text-xs text-muted-foreground">{action_query.data.deadline_assessment.message}</p>
                    <Button variant="outline" onClick={() => setStep("agency")}>Review forum and triggering event</Button>
                  </CardContent>
                </Card>

                {/* Action Items */}
                {action_query.data.actions && action_query.data.actions.length > 0 && (
                  <div className="space-y-3">
                    {action_query.data.actions.map((action: any, i: number) => {
                      const urgency_colors: Record<string, string> = {
                        critical: "border-l-red-500 bg-red-500/5",
                        high: "border-l-amber-500 bg-amber-500/5",
                        medium: "border-l-blue-500 bg-blue-500/5",
                        low: "border-l-slate-500 bg-slate-500/5",
                        unknown: "border-l-slate-500 bg-slate-500/5",
                      };
                      const type_icons: Record<string, React.ElementType> = {
                        deadline: Clock,
                        filing: FileText,
                        evidence: Search,
                        consultation: Scale,
                        research: Lightbulb,
                      };
                      const TypeIcon = type_icons[action.type] || Sparkles;

                      return (
                        <Card key={i} className={`border-l-4 ${urgency_colors[action.urgency] || urgency_colors.medium}`}>
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
                                {action.href && <Button variant="link" className="px-0" onClick={() => navigate(action.href)}>Open referenced guidance</Button>}
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
                            <span className="text-purple-400">{selected_claim_type}</span>
                            {jurisdiction && <> in <span className="text-purple-400">{jurisdiction}</span></>}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const params = new URLSearchParams();
                          params.set("claimType", selected_claim_type);
                          if (jurisdiction) params.set("jurisdiction", jurisdiction);
                          if (selected_domain) params.set("domain", selected_domain);
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
                  <Button variant="outline" onClick={() => { setStep("problem"); set_problem_text(""); set_selected_claim_type(""); set_selected_domain(""); }} className="gap-2">
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
                        Knowledge Graph — {selected_claim_type}
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
