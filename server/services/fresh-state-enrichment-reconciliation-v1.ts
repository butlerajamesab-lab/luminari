import crypto from "node:crypto";
import JSZip from "jszip";
import { getPool } from "../db";
import { SUPABASE_PROJECT } from "../_core/health-diagnostics";

export const STATE_ENRICHMENT_ENGINE_VERSION = "fresh_state_enrichment_reconciliation_v1.0.0";
export const STATE_ENRICHMENT_PARSER_VERSION = "state_enrichment_label_value_parser_v1.0.0";

const FIELD_LABELS: Record<string, string> = {
  "address": "address",
  "phone": "phone",
  "telephone": "phone",
  "email": "email",
  "website": "website_url",
  "url": "website_url",
  "eligibility": "eligibility_summary",
  "apply / notes": "apply_notes",
  "apply notes": "apply_notes",
  "application / notes": "apply_notes",
  "application": "apply_notes",
  "notes": "apply_notes",
  "service type": "service_type",
  "organization": "organization_name",
  "agency": "organization_name",
  "statutory authority": "statutory_authority",
  "statute / apply": "statutory_authority",
};

const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/food|nutrition|snap|wic|food bank/i, "food_nutrition"],
  [/health|medicaid|medical|hospital|clinic|behavioral/i, "healthcare"],
  [/housing|rent|tenant|homeless|shelter/i, "housing"],
  [/domestic violence|sexual assault|victim|safety/i, "domestic_violence_safety"],
  [/legal aid|legal service|court help|law help/i, "legal_aid"],
  [/cash assistance|income|tanf|unemployment|ssi|ssdi/i, "cash_assistance_income"],
  [/utilit|energy|liheap|heat relief|electric|gas/i, "utilities"],
  [/tribal|indigenous|native american|indian health/i, "tribal_indigenous"],
  [/labor|employment|wage|worker/i, "labor_employment"],
  [/immigration|refugee/i, "immigration"],
  [/disability/i, "disability"],
  [/mental health|substance|recovery/i, "mental_health_substance_use"],
];

type SourceArtifact = {
  artifact_key: string;
  bucket_id: string;
  object_name: string;
  byte_size: number;
  jurisdiction_hint: string | null;
  exact_duplicate_of: string | null;
};

type ParsedResource = {
  source_locator: string;
  name: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  eligibility_summary: string | null;
  apply_notes: string | null;
  organization_name: string | null;
  statutory_authority: string | null;
  service_type: string | null;
  section_name: string | null;
  raw_excerpt: string;
};

function sha256(value: string | Buffer): string {
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

function compact(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function nullable(value: unknown, max = 5000): string | null {
  const cleaned = compact(value);
  return cleaned ? cleaned.slice(0, max) : null;
}

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/[:：]+$/, "").replace(/\s+/g, " ").trim();
}

function parseKnownLabel(line: string): { key: string; value: string } | null {
  const match = line.match(/^([^:：]{2,80})[:：]\s*(.*)$/);
  if (!match) return null;
  const mapped = FIELD_LABELS[normalizeLabel(match[1])];
  return mapped ? { key: mapped, value: compact(match[2]) } : null;
}

function invalidTitle(value: string): boolean {
  const name = compact(value);
  if (name.length < 4) return true;
  if (/^[0-9]+$/.test(name)) return true;
  if (/^(https?:\/\/|www\.)/i.test(name)) return true;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(name)) return true;
  if (/^(no dedicated portal|no portal|use phone|online portal|not available|n\/?a\b|none\b|dial\b|call\b|text\b)/i.test(name)) return true;
  if (/^[0-9() +.\-]+$/.test(name) && name.replace(/\D/g, "").length >= 7) return true;
  if (/^\d{1,6}\s+.*(?:street|\bst\.?\b|avenue|\bave\.?\b|road|\brd\.?\b|boulevard|blvd|drive|\bdr\.?\b|lane|highway|hwy|suite|room|plaza|parkway|pkwy)/i.test(name)) return true;
  return false;
}

function isSectionHeading(line: string): boolean {
  if (/^LAYER\s+\d+/i.test(line)) return true;
  if (/^(FOOD|HEALTH|HOUSING|DOMESTIC|LEGAL|CASH|UTILIT|TRIBAL|LABOR|IMMIGRATION|DISABILITY|MENTAL)[A-Z &/+-]{2,}$/i.test(line) && line.length < 120) return true;
  if (/^(Phoenix|Tucson|Statewide|Tribal|County|City|Regional).*(Programs|Healthcare|Housing|Services)$/i.test(line) && line.length < 140) return true;
  return false;
}

