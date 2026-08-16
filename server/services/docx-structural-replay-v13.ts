import crypto from "node:crypto";
import { getPool } from "../db";
import { SUPABASE_PROJECT } from "../_core/health-diagnostics";
import {
  DOCX_STRUCTURAL_PARSER_VERSION,
  extractDocxStructure,
  structuralCandidateSeeds,
  type StructuralCandidateSeed,
} from "./docx-structural-extractor-v13";

export const DOCX_STRUCTURAL_REPLAY_ENGINE_VERSION = "fresh_docx_structural_replay_v1.3.0";
export const DEFAULT_STRUCTURAL_ROLES = ["addendum_source", "domain_deep_dive_source"] as const;

const STATE_NAMES: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS",
  Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA",
  Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT",
  Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND",
  Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI",
  "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT",
  Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI",
  Wyoming: "WY", "District of Columbia": "DC", "Puerto Rico": "PR", Guam: "GU",
  "American Samoa": "AS", "Northern Mariana Islands": "MP", "U.S. Virgin Islands": "VI",
};
const VALID_STATE_CODES = new Set(Object.values(STATE_NAMES));
const IDENTITY_TYPES = new Set(["resource", "organization", "agency"]);

type StructuralSourceArtifact = {
  artifact_key: string;
  bucket_id: string;
  object_name: string;
  byte_size: number;
  mimetype: string | null;
  artifact_role: string;
  jurisdiction_hint: string | null;
  semantic_family: string;
  exact_duplicate_of: string | null;
};

type StructuralCandidate = {
  candidate_key: string;
  run_id: string;
  artifact_key: string;
  candidate_type: string;
  source_locator: string;
  jurisdiction: string | null;
  state_code: string | null;
  section_name: string | null;
  name: string | null;
  organization_name: string | null;
  category: string | null;
  layer: string | null;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  address: string | null;
  eligibility_summary: string | null;
  apply_notes: string | null;
  description: string | null;
  raw_excerpt: string | null;
  parser_version: string;
  candidate_hash: string;
  source_content_sha256: string;
  jurisdiction_resolution_state: string;
  candidate_state: string;
  payload: Record<string, unknown>;
};

