import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, CheckCircle2, AlertTriangle, Clock, ChevronDown, ChevronUp, ClipboardList, FileCheck, Send } from "lucide-react";


/* ─── types ─── */
interface FilingTemplate {
  id: number;
  agency: string;
  agencyShort: string;
  claimType: string;
  formName: string;
  formNumber: string;
  filingDeadline: string;
  filingLink: string | null;
  requiredFields: string[];
  requiredEvidence: string[];
  recommendedAttachments: string[] | null;
  submissionMethods: string[];
  expectedTimeline: string | null;
  intakeWarnings: string[] | null;
  priorityFlags: string[] | null;
  nextSteps: string[] | null;
  pipelineCategory: string;
  notes: string | null;
}

/* ─── Filing Template Card ─── */
function FilingTemplateCard({ template }: { template: FilingTemplate }) {
  const [expanded, setExpanded] = useState(false);
  const [checkedFields, setCheckedFields] = useState<Set<number>>(new Set());
  const [checkedEvidence, setCheckedEvidence] = useState<Set<number>>(new Set());

  const requiredFields = template.requiredFields ?? [];
  const requiredEvidence = template.requiredEvidence ?? [];
  const recommendedAttachments = template.recommendedAttachments ?? [];
  const nextSteps = template.nextSteps ?? [];
  const submissionMethods = template.submissionMethods ?? [];
  const intakeWarnings = template.intakeWarnings ?? [];

  const fieldProgress = requiredFields.length > 0 ? (checkedFields.size / requiredFields.length) * 100 : 0;
  const evidenceProgress = requiredEvidence.length > 0 ? (checkedEvidence.size / requiredEvidence.length) * 100 : 0;
  const overallProgress = (fieldProgress + evidenceProgress) / 2;

  const toggleField = (idx: number) => {
    setCheckedFields(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleEvidence = (idx: number) => {
    setCheckedEvidence(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <Card className="border-white/10">
      <CardHeader className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base text-white">{template.formName}</CardTitle>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className="text-xs">{template.agency}</Badge>
                <Badge variant="outline" className="text-xs text-amber-400 border-amber-400/30">{template.claimType}</Badge>
                {template.formNumber && (
                  <span className="text-xs text-muted-foreground">Form {template.formNumber}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {template.filingDeadline}
              </div>
              {expanded && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {Math.round(overallProgress)}% ready
                </div>
              )}
            </div>
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>

        {/* Progress bar */}
        {expanded && (
          <div className="mt-3 h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-4">
          {/* Required Fields Checklist */}
          {requiredFields.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <ClipboardList className="h-3 w-3" />
                Required Fields ({checkedFields.size}/{requiredFields.length})
              </h4>
              <div className="space-y-1">
                {requiredFields.map((field, i) => (
                  <label key={i} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-white/5 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={checkedFields.has(i)}
                      onChange={() => toggleField(i)}
                      className="rounded border-white/20"
                    />
                    <span className={checkedFields.has(i) ? "text-white/50 line-through" : "text-white/80"}>{field}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Required Evidence Checklist */}
          {requiredEvidence.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <FileCheck className="h-3 w-3" />
                Required Evidence ({checkedEvidence.size}/{requiredEvidence.length})
              </h4>
              <div className="space-y-1">
                {requiredEvidence.map((ev, i) => (
                  <label key={i} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-white/5 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={checkedEvidence.has(i)}
                      onChange={() => toggleEvidence(i)}
                      className="rounded border-white/20"
                    />
                    <span className={checkedEvidence.has(i) ? "text-white/50 line-through" : "text-white/80"}>{ev}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Recommended Attachments */}
          {recommendedAttachments.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Recommended Attachments</h4>
              <div className="flex flex-wrap gap-1.5">
                {recommendedAttachments.map((att, i) => (
                  <Badge key={i} variant="outline" className="text-xs text-white/60">{att}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Next Steps */}
          {nextSteps.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Next Steps</h4>
              <ol className="space-y-1.5 list-none">
                {nextSteps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/10 text-blue-400 text-xs flex items-center justify-center font-medium mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-white/80">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Intake Warnings */}
          {intakeWarnings.length > 0 && (
            <div>
              {intakeWarnings.map((warn, i) => (
                <div key={i} className="flex items-start gap-2 text-sm p-2 rounded bg-amber-500/5 border border-amber-500/10 mb-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                  <span className="text-amber-200/80">{warn}</span>
                </div>
              ))}
            </div>
          )}

          {/* Submission Methods */}
          {submissionMethods.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <Send className="h-3 w-3" />
                Submission Methods
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {submissionMethods.map((method, i) => (
                  <Badge key={i} variant="outline" className="text-xs text-emerald-400 border-emerald-400/30">{method}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {template.notes && (
            <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-200/80">{template.notes}</p>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

/* ─── Main Page ─── */
export default function FilingGenerator() {
  const [agencyFilter, setAgencyFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");


  const { data: templates, isLoading } = trpc.architectureMap.listFilingTemplates.useQuery(
    agencyFilter !== "all" || categoryFilter !== "all"
      ? {
          ...(agencyFilter !== "all" ? { agencyShort: agencyFilter } : {}),
          ...(categoryFilter !== "all" ? { pipelineCategory: categoryFilter } : {}),
        }
      : undefined
  );

  // Extract unique agencies and categories for filters
  const { data: allTemplates } = trpc.architectureMap.listFilingTemplates.useQuery();
  const agencies = useMemo(() => {
    if (!allTemplates) return [];
    const set = new Set(allTemplates.map((t: any) => t.agencyShort));
    return Array.from(set).sort();
  }, [allTemplates]);

  const categories = useMemo(() => {
    if (!allTemplates) return [];
    const set = new Set(allTemplates.map((t: any) => t.pipelineCategory));
    return Array.from(set).sort();
  }, [allTemplates]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-64 bg-white/5 rounded animate-pulse" />
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 bg-white/5 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <FileText className="h-6 w-6 text-blue-400" />
          <h1 className="text-2xl font-bold text-white">Filing Generator</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Agency complaint filing templates with required fields, evidence checklists, step-by-step filing instructions, and submission methods.
          Check off items as you gather them to track readiness.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={agencyFilter} onValueChange={setAgencyFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Agencies" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agencies</SelectItem>
            {agencies.map(a => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />
        <Badge variant="outline" className="text-xs">
          {templates?.length ?? 0} templates
        </Badge>
      </div>

      {/* Templates */}
      <div className="space-y-3">
        {templates && templates.length > 0 ? (
          templates.map((template: any) => (
            <FilingTemplateCard key={template.id} template={template} />
          ))
        ) : (
          <Card className="border-white/10">
            <CardContent className="p-8 text-center">
              <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">No filing templates found for the selected filters.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
