import { query_with_diagnostics } from "../db";
import { stringify_spine_json } from "./spine-bundle-contract";

function parse_json_text<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export type export_spine_run_record = {
  id: number;
  exportType: string | null;
  bundleName: string | null;
  status: string | null;
  createdAt: number | null;
  completedAt: number | null;
  createdBy: string | null;
  filePath: string | null;
  fileUrl: string | null;
  bundleSize: string | null;
  bundleManifestJson: unknown;
  errorMessage: string | null;
};

export async function create_export_spine_run(input: {
  exportType: string;
  bundleName: string;
  createdBy: string;
  createdAt: number;
}): Promise<number> {
  const result = await query_with_diagnostics<{ id: number | string }>(
    `insert into public.export_spine_runs (
       export_type_esr, bundle_name_esr, status_esr, created_at_esr, created_by_esr
     ) values ($1,$2,'running',$3,$4)
     returning id`,
    [input.exportType, input.bundleName, input.createdAt, input.createdBy],
    { label: "spine_export_run_create", query_timeout_ms: 5_000 },
  );
  const id = Number(result.rows[0]?.id);
  if (!Number.isFinite(id)) throw new Error("Export run insert did not return an id");
  return id;
}

export async function complete_export_spine_run(input: {
  id: number;
  completedAt: number;
  filePath: string;
  fileUrl: string;
  bundleSize: number;
  manifest: unknown;
}): Promise<void> {
  await query_with_diagnostics(
    `update public.export_spine_runs
     set status_esr='completed',
         completed_at_esr=$2,
         file_path_esr=$3,
         file_url_esr=$4,
         bundle_size_esr=$5,
         bundle_manifest_json_esr=$6,
         error_message_esr=null
     where id=$1`,
    [
      input.id,
      input.completedAt,
      input.filePath,
      input.fileUrl,
      String(input.bundleSize),
      stringify_spine_json(input.manifest, 0),
    ],
    { label: "spine_export_run_complete", query_timeout_ms: 5_000 },
  );
}

export async function fail_export_spine_run(input: {
  id: number;
  completedAt: number;
  errorMessage: string;
}): Promise<void> {
  await query_with_diagnostics(
    `update public.export_spine_runs
     set status_esr='failed', completed_at_esr=$2, error_message_esr=$3
     where id=$1`,
    [input.id, input.completedAt, input.errorMessage.slice(0, 4_000)],
    { label: "spine_export_run_fail", query_timeout_ms: 5_000 },
  );
}

function map_export_run(row: any): export_spine_run_record {
  return {
    id: Number(row.id),
    exportType: row.export_type,
    bundleName: row.bundle_name,
    status: row.status,
    createdAt: row.created_at === null ? null : Number(row.created_at),
    completedAt: row.completed_at === null ? null : Number(row.completed_at),
    createdBy: row.created_by,
    filePath: row.file_path,
    fileUrl: row.file_url,
    bundleSize: row.bundle_size,
    bundleManifestJson: parse_json_text(row.bundle_manifest_json, null),
    errorMessage: row.error_message,
  };
}

const EXPORT_RUN_SELECT = `select
  id,
  export_type_esr as export_type,
  bundle_name_esr as bundle_name,
  status_esr as status,
  created_at_esr as created_at,
  completed_at_esr as completed_at,
  created_by_esr as created_by,
  file_path_esr as file_path,
  file_url_esr as file_url,
  bundle_size_esr as bundle_size,
  bundle_manifest_json_esr as bundle_manifest_json,
  error_message_esr as error_message
from public.export_spine_runs`;

export async function list_export_spine_runs(limit = 20): Promise<export_spine_run_record[]> {
  const bounded = Math.min(100, Math.max(1, Math.floor(limit)));
  const result = await query_with_diagnostics<any>(
    `${EXPORT_RUN_SELECT} order by created_at_esr desc, id desc limit ${bounded}`,
    [],
    { label: "spine_export_run_list", query_timeout_ms: 5_000 },
  );
  return result.rows.map(map_export_run);
}

