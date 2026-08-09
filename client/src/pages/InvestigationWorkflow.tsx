import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle, FileText, Clock, Building2, Shield, Zap,
  ChevronDown, ChevronUp, Eye, ArrowLeft, Wrench
} from "lucide-react";
import { useLocation } from "wouter";

const severityBadge: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/30",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
};

function CollapsibleSection({ title, icon, count, children, defaultOpen = true }: {
  title: string; icon: React.ReactNode; count: number; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="border-0 bg-card/50">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4 hover:bg-muted/20 transition-colors">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-semibold">{title}</h3>
          <Badge variant="outline" className="text-xs">{count}</Badge>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <CardContent className="pt-0 pb-4">{children}</CardContent>}
    </Card>
  );
}

export default function InvestigationWorkflow() {
  const [domain, setDomain] = useState("civil_rights");
  const [claimType, setClaimType] = useState("");
  const [agencyShort, setAgencyShort] = useState("");
  const [incidentDate, setIncidentDate] = useState("");
  const [hasDocuments, setHasDocuments] = useState(false);
  const [hasWitnesses, setHasWitnesses] = useState(false);
  const [generated, setGenerated] = useState(false);
  const agencies = trpc.enforcementIntel.listAgencies.useQuery();

  const queryInput = useMemo(() => ({
    domain,
    claimType: claimType || undefined,
    agencyShort: agencyShort || undefined,
    incidentDate: incidentDate || undefined,
    hasDocuments,
    hasWitnesses,
  }), [domain, claimType, agencyShort, incidentDate, hasDocuments, hasWitnesses]);

  const workflow = trpc.enforcementIntel.generateInvestigationWorkflow.useQuery(queryInput, { enabled: generated });

  const [, navigate] = useLocation();
  return (
    <div className="space-y-6">
      {/* Back nav */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate("/architecture")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Architecture Map
        </button>
        <button onClick={() => navigate("/workshop?from=Investigation+Workflow&layer=%2Finvestigation-workflow")} className="flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300 transition-colors">
          <Wrench className="h-3.5 w-3.5" /> Open in Workshop
        </button>
      </div>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Investigation Workflow</h1>
        <p className="text-muted-foreground mt-1">
          Load deterministic workflow steps and supporting records from the live source registries.
        </p>
      </div>

      {/* Input Panel */}
      <Card className="border-0 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Case Context</CardTitle>
          <CardDescription>Choose the exact source context to load; unsupported sections remain explicitly unavailable.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Domain</Label>
              <Select value={domain} onValueChange={v => { setDomain(v); setGenerated(false); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["criminal_justice", "civil_rights", "employment", "housing", "consumer", "benefits", "disability", "foia", "immigration", "family"].map(d => (
                    <SelectItem key={d} value={d}>{d.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Claim Type (optional)</Label>
              <Input placeholder="e.g., discrimination, retaliation" value={claimType} onChange={e => { setClaimType(e.target.value); setGenerated(false); }} />
            </div>

            <div className="space-y-2">
              <Label>Agency (optional)</Label>
              <Select value={agencyShort || "none"} onValueChange={v => { setAgencyShort(v === "none" ? "" : v); setGenerated(false); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {agencies.data?.map((a) => (
                    <SelectItem key={a.id} value={a.agencyShort}>
                      {a.agencyName}{a.agencyShort ? ` (${a.agencyShort})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Incident Date (optional)</Label>
              <Input type="date" value={incidentDate} onChange={e => { setIncidentDate(e.target.value); setGenerated(false); }} />
            </div>

            <div className="flex items-center gap-6 pt-6">
              <div className="flex items-center gap-2">
                <Switch checked={hasDocuments} onCheckedChange={v => { setHasDocuments(v); setGenerated(false); }} />
                <Label className="text-sm">Has documents</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={hasWitnesses} onCheckedChange={v => { setHasWitnesses(v); setGenerated(false); }} />
                <Label className="text-sm">Has witnesses</Label>
              </div>
            </div>

            <div className="flex items-end">
              <Button onClick={() => setGenerated(true)} className="w-full gap-2">
                <Zap className="h-4 w-4" /> Load Source Workflow
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Source workflow */}
      {workflow.isLoading && <p className="text-muted-foreground">Loading source workflow...</p>}
      {workflow.error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-4 text-sm text-red-300">
            The source workflow could not be loaded: {workflow.error.message}
          </CardContent>
        </Card>
      )}

      {workflow.data && generated && workflow.data.availability.status === "unavailable" && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Source-bound workflow unavailable
            </CardTitle>
            <CardDescription>{workflow.data.availability.reason}</CardDescription>
          </CardHeader>
          {workflow.data.availableWorkflows.length > 0 && (
            <CardContent className="pt-0">
              <p className="mb-2 text-xs text-muted-foreground">
                Available source workflows and their exact claim keys:
              </p>
              <div className="space-y-2">
                {workflow.data.availableWorkflows.map(sourceWorkflow => (
                  <div key={sourceWorkflow.id} className="rounded-md border border-border/30 bg-muted/20 p-3">
                    <p className="text-sm font-medium">{sourceWorkflow.title}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {sourceWorkflow.issueTypes.map(issueType => (
                        <Badge key={issueType} variant="outline" className="text-xs">{issueType}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {workflow.data && generated && workflow.data.availability.status === "available" && (
        <div className="space-y-4">
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="p-4">
              <p className="text-sm font-medium">{workflow.data.selectedWorkflow?.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Live source: workflow_master / workflow_steps
                {workflow.data.selectedWorkflow?.primaryAgency
                  ? ` · ${workflow.data.selectedWorkflow.primaryAgency}`
                  : ""}
              </p>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{workflow.data.metadata.weakJointsConsidered} weak joints considered</Badge>
            <Badge variant="outline">{workflow.data.metadata.signalsConsidered} signals considered</Badge>
            <Badge variant="outline">{workflow.data.metadata.contradictionTemplatesConsidered} contradiction templates</Badge>
            <Badge variant="outline">{workflow.data.metadata.proofFrameworksConsidered} proof frameworks</Badge>
            <Badge variant="outline">{workflow.data.metadata.barriersConsidered} barriers considered</Badge>
            <Badge variant="outline">{workflow.data.metadata.claimElementsConsidered} claim elements</Badge>
          </div>

          {workflow.data.workflow.immediateActions.length > 0 && (
            <CollapsibleSection title="Source Eligibility Steps" icon={<AlertTriangle className="h-4 w-4 text-amber-400" />} count={workflow.data.workflow.immediateActions.length}>
              <div className="space-y-2">
                {workflow.data.workflow.immediateActions.map((action, index) => (
                  <div key={index} className="flex items-start gap-3 rounded-lg border border-border/20 bg-muted/30 p-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-xs font-bold text-amber-400">
                      {action.priority}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{action.action}</p>
                      {action.reason && <p className="mt-0.5 text-xs text-muted-foreground">{action.reason}</p>}
                      <Badge variant="outline" className="mt-1 text-xs">
                        <Clock className="mr-1 h-3 w-3" />
                        {action.deadlineText ?? "Deadline unavailable in source"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {workflow.data.workflow.recordsToRequest.length > 0 && (
            <CollapsibleSection title="Source Evidence Inputs" icon={<FileText className="h-4 w-4 text-blue-400" />} count={workflow.data.workflow.recordsToRequest.length} defaultOpen={false}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-muted-foreground">
                      <th className="py-2 pr-3 text-left">Source</th>
                      <th className="px-3 py-2 text-left">Evidence type</th>
                      <th className="py-2 pl-3 text-left">Source description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workflow.data.workflow.recordsToRequest.map((record, index) => (
                      <tr key={index} className="border-b border-border/20">
                        <td className="py-2 pr-3 font-medium">{record.source}</td>
                        <td className="px-3 py-2">{record.recordType}</td>
                        <td className="py-2 pl-3 text-muted-foreground">{record.reason ?? "Not specified in source"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>
          )}

          {workflow.data.workflow.timelineTasks.length > 0 && (
            <CollapsibleSection title="Source Workflow Steps" icon={<Clock className="h-4 w-4 text-cyan-400" />} count={workflow.data.workflow.timelineTasks.length} defaultOpen={false}>
              <div className="space-y-0">
                {workflow.data.workflow.timelineTasks.map((task, index) => (
                  <div key={index} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="mt-1.5 h-3 w-3 shrink-0 rounded-full border border-cyan-500/50 bg-cyan-500/30" />
                      {index < workflow.data.workflow.timelineTasks.length - 1 && <div className="my-1 w-px flex-1 bg-border/50" />}
                    </div>
                    <div className="pb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-xs">{task.phase}</Badge>
                        {task.durationText && <span className="text-xs text-muted-foreground">{task.durationText}</span>}
                      </div>
                      <p className="mt-0.5 text-sm">{task.task}</p>
                      {task.description && <p className="mt-0.5 text-xs text-muted-foreground">{task.description}</p>}
                      {task.deadlineText && (
                        <p className="mt-1 text-xs text-amber-300">Source deadline text: {task.deadlineText}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {workflow.data.workflow.agencySteps.length > 0 && (
            <CollapsibleSection title="Source Agency Steps" icon={<Building2 className="h-4 w-4 text-amber-400" />} count={workflow.data.workflow.agencySteps.length} defaultOpen={false}>
              <div className="space-y-2">
                {workflow.data.workflow.agencySteps.map((step, index) => (
                  <div key={index} className="flex items-start gap-3 rounded-lg border border-border/20 bg-muted/30 p-3">
                    {step.agency && <Badge variant="outline" className="shrink-0 text-xs">{step.agency}</Badge>}
                    <div className="flex-1">
                      <p className="text-sm font-medium">{step.step}</p>
                      {step.description && <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>}
                      <p className="mt-1 text-xs text-amber-300">
                        {step.deadlineText
                          ? `Source deadline text: ${step.deadlineText}`
                          : "Deadline unavailable in source"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {workflow.data.deadlineSources.length > 0 && (
            <CollapsibleSection title="Agency Deadline Sources" icon={<Building2 className="h-4 w-4 text-amber-400" />} count={workflow.data.deadlineSources.length} defaultOpen={false}>
              <div className="space-y-2">
                {workflow.data.deadlineSources.map(deadline => (
                  <div key={deadline.formId} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{deadline.formName}</p>
                      {deadline.agencyShort && <Badge variant="outline" className="text-xs">{deadline.agencyShort}</Badge>}
                      <Badge variant="outline" className="text-xs">source text only</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{deadline.filingDeadlineText}</p>
                    {deadline.sourceUrl && (
                      <a className="mt-2 inline-block text-xs text-cyan-400 hover:text-cyan-300" href={deadline.sourceUrl} target="_blank" rel="noreferrer">
                        Open source
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="space-y-2 p-4 text-xs text-muted-foreground">
              <p>{workflow.data.sectionAvailability.deadlineCalculations.reason}</p>
              <p>{workflow.data.sectionAvailability.witnessTargets.reason}</p>
            </CardContent>
          </Card>

          {workflow.data.workflow.riskFlags.length > 0 && (
            <CollapsibleSection title="Source Risk Flags" icon={<Shield className="h-4 w-4 text-red-400" />} count={workflow.data.workflow.riskFlags.length} defaultOpen={false}>
              <div className="space-y-2">
                {workflow.data.workflow.riskFlags.map((risk, index) => (
                  <div key={index} className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-xs text-red-400">{risk.type}</Badge>
                      {risk.severity && <Badge variant="outline" className="text-xs">{risk.severity}</Badge>}
                    </div>
                    <p className="text-sm">{risk.flag}</p>
                    {risk.mitigation && <p className="mt-1 text-xs text-muted-foreground">Source note: {risk.mitigation}</p>}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {workflow.data.workflow.signalWatchList.length > 0 && (
            <CollapsibleSection title="Signal Watch List" icon={<Eye className="h-4 w-4 text-emerald-400" />} count={workflow.data.workflow.signalWatchList.length} defaultOpen={false}>
              <div className="space-y-2">
                {workflow.data.workflow.signalWatchList.map((signal, index) => (
                  <div key={index} className="rounded-lg border border-border/20 bg-muted/30 p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-sm font-medium">{signal.signalType.replace(/_/g, " ")}</span>
                      <Badge variant="outline" className={`text-xs ${severityBadge[signal.severity] ?? ""}`}>{signal.severity}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {signal.triggerPatterns.slice(0, 4).map(pattern => (
                        <Badge key={pattern} variant="outline" className="text-xs">{pattern}</Badge>
                      ))}
                    </div>
                    {signal.nextSteps.length > 0 && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Source next steps: {signal.nextSteps.join(" → ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}
        </div>
      )}
    </div>
  );
}
