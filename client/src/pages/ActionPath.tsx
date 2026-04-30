import { useState } from "react";
import { useLocation } from "wouter";
import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Sparkles, Loader2, CheckCircle2,
  AlertCircle, Clock, Copy, Download, Volume2,
  VolumeX, FileText, ArrowRight, RefreshCw, Send,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { CaseEnforcementNextSteps } from "@/components/EnforcementNextSteps";
import { CaseSupportRecommendations } from "@/components/SupportRecommendations";
import { toast } from "sonner";

type ActionItem = {
  title: string;
  description: string;
  priority: "urgent" | "important" | "optional";
};

type ActionPathResult = {
  summary: string;
  actions: ActionItem[];
  letterTemplate: string | null;
};

export default function ActionPath() {
  const [, setLocation] = useLocation();
  const { currentCaseId } = useCase();
  const [result, setResult] = useState<ActionPathResult | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showLetter, setShowLetter] = useState(false);

  const generatePath = trpc.intake.generateActionPath.useMutation({
    onSuccess: (data) => {
      setResult(data as ActionPathResult);
    },
    onError: () => {
      toast.error("Could not generate your action path. Please try again.");
    },
  });

  const handleGenerate = () => {
    if (!currentCaseId) return;
    generatePath.mutate({ caseId: currentCaseId });
  };

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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const priorityConfig = {
    urgent: { icon: AlertCircle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", label: "Do this first" },
    important: { icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", label: "Important" },
    optional: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", label: "When you can" },
  };

  if (!currentCaseId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">Select a case first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => setLocation(`/guide/${currentCaseId}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Your Next Steps</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Based on what the engine found in your documents
            </p>
          </div>
        </div>
      </div>

      {/* Structured enforcement action paths — always visible, no generation needed */}
      <CaseEnforcementNextSteps caseId={currentCaseId} />

      {/* Unified support resources — matched from all data sources */}
      <CaseSupportRecommendations caseId={currentCaseId} />

      {!result && !generatePath.isPending && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-6 text-center space-y-4">
            <Sparkles className="h-10 w-10 text-primary mx-auto" />
            <div className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">
                Ready to see what you can do?
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                The engine will look at everything it found in your documents and create 
                a clear list of steps you can take — written in plain language, 
                prioritized by what matters most.
              </p>
            </div>
            <Button onClick={handleGenerate} size="lg" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Generate My Action Path
            </Button>
          </CardContent>
        </Card>
      )}

      {generatePath.isPending && (
        <Card>
          <CardContent className="p-6 text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Building your action path...
              </p>
              <p className="text-xs text-muted-foreground">
                Looking at your findings and figuring out the best steps forward
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <div className="space-y-5">
          {/* Summary */}
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  What Your Documents Show
                </h3>
                <button
                  onClick={() => toggleSpeech(result.summary)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isSpeaking ? <><VolumeX className="h-3 w-3" /> Stop</> : <><Volume2 className="h-3 w-3" /> Read aloud</>}
                </button>
              </div>
              <div className="text-sm text-foreground/80 leading-relaxed">
                <Streamdown>{result.summary}</Streamdown>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">What You Can Do</h3>
            {result.actions.map((action, i) => {
              const config = priorityConfig[action.priority];
              const Icon = config.icon;
              return (
                <Card key={i} className={`border ${config.bg}`}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start gap-3">
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-mono text-muted-foreground">{i + 1}</span>
                        <Icon className={`h-4 w-4 ${config.color}`} />
                      </div>
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-medium text-foreground">{action.title}</h4>
                          <Badge variant="outline" className={`text-[9px] ${config.color}`}>
                            {config.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {action.description}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Letter template */}
          {result.letterTemplate && (
            <Card className="border-primary/20">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Letter Template
                  </h3>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs gap-1"
                      onClick={() => toggleSpeech(result.letterTemplate!)}
                    >
                      {isSpeaking ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1"
                      onClick={() => copyToClipboard(result.letterTemplate!)}
                    >
                      <Copy className="h-3 w-3" /> Copy
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1 text-amber-400 border-amber-400/30 hover:bg-amber-500/10"
                      onClick={() => setLocation(`/lumensend?type=demand`)}
                    >
                      <Send className="h-3 w-3" /> Open in LumenSend
                    </Button>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => setShowLetter(!showLetter)}
                >
                  {showLetter ? "Hide letter" : "Show letter template"}
                </Button>

                {showLetter && (
                  <div className="bg-background rounded-lg p-4 border border-border text-sm leading-relaxed whitespace-pre-wrap font-mono text-foreground/80">
                    {result.letterTemplate}
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground/60 text-center">
                  This is a starting point. Review and customize it before sending.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Regenerate + navigation */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button
              variant="outline"
              className="gap-2 text-xs flex-1"
              onClick={handleGenerate}
              disabled={generatePath.isPending}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Regenerate
            </Button>
            <Button
              className="gap-2 text-xs flex-1"
              onClick={() => setLocation(`/guide/${currentCaseId}`)}
            >
              Back to Overview
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