export async function get_export_spine_run(id: number): Promise<export_spine_run_record | null> {
  const result = await query_with_diagnostics<any>(
    `${EXPORT_RUN_SELECT} where id=$1 limit 1`,
    [id],
    { label: "spine_export_run_get", query_timeout_ms: 5_000 },
  );
  return result.rows[0] ? map_export_run(result.rows[0]) : null;
}

export async function get_export_spine_stats() {
  const result = await query_with_diagnostics<{
    total_exports: string | number;
    completed_exports: string | number;
    failed_exports: string | number;
    total_export_size: string | number | null;
    last_export_at: string | number | null;
    full_count: string | number;
    schema_count: string | number;
    config_count: string | number;
    deployment_count: string | number;
  }>(
    `select
       count(*) as total_exports,
       count(*) filter (where status_esr='completed') as completed_exports,
       count(*) filter (where status_esr='failed') as failed_exports,
       coalesce(sum(case when bundle_size_esr ~ '^[0-9]+$' then bundle_size_esr::bigint else 0 end)
         filter (where status_esr='completed'),0) as total_export_size,
       max(created_at_esr) filter (where status_esr='completed') as last_export_at,
       count(*) filter (where export_type_esr='full') as full_count,
       count(*) filter (where export_type_esr='schema') as schema_count,
       count(*) filter (where export_type_esr='config') as config_count,
       count(*) filter (where export_type_esr='deployment') as deployment_count
     from public.export_spine_runs`,
    [],
    { label: "spine_export_stats", query_timeout_ms: 5_000 },
  );
  const row = result.rows[0];
  return {
    totalExports: Number(row?.total_exports ?? 0),
    completedExports: Number(row?.completed_exports ?? 0),
    failedExports: Number(row?.failed_exports ?? 0),
    totalExportSize: Number(row?.total_export_size ?? 0),
    lastExportAt: row?.last_export_at === null ? null : Number(row?.last_export_at ?? 0),
    exportsByType: {
      full: Number(row?.full_count ?? 0),
      schema: Number(row?.schema_count ?? 0),
      config: Number(row?.config_count ?? 0),
      deployment: Number(row?.deployment_count ?? 0),
    },
  };
}

export type restore_spine_run_record = {
  id: number;
  bundleName: string;
  restoreType: string;
  status: string;
  executedBy: string;
  riskLevel: string | null;
  manifestChecksum: string | null;
  validationResult: unknown;
  startedAt: number;
  completedAt: number | null;
  restoredTables: string[];
  restoredEngines: string[];
  restoredStreams: string[];
  restoredRows: number;
  skippedTables: unknown[];
  errors: string[];
  summary: string | null;
};

export async function create_restore_spine_run(input: {
  bundleName: string;
  restoreType: string;
  executedBy: string;
  riskLevel: string;
  manifestChecksum: string | null;
  validationResult: unknown;
  startedAt: number;
}): Promise<number> {
  const result = await query_with_diagnostics<{ id: number | string }>(
    `insert into public.restore_spine_runs (
       bundle_name_rsr, restore_type_rsr, status_rsr, executed_by_rsr,
       risk_level_rsr, manifest_checksum_rsr, validation_result_rsr, started_at_rsr
     ) values ($1,$2,'validating',$3,$4,$5,$6,$7)
     returning id`,
    [
      input.bundleName,
      input.restoreType,
      input.executedBy,
      input.riskLevel,
      input.manifestChecksum,
      stringify_spine_json(input.validationResult, 0),
      input.startedAt,
    ],
    { label: "spine_restore_run_create", query_timeout_ms: 5_000 },
  );
  const id = Number(result.rows[0]?.id);
  if (!Number.isFinite(id)) throw new Error("Restore run insert did not return an id");
  return id;
}

