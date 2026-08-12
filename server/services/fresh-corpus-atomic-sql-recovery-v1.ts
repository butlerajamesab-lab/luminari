import crypto from "node:crypto";
import { getPool } from "../db";
import { SUPABASE_PROJECT } from "../_core/health-diagnostics";

export const ATOMIC_SQL_RECOVERY_ENGINE_VERSION = "fresh_atomic_sql_recovery_v1.0.0";
export const ATOMIC_SQL_RECOVERY_PARSER_VERSION = "fresh_atomic_sql_bounded_v1.0.0";

const TARGET_OBJECT = "luminari_full_substrate_handoff.sql";
const INSERT_BATCH_SIZE = 250;
const MAX_RECORDS = 300_000;
const MAX_EXCERPT = 8_000;

type SourceArtifact = {
  artifact_key: string;
  bucket_id: string;
  object_name: string;
  byte_size: number;
};

type PendingRecord = {
  atomic_record_key: string;
  source_file_sha256: string;
  source_kind: string;
  source_relation: string;
  row_ordinal: number;
  column_names: string[];
  values_json: Record<string, unknown> | unknown[];
  raw_excerpt: string | null;
  parser_version: string;
  record_hash: string;
  source_locator: string;
};

function sha256(value: Buffer | string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stable(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function encodeStoragePath(value: string): string {
  return value.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

function supabaseBaseUrl(): string {
  return (process.env.SUPABASE_URL || process.env.LIGHTHOUSE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || `https://${SUPABASE_PROJECT}.supabase.co`).replace(/\/+$/, "");
}

async function downloadArtifact(artifact: SourceArtifact): Promise<Buffer> {
  const url = `${supabaseBaseUrl()}/storage/v1/object/public/${encodeURIComponent(artifact.bucket_id)}/${encodeStoragePath(artifact.object_name)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/octet-stream" } });
    if (!response.ok) throw new Error(`storage_download_http_${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength !== Number(artifact.byte_size)) throw new Error(`storage_byte_size_mismatch_${artifact.byte_size}_${buffer.byteLength}`);
    return buffer;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeRelation(value: string): string {
  return value.replace(/"/g, "").replace(/^public\./i, "").replace(/\s+/g, "").slice(0, 300);
}

function splitTopLevel(input: string): string[] {
  const out: string[] = [];
  let current = "";
  let depth = 0;
  let single = false;
  let double = false;
  let dollarTag: string | null = null;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (dollarTag) {
      if (input.startsWith(dollarTag, i)) { current += dollarTag; i += dollarTag.length - 1; dollarTag = null; }
      else current += char;
      continue;
    }
    if (!single && !double && char === '$') {
      const tag = input.slice(i, i + 100).match(/^\$[A-Za-z0-9_]*\$/)?.[0];
      if (tag) { dollarTag = tag; current += tag; i += tag.length - 1; continue; }
    }
    if (!double && char === "'") {
      if (single && input[i + 1] === "'") { current += "''"; i += 1; continue; }
      single = !single; current += char; continue;
    }
    if (!single && char === '"') { double = !double; current += char; continue; }
    if (!single && !double) {
      if (char === '(' || char === '[' || char === '{') depth += 1;
      else if (char === ')' || char === ']' || char === '}') depth = Math.max(0, depth - 1);
      else if (char === ',' && depth === 0) { out.push(current.trim()); current = ""; continue; }
    }
    current += char;
  }
  out.push(current.trim());
  return out;
}

function sqlLiteral(raw: string): unknown {
  const value = raw.trim();
  if (/^null$/i.test(value) || value === "\\N") return null;
  const castless = value.replace(/::[A-Za-z0-9_\.\[\]\"]+\s*$/g, "").trim();
  if (castless.startsWith("'") && castless.endsWith("'")) return castless.slice(1, -1).replace(/''/g, "'").slice(0, 20_000);
  return castless.slice(0, 20_000);
}

function makeRecord(sourceFileSha256: string, sourceKind: string, sourceRelation: string, rowOrdinal: number, columns: string[], values: Record<string, unknown> | unknown[], excerpt: string, locator: string): PendingRecord {
  const material = { source_file_sha256: sourceFileSha256, source_kind: sourceKind, source_relation: sourceRelation, row_ordinal: rowOrdinal, column_names: columns, values };
  const recordHash = sha256(stable(material));
  const key = sha256(stable({ source_file_sha256: sourceFileSha256, row_ordinal: rowOrdinal, record_hash: recordHash }));
  return {
    atomic_record_key: key,
    source_file_sha256: sourceFileSha256,
    source_kind: sourceKind,
    source_relation: sourceRelation,
    row_ordinal: rowOrdinal,
    column_names: columns,
    values_json: values,
    raw_excerpt: excerpt.slice(0, MAX_EXCERPT),
    parser_version: ATOMIC_SQL_RECOVERY_PARSER_VERSION,
    record_hash: recordHash,
    source_locator: locator,
  };
}

async function flush(runId: string, artifactKey: string, rows: PendingRecord[]): Promise<{ inserted: number; origins: number }> {
  if (!rows.length) return { inserted: 0, origins: 0 };
  const result = await getPool().query(`
    with source_rows as (
      select * from jsonb_to_recordset($1::jsonb) as x(
        atomic_record_key text,source_file_sha256 text,source_kind text,source_relation text,row_ordinal integer,
        column_names jsonb,values_json jsonb,raw_excerpt text,parser_version text,record_hash text,source_locator text
      )
    ), records as (
      insert into public.luminari_corpus_atomic_record_v1(
        atomic_record_key,source_file_sha256,source_kind,source_relation,row_ordinal,column_names,values_json,raw_excerpt,parser_version,record_hash
      ) select atomic_record_key,source_file_sha256,source_kind,source_relation,row_ordinal,column_names,values_json,raw_excerpt,parser_version,record_hash
        from source_rows
      on conflict(atomic_record_key) do nothing returning atomic_record_key
    ), origins as (
      insert into public.luminari_corpus_atomic_record_origin_v1(atomic_record_key,origin_hash,run_id,artifact_key,container_member_path,source_locator)
      select atomic_record_key,
             encode(digest(atomic_record_key||'|'||$2||'||'||source_locator,'sha256'),'hex'),
             $3::uuid,$2,null,source_locator
        from source_rows
      on conflict(atomic_record_key,origin_hash) do nothing returning atomic_record_key
    )
    select (select count(*)::int from records) as inserted,(select count(*)::int from origins) as origins
  `, [JSON.stringify(rows), artifactKey, runId]);
  return { inserted: Number(result.rows[0]?.inserted ?? 0), origins: Number(result.rows[0]?.origins ?? 0) };
}

function findLineEnd(text: string, start: number): number {
  const index = text.indexOf("\n", start);
  return index < 0 ? text.length : index;
}

function statementEnd(text: string, start: number): number {
  let single = false;
  let double = false;
  let dollarTag: string | null = null;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (dollarTag) {
      if (text.startsWith(dollarTag, i)) { i += dollarTag.length - 1; dollarTag = null; }
      continue;
    }
    if (!single && !double && char === '$') {
      const tag = text.slice(i, i + 100).match(/^\$[A-Za-z0-9_]*\$/)?.[0];
      if (tag) { dollarTag = tag; i += tag.length - 1; continue; }
    }
    if (!double && char === "'") {
      if (single && text[i + 1] === "'") { i += 1; continue; }
      single = !single; continue;
    }
    if (!single && char === '"') { double = !double; continue; }
    if (!single && !double && char === ';') return i;
  }
  return text.length - 1;
}

async function parseSqlBounded(runId: string, artifact: SourceArtifact, buffer: Buffer): Promise<{ generated: number; inserted: number; origins: number; sourceFileSha256: string }> {
  const text = buffer.toString("utf8");
  const sourceFileSha256 = sha256(buffer);
  const relationOrdinal = new Map<string, number>();
  let generated = 0;
  let inserted = 0;
  let origins = 0;
  let cursor = 0;
  let batch: PendingRecord[] = [];

  const emit = async (record: PendingRecord) => {
    batch.push(record);
    generated += 1;
    if (generated > MAX_RECORDS) throw new Error(`atomic_sql_record_ceiling_${MAX_RECORDS}`);
    if (batch.length >= INSERT_BATCH_SIZE) {
      const result = await flush(runId, artifact.artifact_key, batch);
      inserted += result.inserted;
      origins += result.origins;
      batch = [];
      await new Promise(resolve => setImmediate(resolve));
    }
  };

  while (cursor < text.length) {
    const lineEnd = findLineEnd(text, cursor);
    const line = text.slice(cursor, lineEnd).replace(/\r$/, "");
    const trimmed = line.trimStart();

    const copy = trimmed.match(/^COPY\s+((?:"[^"]+"|[A-Za-z0-9_]+)(?:\.(?:"[^"]+"|[A-Za-z0-9_]+))?)\s*(?:\(([^)]*)\))?\s+FROM\s+stdin\s*;/i);
    if (copy) {
      const relation = normalizeRelation(copy[1]);
      const columns = copy[2] ? splitTopLevel(copy[2]).map(value => value.replace(/"/g, "").trim()) : [];
      cursor = lineEnd + 1;
      while (cursor < text.length) {
        const rowEnd = findLineEnd(text, cursor);
        const rowLine = text.slice(cursor, rowEnd).replace(/\r$/, "");
        cursor = rowEnd + 1;
        if (rowLine === "\\.") break;
        const fields = rowLine.split("\t").map(sqlLiteral);
        const ordinal = (relationOrdinal.get(relation) ?? 0) + 1;
        relationOrdinal.set(relation, ordinal);
        const values = columns.length ? Object.fromEntries(fields.map((value, index) => [columns[index] ?? `column_${index + 1}`, value])) : fields;
        await emit(makeRecord(sourceFileSha256, "sql_copy_row", relation, ordinal, columns, values, rowLine, `sql:COPY:${relation}:row:${ordinal}`));
      }
      continue;
    }

    if (/^INSERT\s+INTO\s+/i.test(trimmed)) {
      const end = statementEnd(text, cursor);
      const statement = text.slice(cursor, end + 1);
      const header = statement.match(/^\s*INSERT\s+INTO\s+((?:"[^"]+"|[A-Za-z0-9_]+)(?:\.(?:"[^"]+"|[A-Za-z0-9_]+))?)\s*(\((?:[^()]|\([^)]*\))*\))?\s*VALUES\s*/i);
      if (header) {
        const relation = normalizeRelation(header[1]);
        const columns = header[2] ? splitTopLevel(header[2].slice(1, -1)).map(value => value.replace(/"/g, "").trim()) : [];
        let i = header[0].length;
        let depth = 0;
        let start = -1;
        let single = false;
        let double = false;
        let dollarTag: string | null = null;
        while (i < statement.length) {
          const char = statement[i];
          if (dollarTag) {
            if (statement.startsWith(dollarTag, i)) { i += dollarTag.length; dollarTag = null; continue; }
            i += 1; continue;
          }
          if (!single && !double && char === '$') {
            const tag = statement.slice(i, i + 100).match(/^\$[A-Za-z0-9_]*\$/)?.[0];
            if (tag) { dollarTag = tag; i += tag.length; continue; }
          }
          if (!double && char === "'") {
            if (single && statement[i + 1] === "'") { i += 2; continue; }
            single = !single; i += 1; continue;
          }
          if (!single && char === '"') { double = !double; i += 1; continue; }
          if (!single && !double) {
            if (char === '(') { if (depth === 0) start = i + 1; depth += 1; i += 1; continue; }
            if (char === ')') {
              depth -= 1;
              if (depth === 0 && start >= 0) {
                const tuple = statement.slice(start, i);
                const fields = splitTopLevel(tuple).map(sqlLiteral);
                const ordinal = (relationOrdinal.get(relation) ?? 0) + 1;
                relationOrdinal.set(relation, ordinal);
                const values = columns.length ? Object.fromEntries(fields.map((value, index) => [columns[index] ?? `column_${index + 1}`, value])) : fields;
                await emit(makeRecord(sourceFileSha256, "sql_insert_row", relation, ordinal, columns, values, tuple, `sql:INSERT:${relation}:row:${ordinal}`));
                start = -1;
              }
              i += 1; continue;
            }
          }
          i += 1;
        }
      }
      cursor = end + 1;
      continue;
    }

    cursor = lineEnd + 1;
  }

  if (batch.length) {
    const result = await flush(runId, artifact.artifact_key, batch);
    inserted += result.inserted;
    origins += result.origins;
  }
  return { generated, inserted, origins, sourceFileSha256 };
}

async function findQueuedRun() {
  const result = await getPool().query(`
    select run_id::text,scope
      from public.luminari_corpus_atomic_run_v1
     where engine_version=$1 and status in ('queued','running')
     order by started_at asc limit 1
  `, [ATOMIC_SQL_RECOVERY_ENGINE_VERSION]);
  return result.rows[0] ?? null;
}

async function targetArtifact(): Promise<SourceArtifact> {
  const result = await getPool().query(`
    select artifact_key,bucket_id,object_name,byte_size
      from public.luminari_corpus_source_artifact_v1
     where object_name=$1 and exact_duplicate_of is null
     order by byte_size desc limit 1
  `, [TARGET_OBJECT]);
  if (!result.rows[0]) throw new Error("atomic_sql_recovery_target_missing");
  return { ...result.rows[0], byte_size: Number(result.rows[0].byte_size ?? 0) };
}

export async function queueAtomicSqlRecovery() {
  const existing = await findQueuedRun();
  if (existing) return { run_id: existing.run_id, status: "existing" };
  const result = await getPool().query(`
    insert into public.luminari_corpus_atomic_run_v1(engine_version,scope,status)
    values($1,$2::jsonb,'queued') returning run_id::text,status
  `, [ATOMIC_SQL_RECOVERY_ENGINE_VERSION, JSON.stringify({ target_object: TARGET_OBJECT, parent_full_run: "bf55517e-7289-477b-8fb3-2c800d7d05ce", mode: "bounded_sql_recovery" })]);
  return result.rows[0];
}

export async function resumeAtomicSqlRecoveryFromDatabase() {
  const queued = await findQueuedRun();
  if (!queued) return { status: "idle" };
  const runId = String(queued.run_id);
  const artifact = await targetArtifact();
  const pool = getPool();
  await pool.query(`update public.luminari_corpus_atomic_run_v1 set status='running' where run_id=$1 and status='queued'`, [runId]);
  await pool.query(`
    insert into public.luminari_corpus_atomic_artifact_v1(run_id,artifact_key,status,attempt_count,started_at)
    values($1,$2,'running',1,now())
    on conflict(run_id,artifact_key) do update set status='running',attempt_count=luminari_corpus_atomic_artifact_v1.attempt_count+1,started_at=now(),error_message=null
  `, [runId, artifact.artifact_key]);

  try {
    const buffer = await downloadArtifact(artifact);
    const result = await parseSqlBounded(runId, artifact, buffer);
    const artifactReceipt = sha256(stable({ engine: ATOMIC_SQL_RECOVERY_ENGINE_VERSION, parser: ATOMIC_SQL_RECOVERY_PARSER_VERSION, artifact_key: artifact.artifact_key, content_sha256: result.sourceFileSha256, generated: result.generated }));
    await pool.query(`
      update public.luminari_corpus_atomic_artifact_v1
         set status='completed',content_sha256=$3,atomic_record_count=$4,origin_count=$5,completed_at=now(),receipt_hash=$6,
             result_json=$7::jsonb
       where run_id=$1 and artifact_key=$2
    `, [runId, artifact.artifact_key, result.sourceFileSha256, result.generated, result.origins, artifactReceipt, JSON.stringify({ ...result, parser_version: ATOMIC_SQL_RECOVERY_PARSER_VERSION })]);

    const counts = await pool.query(`select count(distinct atomic_record_key)::bigint as atomic_records,count(*)::bigint as origins from public.luminari_corpus_atomic_record_origin_v1 where run_id=$1`, [runId]);
    const atomicRecords = Number(counts.rows[0]?.atomic_records ?? 0);
    const origins = Number(counts.rows[0]?.origins ?? 0);
    const runReceipt = sha256(stable({ engine: ATOMIC_SQL_RECOVERY_ENGINE_VERSION, parser: ATOMIC_SQL_RECOVERY_PARSER_VERSION, artifact_receipt: artifactReceipt, atomic_records: atomicRecords, origins }));
    await pool.query(`
      update public.luminari_corpus_atomic_run_v1
         set status='completed',artifact_count=1,atomic_record_count=$2,origin_count=$3,completed_at=now(),receipt_hash=$4,
             result_json=$5::jsonb
       where run_id=$1
    `, [runId, atomicRecords, origins, runReceipt, JSON.stringify({ target_object: TARGET_OBJECT, parser_version: ATOMIC_SQL_RECOVERY_PARSER_VERSION, artifact_receipt: artifactReceipt })]);
    return { status: "completed", run_id: runId, atomic_records: atomicRecords, origins, receipt_hash: runReceipt };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await pool.query(`update public.luminari_corpus_atomic_artifact_v1 set status='failed',completed_at=now(),error_message=$3,result_json=$4::jsonb where run_id=$1 and artifact_key=$2`, [runId, artifact.artifact_key, message.slice(0, 1000), JSON.stringify({ error: message.slice(0, 1000), parser_version: ATOMIC_SQL_RECOVERY_PARSER_VERSION })]);
    await pool.query(`update public.luminari_corpus_atomic_run_v1 set status='failed',artifact_count=1,completed_at=now(),result_json=$2::jsonb where run_id=$1`, [runId, JSON.stringify({ error: message.slice(0, 1000), target_object: TARGET_OBJECT })]);
    throw error;
  }
}
