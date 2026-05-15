import { AlertTriangle, ArrowRight, CheckCircle, Info, Layers, TrendingUp, XCircle, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";

// ─── Cross-claim interaction matrix (from team JSON — rule_interaction_matrix) ─────
const CROSS_CLAIM_INTERACTIONS: Record<string, {
  interaction: "Reinforces" | "Conflict" | "Separate" | "Reinforces (often identical)" | "Reinforces (retaliation is subset of unlawful)" | "Can conflict";
  mechanism: string;
  example: string;
  remedyNote?: string;
  linkedElements?: Array<{ claimA: string; claimB: string; link: string }>;
}> = {
  "wage_theft+wrongful_termination": {
    interaction: "Reinforces",
    mechanism: "Employee complains about wage theft (protected activity) → employer terminates → both claims available",
    example: "Worker reports unpaid overtime to HR; employer fires worker within 30 days → wage theft claim + wrongful termination (retaliation for wage complaint)",
    remedyNote: "Both claims award back pay — courts avoid double-recovery. Claim the greater of the two back pay awards.",
    linkedElements: [
      { claimA: "payment_withheld_deliberately", claimB: "protected_activity_engaged", link: "Wage complaint = protected activity; triggers retaliation pathway" },
      { claimA: "amount_owed_calculable", claimB: "adverse_action_termination", link: "Termination within 30–90 days of wage complaint satisfies temporal proximity" },
    ],
  },
  "housing_denial+discrimination_housing": {
    interaction: "Reinforces (often identical)",
    mechanism: "Housing denial claim requires protected class membership; discrimination housing claim requires identical elements — claims are nearly identical",
    example: "Landlord denies application to family with children (familial status = protected class) → file as single discrimination housing claim",
    remedyNote: "File as single discrimination_housing claim; award encompasses both denial and discriminatory intent.",
  },
  "eviction_unlawful+wrongful_termination": {
    interaction: "Reinforces (retaliation is subset of unlawful)",
    mechanism: "Retaliatory eviction indicator is standalone element; also evidence for unlawful eviction (no legal cause or pretextual cause)",
    example: "Tenant complains about habitability within 180 days of eviction notice → eviction unlawful for two reasons: (1) no legal cause, (2) retaliatory eviction indicator",
    remedyNote: "Dual element satisfaction strengthens unlawful eviction claim; retaliation presumption (CA 180-day window) shifts burden to landlord.",
  },
  "discrimination_employment+wage_theft": {
    interaction: "Reinforces",
    mechanism: "Employer pays protected class workers less (wage theft) AND treats them differently (discrimination) — same employer, two separate violations",
    example: "Employer pays Black workers 20% less than white workers for identical work → wage theft (underpayment) + discrimination employment (disparate treatment)",
    remedyNote: "Wage theft awards back wages; discrimination employment awards damages + punitive. Both claims stack.",
    linkedElements: [
      { claimA: "payment_withheld_deliberately", claimB: "protected_class_disparate_treatment", link: "Wage gap evidence satisfies both underpayment (wage theft) and disparate treatment (discrimination)" },
    ],
  },
  "benefits_denial+discrimination_employment": {
    interaction: "Reinforces",
    mechanism: "Benefits denial based on protected class status = both benefits denial (procedural) and employment discrimination (substantive)",
    example: "Employer denies FMLA leave to female employees but grants it to male employees → benefits denial + discrimination employment",
    remedyNote: "File both claims; benefits denial remedies address the specific benefit; discrimination remedies address the discriminatory intent.",
  },
  "nursing_home_abuse+healthcare_denial": {
    interaction: "Can conflict",
    mechanism: "Nursing home abuse may manifest as healthcare denial (withholding medical care as form of abuse)",
    example: "Facility denies pain medication (healthcare denial) due to cost-cutting (nursing home abuse structural failure)",
    remedyNote: "File as both healthcare denial (insurance/facility denial) and nursing home abuse (intentional harm). Elements are distinct.",
  },
};

// ─── Conflict matrix ─────────────────────────────────────────────────────────
const CONFLICT_RULES: Record<string, {
  scenario: string;
  conflict: string;
  resolution: string;
}> = {
  "wage_theft+wrongful_termination": {
    scenario: "Back pay calculations may overlap (wages owed vs wages lost due to wrongful termination)",
    conflict: "Double-recovery risk on back pay",
    resolution: "Courts award the greater of: (1) back wages + termination damages, or (2) wage theft back pay + wrongful termination back pay — single back pay award",
  },
};

// ─── Reinforcement patterns ───────────────────────────────────────────────────
const REINFORCEMENT_PATTERNS = [
  {
    id: "systemic_discrimination",
    name: "Systemic Discrimination Pattern",
    claims: ["discrimination_employment", "wage_theft"],
    description: "Single employer commits discrimination AND wage theft — demonstrates systemic practice",
    escalation: "Pattern evidence strengthens both claims; may qualify for collective action if 10+ workers affected",
  },
  {
    id: "retaliation_cluster",
    name: "Retaliation Cluster",
    claims: ["wage_theft", "wrongful_termination"],
    description: "Protected activity (wage complaint, safety report) → multiple adverse actions (wage cut, demotion, termination)",
    escalation: "Clustering of retaliation within 60 days = clear intent; each adverse action strengthens temporal proximity",
  },
];

// ─── Helper ───────────────────────────────────────────────────────────────────
function getInteractionKey(claimA: string, claimB: string): string {
  const sorted = [claimA, claimB].sort();
  return sorted.join("+");
}

function getInteractionColor(type: string): string {
  if (type.includes("Reinforces")) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  if (type.includes("conflict") || type.includes("Conflict")) return "text-amber-400 bg-amber-500/10 border-amber-500/30";
  return "text-blue-400 bg-blue-500/10 border-blue-500/30";
}

function getInteractionIcon(type: string) {
  if (type.includes("Reinforces")) return <TrendingUp className="h-3.5 w-3.5" />;
  if (type.includes("conflict") || type.includes("Conflict")) return <AlertTriangle className="h-3.5 w-3.5" />;
  return <Info className="h-3.5 w-3.5" />;
}

// ─── Component ────────────────────────────────────────────────────────────────
interface CrossClaimPanelProps {
  activeClaimTypes: string[];
}

export function CrossClaimPanel({ activeClaimTypes }: CrossClaimPanelProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (activeClaimTypes.length < 2) {
    return null; // Only show when 2+ claims are active
  }

  // Find all interactions between active claims
  const interactions: Array<{
    key: string;
    claimA: string;
    claimB: string;
    data: typeof CROSS_CLAIM_INTERACTIONS[string];
  }> = [];

  for (let i = 0; i < activeClaimTypes.length; i++) {
    for (let j = i + 1; j < activeClaimTypes.length; j++) {
      const key = getInteractionKey(activeClaimTypes[i], activeClaimTypes[j]);
      if (CROSS_CLAIM_INTERACTIONS[key]) {
        interactions.push({
          key,
          claimA: activeClaimTypes[i],
          claimB: activeClaimTypes[j],
          data: CROSS_CLAIM_INTERACTIONS[key],
        });
      }
    }
  }

  // Find matching reinforcement patterns
  const matchingPatterns = REINFORCEMENT_PATTERNS.filter(p =>
    p.claims.every(c => activeClaimTypes.includes(c))
  );

  // Find conflicts
  const conflicts = interactions.filter(i =>
    i.data.interaction.toLowerCase().includes("conflict")
  );

  if (interactions.length === 0 && matchingPatterns.length === 0) {
    return (
      <Card className="border-dashed border-muted-foreground/30">
        <CardContent className="py-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Layers className="h-4 w-4" />
            <span>No known interactions between your active claims. Each claim proceeds independently.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Cross-Claim Interactions</h3>
        </div>
        <div className="flex items-center gap-1.5">
          {conflicts.length > 0 && (
            <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30">
              {conflicts.length} conflict{conflicts.length > 1 ? "s" : ""}
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px]">
            {interactions.length} interaction{interactions.length > 1 ? "s" : ""}
          </Badge>
        </div>
      </div>

      {/* Interaction cards */}
      {interactions.map(({ key, claimA, claimB, data }) => {
        const isExpanded = expandedKey === key;
        const conflictData = CONFLICT_RULES[key];
        const colorClass = getInteractionColor(data.interaction);

        return (
          <Collapsible
            key={key}
            open={isExpanded}
            onOpenChange={(open) => setExpandedKey(open ? key : null)}
          >
            <CollapsibleTrigger asChild>
              <div
                className={`p-3 rounded-lg border cursor-pointer hover:opacity-90 transition-opacity ${colorClass}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getInteractionIcon(data.interaction)}
                    <span className="text-xs font-medium capitalize">
                      {claimA.replace(/_/g, " ")}
                    </span>
                    <ArrowRight className="h-3 w-3 opacity-60" />
                    <span className="text-xs font-medium capitalize">
                      {claimB.replace(/_/g, " ")}
                    </span>
                  </div>
                  <Badge variant="outline" className={`text-[9px] border-current ${colorClass}`}>
                    {data.interaction}
                  </Badge>
                </div>
                <p className="text-[11px] mt-1.5 opacity-80 line-clamp-2">{data.mechanism}</p>
              </div>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="mt-1 p-3 rounded-lg bg-muted/30 border border-border/40 space-y-3">
                {/* Example */}
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Example</p>
                  <p className="text-xs">{data.example}</p>
                </div>

                {/* Linked elements */}
                {data.linkedElements && data.linkedElements.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Element Links</p>
                    <div className="space-y-1.5">
                      {data.linkedElements.map((el, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-[11px]">
                          <CheckCircle className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
                          <span>
                            <span className="font-mono text-primary/80">{el.claimA}</span>
                            {" + "}
                            <span className="font-mono text-primary/80">{el.claimB}</span>
                            {" — "}
                            <span className="opacity-70">{el.link}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Remedy note */}
                {data.remedyNote && (
                  <div className="flex items-start gap-2 p-2 rounded bg-primary/5 border border-primary/20">
                    <Info className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                    <p className="text-[11px] text-primary/80">{data.remedyNote}</p>
                  </div>
                )}

                {/* Conflict warning */}
                {conflictData && (
                  <div className="flex items-start gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/30">
                    <XCircle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[11px] font-medium text-amber-400">{conflictData.conflict}</p>
                      <p className="text-[11px] text-amber-400/70 mt-0.5">{conflictData.resolution}</p>
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      {/* Reinforcement patterns */}
      {matchingPatterns.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Detected Patterns</p>
          {matchingPatterns.map(pattern => (
            <div
              key={pattern.id}
              className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5"
            >
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-xs font-medium text-emerald-400">{pattern.name}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">{pattern.description}</p>
              <p className="text-[11px] text-emerald-400/70 mt-1.5 flex items-start gap-1">
                <Zap className="h-3 w-3 mt-0.5 shrink-0" />
                {pattern.escalation}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
