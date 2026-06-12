import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Database, Eye, Loader2, RefreshCw, ShieldAlert } from "lucide-react";

type status_filter_value =
  | "all"
  | "blocked"
  | "review_required"
  | "pending_bucket_content_scan"
  | "pending_docx_normalization"
  | "docx_extraction_failed"
  | "candidates_created";

type visible_queue_row = {
  id: number;
  source_name: string | null;
  source_ext: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  storage_mode: string | null;
  target_hint: string | null;
  import_status: string | null;
  record_count_estimate: number | null;
  created_at: string | null;
  updated_at: string | null;
  raw_text_chars: number;
  has_payload: boolean;
  policy_class: string;
  dedupe_behavior: string;
  intended_destination: string;
  blocked_reason: string | null;
  next_action: string;
};

type queue_row_detail = visible_queue_row & {
  raw_text_preview: string;
  payload: unknown | null;
};

function format_date(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

async function read_json_response<T>(response: Response): Promise<T> {
  const content_type = response.headers.get("content-type") ?? "";
  const text = await response.text();

  if (!content_type.includes("application/json")) {
    throw new Error(`server_returned_non_json status=${response.status} preview=${text.slice(0, 240)}`);
  }

  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = parsed?.message ?? parsed?.error ?? response.statusText;
    throw new Error(message);
  }

  return parsed as T;
}

