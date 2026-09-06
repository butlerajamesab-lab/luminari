import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Pool } = pg;

export const C3_SEALED_PANEL_RUNNER_CONTRACT =
  "rosetta-c3-sealed-panel-runner-v1";
export const DEFAULT_PANEL_MANIFEST_ID =
  "c30e86c3-1c86-4928-9b9c-2b5393fc9096";
export const DEFAULT_PANEL_TABLE = "rosetta_replay.kimi_panel_20260903_v1";
export const DEFAULT_WORKER_IDENTITY =
  "rosetta-c3-sealed-panel-runner";
export const REQUIRED_CLOSURE_PREFIX = "v2513_";
export const REQUIRED_ENGINE_VERSION =
  "rosetta-v3-deterministic-sql-2.5.13";
export const REQUIRED_RULE_SET_VERSION =
  "rosetta-five-layer-structural-correctness-2.5.13";
export const REQUIRED_TIMEOUT_MS = 120_000;

type cli_options = {
  manifest_id: string;
  panel_table: string;
  worker_identity: string;
  out_dir: string;
  limit?: number;
  start_ordinal?: number;
  include_unreceipted: boolean;
  dry_run: boolean;
};

type panel_member = {
  ordinal: number;
  source_registry_id: string;
  has_c3_receipt: boolean;
  config_hash: string;
  closure_hash: string;
};

type member_result = panel_member & {
  claim?: unknown;
  execution?: unknown;
  final_receipt_id?: string;
  skipped_reason?: string;
  error_code?: string;
  error_message?: string;
};

function required_arg(argv: string[], index: number, flag: string): string {
  const value = argv[index]?.trim();
  if (!value) throw new Error(`missing_value_for:${flag}`);
  return value;
}

export function parse_args(argv: string[]): cli_options {
  const options: cli_options = {
    manifest_id: DEFAULT_PANEL_MANIFEST_ID,
    panel_table: DEFAULT_PANEL_TABLE,
    worker_identity: DEFAULT_WORKER_IDENTITY,
    out_dir: path.resolve("artifacts/rosetta-c3-sealed-panel-rerun"),
    include_unreceipted: false,
    dry_run: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--manifest-id") {
      options.manifest_id = required_arg(argv, ++index, arg);
    } else if (arg === "--panel-table") {
      options.panel_table = required_arg(argv, ++index, arg);
    } else if (arg === "--worker-identity") {
      options.worker_identity = required_arg(argv, ++index, arg);
    } else if (arg === "--out-dir") {
      options.out_dir = path.resolve(required_arg(argv, ++index, arg));
    } else if (arg === "--limit") {
      const limit = Number(required_arg(argv, ++index, arg));
      if (!Number.isInteger(limit) || limit < 1) throw new Error("invalid_limit");
      options.limit = limit;
    } else if (arg === "--start-ordinal") {
      const start_ordinal = Number(required_arg(argv, ++index, arg));
      if (!Number.isInteger(start_ordinal) || start_ordinal < 1) {
        throw new Error("invalid_start_ordinal");
      }
      options.start_ordinal = start_ordinal;
    } else if (arg === "--include-unreceipted") {
      options.include_unreceipted = true;
    } else if (arg === "--dry-run") {
      options.dry_run = true;
    } else {
      throw new Error(`unknown_argument:${arg}`);
    }
  }

  assert_uuid(options.manifest_id, "manifest_id");
  if (!/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/i.test(options.panel_table)) {
    throw new Error("invalid_panel_table");
  }
  if (!options.worker_identity.trim()) throw new Error("worker_identity_required");
  return options;
}

function assert_uuid(value: string, label: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`invalid_uuid:${label}`);
  }
}

function database_url(): string {
  const value = process.env.ROSETTA_REPLAY_DATABASE_URL ?? process.env.ROSETTA_DATABASE_URL;
  if (!value?.trim()) throw new Error("missing_rosetta_replay_database_url");
  return value.trim();
}

function create_pool(): pg.Pool {
  const connectionString = database_url();
  return new Pool({
    connectionString,
    ssl: /supabase\.co|pooler\.supabase\.com/.test(connectionString)
      ? { rejectUnauthorized: false }
      : undefined,
  });
}

