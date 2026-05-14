import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentChecklist } from "@/components/DocumentChecklist";
import { ResourceDirectory } from "@/components/ResourceDirectory";
import { LegalResources } from "@/components/LegalResources";
import { ShareWithAdvocate } from "@/components/ShareWithAdvocate";
import {
  Scale, Upload, FileText, CheckCircle2, ArrowRight,
  Lightbulb, AlertTriangle, Clock, Shield, Headphones,
  Volume2, VolumeX, ChevronRight, Sparkles, Eye,
  MessageCircle, Download, ArrowLeft, Loader2, HeartHandshake,
  ClipboardList, Send,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { MissingRecordsSection } from "@/components/MissingRecords";
import { EnforcementSuggestions } from "@/components/EnforcementSuggestions";
import { EnforcementNextSteps, CaseEnforcementNextSteps } from "@/components/EnforcementNextSteps";
import { SupportRecommendations } from "@/components/SupportRecommendations";
import { toast } from "sonner";

/** Step indicator component */
function StepIndicator({ steps, currentStep }: { steps: string[]; currentStep: number }) {
  return (
    <div className="flex items-center gap-1 w-full">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center gap-1 flex-1">
          <div className="flex flex-col items-center flex-1">
            <div
              className={`w-full h-1.5 rounded-full transition-colors ${
                i < currentStep ? "bg-primary" :
                i === currentStep ? "bg-primary/50" : "bg-muted"
              }`}
            />
            <span className={`text-[9px] mt-1 ${
              i <= currentStep ? "text-foreground" : "text-muted-foreground"
            }`}>
              {label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Guided upload section — prompts for specific documents */
function GuidedUploadSection({ caseId, onUploadComplete }: { caseId: number; onUploadComplete: () => void }) {
  const [, setLocation] = useLocation();
  const { data: docs, isLoading } = trpc.documents.list.useQuery({ caseId });

  const docCount = docs?.length || 0;

  return (
    <Card className="border-primary/20">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Upload className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {docCount === 0 ? "Let's gather your documents" : `${docCount} document${docCount !== 1 ? "s" : ""} uploaded`}
            </h3>
            <p className="text-xs text-muted-foreground">
              {docCount === 0
                ? "Start with whatever you have — even one document helps"
                : "You can always add more later"}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Upload any documents related to your situation. The engine will read through them, 
            find important details, and identify any contradictions or patterns.
          </p>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70">
            <Shield className="h-3 w-3" />
            Your documents are private and encrypted
          </div>
        </div>

        <Button
          onClick={() => setLocation("/upload")}
          className="w-full gap-2"
          size="lg"
        >
          <Upload className="h-4 w-4" />
          {docCount === 0 ? "Upload Your First Document" : "Upload More Documents"}
        </Button>

        {docCount > 0 && (
          <Button
            variant="outline"
            onClick={onUploadComplete}
            className="w-full gap-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
            size="lg"
          >
            <CheckCircle2 className="h-4 w-4" />
            Done Uploading for Now
          </Button>
        )}

        {docCount > 0 && (
          <p className="text-[10px] text-center text-muted-foreground/60">
            You can always come back and upload more documents later
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Narrative findings section — translates findings into plain language */
function NarrativeFindings({ caseId }: { caseId: number }) {
  const [, setLocation] = useLocation();
  const { data: findings, isLoading } = trpc.findings.listEnriched.useQuery({ caseId });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const toggleSpeech = (text: string) => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    } else {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.onend = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
      setIsSpeaking(true);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-5">
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!findings || findings.length === 0) {
    return (
      <Card className="border-dashed border-border">
        <CardContent className="p-5 text-center space-y-2">
          <Lightbulb className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">
            No findings yet. Once you upload and analyze documents, 
            the engine will identify important patterns and contradictions.
          </p>
        </CardContent>
      </Card>
    );
  }

  const importantFindings = findings.filter(f => f.evidentiaryWeight === "finding");
  const noteSignals = findings.filter(f => f.evidentiaryWeight === "note_signal");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            What We Found
          </h3>
          <Badge variant="outline" className="text-[10px]">
            {findings.length} finding{findings.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground gap-1"
          onClick={() => setLocation("/findings")}
        >
          Full details <ChevronRight className="h-3 w-3" />
        </Button>
      </div>

      {importantFindings.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Important Findings
          </p>
          {importantFindings.slice(0, 5).map((finding) => (
            <Card
              key={finding.id}
              className="border-amber-500/20 bg-amber-500/5 cursor-pointer hover:border-amber-500/40 transition-colors"
              onClick={() => setExpandedId(expandedId === finding.id ? null : finding.id)}
            >
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1 min-w-0">
                    <h4 className="text-sm font-medium text-foreground leading-snug">
                      {finding.title}
                    </h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {finding.description}
                    </p>
                  </div>
                </div>

                {expandedId === finding.id && (
                  <div className="mt-3 pt-3 border-t border-amber-500/10 space-y-3">
                    {finding.significance && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Why This Matters</p>
                        <p className="text-xs text-foreground/80 leading-relaxed">
                          <Streamdown>{finding.significance}</Streamdown>
                        </p>
                      </div>
                    )}
                    {finding.backingEvidence && finding.backingEvidence.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Evidence</p>
                        {finding.backingEvidence.slice(0, 3).map((ev: any, i: number) => (
                          <div key={i} className="text-xs text-muted-foreground bg-background/50 rounded p-2 mt-1">
                            {ev.quote && (
                              <p className="italic border-l-2 border-primary/30 pl-2">"{ev.quote}"</p>
                            )}
                            {ev.documentFilename && (
                              <p className="text-[10px] mt-1 text-muted-foreground/70">
                                — {ev.documentFilename}{ev.page ? `, p.${ev.page}` : ""}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleSpeech(`${finding.title}. ${finding.description}. ${finding.significance || ""}`); }}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {isSpeaking ? <><VolumeX className="h-3 w-3" /> Stop</> : <><Volume2 className="h-3 w-3" /> Read aloud</>}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setLocation(`/findings`); }}
                        className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
                      >
                        <Eye className="h-3 w-3" /> View full details
                      </button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {noteSignals.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Worth Noting ({noteSignals.length})
          </p>
          <div className="space-y-1">
            {noteSignals.slice(0, 3).map((note) => (
              <div
                key={note.id}
                className="flex items-start gap-2 p-2.5 rounded-md bg-card border border-border hover:border-border/80 cursor-pointer transition-colors"
                onClick={() => setLocation("/findings")}
              >
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-foreground">{note.title}</p>
                  <p className="text-[10px] text-muted-foreground line-clamp-2">{note.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Action path section — what to do next based on findings */
function ActionPath({ caseId }: { caseId: number }) {
  const [, setLocation] = useLocation();
  const { data: findings } = trpc.findings.listEnriched.useQuery({ caseId });
  const { data: docs } = trpc.documents.list.useQuery({ caseId });
  const { data: lifecycle } = trpc.snapshots.lifecycle.useQuery({ caseId });

  const docCount = docs?.length || 0;
  const findingCount = findings?.length || 0;
  const hasSnapshot = lifecycle?.hasSnapshot;
  const isSealed = lifecycle?.status === "sealed";

  // Determine current step
  let currentStep = 0;
  if (docCount > 0) currentStep = 1;
  if (hasSnapshot && lifecycle?.stages?.extraction?.status === "complete") currentStep = 2;
  if (findingCount > 0) currentStep = 3;
  if (isSealed) currentStep = 4;

  const steps = ["Upload", "Analyze", "Review", "Export"];

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Your Progress</h3>
        </div>

        <StepIndicator steps={steps} currentStep={currentStep} />

        <div className="space-y-2 pt-2">
          {currentStep === 0 && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <Upload className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-xs font-medium text-foreground">Upload your documents</p>
                <p className="text-[10px] text-muted-foreground">Start with whatever you have. Even one document helps.</p>
              </div>
              <Button size="sm" className="shrink-0 ml-auto" onClick={() => setLocation("/upload")}>
                Upload
              </Button>
            </div>
          )}
          {currentStep === 1 && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <Sparkles className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-xs font-medium text-foreground">Ready to analyze</p>
                <p className="text-[10px] text-muted-foreground">
                  {docCount} document{docCount !== 1 ? "s" : ""} uploaded. Go to Documents to start analysis.
                </p>
              </div>
              <Button size="sm" className="shrink-0 ml-auto" onClick={() => setLocation("/documents")}>
                Analyze
              </Button>
            </div>
          )}
          {currentStep === 2 && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <Lightbulb className="h-5 w-5 text-amber-400 shrink-0" />
              <div>
                <p className="text-xs font-medium text-foreground">Analysis in progress</p>
                <p className="text-[10px] text-muted-foreground">
                  The engine is reading through your documents. Findings will appear soon.
                </p>
              </div>
              <Loader2 className="h-4 w-4 animate-spin text-amber-400 shrink-0 ml-auto" />
            </div>
          )}
          {currentStep >= 3 && (
            <>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-foreground">
                    {findingCount} finding{findingCount !== 1 ? "s" : ""} identified
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {isSealed
                      ? "Your analysis is sealed and ready to export."
                      : "Review findings below. When ready, you can seal and export a report."}
                  </p>
                </div>
                {isSealed && (
                  <Button size="sm" className="shrink-0 ml-auto gap-1" onClick={() => setLocation("/exports")}>
                    <Download className="h-3.5 w-3.5" /> Export
                  </Button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            onClick={() => setLocation("/chat")}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Ask the Evidence
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            onClick={() => setLocation("/timeline")}
          >
            <Clock className="h-3.5 w-3.5" />
            View Timeline
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            onClick={() => setLocation("/network")}
          >
            <Eye className="h-3.5 w-3.5" />
            Network Graph
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5 text-amber-400 border-amber-400/30 hover:bg-amber-500/10"
            onClick={() => setLocation("/lumensend")}
          >
            <Send className="h-3.5 w-3.5" />
            LumenSend
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs gap-1.5 text-muted-foreground"
            onClick={() => setLocation("/")}
          >
            <Eye className="h-3.5 w-3.5" />
            Full Workspace
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function GuidedDashboard() {
  const [matched, params] = useRoute("/guide/:caseId");
  const [, setLocation] = useLocation();
  const { setCurrentCaseId, currentCaseId } = useCase();
  const caseId = params?.caseId ? parseInt(params.caseId, 10) : null;
  const [uploadDone, setUploadDone] = useState(false);

  // Set the case context when arriving at this page
  useEffect(() => {
    if (caseId && caseId !== currentCaseId) {
      setCurrentCaseId(caseId);
    }
  }, [caseId, currentCaseId, setCurrentCaseId]);

  const { data: caseData, isLoading } = trpc.cases.get.useQuery(
    { id: caseId! },
    { enabled: !!caseId }
  );

  if (!caseId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">No case selected.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/50 px-4 sm:px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => setLocation("/welcome")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Luminari</span>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-xs gap-1.5"
          onClick={() => setLocation("/")}
        >
          <Eye className="h-3.5 w-3.5" />
          Full Workspace
        </Button>
      </header>

      {/* Main content */}
      <main className="flex-1 px-4 sm:px-6 py-6 max-w-2xl mx-auto w-full space-y-6">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <>
            {/* Case header */}
            <div className="space-y-2">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
                {caseData?.name || "Your Case"}
              </h1>
              {caseData?.description && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {caseData.description}
                </p>
              )}
              {caseData?.domain && (
                <Badge variant="outline" className="text-[10px]">
                  {caseData.domain}
                </Badge>
              )}
            </div>

            {/* ─── YOUR NEXT STEPS: Enforcement Action Paths ─── */}
            {/* This appears IMMEDIATELY — no documents needed. Bridges claim → action. */}
            {(caseData as any)?.pipelineType && (
              <EnforcementNextSteps pipelineType={(caseData as any).pipelineType} />
            )}

            {/* ─── SUPPORT RESOURCES: Unified matching from all data sources ─── */}
            {/* No soul left behind — matched to pipeline type + jurisdiction + urgency */}
            {(caseData as any)?.pipelineType && (
              <SupportRecommendations
                pipelineType={(caseData as any).pipelineType}
                jurisdiction={(caseData as any)?.jurisdiction || undefined}
                urgency="urgent"
              />
            )}

            {/* Share, Checklist & Resources */}
            <div className="space-y-4">
              <ShareWithAdvocate caseId={caseId} />
              <DocumentChecklist caseId={caseId} pipelineType={(caseData as any)?.pipelineType} />
              <ResourceDirectory pipelineType={(caseData as any)?.pipelineType} />
              <LegalResources pipelineType={(caseData as any)?.pipelineType} />
              {/* Benefits Navigator link */}
              <Card className="border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/8 transition-colors cursor-pointer" onClick={() => {
                const pipeline = (caseData as any)?.pipelineType || "";
                setLocation(`/benefits?pipeline=${encodeURIComponent(pipeline)}`);
              }}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                      <HeartHandshake className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">Benefits Navigator</p>
                      <p className="text-[10px] text-muted-foreground">Find government programs you may qualify for</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-emerald-500/50 shrink-0" />
                  </div>
                </CardContent>
              </Card>
              {/* My Applications link */}
              <Card className="border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/8 transition-colors cursor-pointer" onClick={() => {
                setLocation(`/my-applications`);
              }}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-purple-500/15 flex items-center justify-center shrink-0">
                      <ClipboardList className="h-4 w-4 text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">My Applications</p>
                      <p className="text-[10px] text-muted-foreground">Track your benefit applications, documents, and deadlines</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-purple-500/50 shrink-0" />
                  </div>
                </CardContent>
              </Card>

              {/* Did You Know? discovery link */}
              <Card className="border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/8 transition-colors cursor-pointer" onClick={() => {
                setLocation(`/discover`);
              }}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
                      <Lightbulb className="h-4 w-4 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">Did You Know?</p>
                      <p className="text-[10px] text-muted-foreground">Discover programs and resources you might not know about</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-amber-500/50 shrink-0" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Progress and action path */}
            <ActionPath caseId={caseId} />

            {/* Guided upload */}
            {!uploadDone ? (
              <GuidedUploadSection
                caseId={caseId}
                onUploadComplete={() => {
                  setUploadDone(true);
                  toast.success("Great work! Your documents are ready for analysis.", {
                    description: "You can always upload more later from the Documents page.",
                    duration: 5000,
                  });
                }}
              />
            ) : (
              <Card className="border-emerald-500/20 bg-emerald-500/5">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-foreground">Documents uploaded</h3>
                      <p className="text-xs text-muted-foreground">Ready for the next step. Found more documents later? No problem.</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button
                      size="sm"
                      className="gap-1.5 flex-1"
                      onClick={() => setLocation("/documents")}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Start Analysis
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setUploadDone(false)}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Upload More
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Narrative findings */}
            <NarrativeFindings caseId={caseId} />

            {/* Missing records gap analysis */}
            <MissingRecordsSection caseId={caseId} />

            {/* Enforcement Intelligence Cross-Link */}
            <div className="mt-4">
              <EnforcementSuggestions caseId={caseId} />
            </div>

            {/* Reassurance footer */}
            <div className="text-center pt-4 pb-8 space-y-2">
              <p className="text-xs text-muted-foreground">
                Need help? Use "Ask the Evidence" to talk to the engine about your documents.
              </p>
              <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground/60">
                <span className="flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  Private
                </span>
                <span className="flex items-center gap-1">
                  <Headphones className="h-3 w-3" />
                  Read-aloud available
                </span>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
