import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowRight, CheckCircle2, Clock, AlertTriangle, Scale, Building2, Shield, ShoppingCart, ArrowLeft, Wrench } from "lucide-react";
import { useLocation } from "wouter";
import { CommitToCase } from "@/components/CommitToCase";

const agencyIcons: Record<string, React.ReactNode> = {
  EEOC: <Scale className="h-5 w-5" />,
  HUD: <Building2 className="h-5 w-5" />,
  OSHA: <Shield className="h-5 w-5" />,
  FTC: <ShoppingCart className="h-5 w-5" />,
};

const agencyColors: Record<string, string> = {
  EEOC: "border-blue-500/30 bg-blue-500/5",
  HUD: "border-purple-500/30 bg-purple-500/5",
  OSHA: "border-amber-500/30 bg-amber-500/5",
  FTC: "border-emerald-500/30 bg-emerald-500/5",
};

const modelTypeLabels: Record<string, string> = {
  charge: "Charge-Based Model",
  adjudication: "Administrative Adjudication",
  inspection: "Regulatory Inspection",
  oversight: "Market Oversight",
};

export default function EnforcementPathway() {
  const [mode, setMode] = useState<"agency" | "claim" | "pipeline">("agency");
  const [selectedAgency, setSelectedAgency] = useState("EEOC");
  const [selectedClaim, setSelectedClaim] = useState("discrimination");
  const [selectedPipeline, setSelectedPipeline] = useState("civil_rights");

  const queryInput = mode === "agency"
    ? { agencyShort: selectedAgency }
    : mode === "claim"
      ? { claimType: selectedClaim }
      : { pipelineCategory: selectedPipeline };

  const pathway = trpc.enforcementIntel.getEnforcementPathway.useQuery(queryInput);

  const [, navigate] = useLocation();
  return (
    <div className="space-y-6">
      {/* Back nav */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate("/architecture")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Architecture Map
        </button>
        <button onClick={() => navigate("/workshop?from=Enforcement+Pathway&layer=%2Fenforcement-pathway")} className="flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300 transition-colors">
          <Wrench className="h-3.5 w-3.5" /> Open in Workshop
        </button>
      </div>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Enforcement Pathway Models</h1>
        <p className="text-muted-foreground mt-1">
          Four enforcement models: EEOC Charge, HUD Adjudication, OSHA Inspection, FTC Oversight. Select by agency, claim type, or pipeline category.
        </p>
      </div>

      {/* Selector */}
      <Card className="border-0 bg-card/50">
        <CardContent className="p-4">
          <Tabs value={mode} onValueChange={v => setMode(v as typeof mode)}>
            <TabsList className="mb-3">
              <TabsTrigger value="agency">By Agency</TabsTrigger>
              <TabsTrigger value="claim">By Claim Type</TabsTrigger>
              <TabsTrigger value="pipeline">By Pipeline</TabsTrigger>
            </TabsList>

            <TabsContent value="agency">
              <div className="flex gap-2">
                {["EEOC", "HUD", "OSHA", "FTC"].map(a => (
                  <Button key={a} variant={selectedAgency === a ? "default" : "outline"} size="sm" onClick={() => setSelectedAgency(a)} className="gap-1.5">
                    {agencyIcons[a]} {a}
                  </Button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="claim">
              <Select value={selectedClaim} onValueChange={setSelectedClaim}>
                <SelectTrigger className="w-[300px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["discrimination", "retaliation", "harassment", "housing_discrimination", "fair_housing", "workplace_safety", "whistleblower", "consumer_fraud", "deceptive_practices", "unfair_business"].map(c => (
                    <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TabsContent>

            <TabsContent value="pipeline">
              <Select value={selectedPipeline} onValueChange={setSelectedPipeline}>
                <SelectTrigger className="w-[300px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["workplace", "civil_rights", "housing", "employment", "consumer", "safety", "discrimination", "retaliation", "whistleblower", "fraud", "deceptive_practices"].map(p => (
                    <SelectItem key={p} value={p}>{p.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Pathway Results */}
      {pathway.isLoading && <p className="text-muted-foreground">Loading enforcement pathway...</p>}
      {pathway.data && (
        <div className="space-y-6">
          {pathway.data.matchedBy !== "all" && (
            <p className="text-sm text-muted-foreground">
              Matched by <Badge variant="outline" className="text-xs ml-1">{pathway.data.matchedBy}</Badge> — {pathway.data.pathways.length} pathway{pathway.data.pathways.length !== 1 ? "s" : ""} found
            </p>
          )}

          {pathway.data.pathways.map((pw: any) => (
            <Card key={pw.agencyShort} className={`border ${agencyColors[pw.agencyShort] || "border-border/30"}`}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted/50">{agencyIcons[pw.agencyShort] || <Scale className="h-5 w-5" />}</div>
                  <div>
                    <CardTitle className="text-lg">{pw.modelName}</CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-xs">{pw.agencyShort}</Badge>
                      <span>{modelTypeLabels[pw.modelType] || pw.modelType}</span>
                    </CardDescription>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-2">{pw.description}</p>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Step-by-Step Process */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Process Steps</h3>
                  <div className="space-y-0">
                    {pw.steps.map((step: any, i: number) => (
                      <div key={step.step} className="flex gap-3">
                        {/* Vertical connector */}
                        <div className="flex flex-col items-center">
                          <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                            {step.step}
                          </div>
                          {i < pw.steps.length - 1 && <div className="w-px flex-1 bg-border/50 my-1" />}
                        </div>
                        {/* Step content */}
                        <div className="pb-4 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{step.name}</h4>
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              <Clock className="h-3 w-3 mr-1" />{step.typicalDuration}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{step.description}</p>
                          <div className="mt-1.5 flex items-start gap-1.5">
                            <ArrowRight className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                            <p className="text-xs text-primary/80">{step.userAction}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Key Deadlines */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Key Deadlines</h3>
                    <div className="space-y-1.5">
                      {pw.keyDeadlines.map((d: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                          <span>{d}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Typical Outcomes</h3>
                    <div className="space-y-1.5">
                      {pw.typicalOutcomes.map((o: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                          <span>{o}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Success Rate */}
                <div className="p-3 rounded-lg bg-muted/30 border border-border/20">
                  <p className="text-sm"><span className="font-medium">Historical success rate:</span> {pw.successRate}</p>
                </div>

                {/* Commit to Case */}
                <div className="flex justify-end pt-1">
                  <CommitToCase
                    type="proceduralPath"
                    pathLabel={pw.modelName}
                    pathId={pw.id}
                    label="Set as My Strategy"
                    size="sm"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