export default function IngestionControl() {
  const [status_filter, set_status_filter] = useState<status_filter_value>("all");
  const [rows, set_rows] = useState<visible_queue_row[]>([]);
  const [selected_row, set_selected_row] = useState<queue_row_detail | null>(null);
  const [loading, set_loading] = useState(false);
  const [action_row_id, set_action_row_id] = useState<number | null>(null);
  const [action_message, set_action_message] = useState<string | null>(null);
  const [error_message, set_error_message] = useState<string | null>(null);

  const load_queue = async () => {
    set_loading(true);
    set_error_message(null);

    try {
      const params = new URLSearchParams({ status_filter, limit: "100" });
      const result = await read_json_response<{ success: boolean; rows: visible_queue_row[]; error?: string; message?: string }>(
        await fetch(`/api/ingestion-control/corpus-import-queue?${params.toString()}`, {
          credentials: "include",
          headers: { Accept: "application/json" },
        }),
      );

      if (!result.success) {
        throw new Error(result.message ?? result.error ?? "ingestion_control_queue_read_failed");
      }

      set_rows(result.rows ?? []);
    } catch (error: any) {
      set_error_message(error?.message ?? String(error));
      set_rows([]);
    } finally {
      set_loading(false);
    }
  };

  const load_row = async (id: number) => {
    set_error_message(null);

    try {
      const result = await read_json_response<{ success: boolean; row: queue_row_detail | null; error?: string; message?: string }>(
        await fetch(`/api/ingestion-control/corpus-import-queue/${id}`, {
          credentials: "include",
          headers: { Accept: "application/json" },
        }),
      );

      if (!result.success || !result.row) {
        throw new Error(result.message ?? result.error ?? "corpus_import_queue_row_not_found");
      }

      set_selected_row(result.row);
    } catch (error: any) {
      set_error_message(error?.message ?? String(error));
    }
  };

  const extract_docx_queue_row = async (id: number) => {
    set_action_row_id(id);
    set_action_message(null);
    set_error_message(null);

    try {
      const result = await read_json_response<{ success: boolean; row?: visible_queue_row; message?: string; error?: string }>(
        await fetch(`/api/ingestion-control/corpus-import-queue/${id}/extract-docx`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ dry_run: false }),
        }),
      );

      if (!result.success) {
        throw new Error(result.message ?? result.error ?? "extract_docx_queue_row_failed");
      }

      set_action_message(`extract_docx_queue_row complete for id_${id}`);
      await load_queue();
      await load_row(id);
    } catch (error: any) {
      set_error_message(error?.message ?? String(error));
    } finally {
      set_action_row_id(null);
    }
  };

  useEffect(() => {
    load_queue();
  }, [status_filter]);

  const summary = useMemo(() => ({
    total_rows: rows.length,
    blocked_rows: rows.filter((row) => row.blocked_reason !== null).length,
    review_required_rows: rows.filter((row) => row.policy_class === "review_required").length,
    strict_authority_rows: rows.filter((row) => row.policy_class === "strict_authority").length,
  }), [rows]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/sovereign-control">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Sovereign Control
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Database className="h-5 w-5 text-cyan-400" />
              ingestion_control
            </h1>
            <p className="text-sm text-muted-foreground">Server-backed queue viewer for bucket and corpus staging. No canonical promotion.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load_queue} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          refresh_queue
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Card className="bg-card/50"><CardContent className="p-3"><div className="text-xs text-muted-foreground">visible_rows</div><div className="text-xl font-bold">{summary.total_rows}</div></CardContent></Card>
        <Card className="bg-card/50"><CardContent className="p-3"><div className="text-xs text-muted-foreground">blocked_rows</div><div className="text-xl font-bold text-amber-400">{summary.blocked_rows}</div></CardContent></Card>
        <Card className="bg-card/50"><CardContent className="p-3"><div className="text-xs text-muted-foreground">review_required</div><div className="text-xl font-bold text-red-400">{summary.review_required_rows}</div></CardContent></Card>
        <Card className="bg-card/50"><CardContent className="p-3"><div className="text-xs text-muted-foreground">strict_authority</div><div className="text-xl font-bold text-purple-400">{summary.strict_authority_rows}</div></CardContent></Card>
      </div>

      <Card className="border-cyan-500/20 bg-cyan-950/10">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-cyan-400" /> operator_posture</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
          server_read_path · viewer_first · staging_only · no_freeform_shell · no_canonical_promotion · snake_case_visible_fields
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Select value={status_filter} onValueChange={(value) => set_status_filter(value as status_filter_value)}>
          <SelectTrigger className="w-[280px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">all</SelectItem>
            <SelectItem value="blocked">blocked</SelectItem>
            <SelectItem value="review_required">review_required</SelectItem>
            <SelectItem value="pending_bucket_content_scan">pending_bucket_content_scan</SelectItem>
            <SelectItem value="pending_docx_normalization">pending_docx_normalization</SelectItem>
            <SelectItem value="docx_extraction_failed">docx_extraction_failed</SelectItem>
            <SelectItem value="candidates_created">candidates_created</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {action_message && (
        <Card className="border-green-500/30 bg-green-950/10">
          <CardContent className="p-3 text-sm text-green-300">{action_message}</CardContent>
        </Card>
      )}

      {error_message && (
        <Card className="border-red-500/30 bg-red-950/10">
          <CardContent className="p-3 text-sm text-red-300">{error_message}</CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {rows.map((row) => (
          <Card key={row.id} className="bg-card/50">
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline">id_{row.id}</Badge>
                    <Badge>{row.import_status ?? "unknown_status"}</Badge>
                    <Badge variant={row.blocked_reason ? "destructive" : "secondary"}>{row.policy_class}</Badge>
                    <span className="text-sm font-medium truncate">{row.source_name ?? row.storage_path ?? "unnamed_source"}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <div><span className="text-foreground">storage_bucket:</span> {row.storage_bucket ?? "—"}</div>
                    <div><span className="text-foreground">storage_path:</span> {row.storage_path ?? "—"}</div>
                    <div><span className="text-foreground">target_hint:</span> {row.target_hint ?? "—"}</div>
                    <div><span className="text-foreground">intended_destination:</span> {row.intended_destination}</div>
                    <div><span className="text-foreground">storage_mode:</span> {row.storage_mode ?? "—"}</div>
                    <div><span className="text-foreground">raw_text_chars:</span> {row.raw_text_chars.toLocaleString()}</div>
                    <div><span className="text-foreground">dedupe_behavior:</span> {row.dedupe_behavior}</div>
                    <div><span className="text-foreground">next_action:</span> {row.next_action}</div>
                    <div><span className="text-foreground">blocked_reason:</span> {row.blocked_reason ?? "—"}</div>
                    <div><span className="text-foreground">updated_at:</span> {format_date(row.updated_at)}</div>
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => load_row(row.id)}>
                    <Eye className="h-3 w-3 mr-1" /> view_row
                  </Button>
                  {row.next_action === "extract_docx_queue_row" && (
                    <Button size="sm" variant="secondary" onClick={() => extract_docx_queue_row(row.id)} disabled={action_row_id === row.id}>
                      {action_row_id === row.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                      extract_docx_queue_row
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {!loading && rows.length === 0 && <div className="text-sm text-muted-foreground text-center py-10">no_visible_queue_rows</div>}
      </div>

      {selected_row && (
        <Card className="border-cyan-500/30 bg-card">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>row_detail: id_{selected_row.id}</span>
              <Button size="sm" variant="ghost" onClick={() => set_selected_row(null)}>close</Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div><span className="text-foreground">source_name:</span> {selected_row.source_name ?? "—"}</div>
              <div><span className="text-foreground">target_hint:</span> {selected_row.target_hint ?? "—"}</div>
              <div><span className="text-foreground">storage_bucket:</span> {selected_row.storage_bucket ?? "—"}</div>
              <div><span className="text-foreground">storage_path:</span> {selected_row.storage_path ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold mb-1">raw_text_preview</div>
              <pre className="text-[10px] whitespace-pre-wrap bg-muted/30 rounded p-3 max-h-56 overflow-auto">{selected_row.raw_text_preview || "no_raw_text"}</pre>
            </div>
            <div>
              <div className="text-xs font-semibold mb-1">payload_preview</div>
              <pre className="text-[10px] whitespace-pre-wrap bg-muted/30 rounded p-3 max-h-56 overflow-auto">{selected_row.payload ? JSON.stringify(selected_row.payload, null, 2).slice(0, 6000) : "no_payload"}</pre>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
