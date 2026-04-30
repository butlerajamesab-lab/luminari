import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, ArrowRight, Building2, Calendar, CheckCircle2,
  ChevronDown, ChevronRight, ClipboardList, Clock, ExternalLink,
  FileText, Gavel, Info, MapPin, Phone, Mail, Globe,
  Shield, Lightbulb, AlertCircle, Scale, ArrowUpRight,
  CircleDot, BookOpen, Users,
} from "lucide-react";

interface ActionPath {
  id: number;
  pipelineType: string;
  claimLabel: string;
  jurisdiction: string;
  priority: number;
  agencyName: string;
  agencyAcronym: string | null;
  agencyDescription: string | null;
  agencyPhone: string | null;
  agencyWebsite: string | null;
  agencyEmail: string | null;
  agencyAddress: string | null;
  formName: string | null;
  formNumber: string | null;
  formUrl: string | null;
  formDescription: string | null;
  submissionMethods: Array<{
    method: string;
    details: string;
    url?: string;
    preferred?: boolean;
  }> | null;
  filingDeadlineDays: number | null;
  filingDeadlineDescription: string | null;
  expectedResponseDays: number | null;
  expectedResponseDescription: string | null;
  investigationTimelineDays: number | null;
  investigationTimelineDescription: string | null;
  steps: Array<{
    order: number;
    title: string;
    description: string;
    actionType: string;
    tips?: string[];
  }> | null;
  escalationPaths: Array<{
    condition: string;
    action: string;
    agencyName?: string;
    contactInfo?: string;
    deadline?: string;
  }> | null;
  primaryStatuteCitation: string | null;
  primaryStatuteTitle: string | null;
  relatedStatutes: Array<{
    citation: string;
    title: string;
    relevance: string;
  }> | null;
  possibleOutcomes: Array<{
    outcome: string;
    description: string;
    likelihood?: string;
  }> | null;
  documentsNeeded: string[] | null;
  commonMistakes: string[] | null;
  practicalTips: string[] | null;
  isActive: boolean;
  lastVerifiedAt: number | null;
  dataSource: string | null;
}

// ─── Sub-components ───

function DeadlineAlert({ path }: { path: ActionPath }) {
  if (!path.filingDeadlineDescription) return null;
  const isUrgent = path.filingDeadlineDays !== null && path.filingDeadlineDays <= 30;
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${
      isUrgent
        ? "bg-red-500/10 border-red-500/30"
        : "bg-amber-500/10 border-amber-500/30"
    }`}>
      <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${
        isUrgent ? "text-red-400" : "text-amber-400"
      }`} />
      <div>
        <p className={`text-xs font-semibold ${
          isUrgent ? "text-red-300" : "text-amber-300"
        }`}>
          {path.filingDeadlineDays
            ? `Filing Deadline: ${path.filingDeadlineDays} days`
            : "Filing Deadline"}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
          {path.filingDeadlineDescription}
        </p>
      </div>
    </div>
  );
}