function inferCategory(section: string | null, name: string): string | null {
  const haystack = `${section ?? ""} ${name}`;
  return CATEGORY_RULES.find(([pattern]) => pattern.test(haystack))?.[1] ?? null;
}

function decodeXmlEntities(value: string): string {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(Number.parseInt(h, 16)));
}

function wordXmlToText(xml: string): string {
  const out: string[] = [];
  const tokens = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>|<w:br\b[^>]*\/?>|<\/w:tc>|<\/w:p>|<\/w:tr>/g;
  for (const match of xml.matchAll(tokens)) {
    if (match[1] !== undefined) out.push(decodeXmlEntities(match[1]));
    else if (match[0].startsWith("<w:tab") || match[0].startsWith("</w:tc")) out.push("\t");
    else out.push("\n");
  }
  return out.join("").replace(/\t+\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("text");
  if (!xml) throw new Error("docx_missing_word_document_xml");
  return wordXmlToText(xml);
}

function encodeStoragePath(value: string): string {
  return value.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

function storageBaseUrl(): string {
  return (process.env.SUPABASE_URL || process.env.LIGHTHOUSE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || `https://${SUPABASE_PROJECT}.supabase.co`).replace(/\/+$/, "");
}

async function downloadArtifact(artifact: SourceArtifact): Promise<Buffer> {
  const url = `${storageBaseUrl()}/storage/v1/object/public/${encodeURIComponent(artifact.bucket_id)}/${encodeStoragePath(artifact.object_name)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/octet-stream" } });
    if (!response.ok) throw new Error(`storage_download_http_${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (artifact.byte_size > 0 && buffer.byteLength !== artifact.byte_size) throw new Error(`storage_byte_size_mismatch_expected_${artifact.byte_size}_actual_${buffer.byteLength}`);
    return buffer;
  } finally {
    clearTimeout(timeout);
  }
}

export function parseStateEnrichmentText(text: string): ParsedResource[] {
  const lines = text.split(/\r?\n/).map(compact);
  const out: ParsedResource[] = [];
  let section: string | null = null;
  let current: { title: string; start: number; fields: Record<string, string>; source: string[]; section: string | null; lastField: string | null } | null = null;

  const flush = () => {
    if (!current) return;
    const f = current.fields;
    const meaningfulFields = [f.address, f.phone, f.website_url, f.eligibility_summary, f.apply_notes, f.organization_name, f.service_type].filter(Boolean).length;
    if (!invalidTitle(current.title) && meaningfulFields >= 2) {
      const excerpt = current.source.join("\n").slice(0, 8000);
      out.push({
        source_locator: `lines:${current.start}-${current.start + current.source.length - 1}`,
        name: current.title.slice(0, 500),
        category: inferCategory(current.section, current.title),
        address: nullable(f.address, 2500),
        phone: nullable(f.phone, 1500),
        email: nullable(f.email, 1000),
        website_url: nullable(f.website_url, 2500),
        eligibility_summary: nullable(f.eligibility_summary, 5000),
        apply_notes: nullable(f.apply_notes, 5000),
        organization_name: nullable(f.organization_name, 500),
        statutory_authority: nullable(f.statutory_authority, 5000),
        service_type: nullable(f.service_type, 1000),
        section_name: current.section,
        raw_excerpt: excerpt,
      });
    }
    current = null;
  };

  const nextNonEmpty = (from: number) => {
    for (let j = from + 1; j < lines.length; j += 1) if (lines[j]) return lines[j];
    return "";
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    if (isSectionHeading(line)) { flush(); section = line; continue; }

    const label = parseKnownLabel(line);
    if (label) {
      if (!current) continue;
      current.fields[label.key] = current.fields[label.key] ? `${current.fields[label.key]} | ${label.value}` : label.value;
      current.source.push(line);
      current.lastField = label.key;
      continue;
    }

    const next = parseKnownLabel(nextNonEmpty(i));
    const looksLikeTitle = Boolean(next) && line.length <= 500 && !invalidTitle(line);
    if (looksLikeTitle) {
      flush();
      current = { title: line, start: i + 1, fields: {}, source: [line], section, lastField: null };
      continue;
    }

    if (current && current.lastField && line.length <= 1500 && !isSectionHeading(line)) {
      current.fields[current.lastField] = `${current.fields[current.lastField]} ${line}`.trim();
      current.source.push(line);
    }
  }
  flush();
  return out;
}

async function insertCandidates(runId: string, artifact: SourceArtifact, contentSha256: string, resources: ParsedResource[]) {
  const pool = getPool();
  let inserted = 0;
  for (const resource of resources) {
    const material = {
      artifact_key: artifact.artifact_key,
      source_locator: resource.source_locator,
      name: resource.name,
      state_code: artifact.jurisdiction_hint,
      address: resource.address,
      phone: resource.phone,
      email: resource.email,
      website_url: resource.website_url,
      eligibility_summary: resource.eligibility_summary,
      apply_notes: resource.apply_notes,
      statutory_authority: resource.statutory_authority,
      service_type: resource.service_type,
      parser_version: STATE_ENRICHMENT_PARSER_VERSION,
    };
    const candidateHash = sha256(stable(material));
    const candidateKey = sha256(`${runId}|${candidateHash}`);
    const result = await pool.query(`
      insert into public.luminari_corpus_candidate_v1(
        candidate_key,run_id,artifact_key,candidate_type,source_locator,jurisdiction,state_code,section_name,name,organization_name,
        category,layer,phone,email,website_url,address,eligibility_summary,apply_notes,description,raw_excerpt,parser_version,
        candidate_hash,source_content_sha256,jurisdiction_resolution_state,candidate_state,payload
      ) values($1,$2,$3,'resource',$4,$5,$5,$6,$7,$8,$9,'layer_1',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        'registry_jurisdiction_source','source_attached',$21::jsonb)
      on conflict(candidate_key) do nothing
      returning candidate_key`, [
        candidateKey,runId,artifact.artifact_key,resource.source_locator,artifact.jurisdiction_hint,resource.section_name,
        resource.name,resource.organization_name ?? resource.name,resource.category,resource.phone,resource.email,resource.website_url,
        resource.address,resource.eligibility_summary,resource.apply_notes,resource.apply_notes,resource.raw_excerpt,
        STATE_ENRICHMENT_PARSER_VERSION,candidateHash,contentSha256,
        JSON.stringify({
          parser_rule: "state_enrichment_label_value_block",
          artifact_role: "state_enrichment_source",
          source_verification_state: "source_attached_not_independently_reverified",
          service_type: resource.service_type,
          statutory_authority: resource.statutory_authority,
        }),
      ]);
    if (result.rowCount) inserted += 1;
  }
  return inserted;
}

async function nextArtifacts(runId: string, limit: number): Promise<SourceArtifact[]> {
  const result = await getPool().query(`
    select a.artifact_key,a.bucket_id,a.object_name,a.byte_size,a.jurisdiction_hint,a.exact_duplicate_of
      from public.luminari_corpus_source_artifact_v1 a
      left join public.luminari_corpus_rebuild_artifact_v1 r on r.run_id=$1 and r.artifact_key=a.artifact_key
     where a.artifact_role='state_enrichment_source'
       and (r.artifact_key is null or (r.status='failed' and r.attempt_count<2))
     order by a.artifact_key
     limit $2`, [runId, limit]);
  return result.rows.map(row => ({ ...row, byte_size: Number(row.byte_size ?? 0) })) as SourceArtifact[];
}

async function processArtifact(runId: string, artifact: SourceArtifact) {
  const pool = getPool();
  await pool.query(`insert into public.luminari_corpus_rebuild_artifact_v1(run_id,artifact_key,status,attempt_count,started_at)
    values($1,$2,'running',1,now()) on conflict(run_id,artifact_key) do update set status='running',attempt_count=luminari_corpus_rebuild_artifact_v1.attempt_count+1,started_at=now(),error_message=null`, [runId, artifact.artifact_key]);
  try {
    if (artifact.exact_duplicate_of) {
      const receipt = sha256(stable({ runId, artifact: artifact.artifact_key, exact_duplicate_of: artifact.exact_duplicate_of }));
      await pool.query(`update public.luminari_corpus_rebuild_artifact_v1 set status='skipped_exact_duplicate',completed_at=now(),receipt_hash=$3,result_json=$4::jsonb where run_id=$1 and artifact_key=$2`,
        [runId,artifact.artifact_key,receipt,JSON.stringify({ exact_duplicate_of: artifact.exact_duplicate_of })]);
      return;
    }
    const buffer = await downloadArtifact(artifact);
    const contentSha256 = sha256(buffer);
    const text = await extractDocxText(buffer);
    const textSha256 = sha256(text);
    const resources = parseStateEnrichmentText(text);
    const inserted = await insertCandidates(runId, artifact, contentSha256, resources);
    const receipt = sha256(stable({ runId,artifact_key:artifact.artifact_key,content_sha256:contentSha256,text_sha256:textSha256,candidate_count:resources.length,parser_version:STATE_ENRICHMENT_PARSER_VERSION }));
    await pool.query(`update public.luminari_corpus_rebuild_artifact_v1 set status='completed',content_sha256=$3,extracted_text_sha256=$4,candidate_count=$5,completed_at=now(),receipt_hash=$6,result_json=$7::jsonb where run_id=$1 and artifact_key=$2`,
      [runId,artifact.artifact_key,contentSha256,textSha256,resources.length,receipt,JSON.stringify({ parsed_candidates: resources.length, inserted, parser_version: STATE_ENRICHMENT_PARSER_VERSION })]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const receipt = sha256(stable({ runId,artifact_key:artifact.artifact_key,status:"failed",error:message.slice(0,500) }));
    await pool.query(`update public.luminari_corpus_rebuild_artifact_v1 set status='failed',error_message=$3,completed_at=now(),receipt_hash=$4,result_json=$5::jsonb where run_id=$1 and artifact_key=$2`,
      [runId,artifact.artifact_key,message.slice(0,1000),receipt,JSON.stringify({ parser_version: STATE_ENRICHMENT_PARSER_VERSION })]);
  }
}

async function finalizeRun(runId: string) {
  const pool = getPool();
  const rows = await pool.query(`select artifact_key,status,candidate_count,receipt_hash from public.luminari_corpus_rebuild_artifact_v1 where run_id=$1 order by artifact_key`, [runId]);
  const candidateCount = rows.rows.reduce((sum,row) => sum + Number(row.candidate_count ?? 0), 0);
  const failed = rows.rows.filter(row => row.status==='failed').length;
  const receipt = sha256(stable({ engine_version:STATE_ENRICHMENT_ENGINE_VERSION,parser_version:STATE_ENRICHMENT_PARSER_VERSION,artifacts:rows.rows,candidate_count:candidateCount }));
  await pool.query(`update public.luminari_corpus_rebuild_run_v1 set status=$2,artifact_count=$3,candidate_count=$4,identity_count=0,unresolved_count=$5,completed_at=now(),receipt_hash=$6,result_json=$7::jsonb where run_id=$1`,
    [runId,failed?'completed_with_failures':'completed',rows.rows.length,candidateCount,failed,receipt,JSON.stringify({ failed_artifacts:failed,parser_version:STATE_ENRICHMENT_PARSER_VERSION,publication_mutated:false })]);
}

export async function runStateEnrichmentBatch(runId: string, limit=6) {
  const bounded = Math.max(1,Math.min(12,Math.floor(limit)));
  const artifacts = await nextArtifacts(runId,bounded);
  for (const artifact of artifacts) await processArtifact(runId,artifact);
  const remaining = Number((await getPool().query(`select count(*)::int as n from public.luminari_corpus_source_artifact_v1 a left join public.luminari_corpus_rebuild_artifact_v1 r on r.run_id=$1 and r.artifact_key=a.artifact_key where a.artifact_role='state_enrichment_source' and (r.artifact_key is null or (r.status='failed' and r.attempt_count<2))`,[runId])).rows[0]?.n ?? 0);
  if (remaining===0) { await finalizeRun(runId); return { processed:artifacts.length,remaining,finalized:true }; }
  return { processed:artifacts.length,remaining,finalized:false };
}

export async function resumeFreshStateEnrichmentFromDatabase(options:{batchSize?:number;maxBatches?:number}={}) {
  const pool=getPool();
  const active=await pool.query(`select run_id from public.luminari_corpus_rebuild_run_v1 where engine_version=$1 and status in ('queued','running') order by started_at asc limit 1`,[STATE_ENRICHMENT_ENGINE_VERSION]);
  const runId=active.rows[0]?.run_id as string|undefined;
  if(!runId) return {status:"idle"};
  await pool.query(`update public.luminari_corpus_rebuild_run_v1 set status='running' where run_id=$1 and status='queued'`,[runId]);
  const batchSize=Math.max(1,Math.min(10,options.batchSize??5));
  const maxBatches=Math.max(1,Math.min(40,options.maxBatches??20));
  let processed=0;
  for(let batch=0;batch<maxBatches;batch+=1){
    const result=await runStateEnrichmentBatch(runId,batchSize); processed+=result.processed;
    if(result.finalized) return {status:"completed",run_id:runId,processed};
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  return {status:"yielded",run_id:runId,processed};
}

if(process.env.NODE_ENV==="production"){
  setTimeout(()=>{
    void resumeFreshStateEnrichmentFromDatabase({batchSize:5,maxBatches:20})
      .then(result=>{if(result.status!=="idle") console.log("[FreshStateEnrichment] startup_resume",result);})
      .catch(error=>console.error("[FreshStateEnrichment] startup_resume_failed",{error_class:error instanceof Error?error.name:"unknown",error_message:error instanceof Error?error.message.slice(0,500):String(error).slice(0,500)}));
  },20_000);
}
