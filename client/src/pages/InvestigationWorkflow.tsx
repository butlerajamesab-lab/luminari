import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle, FileText, Users, Clock, Building2, Shield, Zap,
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
        <h1 className="text-2xl font-bold tracking-tight">Investigation Workflow Generator</h1>
        <p className="text-muted-foreground mt-1">
          Generate structured investigation workflows from case context — immediate actions, records to request, witness targets, timeline tasks, agency steps, and risk flags.
        </p>
      </div>

      {/* Input Panel */}
      <Card className="border-0 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Case Context</CardTitle>
          <CardDescription>Provide case parameters to generate a tailored investigation workflow</CardDescription>
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
                  <SelectItem value="EEOC">EEOC</SelectItem>
                  <SelectItem value="HUD">HUD</SelectItem>
                  <SelectItem value="OSHA">OSHA</SelectItem>
                  <SelectItem value="FTC">FTC</SelectItem>
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
                <Zap className="h-4 w-4" /> Generate Workflow
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Generated Workflow */}
      {workflow.isLoading && <p className="text-muted-foreground">Generating investigation workflow...</p>}
      {workflow.data && generated && (
        <div className="space-y-4">
          {/* Metadata Banner */}
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{workflow.data.metadata.weakJointsConsidered} weak joints considered</Badge>
            <Badge variant="outline">{workflow.data.metadata.signalsConsidered} signals considered</Badge>
            <Badge variant="outline">{workflow.data.metadata.contradictionTemplatesConsidered} contradiction templates</Badge>
            <Badge variant="outline">{workflow.data.metadata.barriersConsidered} barriers considered</Badge>
          </div>

          {/* 1. Immediate Actions */}
          <CollapsibleSection title="Immediate Actions" icon={<AlertTriangle className="h-4 w-4 text-red-400" />} count={workflow.data.workflow.immediateActions.length}>
            <div className="space-y-2">
              {workflow.data.workflow.immediateActions.map((a: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/20">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${a.priority === 1 ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"}`}>
                    {a.priority}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{a.action}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{a.reason}</p>
                    <Badge variant="outline" className="text-xs mt-1"><Clock className="h-3 w-3 mr-1" />{a.deadline}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          {/* 2. Records to Request */}
          <CollapsibleSection title="Records to Request" icon={<FileText className="h-4 w-4 text-blue-400" />} count={workflow.data.workflow.recordsToRequest.length} defaultOpen={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-muted-foreground">
                    <th className="text-left py-2 pr-3">Source</th>
                    <th className="text-left py-2 px-3">Record Type</th>
                    <th className="text-left py-2 px-3">Reason</th>
                    <th className="text-left py-2 pl-3">Method</th>
                  </tr>
                </thead>
                <tbody>
                  {workflow.data.workflow.recordsToRequest.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-border/20">
                      <td className="py-2 pr-3 font-medium">{r.source}</td>
                      <td className="py-2 px-3">{r.recordType}</td>
                      <td className="py-2 px-3 text-muted-foreground">{r.reason}</td>
                      <td className="py-2 pl-3"><Badge variant="outline" className="text-xs">{r.method}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>

          {/* 3. Witness Targets */}
          <CollapsibleSection title="Witness Targets" icon={<Users className="h-4 w-4 text-purple-400" />} count={workflow.data.workflow.witnessTargets.length} defaultOpen={false}>
            <div className="space-y-2">
              {workflow.data.workflow.witnessTargets.map((w: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/20">
                  <Users className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">{w.category}</p>
                    <p className="text-xs text-muted-foreground">{w.description}</p>
                    <p className="text-xs text-purple-400/80 mt-0.5">{w.purpose}</p>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          {/* 4. Timeline Tasks */}
          <CollapsibleSection title="Investigation Timeline" icon={<Clock className="h-4 w-4 text-cyan-400" />} count={workflow.data.workflow.timelineTasks.length} defaultOpen={false}>
            <div className="space-y-0">
              {workflow.data.workflow.timelineTasks.map((t: any, i: number) => (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-cyan-500/30 border border-cyan-500/50 shrink-0 mt-1.5" />
                    {i < workflow.data!.workflow.timelineTasks.length - 1 && <div className="w-px flex-1 bg-border/50 my-1" />}
                  </div>
                  <div className="pb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{t.phase}</Badge>
                      <span className="text-xs text-muted-foreground">{t.duration}</span>
                    </div>
                    <p className="text-sm mt-0.5">{t.task}</p>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          {/* 5. Agency Steps */}
          {workflow.data.workflow.agencySteps.length > 0 && (
            <CollapsibleSection title="Agency Filing Steps" icon={<Building2 className="h-4 w-4 text-amber-400" />} count={workflow.data.workflow.agencySteps.length} defaultOpen={false}>
              <div className="space-y-2">
                {workflow.data.workflow.agencySteps.map((s: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/20">
                    <Badge variant="outline" className="text-xs shrink-0">{s.agency}</Badge>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{s.step}</p>
                      <p className="text-xs text-amber-400/80 mt-0.5">Deadline: {s.deadline}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* 6. Risk Flags */}
          {workflow.data.workflow.riskFlags.length > 0 && (
            <CollapsibleSection title="Risk Flags" icon={<Shield className="h-4 w-4 text-red-400" />} count={workflow.data.workflow.riskFlags.length} defaultOpen={false}>
              <div className="space-y-2">
                {workflow.data.workflow.riskFlags.map((r: any, i: number) => (
                  <div key={i} className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs bg-red-500/10 text-red-400 border-red-500/30">{r.type}</Badge>
                    </div>
                    <p className="text-sm">{r.flag}</p>
                    <p className="text-xs text-muted-foreground mt-1">Mitigation: {r.mitigation}</p>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* 7. Signal Watch List */}
          {workflow.data.workflow.signalWatchList.length > 0 && (
            <CollapsibleSection title="Signal Watch List" icon={<Eye className="h-4 w-4 text-emerald-400" />} count={workflow.data.workflow.signalWatchList.length} defaultOpen={false}>
              <div className="space-y-2">
                {workflow.data.workflow.signalWatchList.map((s: any, i: number) => (
                  <div key={i} className="p-3 rounded-lg bg-muted/30 border border-border/20">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{s.signalType.replace(/_/g, " ")}</span>
                      <Badge variant="outline" className={`text-xs ${severityBadge[s.severity]}`}>{s.severity}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(s.triggerPatterns as string[])?.slice(0, 4).map((p: string, j: number) => (
                        <Badge key={j} variant="outline" className="text-xs">{p}</Badge>
                      ))}
                    </div>
                    {s.nextSteps && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Next: {(s.nextSteps as string[]).join(" → ")}
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
