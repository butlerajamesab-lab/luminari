import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useInterfaceStore } from "@/store/interfaceStore";
import { matchJurisdiction } from "@/utils/jurisdiction-matcher";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Terminal, Globe, Clock, GitBranch, Workflow, Shield,
  AlertTriangle, Search, ChevronRight, Layers, Scale,
  Timer, Target, FileCheck, ArrowRight, CheckCircle2,
  XCircle, BarChart3, Zap
} from "lucide-react";

export default function CommandBoard() {
  const [activeTab, setActiveTab] = useState("simulator");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Terminal className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Command Board</h1>
          <p className="text-sm text-muted-foreground">
            Procedural Engine — Jurisdiction Hierarchy, Timeline Law, Workflow Orchestration
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 h-10">
          <TabsTrigger value="simulator" className="text-xs sm:text-sm">
            <Zap className="h-3.5 w-3.5 mr-1.5" /> Simulator
          </TabsTrigger>
          <TabsTrigger value="jurisdictions" className="text-xs sm:text-sm">
            <Globe className="h-3.5 w-3.5 mr-1.5" /> Jurisdictions
          </TabsTrigger>
          <TabsTrigger value="timeline" className="text-xs sm:text-sm">
            <Clock className="h-3.5 w-3.5 mr-1.5" /> Timeline Law
          </TabsTrigger>
          <TabsTrigger value="workflows" className="text-xs sm:text-sm">
            <Workflow className="h-3.5 w-3.5 mr-1.5" /> Workflows
          </TabsTrigger>
        </TabsList>

        <TabsContent value="simulator"><SimulatorTab /></TabsContent>
        <TabsContent value="jurisdictions"><JurisdictionsTab /></TabsContent>
        <TabsContent value="timeline"><TimelineTab /></TabsContent>
        <TabsContent value="workflows"><WorkflowsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function SimulatorTab() {
  const stats = trpc.proceduralEngine.getProceduralStats.useQuery();

  const statCards = useMemo(() => {
    if (!stats.data) return [];
    return [
      { label: "Jurisdictions", value: stats.data.jurisdictions, icon: Globe, color: "text-blue-500" },
      { label: "Node Timelines", value: stats.data.nodeTimelines, icon: GitBranch, color: "text-purple-500" },
      { label: "Timeline Events", value: stats.data.timelineEvents, icon: Clock, color: "text-amber-500" },
      { label: "Timeline Edges", value: stats.data.timelineEdges, icon: ArrowRight, color: "text-cyan-500" },
      { label: "Workflows", value: stats.data.workflows, icon: Workflow, color: "text-green-500" },
      { label: "Workflow Steps", value: stats.data.workflowSteps, icon: Layers, color: "text-emerald-500" },
      { label: "Evidence Profiles", value: stats.data.evidenceProfiles, icon: Shield, color: "text-indigo-500" },
      { label: "Escalation Routes", value: stats.data.escalationRoutes, icon: AlertTriangle, color: "text-orange-500" },
      { label: "Deadline Rules", value: stats.data.deadlineRules, icon: Timer, color: "text-red-500" },
      { label: "Weak Joint Triggers", value: stats.data.weakJointTriggers, icon: Target, color: "text-rose-500" },
      { label: "Detection Rules", value: stats.data.claimDetectionRules, icon: FileCheck, color: "text-teal-500" },
    ];
  }, [stats.data]);

  return (
    <div className="space-y-6 mt-4">
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Procedural Engine Coverage
          </CardTitle>
          <CardDescription>Real-time data counts across the procedural engine's 11 core tables</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 11 }).map((_, i) => (
                <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {statCards.map((s) => (
                <div key={s.label} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                  <s.icon className={`h-5 w-5 ${s.color} shrink-0`} />
                  <div className="min-w-0">
                    <div className="text-xl font-bold tabular-nums">{Number(s.value).toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground truncate">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Claim Viability Pipeline
          </CardTitle>
          <CardDescription>The 8-stage pipeline from fact extraction to viability assessment</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { stage: 1, name: "Fact Extraction", desc: "Extract facts from case documents", table: "fact_claims" },
              { stage: 2, name: "Claim Detection", desc: "Match fact patterns to claim types", table: "claim_detection_results" },
              { stage: 3, name: "SOL Check", desc: "Verify statute of limitations", table: "deadline_rules" },
              { stage: 4, name: "Element Evaluation", desc: "Score each claim element", table: "element_strength" },
              { stage: 5, name: "Proof Framework", desc: "Map evidence to proof requirements", table: "evidence_records" },
              { stage: 6, name: "Contradiction Detection", desc: "Identify internal contradictions", table: "contradiction_scores" },
              { stage: 7, name: "Weak Joint Analysis", desc: "Detect systemic vulnerabilities", table: "weak_joint_hits" },
              { stage: 8, name: "Viability Assessment", desc: "Final claim viability score", table: "claim_viability" },
            ].map((p) => (
              <div key={p.stage} className="relative p-3 rounded-lg border bg-card hover:border-primary/30 transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-bold">{p.stage}</span>
                  <span className="text-sm font-medium">{p.name}</span>
                </div>
                <p className="text-xs text-muted-foreground">{p.desc}</p>
                <code className="text-[10px] text-muted-foreground/60 mt-1 block">{p.table}</code>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function JurisdictionsTab() {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const { searchQuery, setSearchQuery, setActiveJurisdiction, setIsSovereign, setIsProcessing } = useInterfaceStore();
  const jurisdictions = trpc.proceduralEngine.listJurisdictions.useQuery(
    typeFilter !== "all" ? { type: typeFilter as any } : undefined
  );

  // Wire jurisdiction matching to store
  useEffect(() => {
    if (!searchQuery) {
      setIsProcessing(false);
      setActiveJurisdiction(null);
      setIsSovereign(false);
      return;
    }

    // Set processing state while matching
    setIsProcessing(true);
    
    // Simulate minimal processing time for UI feedback
    const timer = setTimeout(() => {
      const match = matchJurisdiction(searchQuery);
      if (match) {
        setActiveJurisdiction(match.id);
        setIsSovereign(match.isSovereign);
      } else {
        setActiveJurisdiction(null);
        setIsSovereign(false);
      }
      setIsProcessing(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, setActiveJurisdiction, setIsSovereign, setIsProcessing]);

  const filtered = useMemo(() => {
    if (!jurisdictions.data) return [];
    if (!searchQuery) return jurisdictions.data;
    const q = searchQuery.toLowerCase();
    return jurisdictions.data.filter((j: any) => j.name.toLowerCase().includes(q) || j.type.toLowerCase().includes(q));
  }, [jurisdictions.data, searchQuery]);

  const typeColors: Record<string, string> = {
    federal: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    state: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    county: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    city: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    tribal: "bg-rose-500/10 text-rose-500 border-rose-500/20",
    territory: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 focus-within:outline focus-within:outline-2 focus-within:outline-blue-500 focus-within:outline-offset-2 rounded transition-all duration-150 ease-in-out">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search jurisdictions..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter by type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="federal">Federal</SelectItem>
            <SelectItem value="state">State</SelectItem>
            <SelectItem value="county">County</SelectItem>
            <SelectItem value="city">City</SelectItem>
            <SelectItem value="tribal">Tribal</SelectItem>
            <SelectItem value="territory">Territory</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {jurisdictions.isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="py-12 text-center">
          <Globe className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No jurisdictions found</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((j: any) => <JurisdictionCard key={j.id} jurisdiction={j} typeColors={typeColors} />)}
        </div>
      )}
    </div>
  );
}

function JurisdictionCard({ jurisdiction: j, typeColors }: { jurisdiction: any; typeColors: Record<string, string> }) {
  const [expanded, setExpanded] = useState(false);
  const preemption = j.preemptionRules as any;
  const override = j.overrideRules as any;
  const agencies = j.agencies as string[] | null;

  return (
    <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setExpanded(!expanded)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <ChevronRight className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{j.name}</span>
                <Badge variant="outline" className={`text-[10px] ${typeColors[j.type] || ""}`}>{j.type}</Badge>
                <Badge variant="outline" className="text-[10px]">Level {j.level}</Badge>
              </div>
              {agencies && agencies.length > 0 && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {agencies.map((a: string) => <Badge key={a} variant="secondary" className="text-[10px]">{a}</Badge>)}
                </div>
              )}
            </div>
          </div>
          <Badge variant={j.status === "active" ? "default" : "secondary"} className="text-[10px] shrink-0">{j.status}</Badge>
        </div>
        {expanded && (
          <div className="mt-4 pt-3 border-t space-y-3 text-sm">
            {preemption && (
              <div>
                <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Preemption Rules</span>
                <pre className="mt-1 p-2 rounded bg-muted text-xs overflow-x-auto whitespace-pre-wrap">
                  {typeof preemption === "string" ? preemption : JSON.stringify(preemption, null, 2)}
                </pre>
              </div>
            )}
            {override && (
              <div>
                <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Override Rules</span>
                <pre className="mt-1 p-2 rounded bg-muted text-xs overflow-x-auto whitespace-pre-wrap">
                  {typeof override === "string" ? override : JSON.stringify(override, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TimelineTab() {
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const events = trpc.proceduralEngine.listTimelineEvents.useQuery(
    eventTypeFilter !== "all" ? { eventType: eventTypeFilter as any } : undefined
  );
  const edges = trpc.proceduralEngine.getTimelineEdges.useQuery();
  const nodes = trpc.proceduralEngine.listNodeTimeline.useQuery();

  const eventTypeColors: Record<string, string> = {
    court_decision: "bg-blue-500/10 text-blue-500",
    statute_enactment: "bg-emerald-500/10 text-emerald-500",
    statute_amendment: "bg-amber-500/10 text-amber-500",
    regulation_change: "bg-purple-500/10 text-purple-500",
    agency_guidance: "bg-cyan-500/10 text-cyan-500",
    doctrine_shift: "bg-rose-500/10 text-rose-500",
    executive_order: "bg-orange-500/10 text-orange-500",
    legislative_action: "bg-indigo-500/10 text-indigo-500",
  };

  return (
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-2xl font-bold">{events.data?.length ?? "—"}</div>
          <div className="text-xs text-muted-foreground">Timeline Events</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">{nodes.data?.length ?? "—"}</div>
          <div className="text-xs text-muted-foreground">Node Timelines</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">{edges.data?.length ?? "—"}</div>
          <div className="text-xs text-muted-foreground">Timeline Edges</div>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Timeline Events</CardTitle>
            <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filter by type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="court_decision">Court Decision</SelectItem>
                <SelectItem value="statute_enactment">Statute Enactment</SelectItem>
                <SelectItem value="statute_amendment">Statute Amendment</SelectItem>
                <SelectItem value="regulation_change">Regulation Change</SelectItem>
                <SelectItem value="agency_guidance">Agency Guidance</SelectItem>
                <SelectItem value="doctrine_shift">Doctrine Shift</SelectItem>
                <SelectItem value="executive_order">Executive Order</SelectItem>
                <SelectItem value="legislative_action">Legislative Action</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {events.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 rounded bg-muted animate-pulse" />)}</div>
          ) : !events.data?.length ? (
            <p className="text-center text-muted-foreground py-8">No timeline events found</p>
          ) : (
            <div className="space-y-2">
              {events.data.map((e: any) => (
                <div key={e.id} className="flex items-start gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                  <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{e.title}</span>
                      <Badge variant="outline" className={`text-[10px] ${eventTypeColors[e.eventType] || ""}`}>{e.eventType.replace(/_/g, " ")}</Badge>
                    </div>
                    {e.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{e.description}</p>}
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                      {e.jurisdiction && <span>{e.jurisdiction}</span>}
                      {e.domain && <span>{e.domain}</span>}
                      {e.date && <span>{new Date(e.date).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {edges.data && edges.data.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Timeline Edges</CardTitle>
            <CardDescription>Relationships between legal nodes over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {edges.data.map((e: any) => (
                <div key={e.id} className="flex items-center gap-2 p-2 rounded border text-sm">
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{e.sourceNode}</code>
                  <Badge variant="outline" className="text-[10px]">{e.relationshipType}</Badge>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{e.targetNode}</code>
                  {e.effectiveDate && <span className="text-[10px] text-muted-foreground ml-auto">{new Date(e.effectiveDate).toLocaleDateString()}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function WorkflowsTab() {
  const [selectedWorkflow, setSelectedWorkflow] = useState<number | null>(null);
  const workflows = trpc.proceduralEngine.listWorkflows.useQuery();
  const workflowDetail = trpc.proceduralEngine.getWorkflow.useQuery({ id: selectedWorkflow! }, { enabled: selectedWorkflow !== null });
  const deadlineRules = trpc.proceduralEngine.listDeadlineRules.useQuery();
  const detectionRules = trpc.proceduralEngine.listClaimDetectionRules.useQuery();

  const statusColors: Record<string, string> = {
    active: "bg-green-500/10 text-green-500",
    draft: "bg-amber-500/10 text-amber-500",
    deprecated: "bg-red-500/10 text-red-500",
    archived: "bg-gray-500/10 text-gray-500",
  };

  return (
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-2xl font-bold">{workflows.data?.length ?? "—"}</div>
          <div className="text-xs text-muted-foreground">Workflows</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">{deadlineRules.data?.length ?? "—"}</div>
          <div className="text-xs text-muted-foreground">Deadline Rules</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">{detectionRules.data?.length ?? "—"}</div>
          <div className="text-xs text-muted-foreground">Detection Rules</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3"><CardTitle className="text-lg">Workflow Library</CardTitle></CardHeader>
          <CardContent className="p-0">
            {workflows.isLoading ? (
              <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded bg-muted animate-pulse" />)}</div>
            ) : (
              <div className="divide-y">
                {workflows.data?.map((w: any) => (
                  <button key={w.id} onClick={() => setSelectedWorkflow(w.id)} className={`w-full text-left p-3 hover:bg-accent/50 transition-colors ${selectedWorkflow === w.id ? "bg-accent" : ""}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{w.title}</span>
                      <Badge variant="outline" className={`text-[10px] ${statusColors[w.status] || ""}`}>{w.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{w.domain} — {w.jurisdiction}</div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{workflowDetail.data ? workflowDetail.data.title : "Select a Workflow"}</CardTitle>
            {workflowDetail.data && <CardDescription>{workflowDetail.data.domain} — {workflowDetail.data.jurisdiction}</CardDescription>}
          </CardHeader>
          <CardContent>
            {!selectedWorkflow ? (
              <div className="text-center py-12 text-muted-foreground">
                <Workflow className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>Select a workflow from the list to view its steps and details</p>
              </div>
            ) : workflowDetail.isLoading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 rounded bg-muted animate-pulse" />)}</div>
            ) : workflowDetail.data ? (
              <div className="space-y-4">
                {workflowDetail.data.triggerConditions && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Trigger Conditions</span>
                    <pre className="mt-1 p-2 rounded bg-muted text-xs overflow-x-auto whitespace-pre-wrap">
                      {typeof workflowDetail.data.triggerConditions === "string" ? workflowDetail.data.triggerConditions : JSON.stringify(workflowDetail.data.triggerConditions, null, 2)}
                    </pre>
                  </div>
                )}
                {workflowDetail.data.steps && workflowDetail.data.steps.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Workflow Steps ({workflowDetail.data.steps.length})</span>
                    <div className="mt-2 space-y-2">
                      {workflowDetail.data.steps.map((step: any, idx: number) => (
                        <div key={step.id} className="flex items-start gap-3 p-3 rounded-lg border">
                          <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">{idx + 1}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{step.title}</span>
                              <Badge variant="outline" className="text-[10px]">{step.stepType}</Badge>
                            </div>
                            {step.requiredInputs && <p className="text-xs text-muted-foreground mt-1">Inputs: {typeof step.requiredInputs === "string" ? step.requiredInputs : JSON.stringify(step.requiredInputs)}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {workflowDetail.data.evidenceProfile && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Evidence Profile</span>
                    <div className="mt-2 p-3 rounded-lg border">
                      <div className="text-sm font-medium">{workflowDetail.data.evidenceProfile.issueType}</div>
                      <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Required Minimum:</span>
                          <pre className="mt-0.5 p-1 rounded bg-muted text-[10px] overflow-x-auto whitespace-pre-wrap">{JSON.stringify(workflowDetail.data.evidenceProfile.requiredMinimum, null, 2)}</pre>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Common Failure Modes:</span>
                          <pre className="mt-0.5 p-1 rounded bg-muted text-[10px] overflow-x-auto whitespace-pre-wrap">{JSON.stringify(workflowDetail.data.evidenceProfile.commonFailureModes, null, 2)}</pre>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {workflowDetail.data.escalations && workflowDetail.data.escalations.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Escalation Routes ({workflowDetail.data.escalations.length})</span>
                    <div className="mt-2 space-y-2">
                      {workflowDetail.data.escalations.map((e: any) => (
                        <div key={e.id} className="p-3 rounded-lg border">
                          <pre className="text-xs overflow-x-auto whitespace-pre-wrap">{JSON.stringify(e.routes, null, 2)}</pre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">Workflow not found</p>
            )}
          </CardContent>
        </Card>
      </div>

      {deadlineRules.data && deadlineRules.data.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Timer className="h-5 w-5 text-red-500" />
              Deadline Rules ({deadlineRules.data.length})
            </CardTitle>
            <CardDescription>Computable deadline logic across claim types and jurisdictions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2 text-xs font-medium text-muted-foreground">Claim Type</th>
                    <th className="p-2 text-xs font-medium text-muted-foreground">Jurisdiction</th>
                    <th className="p-2 text-xs font-medium text-muted-foreground">Trigger</th>
                    <th className="p-2 text-xs font-medium text-muted-foreground">Type</th>
                    <th className="p-2 text-xs font-medium text-muted-foreground">Days</th>
                    <th className="p-2 text-xs font-medium text-muted-foreground">Extended</th>
                    <th className="p-2 text-xs font-medium text-muted-foreground">Tolling</th>
                  </tr>
                </thead>
                <tbody>
                  {deadlineRules.data.map((r: any) => (
                    <tr key={r.id} className="border-b hover:bg-accent/50">
                      <td className="p-2 text-xs">{r.claimType?.replace(/_/g, " ")}</td>
                      <td className="p-2 text-xs"><Badge variant="outline" className="text-[10px]">{r.jurisdiction}</Badge></td>
                      <td className="p-2 text-xs text-muted-foreground">{r.triggerEvent?.replace(/_/g, " ")}</td>
                      <td className="p-2 text-xs"><Badge variant="secondary" className="text-[10px]">{r.deadlineType?.replace(/_/g, " ")}</Badge></td>
                      <td className="p-2 text-xs font-mono font-bold">{r.timeLimitDays}</td>
                      <td className="p-2 text-xs font-mono">{r.extendedLimitDays || "—"}</td>
                      <td className="p-2">{r.tollingPossible ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground/30" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
