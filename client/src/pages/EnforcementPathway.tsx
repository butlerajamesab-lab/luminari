import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { AlertTriangle, ArrowLeft, Database, FileText, Scale, Wrench } from "lucide-react";

import { CaseActionPaths } from "@/components/CaseActionPaths";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { safeArray as safe_array, safeObject as safe_object, safeText as safe_text } from "@/lib/data-guard";
import { trpc } from "@/lib/trpc";

export default function EnforcementPathway() {
  const [mode, set_mode] = useState<"agency" | "claim" | "pipeline">("agency");
  const [selected_agency, set_selected_agency] = useState("");
  const [selected_claim, set_selected_claim] = useState("");
  const [selected_pipeline, set_selected_pipeline] = useState("");

  const search = useSearch();
  const search_params = new URLSearchParams(search);
  const selected_pathway = search_params.get("pathway_id") || "";
  const selected_jurisdiction = search_params.get("jurisdiction") || "";
  const query_filter = mode === "agency" && selected_agency
    ? { agency_name: selected_agency }
    : mode === "claim" && selected_claim
      ? { claim_type: selected_claim }
      : mode === "pipeline" && selected_pipeline
        ? { pipeline_category: selected_pipeline }
        : {};

  const query_input = {
    ...query_filter,
    ...(selected_jurisdiction ? { jurisdiction: selected_jurisdiction } : {}),
    ...(selected_pathway ? { pathway_id: selected_pathway } : {}),
  };
  const pathway = trpc.enforcementIntel.get_enforcement_pathway.useQuery(query_input);
  const pathway_data = safe_object<any>(pathway.data);
  const availability = safe_object<any>(pathway_data.availability);
  const filter_options = safe_object<any>(pathway_data.filter_options);
  const pathway_rows = safe_array<any>(pathway_data.pathways);
  const agency_options = safe_array<string>(filter_options.agency_names);
  const claim_options = safe_array<string>(filter_options.claim_types);
  const pipeline_options = safe_array<string>(filter_options.pipeline_categories);
  const jurisdiction_options = safe_array<string>(filter_options.jurisdictions);
  const matched_by = safe_text(pathway_data.matched_by, "none");

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
              : `${Number(pathway_data.model_count ?? 0)} stored models; ${Number(pathway_data.linked_step_count ?? 0)} linked current steps; ${Number(pathway_data.unlinked_step_count ?? 0)} steps awaiting parent linkage.`}
          </p>
        </div>

        <Card className="border-0 bg-card/50">
          <CardContent className="p-4">
            <div className="flex gap-3 items-center flex-wrap mb-4">
              <Select value={selected_jurisdiction || "__all"} onValueChange={value => {
                const next_search = new URLSearchParams(search);
                if (value === "__all") next_search.delete("jurisdiction");
                else next_search.set("jurisdiction", value);
                navigate(`/enforcement-pathway?${next_search.toString()}`);
              }}>
                <SelectTrigger className="w-[280px]"><SelectValue placeholder="Jurisdiction" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All recorded jurisdictions</SelectItem>
                  {selected_jurisdiction && !jurisdiction_options.includes(selected_jurisdiction) && <SelectItem value={selected_jurisdiction}>{selected_jurisdiction}</SelectItem>}
                  {jurisdiction_options.map(jurisdiction => <SelectItem key={jurisdiction} value={jurisdiction}>{jurisdiction}</SelectItem>)}
                </SelectContent>
              </Select>
              {selected_pathway && <Button variant="outline" onClick={() => {
                set_selected_agency(""); set_selected_claim(""); set_selected_pipeline("");
                navigate("/enforcement-pathway");
              }}>Show all source models</Button>}
            </div>
            <Tabs value={mode} onValueChange={value => set_mode(value as typeof mode)}>
              <TabsList className="mb-3">
                <TabsTrigger value="agency">By Agency</TabsTrigger>
                <TabsTrigger value="claim">By Claim Type</TabsTrigger>
                <TabsTrigger value="pipeline">By Pipeline</TabsTrigger>
              </TabsList>

              <TabsContent value="agency">
                {agency_options.length > 0 ? (
                  <div className="flex gap-2 flex-wrap">
                    <Button variant={selected_agency === "" ? "default" : "outline"} size="sm" onClick={() => set_selected_agency("")}>
                      All recorded agencies
                    </Button>
                    {agency_options.map(agency => (
                      <Button key={agency} variant={selected_agency === agency ? "default" : "outline"} size="sm" onClick={() => set_selected_agency(agency)}>
                        {agency}
                      </Button>
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground">No agency name is recorded for these source rows.</p>}
              </TabsContent>

              <TabsContent value="claim">
                {claim_options.length > 0 ? (
                  <Select value={selected_claim || "__all"} onValueChange={value => set_selected_claim(value === "__all" ? "" : value)}>
                    <SelectTrigger className="w-[360px] max-w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">All recorded claim types</SelectItem>
                      {claim_options.map(claim => <SelectItem key={claim} value={claim}>{claim.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : <p className="text-sm text-muted-foreground">No claim-type tags are stored for these source rows.</p>}
              </TabsContent>

              <TabsContent value="pipeline">
                {pipeline_options.length > 0 ? (
                  <Select value={selected_pipeline || "__all"} onValueChange={value => set_selected_pipeline(value === "__all" ? "" : value)}>
                    <SelectTrigger className="w-[360px] max-w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">All recorded pipeline categories</SelectItem>
                      {pipeline_options.map(category => <SelectItem key={category} value={category}>{category.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : <p className="text-sm text-muted-foreground">No pipeline-category associations are stored for these source rows.</p>}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {pathway.isLoading && <p className="text-muted-foreground">Loading source models and steps...</p>}

        {pathway.isError && <p className="text-sm text-destructive">The pathway references could not be loaded. Please retry.</p>}

        {!pathway.isLoading && safe_text(availability.status) === "unavailable" && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="py-8 text-center">
              <AlertTriangle className="h-5 w-5 text-amber-400 mx-auto mb-2" />
              <p className="text-sm font-medium">Pathway reference unavailable</p>
              <p className="text-xs text-muted-foreground mt-1">{safe_text(availability.reason, "No exact live source row matched this filter.")}</p>
            </CardContent>
          </Card>
        )}

        {pathway_rows.length > 0 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Filter state <Badge variant="outline" className="text-xs ml-1">{matched_by}</Badge> — {pathway_rows.length} source row{pathway_rows.length === 1 ? "" : "s"}
            </p>

            <div className="grid gap-4 max-h-[760px] overflow-y-auto pr-1">
              {pathway_rows.map((record: any) => (
                <Card key={safe_text(record.id)} className="border border-border/30">
                  <CardHeader>
                    <div className="flex gap-2 flex-wrap">
                      <Badge variant="outline">{record.record_kind === "model" ? "Source model" : record.record_kind === "unlinked_step" ? "Step awaiting parent linkage" : "Source record"}</Badge>
                      {safe_text(record.pathway_id) && <span className="text-xs text-muted-foreground">{safe_text(record.pathway_id)}</span>}
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-muted/50"><Scale className="h-5 w-5" /></div>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-lg">{safe_text(record.pathway_name, "Unnamed source record")}</CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1 flex-wrap">
                          {safe_text(record.agency_name) && <span>{safe_text(record.agency_name)}</span>}
                          {safe_text(record.jurisdiction) && <span>{safe_text(record.jurisdiction)}</span>}
                          {safe_text(record.domain) && <span>· {safe_text(record.domain)}</span>}
                        </CardDescription>
                      </div>
                    </div>
                    {safe_text(record.description) && <p className="text-sm text-muted-foreground mt-2">{safe_text(record.description)}</p>}
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {record.record_kind === "model" && (
                      <div>
                        <h3 className="text-sm font-semibold mb-2">Steps recorded in this source</h3>
                        <p className="text-xs text-muted-foreground mb-2">The source sequence is preserved. These statements have not been verified for your situation.</p>
                        {safe_array<any>(record.steps).length ? (
                          <ol className="space-y-2">
                            {safe_array<any>(record.steps).map(step => (
                              <li key={step.source_index} className="rounded border border-border/50 p-3">
                                <p className="text-sm font-medium">{step.source_order != null ? `${step.source_order}. ` : ""}{safe_text(step.source_name, "Unnamed source step")}</p>
                                {safe_text(step.source_description) && <p className="text-xs text-muted-foreground mt-1">{safe_text(step.source_description)}</p>}
                                <p className="text-[11px] text-muted-foreground mt-1">{step.civic_object_uid ? "Linked to current source object" : "Current object linkage not established"}</p>
                              </li>
                            ))}
                          </ol>
                        ) : <p className="text-sm text-muted-foreground">This source model has no recorded steps. Its agency and jurisdiction are retained; a procedural sequence still needs source review.</p>}
                      </div>
                    )}
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recorded claim tags</h3>
                        <div className="flex gap-1.5 flex-wrap">
                          {safe_array<string>(record.claim_types).length > 0
                            ? safe_array<string>(record.claim_types).map(tag => <Badge key={tag} variant="secondary">{tag.replace(/_/g, " ")}</Badge>)
                            : <span className="text-xs text-muted-foreground">None stored</span>}
                        </div>
                      </div>
                      <div>
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recorded pipeline tags</h3>
                        <div className="flex gap-1.5 flex-wrap">
                          {safe_array<string>(record.pipeline_categories).length > 0
                            ? safe_array<string>(record.pipeline_categories).map(tag => <Badge key={tag} variant="secondary">{tag.replace(/_/g, " ")}</Badge>)
                            : <span className="text-xs text-muted-foreground">None stored</span>}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                      <div className="flex items-start gap-2">
                        {record.source_pending ? <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" /> : <Database className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
                        <div>
                          <p className="text-sm font-medium">Source text only</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {record.source_pending
                              ? "This source reference still needs verification."
                              : "No procedural or deadline inference is added to this stored record."}
                          </p>
                          {safe_text(record.source_locator) && <p className="text-[11px] text-muted-foreground mt-1 break-all">{safe_text(record.source_locator)}</p>}
                          <p className="text-[11px] text-muted-foreground mt-1">{record.source_identity_status === "reviewed_content_match" ? "Parent record matched to a reviewed source version; legal assertions remain unverified." : record.source_origin === "stored_model_reference" ? "Stored model reference; source version has not been matched." : "Current corpus source object."}</p>
                          {safe_text(record.source_file) && (
                            <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                              <FileText className="h-3 w-3" /> {safe_text(record.source_file)}
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