function AgencyCard({ path }: { path: ActionPath }) {
  return (
    <div className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-2">
      <div className="flex items-start gap-2">
        <Building2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground">
            {path.agencyName}
          </p>
          {path.agencyAcronym && (
            <Badge variant="outline" className="text-[9px] mt-0.5">{path.agencyAcronym}</Badge>
          )}
          {path.agencyDescription && (
            <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
              {path.agencyDescription}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {path.agencyPhone && (
          <a
            href={`tel:${path.agencyPhone.replace(/[^0-9+]/g, "")}`}
            className="flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            <Phone className="h-3 w-3" />
            {path.agencyPhone}
          </a>
        )}
        {path.agencyWebsite && (
          <a
            href={path.agencyWebsite}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            <Globe className="h-3 w-3" />
            Website
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
        {path.agencyEmail && (
          <a
            href={`mailto:${path.agencyEmail}`}
            className="flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            <Mail className="h-3 w-3" />
            Email
          </a>
        )}
      </div>
      {path.agencyAddress && (
        <div className="flex items-start gap-1 mt-1">
          <MapPin className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground">{path.agencyAddress}</p>
        </div>
      )}
    </div>
  );
}

function FilingForm({ path }: { path: ActionPath }) {
  if (!path.formName) return null;
  return (
    <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
      <div className="flex items-start gap-2">
        <FileText className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground">
            {path.formName}
            {path.formNumber && (
              <span className="text-muted-foreground font-normal ml-1">({path.formNumber})</span>
            )}
          </p>
          {path.formDescription && (
            <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
              {path.formDescription}
            </p>
          )}
        </div>
      </div>
      {path.formUrl && (
        <a
          href={path.formUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
          Open Form Online
        </a>
      )}
      {path.submissionMethods && path.submissionMethods.length > 0 && (
        <div className="space-y-1 mt-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            How to Submit
          </p>
          {path.submissionMethods.map((m, i) => (
            <div key={i} className="flex items-start gap-2 pl-1">
              <CircleDot className={`h-2.5 w-2.5 shrink-0 mt-1 ${
                m.preferred ? "text-primary" : "text-muted-foreground/50"
              }`} />
              <div>
                <span className="text-[10px] text-foreground capitalize">
                  {m.method.replace(/_/g, " ")}
                  {m.preferred && (
                    <Badge variant="outline" className="text-[8px] ml-1 text-primary border-primary/30">
                      Recommended
                    </Badge>
                  )}
                </span>
                <p className="text-[10px] text-muted-foreground">{m.details}</p>
                {m.url && (
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-primary hover:underline inline-flex items-center gap-0.5"
                  >
                    Go <ExternalLink className="h-2 w-2" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StepsTimeline({ steps }: { steps: ActionPath["steps"] }) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  if (!steps || steps.length === 0) return null;

  const actionTypeIcons: Record<string, typeof CheckCircle2> = {
    prepare: ClipboardList,
    file: FileText,
    wait: Clock,
    respond: ArrowRight,
    escalate: ArrowUpRight,
  };

  const actionTypeColors: Record<string, string> = {
    prepare: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    file: "text-primary bg-primary/10 border-primary/20",
    wait: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    respond: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    escalate: "text-red-400 bg-red-500/10 border-red-500/20",
  };

  return (
    <div className="space-y-0">
      {steps.sort((a, b) => a.order - b.order).map((step, i) => {
        const Icon = actionTypeIcons[step.actionType] || ArrowRight;
        const colors = actionTypeColors[step.actionType] || "text-muted-foreground bg-muted/30 border-border/50";
        const isExpanded = expandedStep === step.order;
        const isLast = i === steps.length - 1;

        return (
          <div key={step.order} className="flex gap-3">
            {/* Timeline line */}
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center border shrink-0 ${colors}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              {!isLast && <div className="w-px flex-1 bg-border/50 min-h-[16px]" />}
            </div>

            {/* Step content */}
            <div className={`flex-1 min-w-0 ${!isLast ? "pb-4" : "pb-1"}`}>
              <button
                onClick={() => setExpandedStep(isExpanded ? null : step.order)}
                className="flex items-center gap-1.5 w-full text-left group"
              >
                <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                  Step {step.order}: {step.title}
                </p>
                {step.tips && step.tips.length > 0 && (
                  isExpanded
                    ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                    : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
              </button>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                {step.description}
              </p>
              {isExpanded && step.tips && step.tips.length > 0 && (
                <div className="mt-2 space-y-1 pl-2 border-l-2 border-primary/20">
                  {step.tips.map((tip, j) => (
                    <div key={j} className="flex items-start gap-1.5">
                      <Lightbulb className="h-2.5 w-2.5 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-muted-foreground leading-relaxed">{tip}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LegalReferences({ path }: { path: ActionPath }) {
  if (!path.primaryStatuteCitation) return null;
  return (
    <div className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-2">
      <div className="flex items-center gap-2">
        <Scale className="h-4 w-4 text-primary" />
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Legal Authority
        </p>
      </div>
      <div className="pl-6">
        <p className="text-xs font-semibold text-foreground">{path.primaryStatuteTitle}</p>
        <p className="text-[10px] text-primary">{path.primaryStatuteCitation}</p>
      </div>
      {path.relatedStatutes && path.relatedStatutes.length > 0 && (
        <div className="pl-6 space-y-1 mt-1">
          {path.relatedStatutes.map((s, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <BookOpen className="h-2.5 w-2.5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] text-foreground">{s.citation}</span>
                <span className="text-[10px] text-muted-foreground ml-1">— {s.title}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EscalationPaths({ paths }: { paths: ActionPath["escalationPaths"] }) {
  if (!paths || paths.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ArrowUpRight className="h-4 w-4 text-amber-400" />
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          If Things Don't Go Your Way
        </p>
      </div>
      {paths.map((ep, i) => (
        <div key={i} className="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/15 space-y-1">
          <p className="text-[10px] font-medium text-amber-300">If: {ep.condition}</p>
          <p className="text-[10px] text-foreground">Then: {ep.action}</p>
          {ep.agencyName && (
            <p className="text-[10px] text-muted-foreground">
              <Users className="h-2.5 w-2.5 inline mr-1" />
              {ep.agencyName}
              {ep.contactInfo && ` — ${ep.contactInfo}`}
            </p>
          )}
          {ep.deadline && (
            <p className="text-[10px] text-amber-400/80">
              <Clock className="h-2.5 w-2.5 inline mr-1" />
              Deadline: {ep.deadline}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function DocumentsChecklist({ docs }: { docs: string[] | null }) {
  if (!docs || docs.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-primary" />
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Documents You'll Need
        </p>
      </div>
      <div className="space-y-1 pl-6">
        {docs.map((doc, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0 mt-1.5" />
            <p className="text-[10px] text-muted-foreground leading-relaxed">{doc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PracticalTipsSection({ tips, mistakes }: { tips: string[] | null; mistakes: string[] | null }) {
  if ((!tips || tips.length === 0) && (!mistakes || mistakes.length === 0)) return null;
  return (
    <div className="space-y-3">
      {tips && tips.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-emerald-400" />
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Practical Tips
            </p>
          </div>
          <div className="space-y-1 pl-6">
            {tips.map((tip, i) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-muted-foreground leading-relaxed">{tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {mistakes && mistakes.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Common Mistakes to Avoid
            </p>
          </div>
          <div className="space-y-1 pl-6">
            {mistakes.map((m, i) => (
              <div key={i} className="flex items-start gap-2">
                <AlertTriangle className="h-2.5 w-2.5 text-red-400/70 shrink-0 mt-0.5" />
                <p className="text-[10px] text-muted-foreground leading-relaxed">{m}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───

function SingleActionPath({ path, defaultExpanded }: { path: ActionPath; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);

  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardHeader className="p-4 pb-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Gavel className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-semibold text-foreground leading-tight">
              {path.claimLabel}
            </CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-[8px]">{path.jurisdiction}</Badge>
              {path.agencyAcronym && (
                <span className="text-[10px] text-muted-foreground">{path.agencyAcronym}</span>
              )}
            </div>
          </div>
          <div className="shrink-0">
            {expanded
              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground" />
            }
          </div>
        </div>
      </CardHeader>

      {/* Always show deadline and primary action even when collapsed */}
      <CardContent className="px-4 pb-3 pt-0">
        <DeadlineAlert path={path} />

        {!expanded && (
          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              className="text-xs gap-1.5"
              onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
            >
              <ArrowRight className="h-3.5 w-3.5" />
              See Full Filing Path
            </Button>
            {path.formUrl && (
              <a
                href={path.formUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                <Button variant="outline" size="sm" className="text-xs gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open Form
                </Button>
              </a>
            )}
          </div>
        )}

        {expanded && (
          <div className="mt-4 space-y-4">
            {/* Agency */}
            <AgencyCard path={path} />

            {/* Filing form */}
            <FilingForm path={path} />

            {/* Steps */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ArrowRight className="h-4 w-4 text-primary" />
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Step-by-Step: What to Do
                </p>
              </div>
              <StepsTimeline steps={path.steps} />
            </div>

            {/* Timeline expectations */}
            {(path.expectedResponseDescription || path.investigationTimelineDescription) && (
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    What to Expect (Timeline)
                  </p>
                </div>
                {path.expectedResponseDescription && (
                  <div className="pl-6">
                    <p className="text-[10px] font-medium text-foreground">Initial Response</p>
                    <p className="text-[10px] text-muted-foreground">{path.expectedResponseDescription}</p>
                  </div>
                )}
                {path.investigationTimelineDescription && (
                  <div className="pl-6">
                    <p className="text-[10px] font-medium text-foreground">Investigation / Resolution</p>
                    <p className="text-[10px] text-muted-foreground">{path.investigationTimelineDescription}</p>
                  </div>
                )}
              </div>
            )}

            {/* Documents needed */}
            <DocumentsChecklist docs={path.documentsNeeded} />

            {/* Legal references */}
            <LegalReferences path={path} />

            {/* Possible outcomes */}
            {path.possibleOutcomes && path.possibleOutcomes.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-primary" />
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Possible Outcomes
                  </p>
                </div>
                <div className="space-y-1 pl-6">
                  {path.possibleOutcomes.map((o, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${
                        o.likelihood === "common" ? "bg-emerald-400" :
                        o.likelihood === "possible" ? "bg-amber-400" : "bg-muted-foreground/50"
                      }`} />
                      <div>
                        <span className="text-[10px] font-medium text-foreground">{o.outcome}</span>
                        {o.likelihood && (
                          <Badge variant="outline" className="text-[8px] ml-1">{o.likelihood}</Badge>
                        )}
                        <p className="text-[10px] text-muted-foreground">{o.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Practical tips & common mistakes */}
            <PracticalTipsSection tips={path.practicalTips} mistakes={path.commonMistakes} />

            {/* Escalation paths */}
            <EscalationPaths paths={path.escalationPaths} />

            {/* Data source */}
            {path.dataSource && (
              <div className="flex items-center gap-1.5 pt-2 border-t border-border/30">
                <Shield className="h-3 w-3 text-muted-foreground/50" />
                <p className="text-[9px] text-muted-foreground/50">
                  Source: {path.dataSource}
                  {path.lastVerifiedAt && ` | Last verified: ${new Date(path.lastVerifiedAt).toLocaleDateString()}`}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Exported Components ───

/**
 * Shows enforcement action paths for a given pipeline type.
 * Used on the GuidedDashboard immediately after case creation.
 * No documents or analysis needed — this is the bridge from claim → action.
 */
export function EnforcementNextSteps({ pipelineType }: { pipelineType: string }) {
  const { data: paths, isLoading } = trpc.actionPaths.getByPipeline.useQuery(
    { pipelineType },
    { enabled: !!pipelineType }
  );

  if (!pipelineType) return null;
  if (isLoading) {
    return (
      <Card className="border-primary/20">
        <CardContent className="p-4 space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!paths || paths.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
          <ArrowRight className="h-3.5 w-3.5 text-primary" />
        </div>
        <h2 className="text-sm font-semibold text-foreground">Your Next Steps</h2>
        <Badge variant="outline" className="text-[8px] text-primary border-primary/30">
          Action Required
        </Badge>
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed pl-8">
        Based on your situation, here are the concrete steps you can take right now.
        You don't need to upload documents first — these are your filing paths.
      </p>
      {paths.map((path, i) => (
        <SingleActionPath key={path.id} path={path as ActionPath} defaultExpanded={i === 0} />
      ))}
    </div>
  );
}

/**
 * Shows enforcement action paths for a specific case.
 * Resolves the pipeline type from the case and includes related paths.
 */
export function CaseEnforcementNextSteps({ caseId }: { caseId: number }) {
  const { data: paths, isLoading } = trpc.actionPaths.getForCase.useQuery(
    { caseId },
    { enabled: !!caseId }
  );

  if (isLoading) {
    return (
      <Card className="border-primary/20">
        <CardContent className="p-4 space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!paths || paths.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
          <ArrowRight className="h-3.5 w-3.5 text-primary" />
        </div>
        <h2 className="text-sm font-semibold text-foreground">Your Next Steps</h2>
        <Badge variant="outline" className="text-[8px] text-primary border-primary/30">
          Action Required
        </Badge>
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed pl-8">
        Based on your situation, here are the concrete steps you can take right now.
        These are real filing paths — not just information.
      </p>
      {paths.map((path, i) => (
        <SingleActionPath key={path.id} path={path as ActionPath} defaultExpanded={i === 0} />
      ))}
    </div>
  );
}