export function should_execute_claim(claim: unknown): boolean {
  if (!claim || typeof claim !== "object") return false;
  const value = claim as Record<string, unknown>;
  return value.created === true && value.attempt_state === "running";
}

function should_finalize_without_execution(claim: unknown): boolean {
  if (!claim || typeof claim !== "object") return false;
  const value = claim as Record<string, unknown>;
  return value.created === false &&
    ["claimed", "running", "failed_retryable"].includes(String(value.attempt_state));
}

export function summarize_results(results: member_result[]) {
  return {
    selected_members: results.length,
    c3_receipted_members: results.filter(result => result.has_c3_receipt).length,
    skipped_members: results.filter(result => result.skipped_reason).length,
    executed_members: results.filter(result => result.execution).length,
    finalized_members: results.filter(result => result.final_receipt_id).length,
    error_members: results.filter(result => result.error_code || result.error_message).length,
  };
}

function receipt_hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

async function verify_manifest(client: pg.PoolClient, manifest_id: string): Promise<void> {
  const result = await client.query(
    `select manifest_id, label, member_count,
            creation_receipt->>'closure_prefix' as closure_prefix,
            creation_receipt->>'engine_version' as engine_version,
            creation_receipt->>'rule_set_version' as rule_set_version,
            rosetta_replay.verify_sealed_manifest(manifest_id) as verified
       from rosetta_replay.sealed_corpus_manifest
      where manifest_id = $1`,
    [manifest_id],
  );
  if (result.rowCount !== 1) throw new Error("manifest_not_found");
  const manifest = result.rows[0];
  if (!manifest.verified) throw new Error("sealed_manifest_not_verified");
  if (manifest.closure_prefix !== REQUIRED_CLOSURE_PREFIX) {
    throw new Error("unexpected_manifest_closure_prefix");
  }
  if (manifest.engine_version !== REQUIRED_ENGINE_VERSION ||
      manifest.rule_set_version !== REQUIRED_RULE_SET_VERSION) {
    throw new Error("unexpected_manifest_engine_or_ruleset");
  }
}

async function load_members(client: pg.PoolClient, options: cli_options): Promise<panel_member[]> {
  const where: string[] = ["p.source_registry_id is not null"];
  const params: unknown[] = [];
  if (!options.include_unreceipted) {
    where.push("c.source_metadata ? 'content_extraction_receipt'");
  }
  if (options.start_ordinal) {
    params.push(options.start_ordinal);
    where.push(`p.ordinal >= $${params.length}`);
  }

  const limit_clause = options.limit ? `limit ${options.limit}` : "";
  const query = `
    select p.ordinal,
           p.source_registry_id,
           c.source_metadata ? 'content_extraction_receipt' as has_c3_receipt,
           rosetta_replay.truth_observation_configuration_hash(p.source_registry_id) as config_hash,
           rosetta_replay.closure_sha256($${params.length + 1}) as closure_hash
      from ${options.panel_table} p
      join rosetta_v2513.source_document_content c
        on c.source_content_id = p.source_content_id
       and c.source_content_hash = p.source_content_hash
     where ${where.join(" and ")}
     order by p.ordinal
     ${limit_clause}`;
  const result = await client.query(query, [...params, REQUIRED_CLOSURE_PREFIX]);
  return result.rows.map(row => ({
    ordinal: Number(row.ordinal),
    source_registry_id: row.source_registry_id,
    has_c3_receipt: Boolean(row.has_c3_receipt),
    config_hash: row.config_hash,
    closure_hash: row.closure_hash,
  }));
}

