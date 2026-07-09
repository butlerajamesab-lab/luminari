import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, ArrowRight, Send, Loader2, Sparkles,
  CheckCircle2, ChevronRight, Target, Shield,
  Heart, Volume2, VolumeX, AlertCircle, Lightbulb,
  RefreshCw, MessageCircle, Zap, MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ─── Types ─── */

interface PipelineSuggestion {
  pipeline_id: string;
  category: string;
  label: string;
  confidence: number;
  confidence_label: "high" | "medium" | "low";
  match_reasons: string[];
  matched_signals: string[];
}

interface CategoryAffinity {
  category: string;
  score: number;
}

interface IntakeQuestion {
  id: string;
  text: string;
  follow_up_for?: string[];
  always?: boolean;
  order: number;
}

interface AutoDetectResult {
  suggestions: PipelineSuggestion[];
  category_affinity: CategoryAffinity[];
  suggested_pre_lenses: string[];
  next_questions: IntakeQuestion[];
  ready_to_recommend: boolean;
}

/* ─── Category display config ─── */

const CATEGORY_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  justice: { label: "Justice & Accountability", color: "text-red-400", icon: "⚖️" },
  family: { label: "Family & Custody", color: "text-pink-400", icon: "👨‍👩‍👧" },
  housing: { label: "Housing & Tenant Rights", color: "text-blue-400", icon: "🏠" },
  employment: { label: "Employment & Workplace", color: "text-amber-400", icon: "💼" },
  benefits: { label: "Government Benefits", color: "text-green-400", icon: "📋" },
  elder: { label: "Elder Care & Protection", color: "text-purple-400", icon: "🤝" },
  tribal: { label: "Tribal Law & Indigenous Rights", color: "text-emerald-400", icon: "🪶" },
  medical: { label: "Medical & Healthcare", color: "text-cyan-400", icon: "🏥" },
  financial: { label: "Financial & Consumer", color: "text-yellow-400", icon: "💰" },
  immigration: { label: "Immigration & Asylum", color: "text-indigo-400", icon: "🌍" },
  education: { label: "Education & Youth", color: "text-orange-400", icon: "📚" },
  community: { label: "Community & Institutional", color: "text-teal-400", icon: "🏛️" },
  lgbtq_rights: { label: "LGBTQ+ Rights", color: "text-violet-400", icon: "🏳️‍🌈" },
  mental_health: { label: "Mental Health System", color: "text-sky-400", icon: "🧠" },
  public_safety: { label: "Public Safety", color: "text-rose-400", icon: "🚨" },
  general: { label: "General Investigation", color: "text-slate-400", icon: "🔍" },
};

/* ─── Confidence display ─── */

function ConfidenceBar({ confidence, label }: { confidence: number; label: string }) {
  const color =
    label === "high" ? "bg-emerald-500" :
    label === "medium" ? "bg-amber-500" : "bg-slate-500";
  const textColor =
    label === "high" ? "text-emerald-400" :
    label === "medium" ? "text-amber-400" : "text-slate-400";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700 ease-out", color)}
          style={{ width: `${Math.round(confidence * 100)}%` }}
        />
      </div>
      <span className={cn("text-[10px] font-medium uppercase tracking-wider", textColor)}>
        {label}
      </span>
    </div>
  );
}

/* ─── Pipeline Suggestion Card ─── */

