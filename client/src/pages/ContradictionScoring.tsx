import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, BarChart3, Shield, Target, Clock, Users, ChevronRight, ArrowLeft, Wrench } from "lucide-react";
import { useLocation } from "wouter";

const severityColor: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/30",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
};

function ScoreBar({ label, score, max, icon }: { label: string; score: number; max: number; icon: React.ReactNode }) {
  const pct = (score / max) * 100;
  const color = pct >= 75 ? "bg-red-500" : pct >= 50 ? "bg-orange-500" : pct >= 25 ? "bg-yellow-500" : "bg-emerald-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">{icon}{label}</span>
        <span className="font-mono font-medium">{score}/{max}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ContradictionScoring() {
  const [tab, setTab] = useState("library");
  const [domain, setDomain] = useState("criminal_justice");
  const [hasDirectEvidence, setHasDirectEvidence] = useState(false);
  const [hasCorroboratingDocs, setHasCorroboratingDocs] = useState(false);
  const [docCount, setDocCount] = useState(1);
  const [hasTimelineSupport, setHasTimelineSupport] = useState(false);
  const [timelineGapDays, setTimelineGapDays] = useState<number | undefined>(undefined);
  const [affectsMultipleParties, setAffectsMultipleParties] = useState(false);
  const [hasPatternEvidence, setHasPatternEvidence] = useState(false);
  const [linkedToWeakJoint, setLinkedToWeakJoint] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const allScores = trpc.enforcementIntel.scoreAllContradictions.useQuery();

  const singleScore = trpc.enforcementIntel.scoreContradiction.useQuery({
    contradictionId: selectedId ?? undefined,
    domain,
    hasDirectEvidence,
    hasCorroboratingDocs,
    docCount,
    hasTimelineSupport,
    timelineGapDays,
    affectsMultipleParties,
    hasPatternEvidence,
    linkedToWeakJoint,
  }, { enabled: selectedId !== null || tab === "adhoc" });

  const [, navigate] = useLocation();
  return (
    <div className="space-y-6">
      {/* Back nav */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate("/architecture")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Architecture Map
        </button>
        <button onClick={() => navigate("/workshop?from=Contradiction+Scoring&layer=%2Fcontradiction-scoring")} className="flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300 transition-colors">
          <Wrench className="h-3.5 w-3.5" /> Open in Workshop
        </button>
      </div>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contradiction Scoring Engine</h1>
        <p className="text-muted-foreground mt-1">
          Weighted scoring model: Legal Severity (25) + Evidence Strength (25) + Timeline Support (20) + Cross-Doc Corroboration (20) + Systemic Risk (10)
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="library">Library Scores</TabsTrigger>
          <TabsTrigger value="adhoc">Ad-Hoc Scoring</TabsTrigger>
        </TabsList>

        {/* Library Scores Tab */}
        <TabsContent value="library" className="space-y-4">
          {allScores.isLoading && <p className="text-muted-foreground">Loading contradiction scores...</p>}
          {allScores.data && (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(["critical", "high", "medium", "low"] as const).map(sev => {
                  const count = allScores.data.filter(s => s.severity === sev).length;
                  return (
                    <Card key={sev} className="border-0 bg-card/50">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className={severityColor[sev]}>{sev}</Badge>
                          <span className="text-2xl font-bold">{count}</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Score Table */}
              <Card className="border-0 bg-card/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">All Contradictions — Ranked by Score</CardTitle>
                  <CardDescription>{allScores.data.length} contradictions scored</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50 text-muted-foreground">
                          <th className="text-left py-2 pr-3">Contradiction</th>
                          <th className="text-left py-2 px-3">Domain</th>
                          <th className="text-center py-2 px-2">Score</th>
                          <th className="text-center py-2 px-2">Legal</th>
                          <th className="text-center py-2 px-2">Evidence</th>
                          <th className="text-center py-2 px-2">Timeline</th>
                          <th className="text-center py-2 px-2">Corroboration</th>
                          <th className="text-center py-2 px-2">Systemic</th>
                          <th className="text-center py-2 px-2">Severity</th>
                          <th className="py-2 pl-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {allScores.data.map(s => (
                          <tr key={s.id} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                            <td className="py-2.5 pr-3 max-w-[250px] truncate font-medium">{s.title}</td>
                            <td className="py-2.5 px-3 text-muted-foreground">{s.domain.replace(/_/g, " ")}</td>
                            <td className="py-2.5 px-2 text-center font-mono font-bold">{s.total_score}</td>
                            <td className="py-2.5 px-2 text-center font-mono text-xs">{s.legal_severity}/25</td>
                            <td className="py-2.5 px-2 text-center font-mono text-xs">{s.evidence_strength}/25</td>
                            <td className="py-2.5 px-2 text-center font-mono text-xs">{s.timeline_support}/20</td>
                            <td className="py-2.5 px-2 text-center font-mono text-xs">{s.corroboration}/20</td>
                            <td className="py-2.5 px-2 text-center font-mono text-xs">{s.systemic_risk}/10</td>
                            <td className="py-2.5 px-2 text-center">
                              <Badge variant="outline" className={`text-xs ${severityColor[s.severity]}`}>{s.severity}</Badge>
                            </td>
                            <td className="py-2.5 pl-3">
                              <Button variant="ghost" size="sm" onClick={() => { setSelectedId(s.id); setTab("adhoc"); }}>
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Ad-Hoc Scoring Tab */}
        <TabsContent value="adhoc" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Input Panel */}
            <Card className="border-0 bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Evidence Context</CardTitle>
                <CardDescription>Provide case-specific evidence parameters to refine the score</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Domain</Label>
                  <Select value={domain} onValueChange={setDomain}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["criminal_justice", "civil_rights", "employment", "housing", "consumer", "benefits", "disability", "foia", "immigration", "family"].map(d => (
                        <SelectItem key={d} value={d}>{d.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Direct evidence available</Label>
                    <Switch checked={hasDirectEvidence} onCheckedChange={setHasDirectEvidence} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Corroborating documents</Label>
                    <Switch checked={hasCorroboratingDocs} onCheckedChange={setHasCorroboratingDocs} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Timeline support</Label>
                    <Switch checked={hasTimelineSupport} onCheckedChange={setHasTimelineSupport} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Affects multiple parties</Label>
                    <Switch checked={affectsMultipleParties} onCheckedChange={setAffectsMultipleParties} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Pattern evidence</Label>
                    <Switch checked={hasPatternEvidence} onCheckedChange={setHasPatternEvidence} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Linked to weak joint</Label>
                    <Switch checked={linkedToWeakJoint} onCheckedChange={setLinkedToWeakJoint} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Document count</Label>
                    <Input type="number" min={1} value={docCount} onChange={e => setDocCount(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Timeline gap (days)</Label>
                    <Input type="number" min={0} placeholder="Optional" value={timelineGapDays ?? ""} onChange={e => setTimelineGapDays(e.target.value ? Number(e.target.value) : undefined)} />
                  </div>
                </div>

                {selectedId && (
                  <div className="pt-2 border-t border-border/30">
                    <p className="text-xs text-muted-foreground">Scoring contradiction ID: {selectedId}</p>
                    <Button variant="ghost" size="sm" className="mt-1 text-xs" onClick={() => setSelectedId(null)}>Clear selection</Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Score Result Panel */}
            <Card className="border-0 bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Score Result</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {singleScore.isLoading && <p className="text-muted-foreground text-sm">Calculating...</p>}
                {singleScore.data && (
                  <>
                    {/* Total Score */}
                    <div className="text-center py-4">
                      <div className="text-5xl font-bold font-mono">{singleScore.data.total_score}</div>
                      <div className="text-sm text-muted-foreground mt-1">out of 100</div>
                      <Badge variant="outline" className={`mt-2 text-sm ${severityColor[singleScore.data.severity]}`}>
                        {singleScore.data.severity.toUpperCase()}
                      </Badge>
                    </div>

                    {/* Dimension Bars */}
                    <div className="space-y-3">
                      <ScoreBar label="Legal Severity" score={singleScore.data.dimensions.legal_severity.score} max={25} icon={<Shield className="h-3.5 w-3.5" />} />
                      <ScoreBar label="Evidence Strength" score={singleScore.data.dimensions.evidence_strength.score} max={25} icon={<Target className="h-3.5 w-3.5" />} />
                      <ScoreBar label="Timeline Support" score={singleScore.data.dimensions.timeline_support.score} max={20} icon={<Clock className="h-3.5 w-3.5" />} />
                      <ScoreBar label="Corroboration" score={singleScore.data.dimensions.corroboration.score} max={20} icon={<BarChart3 className="h-3.5 w-3.5" />} />
                      <ScoreBar label="Systemic Risk" score={singleScore.data.dimensions.systemic_risk.score} max={10} icon={<Users className="h-3.5 w-3.5" />} />
                    </div>

                    {/* Recommendation */}
                    <div className="p-3 rounded-lg bg-muted/50 border border-border/30">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                        <p className="text-sm">{singleScore.data.recommendation}</p>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {singleScore.data.title} — {singleScore.data.domain.replace(/_/g, " ")}
                    </p>
                  </>
                )}
                {!singleScore.data && !singleScore.isLoading && (
                  <p className="text-muted-foreground text-sm">Select a contradiction from the library or adjust parameters to see a score.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
