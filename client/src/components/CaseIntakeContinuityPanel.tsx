import { useState } from "react";
import { useLocation } from "wouter";
import { Activity, ArrowRight, Clock3, FilePlus2, Link2, MessageSquarePlus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { buildFromParam } from "@/lib/buildFromParam";
import {
  case_intake_surface_for_path,
  write_case_intake_origin_context,
  related_subject_label,
} from "@/lib/caseIntakeContinuity";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  case_intake_continuity_intent,
  case_intake_continuity_related_subject,
  case_intake_continuity_surface,
} from "@shared/case-intake-continuity";

const INTENT_OPTIONS: Array<{
  value: case_intake_continuity_intent;
  label: string;
}> = [
  { value: "new_evidence", label: "New evidence" },
  { value: "supports", label: "Supports existing evidence" },
  { value: "contradicts", label: "Contradicts existing evidence" },
  { value: "clarifies_identity", label: "Clarifies identity" },
  { value: "corrects_metadata", label: "Corrects metadata" },
  { value: "adds_context", label: "Adds context" },
  { value: "requests_review", label: "Requests review" },
];

function short_id(value: string) {
  return value.length <= 12 ? value : `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function humanize(value: string) {
  return value.replace(/_/g, " ");
}

function with_from_param(href: string) {
  const [path_and_query, hash = ""] = href.split("#", 2);
  const [path, query = ""] = path_and_query.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("from", buildFromParam());
  const next_query = params.toString();
  return `${path}${next_query ? `?${next_query}` : ""}${hash ? `#${hash}` : ""}`;
}

export function CaseIntakeContinuityPanel({
  caseId,
  routePath,
  relatedSubject,
  surfaceOverride,
}: {
  caseId: number;
  routePath: string;
  relatedSubject?: case_intake_continuity_related_subject;
  surfaceOverride?: case_intake_continuity_surface;
}) {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [intent, setIntent] =
    useState<case_intake_continuity_intent>("new_evidence");
  const surface = surfaceOverride ?? case_intake_surface_for_path(routePath);
  const continuity = trpc.analyze.getCaseIntakeContinuity.useQuery(
    { caseId },
    { enabled: !!surface, refetchInterval: 5000 },
  );

  if (!surface) return null;

  const data = continuity.data;
  const openLauncher = (nextIntent: case_intake_continuity_intent) => {
    setIntent(nextIntent);
    setOpen(true);
  };
  const continueToUpload = () => {
    if (!data) return;
    const from = buildFromParam();
    write_case_intake_origin_context({
      case_id: caseId,
      case_uuid: data.case_uuid,
      originating_route: from,
      originating_surface: surface,
      user_intent: intent,
      related_subject: relatedSubject,
      from_route: from,
    });
    setOpen(false);
    setLocation(with_from_param("/upload"));
  };

  return (
    <>
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-primary" />
                Intake Activity / What Changed
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Case-linked intake sessions stay separate. This surface shows the primary session, any explicitly related sessions, and their current preserved evidence and governed output posture.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="gap-2" onClick={() => openLauncher("new_evidence")}>
                <FilePlus2 className="h-3.5 w-3.5" />
                Add Evidence
              </Button>
              <Button size="sm" variant="outline" className="gap-2" onClick={() => openLauncher("adds_context")}>
                <MessageSquarePlus className="h-3.5 w-3.5" />
                Add Context
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!data ? (
            <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
              {continuity.isLoading
                ? "Loading intake continuity…"
                : continuity.error
                  ? continuity.error.message
                  : "No intake continuity data is available for this case yet."}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary">
                  {data.totals.primary_session_count} primary
                </Badge>
                <Badge variant="secondary">
                  {data.totals.related_session_count} related
                </Badge>
                <Badge variant="outline">
                  {data.totals.source_artifact_count} source artifact{data.totals.source_artifact_count === 1 ? "" : "s"}
                </Badge>
                <Badge variant="outline">
                  {data.totals.sealed_layer_run_count} sealed run{data.totals.sealed_layer_run_count === 1 ? "" : "s"}
                </Badge>
                <Badge variant="outline">
                  {data.totals.failed_layer_run_count} failed
                </Badge>
                <Badge variant="outline">
                  {data.totals.pending_layer_run_count} pending
                </Badge>
                <Badge variant="outline">
                  {data.totals.unresolved_dependency_count} unresolved {data.totals.unresolved_dependency_count === 1 ? "dependency" : "dependencies"}
                </Badge>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {[...data.primary_sessions, ...data.related_sessions].map((session) => (
                  <div key={session.intake_session_id} className="rounded-lg border bg-background/70 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">
                            {session.is_primary ? "Primary intake session" : "Related intake session"}
                          </p>
                          <Badge variant={session.is_primary ? "default" : "outline"} className="text-[10px]">
                            {humanize(session.link_type)}
                          </Badge>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {short_id(session.intake_session_id)} · {humanize(session.completion_state)}
                        </p>
                      </div>
                      <div className="text-right text-[11px] text-muted-foreground">
                        <div>{session.session_status}</div>
                        <div>{new Date(session.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      <span>{session.source_artifact_count} sources</span>
                      <span>{session.layer_output_available_count} outputs</span>
                      <span>{session.verification_record_count} verification</span>
                      <span>{session.transition_count} transitions</span>
                    </div>

                    {session.document_links.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {session.document_links.slice(0, 3).map((link) => (
                          <button
                            key={`${session.intake_session_id}-${link.document_id}`}
                            type="button"
                            onClick={() => setLocation(with_from_param(link.href))}
                            className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] text-primary hover:bg-primary/10"
                          >
                            <Link2 className="h-3 w-3" />
                            {link.filename ?? `Document ${link.document_id}`}
                          </button>
                        ))}
                      </div>
                    )}

                    {(session.failed_layer_run_count > 0
                      || session.pending_layer_run_count > 0
                      || session.unresolved_dependency_count > 0) && (
                      <div className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-2 text-[11px] text-muted-foreground">
                        {session.failed_layer_run_count > 0 ? `${session.failed_layer_run_count} failed run(s). ` : ""}
                        {session.pending_layer_run_count > 0 ? `${session.pending_layer_run_count} pending run(s). ` : ""}
                        {session.unresolved_dependency_count > 0 ? `${session.unresolved_dependency_count} unresolved dependency item(s).` : ""}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {Object.entries(data.surface_links).map(([label, href]) => (
                  <Button
                    key={label}
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => setLocation(with_from_param(href))}
                  >
                    {humanize(label)}
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock3 className="h-4 w-4" />
              Add evidence or context
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              From <span className="font-medium text-foreground">{humanize(surface)}</span>
              {relatedSubject ? (
                <> · related to <span className="font-medium text-foreground">{related_subject_label(relatedSubject)}</span></>
              ) : null}
            </div>
            <label className="block space-y-1 text-xs">
              <span className="font-medium">Intent</span>
              <Select value={intent} onValueChange={(value) => setIntent(value as case_intake_continuity_intent)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTENT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={continueToUpload}>Continue to upload</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
