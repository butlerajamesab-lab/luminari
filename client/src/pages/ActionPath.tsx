import { useLocation } from "wouter";
import { useCase } from "@/contexts/CaseContext";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { CaseEnforcementNextSteps } from "@/components/EnforcementNextSteps";
import { CaseSupportRecommendations } from "@/components/SupportRecommendations";

export default function ActionPath() {
  const [, setLocation] = useLocation();
  const { currentCaseId } = useCase();

  if (!currentCaseId) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 text-center">
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">Choose a case to see its next steps.</p>
          <Button variant="outline" size="sm" onClick={() => setLocation("/cases")}>
            View My Cases
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="mt-0.5 shrink-0 text-muted-foreground"
          aria-label="Back to case overview"
          onClick={() => setLocation(`/guide/${currentCaseId}`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">Your Next Steps</h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Start with the reviewed routes that match this case. Supporting resources are kept separate below so you can act without sorting through the whole knowledge system.
          </p>
        </div>
      </div>

      <CaseEnforcementNextSteps caseId={currentCaseId} />

      <CaseSupportRecommendations caseId={currentCaseId} />

      <div className="flex justify-end border-t border-border/50 pt-4">
        <Button
          variant="outline"
          className="gap-2 text-xs"
          onClick={() => setLocation(`/guide/${currentCaseId}`)}
        >
          Back to Case Overview
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