function sha256(input: Buffer | string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function stable(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function compact(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function encodeStoragePath(value: string): string {
  return value.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

function supabaseBaseUrl(): string {
  return (
    process.env.SUPABASE_URL
    || process.env.LIGHTHOUSE_SUPABASE_URL
    || process.env.VITE_SUPABASE_URL
    || `https://${SUPABASE_PROJECT}.supabase.co`
  ).replace(/\/+$/, "");
}

async function downloadArtifact(artifact: StructuralSourceArtifact): Promise<Buffer> {
  const url = `${supabaseBaseUrl()}/storage/v1/object/public/${encodeURIComponent(artifact.bucket_id)}/${encodeStoragePath(artifact.object_name)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/octet-stream" } });
    if (!response.ok) throw new Error(`storage_download_http_${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (artifact.byte_size > 0 && Number(artifact.byte_size) !== buffer.byteLength) {
      throw new Error(`storage_byte_size_mismatch_expected_${artifact.byte_size}_actual_${buffer.byteLength}`);
    }
    return buffer;
  } finally {
    clearTimeout(timer);
  }
}

function detectJurisdiction(artifact: StructuralSourceArtifact, excerpt: string) {
  const explicitCodes = [...excerpt.matchAll(/\b([A-Z]{2})\b/g)]
    .map((match) => match[1])
    .filter((code) => VALID_STATE_CODES.has(code));
  const namedCodes = Object.entries(STATE_NAMES)
    .filter(([name]) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(excerpt))
    .map(([, code]) => code);
  const codes = [...new Set([...explicitCodes, ...namedCodes])];
  const artifactCode = artifact.jurisdiction_hint && VALID_STATE_CODES.has(artifact.jurisdiction_hint)
    ? artifact.jurisdiction_hint
    : null;

  if (codes.length === 1) {
    if (artifactCode && artifactCode !== codes[0]) {
      return { stateCode: null, jurisdiction: artifactCode, state: "conflict" };
    }
    return { stateCode: codes[0], jurisdiction: codes[0], state: "content_consistent" };
  }
  if (codes.length > 1) return { stateCode: null, jurisdiction: "US", state: "multi_jurisdiction" };
  if (artifactCode) return { stateCode: artifactCode, jurisdiction: artifactCode, state: "artifact_inferred" };
  return { stateCode: null, jurisdiction: "US", state: "national_or_federal" };
}

function seedToCandidate(runId: string, artifact: StructuralSourceArtifact, contentSha256: string, seed: StructuralCandidateSeed): StructuralCandidate {
  const jurisdiction = detectJurisdiction(artifact, seed.excerptForJurisdiction);
  const rawExcerpt = compact(seed.description || seed.applyNotes || seed.name).slice(0, 8000);
  const payload = {
    ...seed.payload,
    structural_parser_version: DOCX_STRUCTURAL_PARSER_VERSION,
    structural_replay_engine_version: DOCX_STRUCTURAL_REPLAY_ENGINE_VERSION,
    target_surface: seed.targetSurface,
    source_artifact_role: artifact.artifact_role,
    semantic_family: artifact.semantic_family,
    promotion_state: "validation_only_not_current",
  };
  const material = {
    artifact_key: artifact.artifact_key,
    source_content_sha256: contentSha256,
    candidate_type: seed.candidateType,
    source_locator: seed.sourceLocator,
    name: seed.name,
    organization_name: seed.organizationName,
    category: seed.category,
    phone: seed.phone,
    email: seed.email,
    website_url: seed.websiteUrl,
    address: seed.address,
    eligibility_summary: seed.eligibilitySummary,
    apply_notes: seed.applyNotes,
    description: seed.description,
    payload,
  };
  const candidateHash = sha256(stable(material));
  const candidateKey = sha256(stable({
    run_id: runId,
    candidate_hash: candidateHash,
    parser_version: DOCX_STRUCTURAL_PARSER_VERSION,
  }));
  return {
    candidate_key: candidateKey,
    run_id: runId,
    artifact_key: artifact.artifact_key,
    candidate_type: seed.candidateType,
    source_locator: seed.sourceLocator,
    jurisdiction: jurisdiction.jurisdiction,
    state_code: jurisdiction.stateCode,
    section_name: seed.sectionName,
    name: seed.name,
    organization_name: seed.organizationName,
    category: seed.category,
    layer: "docx_structural_v13",
    phone: seed.phone,
    email: seed.email,
    website_url: seed.websiteUrl,
    address: seed.address,
    eligibility_summary: seed.eligibilitySummary,
    apply_notes: seed.applyNotes,
    description: seed.description,
    raw_excerpt: rawExcerpt,
    parser_version: DOCX_STRUCTURAL_PARSER_VERSION,
    candidate_hash: candidateHash,
    source_content_sha256: contentSha256,
    jurisdiction_resolution_state: jurisdiction.state,
    candidate_state: IDENTITY_TYPES.has(seed.candidateType) ? "unresolved" : "typed_preserved",
    payload,
  };
}

async function selectArtifacts(options: { artifactKeys?: string[]; roles?: string[]; limit?: number }) {
  const pool = getPool();
  const roles = options.roles?.length ? options.roles : [...DEFAULT_STRUCTURAL_ROLES];
  const limit = Math.min(Math.max(Number(options.limit ?? 200), 1), 500);
  const params: unknown[] = [roles, limit];
  let artifactClause = "";
  if (options.artifactKeys?.length) {
    params.push(options.artifactKeys);
    artifactClause = `and artifact_key = any($${params.length}::text[])`;
  }
  const result = await pool.query(`
    select artifact_key,bucket_id,object_name,byte_size,mimetype,artifact_role,jurisdiction_hint,semantic_family,exact_duplicate_of
      from public.luminari_corpus_source_artifact_v1
     where storage_state='active'
       and artifact_role = any($1::text[])
       and lower(object_name) like '%.docx'
       and exact_duplicate_of is null
       ${artifactClause}
     order by artifact_role,artifact_key
     limit $2
  `, params);
  return result.rows.map((row) => ({ ...row, byte_size: Number(row.byte_size ?? 0) })) as StructuralSourceArtifact[];
}

function classifyCounts(candidates: StructuralCandidate[]) {
  const counts: Record<string, number> = {};
  for (const row of candidates) counts[row.candidate_type] = (counts[row.candidate_type] ?? 0) + 1;
  return counts;
}

async function parseArtifact(runId: string, artifact: StructuralSourceArtifact) {
  const buffer = await downloadArtifact(artifact);
  const contentSha256 = sha256(buffer);
  const structure = await extractDocxStructure(buffer);
  const seeds = structuralCandidateSeeds(structure);
  const candidates = seeds.map((seed) => seedToCandidate(runId, artifact, contentSha256, seed));
  return {
    artifact,
    contentSha256,
    paragraphCount: structure.paragraphs.length,
    tableCount: structure.tables.length,
    hyperlinkCount: structure.hyperlinks.length,
    candidateCounts: classifyCounts(candidates),
    candidates,
  };
}

export async function previewDocxStructuralReplay(options: { artifactKeys?: string[]; roles?: string[]; limit?: number } = {}) {
  const artifacts = await selectArtifacts(options);
  const previewRunId = "00000000-0000-0000-0000-000000000000";
  const results = [];
  for (const artifact of artifacts) {
    const parsed = await parseArtifact(previewRunId, artifact);
    results.push({
      artifact_key: artifact.artifact_key,
      object_name: artifact.object_name,
      artifact_role: artifact.artifact_role,
      content_sha256: parsed.contentSha256,
      paragraph_count: parsed.paragraphCount,
      table_count: parsed.tableCount,
      hyperlink_count: parsed.hyperlinkCount,
      candidate_count: parsed.candidates.length,
      candidate_counts: parsed.candidateCounts,
      sample: parsed.candidates.slice(0, 12).map((row) => ({
        candidate_type: row.candidate_type,
        source_locator: row.source_locator,
        name: row.name,
        state_code: row.state_code,
        jurisdiction: row.jurisdiction,
        phone: row.phone,
        website_url: row.website_url,
      })),
    });
  }
  return {
    contract: "docx_structural_replay_preview_v13",
    parser_version: DOCX_STRUCTURAL_PARSER_VERSION,
    engine_version: DOCX_STRUCTURAL_REPLAY_ENGINE_VERSION,
    promotion_state: "validation_only_not_current",
    artifact_count: results.length,
    candidate_count: results.reduce((sum, row) => sum + row.candidate_count, 0),
    artifacts: results,
  };
}

async function insertCandidates(candidates: StructuralCandidate[]) {
  if (!candidates.length) return { inserted: 0, idempotent: 0 };
  const result = await getPool().query(`
    with source_rows as (
      select * from jsonb_to_recordset($1::jsonb) as x(
        candidate_key text, run_id uuid, artifact_key text, candidate_type text, source_locator text,
        jurisdiction text, state_code text, section_name text, name text, organization_name text,
        category text, layer text, phone text, email text, website_url text, address text,
        eligibility_summary text, apply_notes text, description text, raw_excerpt text,
        parser_version text, candidate_hash text, source_content_sha256 text,
        jurisdiction_resolution_state text, candidate_state text, payload jsonb
      )
    ), inserted as (
      insert into public.luminari_corpus_candidate_v1 (
        candidate_key,run_id,artifact_key,candidate_type,source_locator,jurisdiction,state_code,section_name,
        name,organization_name,category,layer,phone,email,website_url,address,eligibility_summary,apply_notes,
        description,raw_excerpt,parser_version,candidate_hash,source_content_sha256,jurisdiction_resolution_state,candidate_state,payload
      )
      select candidate_key,run_id,artifact_key,candidate_type,source_locator,jurisdiction,state_code,section_name,
             name,organization_name,category,layer,phone,email,website_url,address,eligibility_summary,apply_notes,
             description,raw_excerpt,parser_version,candidate_hash,source_content_sha256,jurisdiction_resolution_state,candidate_state,payload
        from source_rows
      on conflict(candidate_key) do nothing
      returning 1
    )
    select (select count(*)::int from inserted) as inserted,
           (select count(*)::int from source_rows) - (select count(*)::int from inserted) as idempotent
  `, [JSON.stringify(candidates)]);
  return {
    inserted: Number(result.rows[0]?.inserted ?? 0),
    idempotent: Number(result.rows[0]?.idempotent ?? 0),
  };
}

export async function runDocxStructuralReplay(options: { artifactKeys?: string[]; roles?: string[]; limit?: number } = {}) {
  const pool = getPool();
  const artifacts = await selectArtifacts(options);
  const scope = {
    source_roles: options.roles?.length ? options.roles : [...DEFAULT_STRUCTURAL_ROLES],
    artifact_keys: options.artifactKeys ?? null,
    parser_version: DOCX_STRUCTURAL_PARSER_VERSION,
    mode: "validation_only_not_current",
    auto_promote: false,
  };
  const run = await pool.query(`
    insert into public.luminari_corpus_rebuild_run_v1(engine_version,scope,status,artifact_count,result_json)
    values($1,$2::jsonb,'started',$3,jsonb_build_object(
      'parser_version',$4::text,
      'promotion_state','validation_only_not_current',
      'auto_promote',false
    )) returning run_id
  `, [DOCX_STRUCTURAL_REPLAY_ENGINE_VERSION, JSON.stringify(scope), artifacts.length, DOCX_STRUCTURAL_PARSER_VERSION]);
  const runId = String(run.rows[0].run_id);
  const artifactResults: Array<Record<string, unknown>> = [];
  let totalCandidates = 0;
  let totalInserted = 0;
  let totalIdempotent = 0;

  for (const artifact of artifacts) {
    const startedAt = new Date().toISOString();
    await pool.query(`
      insert into public.luminari_corpus_rebuild_artifact_v1(run_id,artifact_key,status,attempt_count,started_at,result_json)
      values($1,$2,'running',1,$3,jsonb_build_object('parser_version',$4::text,'promotion_state','validation_only_not_current'))
      on conflict(run_id,artifact_key) do nothing
    `, [runId, artifact.artifact_key, startedAt, DOCX_STRUCTURAL_PARSER_VERSION]);
    try {
      const parsed = await parseArtifact(runId, artifact);
      const inserted = await insertCandidates(parsed.candidates);
      totalCandidates += parsed.candidates.length;
      totalInserted += inserted.inserted;
      totalIdempotent += inserted.idempotent;
      const receiptHash = sha256(stable({
        run_id: runId,
        artifact_key: artifact.artifact_key,
        content_sha256: parsed.contentSha256,
        parser_version: DOCX_STRUCTURAL_PARSER_VERSION,
        candidate_hashes: parsed.candidates.map((row) => row.candidate_hash).sort(),
      }));
      const resultJson = {
        parser_version: DOCX_STRUCTURAL_PARSER_VERSION,
        promotion_state: "validation_only_not_current",
        paragraph_count: parsed.paragraphCount,
        table_count: parsed.tableCount,
        hyperlink_count: parsed.hyperlinkCount,
        candidate_counts: parsed.candidateCounts,
        inserted: inserted.inserted,
        idempotent: inserted.idempotent,
      };
      await pool.query(`
        update public.luminari_corpus_rebuild_artifact_v1
           set status='completed',content_sha256=$3,candidate_count=$4,error_message=null,completed_at=now(),receipt_hash=$5,result_json=result_json||$6::jsonb
         where run_id=$1 and artifact_key=$2
      `, [runId, artifact.artifact_key, parsed.contentSha256, parsed.candidates.length, receiptHash, JSON.stringify(resultJson)]);
      artifactResults.push({ artifact_key: artifact.artifact_key, object_name: artifact.object_name, ...resultJson, candidate_count: parsed.candidates.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await pool.query(`
        update public.luminari_corpus_rebuild_artifact_v1
           set status='failed',error_message=$3,completed_at=now(),result_json=result_json||jsonb_build_object('error',$3::text)
         where run_id=$1 and artifact_key=$2
      `, [runId, artifact.artifact_key, message.slice(0, 1000)]);
      artifactResults.push({ artifact_key: artifact.artifact_key, object_name: artifact.object_name, error: message });
    }
  }

  const failed = artifactResults.filter((row) => row.error).length;
  const receiptHash = sha256(stable({
    run_id: runId,
    engine_version: DOCX_STRUCTURAL_REPLAY_ENGINE_VERSION,
    parser_version: DOCX_STRUCTURAL_PARSER_VERSION,
    artifacts: artifactResults,
  }));
  const resultJson = {
    parser_version: DOCX_STRUCTURAL_PARSER_VERSION,
    promotion_state: "validation_only_not_current",
    auto_promote: false,
    artifacts_completed: artifactResults.length - failed,
    artifacts_failed: failed,
    inserted: totalInserted,
    idempotent: totalIdempotent,
  };
  await pool.query(`
    update public.luminari_corpus_rebuild_run_v1
       set status=$2,candidate_count=$3,unresolved_count=0,completed_at=now(),receipt_hash=$4,result_json=result_json||$5::jsonb
     where run_id=$1
  `, [runId, failed ? "completed_with_failures" : "completed", totalCandidates, receiptHash, JSON.stringify(resultJson)]);

  return {
    contract: "docx_structural_replay_run_v13",
    run_id: runId,
    engine_version: DOCX_STRUCTURAL_REPLAY_ENGINE_VERSION,
    parser_version: DOCX_STRUCTURAL_PARSER_VERSION,
    promotion_state: "validation_only_not_current",
    auto_promote: false,
    artifact_count: artifacts.length,
    candidate_count: totalCandidates,
    inserted: totalInserted,
    idempotent: totalIdempotent,
    failed,
    artifacts: artifactResults,
  };
}
