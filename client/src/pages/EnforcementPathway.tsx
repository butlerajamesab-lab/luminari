import { useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, ArrowLeft, Database, FileText, Scale, Wrench } from "lucide-react";

import { CaseActionPaths } from "@/components/CaseActionPaths";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { safeArray, safeObject, safeText } from "@/lib/data-guard";
import { trpc } from "@/lib/trpc";

export default function EnforcementPathway() {
  const [mode, setMode] = useState<"agency" | "claim" | "pipeline">("agency");
  const [selectedAgency, setSelectedAgency] = useState("");
  const [selectedClaim, setSelectedClaim] = useState("");
  const [selectedPipeline, setSelectedPipeline] = useState("");

  const queryInput = mode === "agency" && selectedAgency
    ? { agencyShort: selectedAgency }
    : mode === "claim" && selectedClaim
      ? { claimType: selectedClaim }
      : mode === "pipeline" && selectedPipeline
        ? { pipelineCategory: selectedPipeline }
        : {};

  const pathway = trpc.enforcementIntel.getEnforcementPathway.useQuery(queryInput);
  const pathwayData = safeObject<any>(pathway.data);
  const availability = safeObject<any>(pathwayData.availability);
  const filterOptions = safeObject<any>(pathwayData.filterOptions);
  const pathwayRows = safeArray<any>(pathwayData.pathways);
  const agencyOptions = safeArray<string>(filterOptions.agencyShorts);
  const claimOptions = safeArray<string>(filterOptions.claimTypes);
  const pipelineOptions = safeArray<string>(filterOptions.pipelineCategories);
  const matchedBy = safeText(pathwayData.matchedBy, "none");
  const totalSourceRows = Number(pathwayData.totalSourceRows ?? 0);

  const [, navigate] = useLocation();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate("/architecture-map")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Architecture Map
        </button>
        <button onClick={() => navigate("/workshop?from=Enforcement+Pathway&layer=%2Fenforcement-pathway")} className="flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300 transition-colors">
          <Wrench className="h-3.5 w-3.5" /> Open in Workshop
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Enforcement Pathways</h1>
        <p className="text-muted-foreground mt-1">
          Case-bound procedural candidates and the global pathway catalog are shown separately. A reference model does not establish case applicability. These source rows are not case-specific legal instructions or deadline calculations.
        </p>
      </div>

      <CaseActionPaths />

      <section className="space-y-5 border-t border-border/60 pt-6">
        <div>
          <h2 className="text-lg font-semibold">Global Enforcement Pathway Reference Library</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {pathway.isLoading
              ? "Source records not loaded yet."
              : `${totalSourceRows} exact live source rows available.`}
          </p>
        </div>

        <Card className="border-0 bg-card/50">
          <CardContent className="p-4">
            <Tabs value={mode} onValueChange={value => setMode(value as typeof mode)}>
              <TabsList className="mb-3">
                <TabsTrigger value="agency">By Agency</TabsTrigger>
                <TabsTrigger value="claim">By Claim Type</TabsTrigger>
                <TabsTrigger value="pipeline">By Pipeline</TabsTrigger>
              </TabsList>

              <TabsContent value="agency">
                {agencyOptions.length > 0 ? (
                  <div className="flex gap-2 flex-wrap">
                    <Button variant={selectedAgency === "" ? "default" : "outline"} size="sm" onClick={() => setSelectedAgency("")}>
                      All recorded agencies
                    </Button>
                    {agencyOptions.map(agency => (
                      <Button key={agency} variant={selectedAgency === agency ? "default" : "outline"} size="sm" onClick={() => setSelectedAgency(agency)}>
                        {agency}
                      </Button>
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground">No explicit agency-short association is stored for these source rows.</p>}
              </TabsContent>

              <TabsContent value="claim">
                {claimOptions.length > 0 ? (
                  <Select value={selectedClaim || "__all"} onValueChange={value => setSelectedClaim(value === "__all" ? "" : value)}>
                    <SelectTrigger className="w-[360px] max-w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">All recorded claim types</SelectItem>
                      {claimOptions.map(claim => <SelectItem key={claim} value={claim}>{claim.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : <p className="text-sm text-muted-foreground">No claim-type tags are stored for these source rows.</p>}
              </TabsContent>

              <TabsContent value="pipeline">
                {pipelineOptions.length > 0 ? (
                  <Select value={selectedPipeline || "__all"} onValueChange={value => setSelectedPipeline(value === "__all" ? "" : value)}>
                    <SelectTrigger className="w-[360px] max-w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">All recorded pipeline categories</SelectItem>
                      {pipelineOptions.map(category => <SelectItem key={category} value={category}>{category.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : <p className="text-sm text-muted-foreground">No pipeline-category associations are stored for these source rows.</p>}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {pathway.isLoading && <p className="text-muted-foreground">Loading exact live source rows...</p>}

        {!pathway.isLoading && safeText(availability.status) === "unavailable" && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="py-8 text-center">
              <AlertTriangle className="h-5 w-5 text-amber-400 mx-auto mb-2" />
              <p className="text-sm font-medium">Pathway reference unavailable</p>
              <p className="text-xs text-muted-foreground mt-1">{safeText(availability.reason, "No exact live source row matched this filter.")}</p>
            </CardContent>
          </Card>
        )}

        {pathwayRows.length > 0 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Filter state <Badge variant="outline" className="text-xs ml-1">{matchedBy}</Badge> — {pathwayRows.length} source row{pathwayRows.length === 1 ? "" : "s"}
            </p>

            <div className="grid gap-4 max-h-[760px] overflow-y-auto pr-1">
              {pathwayRows.map((record: any) => (
                <Card key={safeText(record.id)} className="border border-border/30">
                  <CardHeader>
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-muted/50"><Scale className="h-5 w-5" /></div>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-lg">{safeText(record.pathwayName, "Unnamed source record")}</CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1 flex-wrap">
                          {safeText(record.agencyShort) && <Badge variant="outline">{safeText(record.agencyShort)}</Badge>}
                          {safeText(record.jurisdiction) && <span>{safeText(record.jurisdiction)}</span>}
                          {safeText(record.domain) && <span>· {safeText(record.domain)}</span>}
                        </CardDescription>
                      </div>
                    </div>
                    {safeText(record.description) && <p className="text-sm text-muted-foreground mt-2">{safeText(record.description)}</p>}
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recorded claim tags</h3>
                        <div className="flex gap-1.5 flex-wrap">
                          {safeArray<string>(record.claimTypes).length > 0
                            ? safeArray<string>(record.claimTypes).map(tag => <Badge key={tag} variant="secondary">{tag.replace(/_/g, " ")}</Badge>)
                            : <span className="text-xs text-muted-foreground">None stored</span>}
                        </div>
                      </div>
                      <div>
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recorded pipeline tags</h3>
                        <div className="flex gap-1.5 flex-wrap">
                          {safeArray<string>(record.pipelineCategories).length > 0
                            ? safeArray<string>(record.pipelineCategories).map(tag => <Badge key={tag} variant="secondary">{tag.replace(/_/g, " ")}</Badge>)
                            : <span className="text-xs text-muted-foreground">None stored</span>}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                      <div className="flex items-start gap-2">
                        {record.sourcePending ? <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" /> : <Database className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
                        <div>
                          <p className="text-sm font-medium">Source text only</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {record.sourcePending
                              ? "The catalog marks this record as pending source verification."
                              : "No procedural or deadline inference is added to this stored record."}
                          </p>
                          {safeText(record.sourceFile) && (
                            <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                              <FileText className="h-3 w-3" /> {safeText(record.sourceFile)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-border/40 pt-3">
                      <p className="text-xs text-muted-foreground">
                        Case-reference staging is unavailable for UUID catalog records.
                      </p>
                      <Button type="button" variant="outline" size="sm" disabled>
                        Add Reference
                      </Button>
                    </div>

                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