export async function set_restore_spine_run_status(id: number, status: string): Promise<void> {
  await query_with_diagnostics(
    `update public.restore_spine_runs set status_rsr=$2 where id=$1`,
    [id, status],
    { label: "spine_restore_run_status", query_timeout_ms: 5_000 },
  );
}

export async function finish_restore_spine_run(input: {
  id: number;
  status: "completed" | "completed_with_errors" | "failed";
  completedAt: number;
  restoredTables: string[];
  restoredEngines: string[];
  restoredStreams: string[];
  restoredRows: number;
  skippedTables: unknown[];
  errors: string[];
  summary: string;
}): Promise<void> {
  await query_with_diagnostics(
    `update public.restore_spine_runs
     set status_rsr=$2,
         completed_at_rsr=$3,
         restored_tables_rsr=$4,
         restored_engines_rsr=$5,
         restored_streams_rsr=$6,
         restored_rows_rsr=$7,
         skipped_tables_rsr=$8,
         errors_rsr=$9,
         summary_rsr=$10
     where id=$1`,
    [
      input.id,
      input.status,
      input.completedAt,
      stringify_spine_json(input.restoredTables, 0),
      stringify_spine_json(input.restoredEngines, 0),
      stringify_spine_json(input.restoredStreams, 0),
      input.restoredRows,
      stringify_spine_json(input.skippedTables, 0),
      stringify_spine_json(input.errors, 0),
      input.summary,
    ],
    { label: "spine_restore_run_finish", query_timeout_ms: 5_000 },
  );
}

function map_restore_run(row: any): restore_spine_run_record {
  return {
    id: Number(row.id),
    bundleName: row.bundle_name,
    restoreType: row.restore_type,
    status: row.status,
    executedBy: row.executed_by,
    riskLevel: row.risk_level,
    manifestChecksum: row.manifest_checksum,
    validationResult: parse_json_text(row.validation_result, null),
    startedAt: Number(row.started_at),
    completedAt: row.completed_at === null ? null : Number(row.completed_at),
    restoredTables: parse_json_text(row.restored_tables, []),
    restoredEngines: parse_json_text(row.restored_engines, []),
    restoredStreams: parse_json_text(row.restored_streams, []),
    restoredRows: Number(row.restored_rows ?? 0),
    skippedTables: parse_json_text(row.skipped_tables, []),
    errors: parse_json_text(row.errors, []),
    summary: row.summary,
  };
}

const RESTORE_RUN_SELECT = `select
  id,
  bundle_name_rsr as bundle_name,
  restore_type_rsr as restore_type,
  status_rsr as status,
  executed_by_rsr as executed_by,
  risk_level_rsr as risk_level,
  manifest_checksum_rsr as manifest_checksum,
  validation_result_rsr as validation_result,
  started_at_rsr as started_at,
  completed_at_rsr as completed_at,
  restored_tables_rsr as restored_tables,
  restored_engines_rsr as restored_engines,
  restored_streams_rsr as restored_streams,
  restored_rows_rsr as restored_rows,
  skipped_tables_rsr as skipped_tables,
  errors_rsr as errors,
  summary_rsr as summary
from public.restore_spine_runs`;

export async function list_restore_spine_runs(limit = 20): Promise<restore_spine_run_record[]> {
  const bounded = Math.min(100, Math.max(1, Math.floor(limit)));
  const result = await query_with_diagnostics<any>(
    `${RESTORE_RUN_SELECT} order by started_at_rsr desc, id desc limit ${bounded}`,
    [],
    { label: "spine_restore_run_list", query_timeout_ms: 5_000 },
  );
  return result.rows.map(map_restore_run);
}

export async function get_restore_spine_run(id: number): Promise<restore_spine_run_record | null> {
  const result = await query_with_diagnostics<any>(
    `${RESTORE_RUN_SELECT} where id=$1 limit 1`,
    [id],
    { label: "spine_restore_run_get", query_timeout_ms: 5_000 },
  );
  return result.rows[0] ? map_restore_run(result.rows[0]) : null;
}
