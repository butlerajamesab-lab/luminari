/**
 * NextStepBar — Follow-through navigation for dead-end pages
 *
 * Usage:
 *   <NextStepBar
 *     steps={[
 *       { label: "Validate Your Claim", href: "/claim-validation", icon: "shield" },
 *       { label: "Find a Remedy", href: "/remedy-feasibility", icon: "scale" },
 *     ]}
 *     context="You've reviewed your litigation barriers."
 *   />
 */
import { useLocation } from "wouter";
import { ArrowRight, Shield, Scale, FileText, Search, BookOpen, Gavel, Flag, Send, Map, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type StepIcon = "shield" | "scale" | "file" | "search" | "book" | "gavel" | "flag" | "send" | "map" | "arrow";

type NextStep = {
  label: string;
  href: string;
  description?: string;
  icon?: StepIcon;
  variant?: "primary" | "secondary";
};

type NextStepBarProps = {
  steps: NextStep[];
  context?: string;
  className?: string;
};

const iconMap: Record<StepIcon, React.ReactNode> = {
  shield: <Shield className="h-3.5 w-3.5" />,
  scale: <Scale className="h-3.5 w-3.5" />,
  file: <FileText className="h-3.5 w-3.5" />,
  search: <Search className="h-3.5 w-3.5" />,
  book: <BookOpen className="h-3.5 w-3.5" />,
  gavel: <Gavel className="h-3.5 w-3.5" />,
  flag: <Flag className="h-3.5 w-3.5" />,
  send: <Send className="h-3.5 w-3.5" />,
  map: <Map className="h-3.5 w-3.5" />,
  arrow: <ArrowRight className="h-3.5 w-3.5" />,
};

export function NextStepBar({ steps, context, className }: NextStepBarProps) {
  const [, setLocation] = useLocation();

  if (!steps.length) return null;

  return (
    <div className={cn(
      "mt-6 p-4 rounded-xl border border-primary/20 bg-primary/5",
      className
    )}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          <ChevronRight className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          {context && (
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{context}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {steps.map((step, i) => {
              const isPrimary = step.variant === "primary" || i === 0;
              return (
                <button
                  key={step.href}
                  onClick={() => setLocation(step.href)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                    "border focus:outline-none focus:ring-2 focus:ring-primary/30",
                    isPrimary
                      ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                      : "bg-transparent text-foreground border-border hover:bg-muted hover:border-primary/30"
                  )}
                >
                  {step.icon && iconMap[step.icon]}
                  {step.label}
                  <ArrowRight className="h-3 w-3 opacity-60" />
                </button>
              );
            })}
          </div>
          {steps.some(s => s.description) && (
            <div className="mt-2 space-y-0.5">
              {steps.filter(s => s.description).map(s => (
                <p key={s.href} className="text-[10px] text-muted-foreground">
                  <span className="font-medium text-foreground/70">{s.label}:</span> {s.description}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
