import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { supabase } from "@/lib/supabase";
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

type corpus_import_queue_row = {
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
  raw_text: string | null;
  payload: unknown | null;
};

type visible_queue_row = Omit<corpus_import_queue_row, "raw_text" | "payload"> & {
  raw_text_chars: number;
  has_payload: boolean;
  policy_class: string;
  dedupe_behavior: string;
  intended_destination: string;
  blocked_reason: string | null;
  next_action: string;
};

function classify_row(row: corpus_import_queue_row) {
  const target_hint = (row.target_hint ?? "").toLowerCase();
  const source_ext = (row.source_ext ?? "").toLowerCase();
  const import_status = row.import_status ?? "pending";

  if (import_status.includes("failed")) {
    return {
      policy_class: "review_required",
      dedupe_behavior: "hold_for_operator_review",
      intended_destination: "corpus_import_queue",
      blocked_reason: import_status,
      next_action: "inspect_error_then_retry_step",
    };
  }

  if (target_hint.includes("statute") || target_hint.includes("law") || target_hint.includes("legal_authority")) {
    return {
      policy_class: "strict_authority",
      dedupe_behavior: "no_silent_merge",
      intended_destination: target_hint || "legal_authority_staging",
      blocked_reason: "strict_authority_requires_review",
      next_action: "route_corpus_queue_dry_run",
    };
  }

  if (source_ext === ".docx" && import_status === "pending_bucket_content_scan") {
    return {
      policy_class: "entity_enrichment",
      dedupe_behavior: "enrich_blank_fields_only",
      intended_destination: target_hint || "registry_entity_extraction_v4",
      blocked_reason: "docx_not_extracted",
      next_action: "extract_docx_queue_row",
    };
  }

  if (source_ext === ".docx" && import_status === "pending_docx_normalization") {
    return {
      policy_class: "entity_enrichment",
      dedupe_behavior: "enrich_blank_fields_only",
      intended_destination: target_hint || "registry_entity_extraction_v4",
      blocked_reason: null,
      next_action: "normalize_docx_queue_row",
    };
  }

  return {
    policy_class: target_hint ? "entity_enrichment" : "review_required",
    dedupe_behavior: target_hint ? "enrich_blank_fields_only" : "hold_for_target_hint",
    intended_destination: target_hint || "target_hint_required",
    blocked_reason: target_hint ? null : "missing_target_hint",
    next_action: target_hint ? "route_corpus_queue_dry_run" : "set_target_hint",
  };
}

function format_date(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function IngestionControl() {
  const [status_filter, set_status_filter] = useState<status_filter_value>("all");
  const [rows, set_rows] = useState<visible_queue_row[]>([]);
  const [selected_row, set_selected_row] = useState<corpus_import_queue_row | null>(null);
  const [loading, set_loading] = useState(false);
  const [error_message, set_error_message] = useState<string | null>(null);

  const load_queue = async () => {
    set_loading(true);
    set_error_message(null);

    let query = supabase
      .from("corpus_import_queue")
      .select("id,source_name,source_ext,storage_bucket,storage_path,storage_mode,target_hint,import_status,record_count_estimate,created_at,updated_at,raw_text,payload")
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(100);

    if (status_filter !== "all" && status_filter !== "blocked") {
      query = query.eq("import_status", status_filter);
    }

    const { data, error } = await query;
    if (error) {
      set_error_message(error.message);
      set_rows([]);
      set_loading(false);
      return;
    }

    const mapped = ((data ?? []) as corpus_import_queue_row[]).map((row) => ({
      id: row.id,
      source_name: row.source_name,
      source_ext: row.source_ext,
      storage_bucket: row.storage_bucket,
      storage_path: row.storage_path,
      storage_mode: row.storage_mode,
      target_hint: row.target_hint,
      import_status: row.import_status,
      record_count_estimate: row.record_count_estimate,
      created_at: row.created_at,
      updated_at: row.updated_at,
      raw_text_chars: row.raw_text?.length ?? 0,
      has_payload: row.payload !== null,
      ...classify_row(row),
    }));

    set_rows(status_filter === "blocked" ? mapped.filter((row) => row.blocked_reason !== null) : mapped);
    set_loading(false);
  };

  const load_row = async (id: number) => {
    const { data, error } = await supabase
      .from("corpus_import_queue")
      .select("id,source_name,source_ext,storage_bucket,storage_path,storage_mode,target_hint,import_status,record_count_estimate,created_at,updated_at,raw_text,payload")
      .eq("id", id)
      .single();

    if (error) {
      set_error_message(error.message);
      return;
    }

    set_selected_row(data as corpus_import_queue_row);
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
            <p className="text-sm text-muted-foreground">Read-only queue viewer for bucket and corpus staging. No canonical promotion.</p>
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
          viewer_first · staging_only · no_freeform_shell · no_canonical_promotion · snake_case_visible_fields
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
                <Button size="sm" variant="outline" onClick={() => load_row(row.id)}>
                  <Eye className="h-3 w-3 mr-1" /> view_row
                </Button>
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
              <pre className="text-[10px] whitespace-pre-wrap bg-muted/30 rounded p-3 max-h-56 overflow-auto">{selected_row.raw_text?.slice(0, 6000) || "no_raw_text"}</pre>
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
