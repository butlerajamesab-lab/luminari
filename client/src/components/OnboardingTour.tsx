import { useState, useEffect } from "react";
import {
  Heart, FileText, Shield, Lightbulb, Share2, MessageCircle, Sparkles,
  ChevronRight, ChevronLeft, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const TOUR_COMPLETED_KEY = "luminari-tour-completed";

export function resetTour() {
  localStorage.removeItem(TOUR_COMPLETED_KEY);
  window.location.reload();
}

interface TourStep {
  icon: any;
  title: string;
  description: string;
  color: string;
  bgGradient: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    icon: Heart,
    title: "Welcome to Luminari",
    description: "A free forensic document intelligence engine built to help you navigate complex paperwork in high-stakes situations. No one should face institutional systems alone.",
    color: "text-rose-400",
    bgGradient: "from-rose-500/10 to-rose-500/5",
  },
  {
    icon: MessageCircle,
    title: "Tell Us Your Situation",
    description: "Choose the category that fits your situation. Our guided intake will walk you through it with care — asking only what's needed to build your case.",
    color: "text-blue-400",
    bgGradient: "from-blue-500/10 to-blue-500/5",
  },
  {
    icon: FileText,
    title: "Upload Your Documents",
    description: "Upload insurance letters, court filings, medical records, or government correspondence. Luminari reads them so you don't have to relive them.",
    color: "text-emerald-400",
    bgGradient: "from-emerald-500/10 to-emerald-500/5",
  },
  {
    icon: Shield,
    title: "Forensic Analysis",
    description: "Our engine extracts entities, timelines, claims, and contradictions. Every finding is backed by exact quotes with page numbers — no guessing, no interpretation.",
    color: "text-amber-400",
    bgGradient: "from-amber-500/10 to-amber-500/5",
  },
  {
    icon: Lightbulb,
    title: "Actionable Findings",
    description: "Get plain-language explanations of what your documents reveal. Findings are organized by importance with direct links to the source evidence.",
    color: "text-violet-400",
    bgGradient: "from-violet-500/10 to-violet-500/5",
  },
  {
    icon: Share2,
    title: "Share with Your Advocate",
    description: "Generate secure, time-limited links to share your case with attorneys, social workers, or advocates. You control access and can revoke anytime.",
    color: "text-cyan-400",
    bgGradient: "from-cyan-500/10 to-cyan-500/5",
  },
  {
    icon: Sparkles,
    title: "You're Ready",
    description: "42 specialized pipelines across 9 categories — from insurance denials to tribal sovereignty. Pick what fits your situation and let's get started.",
    color: "text-primary",
    bgGradient: "from-primary/10 to-primary/5",
  },
];

export function OnboardingTour({ onComplete }: { onComplete?: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const completed = localStorage.getItem(TOUR_COMPLETED_KEY);
    if (!completed) {
      setIsVisible(true);
    }
  }, []);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentStep((prev) => prev + 1);
        setIsAnimating(false);
      }, 200);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentStep((prev) => prev - 1);
        setIsAnimating(false);
      }, 200);
    }
  };

  const handleComplete = () => {
    localStorage.setItem(TOUR_COMPLETED_KEY, "true");
    setIsVisible(false);
    onComplete?.();
  };

  const handleSkip = () => {
    localStorage.setItem(TOUR_COMPLETED_KEY, "true");
    setIsVisible(false);
    onComplete?.();
  };

  if (!isVisible) return null;

  const step = TOUR_STEPS[currentStep];
  const Icon = step.icon;
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-full max-w-md mx-4">
        {/* Card */}
        <div className={`rounded-2xl border border-border/50 bg-card shadow-2xl overflow-hidden transition-all duration-300 ${isAnimating ? "opacity-0 scale-95" : "opacity-100 scale-100"}`}>
          {/* Progress bar */}
          <div className="h-1 bg-muted">
            <div
              className="h-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Skip button */}
          <button
            onClick={handleSkip}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors z-10"
            aria-label="Skip tour"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Icon area */}
          <div className={`bg-gradient-to-b ${step.bgGradient} px-8 pt-10 pb-6 flex justify-center`}>
            <div className={`w-16 h-16 rounded-2xl bg-card/80 backdrop-blur-sm border border-border/50 flex items-center justify-center shadow-lg`}>
              <Icon className={`h-8 w-8 ${step.color}`} />
            </div>
          </div>

          {/* Content */}
          <div className="px-8 pb-6 pt-2 text-center">
            <h2 className="text-lg font-semibold mb-2">{step.title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {step.description}
            </p>
          </div>

          {/* Progress dots */}
          <div className="flex justify-center gap-1.5 pb-4">
            {TOUR_STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  setIsAnimating(true);
                  setTimeout(() => {
                    setCurrentStep(i);
                    setIsAnimating(false);
                  }, 200);
                }}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentStep
                    ? "w-6 bg-primary"
                    : i < currentStep
                    ? "w-1.5 bg-primary/40"
                    : "w-1.5 bg-muted-foreground/20"
                }`}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="px-8 pb-6 flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrev}
              disabled={currentStep === 0}
              className="gap-1 text-muted-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </Button>

            <span className="text-xs text-muted-foreground">
              {currentStep + 1} of {TOUR_STEPS.length}
            </span>

            <Button
              size="sm"
              onClick={handleNext}
              className="gap-1"
            >
              {currentStep === TOUR_STEPS.length - 1 ? (
                <>
                  Get Started
                  <Sparkles className="h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </div>

          {/* Skip link */}
          {currentStep < TOUR_STEPS.length - 1 && (
            <div className="text-center pb-4">
              <button
                onClick={handleSkip}
                className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors underline-offset-2 hover:underline"
              >
                Skip tour
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