function SuggestionCard({
  suggestion,
  isSelected,
  onSelect,
}: {
  suggestion: PipelineSuggestion;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const catInfo = CATEGORY_LABELS[suggestion.category] || CATEGORY_LABELS.general;

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-lg border p-4 transition-all duration-200",
        isSelected
          ? "border-primary bg-primary/10 ring-1 ring-primary/30"
          : "border-border/50 bg-card/50 hover:bg-card hover:border-border"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm">{catInfo.icon}</span>
            <h4 className="text-sm font-medium text-foreground truncate">
              {suggestion.label}
            </h4>
            {isSelected && (
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
            )}
          </div>
          <p className={cn("text-[11px] mb-2", catInfo.color)}>
            {catInfo.label}
          </p>
          <ConfidenceBar confidence={suggestion.confidence} label={suggestion.confidence_label} />
          {suggestion.match_reasons.length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
              {suggestion.match_reasons[0]}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

/* ─── Main Component ─── */

export default function GuidedIntake() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  // ─── Map session context (from Civic Map intake) ─────────────────
  const [mapSessionId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("mapSession") || null;
  });
  const [mapState] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("state") || null;
  });
  const mapSessionIdNum = mapSessionId ? parseInt(mapSessionId, 10) : null;
  const mapSession = trpc.lighthouse.mapIntake.getSession.useQuery(
    { sessionId: mapSessionIdNum! },
    { enabled: !!mapSessionIdNum && !isNaN(mapSessionIdNum), refetchOnWindowFocus: false, staleTime: Infinity }
  );

  // Questionnaire state
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentInput, setCurrentInput] = useState("");
  const [isDetecting, setIsDetecting] = useState(false);
  const [isSmartDetecting, setIsSmartDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState<AutoDetectResult | null>(null);
  const [selectedPipeline, setSelectedPipeline] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [phase, setPhase] = useState<"questions" | "suggestions" | "confirm">("questions");
  const [useSmartDetect, setUseSmartDetect] = useState(false);
  const [mapContextApplied, setMapContextApplied] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // tRPC mutations
  const autoDetect = trpc.intake.autoDetect.useMutation();
  const smartDetect = trpc.intake.smartDetect.useMutation();
  const createCase = trpc.cases.create.useMutation();
  const logEvent = trpc.analytics.logEvent.useMutation();
  const submitSpineData = trpc.guidedIntake.submitSpineData.useMutation();

  // Pre-populate from map session context
  useEffect(() => {
    if (mapSession.data && !mapContextApplied) {
      setMapContextApplied(true);
      const sess = mapSession.data;
      // Pre-fill the "where" answer with the detected state
      if (sess.detectedState) {
        const stateNames: Record<string, string> = {
          AZ: "Arizona", CA: "California", FL: "Florida", IL: "Illinois",
          MO: "Missouri", NY: "New York", OR: "Oregon", PA: "Pennsylvania",
          TX: "Texas", WA: "Washington",
        };
        setAnswers(prev => ({
          ...prev,
          where: stateNames[sess.detectedState!] || sess.detectedState!,
        }));
      }
      // If map session has pipeline suggestions, convert to detect result format
      const pipelines = (sess.suggestedPipelines as any[]) || [];
      if (pipelines.length > 0) {
        const mapSuggestions: PipelineSuggestion[] = pipelines.map((p: any) => ({
          pipeline_id: p.pipeline_id,
          category: p.category || "general",
          label: p.pipeline_id.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
          confidence: p.confidence,
          confidence_label: p.confidence_label || (p.confidence >= 0.6 ? "high" : p.confidence >= 0.3 ? "medium" : "low"),
          match_reasons: p.match_reasons || [],
          matched_signals: p.matched_signals || [],
        }));
        setDetectResult({
          suggestions: mapSuggestions,
          category_affinity: [],
          suggested_pre_lenses: [],
          next_questions: [],
          ready_to_recommend: mapSuggestions.some(s => s.confidence >= 0.4),
        });
      }
    }
  }, [mapSession.data, mapContextApplied]);

  // Questions to show (adaptive based on answers)
  const questions: IntakeQuestion[] = useMemo(() => [
    {
      id: "what_happened",
      text: "In your own words, what's going on? Don't worry about getting it perfect — just tell me what happened.",
      always: true,
      order: 1,
    },
    {
      id: "who_involved",
      text: "Who's involved in this situation? For example — a company, a government agency, a landlord, an employer, a family member, law enforcement?",
      always: true,
      order: 2,
    },
    {
      id: "documents_available",
      text: "Do you have any documents related to this? Things like letters, emails, contracts, medical records, court papers, bills — anything at all?",
      always: false,
      order: 3,
    },
    {
      id: "where",
      text: "Where did this happen? Knowing the state or location can help us understand which laws and protections apply.",
      always: false,
      order: 4,
      follow_up_for: ["tribal", "immigration", "housing", "employment"],
    },
    {
      id: "additional_context",
      text: "Is there anything else you'd like me to know? Any deadlines, court dates, or urgent concerns?",
      always: false,
      order: 5,
    },
    // ─── Power dynamics and cascade questions (spine enrichment) ───────────
    // These are neutral, structural questions that collect authority, access,
    // and cascade data. Answers normalize into power_dynamics_registry and
    // cascade_registry via the guided intake submit path.
    {
      id: "pd_decision_maker",
      text: "Who makes decisions about care, housing, or services in this situation?",
      always: false,
      order: 6,
    },
    {
      id: "pd_access_controller",
      text: "Who controls access to the place, person, or services involved?",
      always: false,
      order: 7,
    },
    {
      id: "pd_documentation_holder",
      text: "Who has or controls the documents related to this situation?",
      always: false,
      order: 8,
    },
    {
      id: "pd_gatekeeper",
      text: "Who has the ability to delay, deny, or limit help or access?",
      always: false,
      order: 9,
    },
    {
      id: "pd_dependency_path",
      text: "Who depends on whom in this situation — financially, for care, or for information?",
      always: false,
      order: 10,
    },
    {
      id: "pd_exclusion_event",
      text: "Has anyone been left out of conversations, meetings, or communications about this situation?",
      always: false,
      order: 11,
    },
    {
      id: "pd_bypass_concern",
      text: "Has anyone tried to go around the person who is supposed to be in charge or represent this person?",
      always: false,
      order: 12,
    },
    {
      id: "cascade_trigger",
      text: "What changed after this event happened — in care, finances, housing, health, or daily life?",
      always: false,
      order: 13,
    },
  ], []);

  // Determine which questions to show based on current state
  const activeQuestions = useMemo(() => {
    const answeredIds = new Set(Object.keys(answers));
    const topCategory = detectResult?.category_affinity?.[0]?.category;

    return questions.filter(q => {
      if (answeredIds.has(q.id)) return false; // Already answered
      if (q.always) return true;
      if (q.follow_up_for && topCategory) {
        return q.follow_up_for.includes(topCategory);
      }
      return answeredIds.size >= 2;
    });
  }, [questions, answers, detectResult]);

  const currentQuestion = activeQuestions[0];
  const answeredCount = Object.keys(answers).length;
  const totalQuestions = questions.length;

  // Progress calculation
  const progress = useMemo(() => {
    if (phase === "confirm") return 100;
    if (phase === "suggestions") return 85;
    return Math.min(((answeredCount / Math.max(totalQuestions, 1)) * 80), 80);
  }, [phase, answeredCount, totalQuestions]);

  // Focus textarea when question changes
  useEffect(() => {
    if (phase === "questions") {
      setTimeout(() => textareaRef.current?.focus(), 300);
    }
  }, [currentQuestion, phase]);

  // Run auto-detection after each answer
  const runDetection = useCallback(async (updatedAnswers: Record<string, string>) => {
    setIsDetecting(true);
    try {
      const result = await autoDetect.mutateAsync({
        what_happened: updatedAnswers.what_happened,
        who_involved: updatedAnswers.who_involved,
        documents_available: updatedAnswers.documents_available,
        where: updatedAnswers.where,
        additional_context: updatedAnswers.additional_context,
      });
      setDetectResult(result);

      // If ready to recommend and we have enough answers, show suggestions
      if (result.ready_to_recommend && Object.keys(updatedAnswers).length >= 2) {
        setPhase("suggestions");
        setTimeout(() => suggestionsRef.current?.scrollIntoView({ behavior: "smooth" }), 300);
      }
    } catch {
      // Silently fail — detection is a helper, not a blocker
    } finally {
      setIsDetecting(false);
    }
  }, [autoDetect]);

  // Handle submitting an answer
  const handleSubmitAnswer = async () => {
    const text = currentInput.trim();
    if (!text || !currentQuestion) return;

    const updatedAnswers = { ...answers, [currentQuestion.id]: text };
    setAnswers(updatedAnswers);
    setCurrentInput("");

    // Run detection in background
    runDetection(updatedAnswers);

    // Move to next question or suggestions
    const remaining = activeQuestions.filter(q => q.id !== currentQuestion.id);
    if (remaining.length === 0 || Object.keys(updatedAnswers).length >= 3) {
      // After 3 answers or no more questions, show suggestions
      setPhase("suggestions");
    }
  };

  // Handle "Tell me more" — run smart detection with LLM
  const handleSmartDetect = async () => {
    const combinedText = Object.values(answers).join(". ");
    if (!combinedText.trim()) return;

    setIsSmartDetecting(true);
    setUseSmartDetect(true);
    try {
      const result = await smartDetect.mutateAsync({ text: combinedText });
      setDetectResult(result);
      setPhase("suggestions");
    } catch {
      toast.error("Smart detection failed. Using standard detection instead.");
    } finally {
      setIsSmartDetecting(false);
    }
  };

  // Handle pipeline selection
  const handleSelectPipeline = (pipelineId: string) => {
    setSelectedPipeline(pipelineId === selectedPipeline ? null : pipelineId);
  };

  // Handle case creation
  const handleCreateCase = async () => {
    if (!selectedPipeline || isCreating) return;
    const suggestion = detectResult?.suggestions.find(s => s.pipeline_id === selectedPipeline);
    if (!suggestion) return;

    setIsCreating(true);
    try {
      const caseName = `${suggestion.label} — ${new Date().toLocaleDateString()}`;
      const description = Object.entries(answers)
        .map(([key, val]) => `${key.replace(/_/g, " ")}: ${val}`)
        .join("\n");

      const result = await createCase.mutateAsync({
        name: caseName,
        description,
        domain: CATEGORY_LABELS[suggestion.category]?.label || suggestion.category,
        pipelineType: suggestion.pipeline_id,
      });

      // Persist spine enrichment data (chronology → power_dynamics → cascade)
      // after case creation. Runs in background; does not block case navigation.
      // Answers include both core questions and any pd_* / cascade_trigger answers
      // the user provided during the intake flow.
      submitSpineData.mutate({
        case_id: result.id,
        answers: { ...answers },
      });

      logEvent.mutate({ pipelineType: suggestion.pipeline_id, eventType: "guided_intake_complete" });
      toast.success("Your case has been created. Let's start gathering your documents.");
      setLocation(`/guide/${result.id}`);
    } catch {
      toast.error("Could not create the case. Please try again.");
      setIsCreating(false);
    }
  };

  // Handle "Continue to conversation" — go to the old intake with the selected pipeline
  const handleContinueToConversation = () => {
    if (!selectedPipeline) return;
    logEvent.mutate({ pipelineType: selectedPipeline, eventType: "guided_to_conversation" });
    setLocation(`/intake?situation=${selectedPipeline}`);
  };

  // Handle key events
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmitAnswer();
    }
  };

  // Text-to-speech
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

  // Skip to suggestions
  const handleSkipToSuggestions = () => {
    if (answeredCount >= 1 && detectResult && detectResult.suggestions.length > 0) {
      setPhase("suggestions");
    }
  };

  // Go back to questions
  const handleBackToQuestions = () => {
    setPhase("questions");
    setSelectedPipeline(null);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ─── Header ─── */}
      <header className="border-b border-border/50 px-4 sm:px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => setLocation("/welcome")}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Button>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Guided Intake</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isDetecting && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
              <span className="hidden sm:inline">Analyzing...</span>
            </div>
          )}
        </div>
      </header>

      {/* ─── Progress ─── */}
      <div className="px-4 sm:px-6 pt-3">
        <Progress value={progress} className="h-1" />
        <div className="flex items-center justify-between mt-1.5">
          <p className="text-[10px] text-muted-foreground">
            {phase === "questions" && `Question ${answeredCount + 1} of ${totalQuestions}`}
            {phase === "suggestions" && "Review suggestions"}
            {phase === "confirm" && "Confirm and create case"}
          </p>
          {phase === "questions" && answeredCount >= 1 && detectResult && detectResult.suggestions.length > 0 && (
            <button
              onClick={handleSkipToSuggestions}
              className="text-[10px] text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
            >
              See suggestions <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* ─── Map Context Banner ─── */}
      {mapSessionId && mapSession.data && (
        <div className="px-4 sm:px-6 pt-3">
          <div className="max-w-2xl mx-auto rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-center gap-3">
            <MapPin className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground">
                Started from <span className="font-medium text-primary">Civic Map</span>
                {mapSession.data.detectedState && (
                  <> in <span className="font-medium">{mapSession.data.detectedState}</span></>
                )}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {(mapSession.data.nearbyResources as any[])?.length || 0} nearby resources
                {((mapSession.data.suggestedPipelines as any[])?.length ?? 0) > 0 && (
                  <> &middot; {(mapSession.data.suggestedPipelines as any[]).length} suggested pipelines</>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Main Content ─── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <div className="max-w-2xl mx-auto space-y-6">

          {/* ─── PHASE: Questions ─── */}
          {phase === "questions" && (
            <>
              {/* Answered questions summary */}
              {answeredCount > 0 && (
                <div className="space-y-3">
                  {Object.entries(answers).map(([qId, answer]) => {
                    const q = questions.find(q => q.id === qId);
                    return (
                      <div key={qId} className="rounded-lg border border-border/30 bg-card/30 p-4">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
                          {q?.text?.split("?")[0] || qId.replace(/_/g, " ")}
                        </p>
                        <p className="text-sm text-foreground/80 leading-relaxed">{answer}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Live detection preview (subtle) */}
              {detectResult && detectResult.suggestions.length > 0 && answeredCount >= 1 && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-center gap-3">
                  <Target className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground">
                      This sounds like it could be{" "}
                      <span className="font-medium text-primary">
                        {detectResult.suggestions[0].label}
                      </span>
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {detectResult.suggestions[0].confidence_label === "high"
                        ? "Strong match — we can set up your case now"
                        : "Tell me more to improve the match"}
                    </p>
                  </div>
                  {detectResult.ready_to_recommend && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-primary shrink-0"
                      onClick={handleSkipToSuggestions}
                    >
                      Review <ChevronRight className="h-3 w-3 ml-1" />
                    </Button>
                  )}
                </div>
              )}

              {/* Current question */}
              {currentQuestion && (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <MessageCircle className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-foreground leading-relaxed">
                        {currentQuestion.text}
                      </p>
                      <button
                        onClick={() => toggleSpeech(currentQuestion.text)}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors mt-2"
                      >
                        {isSpeaking ? (
                          <><VolumeX className="h-3 w-3" /> Stop reading</>
                        ) : (
                          <><Volume2 className="h-3 w-3" /> Read aloud</>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="pl-11">
                    <Textarea
                      ref={textareaRef}
                      value={currentInput}
                      onChange={(e) => setCurrentInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Type your answer here..."
                      className="min-h-[80px] max-h-[200px] resize-none text-sm"
                      rows={3}
                    />
                    <div className="flex items-center justify-between mt-3">
                      <p className="text-[10px] text-muted-foreground/50">
                        Press Enter to continue, Shift+Enter for a new line
                      </p>
                      <Button
                        onClick={handleSubmitAnswer}
                        disabled={!currentInput.trim()}
                        size="sm"
                        className="gap-1.5"
                      >
                        Continue <Send className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* No more questions — prompt to see suggestions */}
              {!currentQuestion && answeredCount > 0 && (
                <div className="text-center py-8 space-y-4">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <Sparkles className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Thank you for sharing that with me
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      I have a good understanding of your situation now. Let me show you what I think this is about.
                    </p>
                  </div>
                  <Button onClick={() => setPhase("suggestions")} className="gap-2">
                    See What I Found <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}

          {/* ─── PHASE: Suggestions ─── */}
          {phase === "suggestions" && (
            <div ref={suggestionsRef} className="space-y-6">
              {/* Back button */}
              <button
                onClick={handleBackToQuestions}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Add more details
              </button>

              {/* Header */}
              <div className="text-center space-y-2">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Target className="h-5 w-5 text-primary" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">
                  Here's what I think this is about
                </h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Based on what you've told me, these are the best matches. Select the one that feels right.
                </p>
              </div>

              {/* Smart detect option */}
              {!useSmartDetect && answeredCount >= 1 && (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5"
                    onClick={handleSmartDetect}
                    disabled={isSmartDetecting}
                  >
                    {isSmartDetecting ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Deep analyzing...</>
                    ) : (
                      <><Zap className="h-3.5 w-3.5" /> Use AI for deeper analysis</>
                    )}
                  </Button>
                </div>
              )}

              {/* Suggestions list */}
              {detectResult && detectResult.suggestions.length > 0 ? (
                <div className="space-y-3">
                  {(showAllSuggestions ? detectResult.suggestions : detectResult.suggestions.slice(0, 3)).map((suggestion) => (
                    <SuggestionCard
                      key={suggestion.pipeline_id}
                      suggestion={suggestion}
                      isSelected={selectedPipeline === suggestion.pipeline_id}
                      onSelect={() => handleSelectPipeline(suggestion.pipeline_id)}
                    />
                  ))}

                  {!showAllSuggestions && detectResult.suggestions.length > 3 && (
                    <button
                      onClick={() => setShowAllSuggestions(true)}
                      className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-2 transition-colors"
                    >
                      Show {detectResult.suggestions.length - 3} more suggestion{detectResult.suggestions.length - 3 > 1 ? "s" : ""}
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 space-y-3">
                  <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    I wasn't able to match your situation to a specific pipeline yet.
                  </p>
                  <Button variant="outline" size="sm" onClick={handleBackToQuestions} className="gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5" /> Add more details
                  </Button>
                </div>
              )}

              {/* Category affinity */}
              {detectResult && detectResult.category_affinity.length > 0 && (
                <div className="rounded-lg border border-border/30 bg-card/30 p-4">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
                    Category Analysis
                  </p>
                  <div className="space-y-2">
                    {detectResult.category_affinity.slice(0, 3).map((cat) => {
                      const info = CATEGORY_LABELS[cat.category] || CATEGORY_LABELS.general;
                      return (
                        <div key={cat.category} className="flex items-center gap-2">
                          <span className="text-xs">{info.icon}</span>
                          <span className="text-xs text-foreground/80 flex-1">{info.label}</span>
                          <div className="w-20 h-1 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary/60 rounded-full"
                              style={{ width: `${Math.min((cat.score / (detectResult.category_affinity[0]?.score || 1)) * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* None of these? */}
              <div className="rounded-lg border border-border/30 bg-card/30 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-400" />
                  <p className="text-xs text-foreground">None of these quite right?</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={handleBackToQuestions}
                  >
                    Add more details
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setLocation("/welcome")}
                  >
                    Browse all pipelines
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setSelectedPipeline("general_investigation");
                      setPhase("confirm");
                    }}
                  >
                    Start a general case
                  </Button>
                </div>
              </div>

              {/* Action buttons */}
              {selectedPipeline && (
                <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t border-border/50 -mx-4 px-4 py-4 space-y-3">
                  <Button
                    onClick={() => setPhase("confirm")}
                    className="w-full gap-2"
                    size="lg"
                  >
                    Continue with this selection <ArrowRight className="h-4 w-4" />
                  </Button>
                  <p className="text-[10px] text-center text-muted-foreground/60">
                    You can always change this later
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ─── PHASE: Confirm ─── */}
          {phase === "confirm" && (
            <div className="space-y-6">
              {/* Back button */}
              <button
                onClick={() => setPhase("suggestions")}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to suggestions
              </button>

              {(() => {
                const suggestion = detectResult?.suggestions.find(s => s.pipeline_id === selectedPipeline);
                const catInfo = CATEGORY_LABELS[suggestion?.category || "general"] || CATEGORY_LABELS.general;

                return (
                  <Card className="border-primary/30 bg-primary/5">
                    <CardContent className="p-6 space-y-5">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <CheckCircle2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-foreground">
                            Ready to set up your case
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            Here's what we'll configure for you
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-md bg-background/50 p-3 space-y-2">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pipeline</p>
                          <div className="flex items-center gap-2">
                            <span>{catInfo.icon}</span>
                            <span className="text-sm font-medium text-foreground">
                              {suggestion?.label || selectedPipeline}
                            </span>
                          </div>
                          <p className={cn("text-[11px]", catInfo.color)}>{catInfo.label}</p>
                        </div>

                        <div className="rounded-md bg-background/50 p-3 space-y-2">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Your Situation</p>
                          <p className="text-xs text-foreground/80 leading-relaxed">
                            {answers.what_happened || "No description provided"}
                          </p>
                        </div>

                        {suggestion && suggestion.confidence_label !== "high" && (
                          <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3 flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-200/80">
                              This is our best match, but if it doesn't feel right, you can always change the pipeline later or start a conversation to refine it.
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="space-y-3 pt-2">
                        <Button
                          onClick={handleCreateCase}
                          disabled={isCreating}
                          className="w-full gap-2"
                          size="lg"
                        >
                          {isCreating ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> Setting things up...</>
                          ) : (
                            <><ArrowRight className="h-4 w-4" /> Create my case</>
                          )}
                        </Button>

                        <Button
                          variant="outline"
                          onClick={handleContinueToConversation}
                          className="w-full gap-2 text-xs"
                          size="sm"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          Talk to an intake advocate first
                        </Button>

                        <Button
                          variant="outline"
                          onClick={() => {
                            const situationText = Object.values(answers).filter(Boolean).join(". ");
                            const cat = suggestion?.category || "";
                            const pid = selectedPipeline || "";
                            setLocation(`/benefits?situation=${encodeURIComponent(situationText)}&category=${encodeURIComponent(cat)}&pipeline=${encodeURIComponent(pid)}`);
                          }}
                          className="w-full gap-2 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                          size="sm"
                        >
                          <Heart className="h-3.5 w-3.5" />
                          See benefits you may qualify for
                        </Button>

                        <p className="text-[10px] text-center text-muted-foreground/60">
                          You can always come back and add more details later
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