async function run_member(
  pool: pg.Pool,
  options: cli_options,
  member: panel_member,
): Promise<member_result> {
  const result: member_result = { ...member };
  if (!member.has_c3_receipt && !options.include_unreceipted) {
    return { ...result, skipped_reason: "missing_c3_receipt" };
  }
  if (options.dry_run) return { ...result, skipped_reason: "dry_run" };

  const claim_result = await pool.query(
    `select rosetta_replay.truth_observation_claim(
       $1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,interval '5 minutes') as claim`,
    [
      options.manifest_id,
      member.source_registry_id,
      REQUIRED_CLOSURE_PREFIX,
      REQUIRED_ENGINE_VERSION,
      REQUIRED_RULE_SET_VERSION,
      member.config_hash,
      member.closure_hash,
      options.worker_identity,
    ],
  );
  result.claim = claim_result.rows[0]?.claim;
  if (!should_execute_claim(result.claim)) {
    if (should_finalize_without_execution(result.claim)) {
      const attempt_id = (result.claim as Record<string, unknown>).attempt_id;
      if (typeof attempt_id !== "string") throw new Error("claim_missing_attempt_id");
      try {
        const final_result = await pool.query(
          `select rosetta_replay.truth_observation_finalize(
             $1::uuid,$2::uuid,$3) as receipt_id`,
          [attempt_id, options.manifest_id, options.worker_identity],
        );
        return {
          ...result,
          final_receipt_id: final_result.rows[0]?.receipt_id,
          skipped_reason: "reused_claim_finalized_without_execution",
        };
      } catch (error) {
        return {
          ...result,
          skipped_reason: "reused_claim_not_executed",
          error_code: error instanceof Error && "code" in error
            ? String((error as Error & { code?: string }).code ?? "")
            : undefined,
          error_message: error instanceof Error ? error.message : String(error),
        };
      }
    }
    return { ...result, skipped_reason: "claim_not_running" };
  }

  const attempt_id = (result.claim as Record<string, unknown>).attempt_id;
  if (typeof attempt_id !== "string") throw new Error("claim_missing_attempt_id");

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local statement_timeout = '120000ms'");
    const execution_result = await client.query(
      `select rosetta_replay.truth_observation_execute(
         $1::uuid,$2::uuid,$3,$4) as execution`,
      [attempt_id, options.manifest_id, REQUIRED_CLOSURE_PREFIX, REQUIRED_TIMEOUT_MS],
    );
    result.execution = execution_result.rows[0]?.execution;
    await client.query("set local statement_timeout = '0'");
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    result.error_code = error instanceof Error && "code" in error
      ? String((error as Error & { code?: string }).code ?? "")
      : undefined;
    result.error_message = error instanceof Error ? error.message : String(error);
  } finally {
    client.release();
  }
  if (result.error_code || result.error_message) return result;

  try {
    const final_result = await pool.query(
      `select rosetta_replay.truth_observation_finalize(
         $1::uuid,$2::uuid,$3) as receipt_id`,
      [attempt_id, options.manifest_id, options.worker_identity],
    );
    result.final_receipt_id = final_result.rows[0]?.receipt_id;
  } catch (error) {
    result.error_code = error instanceof Error && "code" in error
      ? String((error as Error & { code?: string }).code ?? "")
      : undefined;
    result.error_message = error instanceof Error ? error.message : String(error);
  }
  return result;
}

export async function run_c3_sealed_panel_runner(options: cli_options) {
  const pool = create_pool();
  const started_at = new Date().toISOString();
  try {
    const client = await pool.connect();
    try {
      await verify_manifest(client, options.manifest_id);
      const members = await load_members(client, options);
      const results: member_result[] = [];
      for (const member of members) {
        results.push(await run_member(pool, options, member));
      }
      const receipt = {
        contract: C3_SEALED_PANEL_RUNNER_CONTRACT,
        manifest_id: options.manifest_id,
        panel_table: options.panel_table,
        worker_identity: options.worker_identity,
        include_unreceipted: options.include_unreceipted,
        timeout_ms: REQUIRED_TIMEOUT_MS,
        started_at,
        finished_at: new Date().toISOString(),
        summary: summarize_results(results),
        results,
      };
      const final_receipt = {
        ...receipt,
        receipt_sha256: receipt_hash(receipt),
      };
      await mkdir(options.out_dir, { recursive: true });
      const receipt_path = path.join(options.out_dir, "c3-sealed-panel-runner-receipt.json");
      await writeFile(receipt_path, `${JSON.stringify(final_receipt, null, 2)}\n`, "utf8");
      return { receipt: final_receipt, receipt_path };
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const options = parse_args(process.argv.slice(2));
  const result = await run_c3_sealed_panel_runner(options);
  console.log(JSON.stringify({
    receipt_path: result.receipt_path,
    summary: result.receipt.summary,
    receipt_sha256: result.receipt.receipt_sha256,
  }, null, 2));
}

const invoked_path = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked_path === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
