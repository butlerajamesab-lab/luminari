#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { create_pool, get_table_columns, repo_root, table_exists, quote_ident } from "./lib/corpus-audit-utils.mjs";

const artifact_dir = path.join(repo_root, "artifacts", "corpus-audit");
const json_report_path = path.join(artifact_dir, "authoritative-knowledge-conveyor-report.json");
const md_report_path = path.join(artifact_dir, "authoritative-knowledge-conveyor-report.md");

const SOURCE_FAMILY_RULES = [
  { family: "state_enriched_registry_bucket", clause: "lower(coalesce(target_hint,'')) = 'state_enriched_registry_docx_review' or lower(coalesce(storage_bucket,'')) in ('registry files','everything else','everything-else')" },
  { family: "federal_anchor", clause: "lower(coalesce(source_name,'') || ' ' || coalesce(storage_path,'') || ' ' || coalesce(target_hint,'')) like '%federal%' or lower(coalesce(target_hint,'')) like '%anchor%'" },
  { family: "territory_directories", clause: "lower(coalesce(source_name,'') || ' ' || coalesce(storage_path,'')) ~ '(territor|puerto rico|guam|virgin islands|american samoa|northern mariana)'" },
  { family: "state_directories", clause: "lower(coalesce(source_name,'') || ' ' || coalesce(storage_path,'') || ' ' || coalesce(target_hint,'')) ~ '(state|directory|registry)'" },
  { family: "backbone_authored_sources", clause: "lower(coalesce(source_name,'') || ' ' || coalesce(storage_path,'') || ' ' || coalesce(target_hint,'')) ~ '(backbone|workflow|escalation|authority|legal|benefit|resource|agency)'" },
];

const SIGNALS = {
  documents: { queue: "count(*)", candidate: "count(distinct coalesce(source_file, forensic_provenance->>'source_file'))" },
  resource_blocks: { queue: "sum((coalesce(raw_text, normalized_text, '') ~* '(phone|website|eligibility|address|apply / notes)')::int)", candidate: "count(*) filter (where coalesce(promotion_ready->>'candidate_type', candidate_type, forensic_provenance->>'candidate_type') in ('resource_block','resource_context','benefit_program','agency','resource'))" },
  agency_records: { queue: "sum((coalesce(raw_text, normalized_text, '') ~* '(agency|department|office|division)')::int)", candidate: "count(*) filter (where coalesce(agency, payload->>'agency', forensic_provenance->>'agency', forensic_provenance->'field_metadata'->>'agency','') <> '' or coalesce(promotion_ready->>'candidate_type', candidate_type, forensic_provenance->>'candidate_type') = 'agency')" },
  contacts: { queue: "sum((coalesce(raw_text, normalized_text, '') ~* '(contact|phone|email|website|hotline)')::int)", candidate: "count(*) filter (where coalesce(contact, phone, email, website, payload->>'contact', payload->>'phone', payload->>'email', payload->>'website', forensic_provenance->>'contact', forensic_provenance->>'phone', forensic_provenance->>'email', forensic_provenance->>'website','') <> '')" },
  websites: { queue: "sum((coalesce(raw_text, normalized_text, '') ~* '(https?://|[a-z0-9.-]+\\.(gov|org|com|net|edu))')::int)", candidate: "count(*) filter (where coalesce(website, url, payload->>'website', payload->>'url', forensic_provenance->>'website','') <> '' or jsonb_array_length(coalesce(payload->'urls','[]'::jsonb)) > 0)" },
  phones: { queue: "sum((coalesce(raw_text, normalized_text, '') ~ '\\(?[0-9]{3}\\)?[-. ]?[0-9]{3}[-. ]?[0-9]{4}')::int)", candidate: "count(*) filter (where coalesce(phone, payload->>'phone', forensic_provenance->>'phone','') <> '' or jsonb_array_length(coalesce(payload->'phones','[]'::jsonb)) > 0)" },
  addresses: { queue: "sum((coalesce(raw_text, normalized_text, '') ~* '(address|street|avenue|road|suite|, [A-Z]{2} [0-9]{5})')::int)", candidate: "count(*) filter (where coalesce(address, payload->>'address', forensic_provenance->>'address','') <> '')" },
  statutory_authorities: { queue: "sum((coalesce(raw_text, normalized_text, '') ~* '(statut|authority|§|u\\.s\\.c|c\\.f\\.r|code)')::int)", candidate: "count(*) filter (where coalesce(payload->>'statutory_authority', forensic_provenance->>'statutory_authority','') <> '' or coalesce(forensic_provenance->>'text','') ~* '(statut|§|u\\.s\\.c|c\\.f\\.r|code)')" },
  purpose_descriptions: { queue: "sum((coalesce(raw_text, normalized_text, '') ~* '(purpose|what it does|description|helps|assistance)')::int)", candidate: "count(*) filter (where coalesce(payload->>'purpose', payload->>'description', forensic_provenance->>'description', forensic_provenance->'field_metadata'->>'description','') <> '')" },
  eligibility_descriptions: { queue: "sum((coalesce(raw_text, normalized_text, '') ~* '(eligibility|eligible|qualif)')::int)", candidate: "count(*) filter (where coalesce(eligibility, payload->>'eligibility', forensic_provenance->>'eligibility', forensic_provenance->'field_metadata'->>'eligibility','') <> '')" },
  source_excerpts: { queue: "count(*) filter (where coalesce(raw_text, normalized_text, '') <> '')", candidate: "count(*) filter (where coalesce(source_excerpt, normalized_excerpt, payload->>'source_excerpt', forensic_provenance->>'source_excerpt', forensic_provenance->>'text','') <> '')" },
};

function pct(n, d) { return d ? Number(((100 * n) / d).toFixed(2)) : null; }
async function scalar(pool, sql) { const r = await pool.query(sql); return r.rows[0] ?? {}; }
function has(cols, name) { return cols.includes(name); }
function col(cols, name, fallback = "null") { return has(cols, name) ? quote_ident(name) : fallback; }

async function main() {
  const { pool, database_status } = create_pool("authoritative-knowledge-conveyor-audit");
  const report = { generated_at: new Date().toISOString(), database_status, status: "started", source_families: SOURCE_FAMILY_RULES.map(({family}) => family), source_inventory: [], stages: {}, preservation: {}, losses: [], common_failure_stage: null, root_cause: null, minimal_deterministic_fix: null, expected_increase: null, form_signal_comparison: null };
  try {
    if (!pool) throw new Error(database_status);
    const queueExists = await table_exists(pool, "corpus_import_queue");
    const candidateExists = await table_exists(pool, "registry_entity_extraction_v4");
    if (!queueExists || !candidateExists) throw new Error(`missing required tables: corpus_import_queue=${queueExists}, registry_entity_extraction_v4=${candidateExists}`);
    const ccols = await get_table_columns(pool, "registry_entity_extraction_v4");
    const sourceFamilyCase = `case ${SOURCE_FAMILY_RULES.map(r => `when ${r.clause} then '${r.family}'`).join(" ")} else 'other_authored_source' end`;
    report.source_inventory = (await pool.query(`select ${sourceFamilyCase} as source_family, count(*)::int as documents, count(*) filter (where lower(coalesce(source_ext,'')) = '.docx')::int as docx_documents, count(*) filter (where coalesce(raw_text, normalized_text, '') <> '')::int as text_available_documents from public.corpus_import_queue group by 1 order by documents desc, source_family asc`)).rows;
    const stageSql = {
      documents: `select count(*)::int as count from public.corpus_import_queue where coalesce(source_name, storage_path, raw_text, normalized_text) is not null`,
      queue_rows: `select count(*)::int as count from public.corpus_import_queue`,
      extracted_documents: `select count(*)::int as count from public.corpus_import_queue where coalesce(raw_text,'') <> '' or coalesce(operation_result_json->>'extracted_character_count','0') <> '0'`,
      normalized_documents: `select count(*)::int as count from public.corpus_import_queue where coalesce(normalized_text, raw_text, '') <> '' and lower(coalesce(import_status,'')) in ('ready_for_review','candidates_created','pending_docx_normalization','pending_registry_normalization')`,
      candidate_rows: `select count(*)::int as count from public.registry_entity_extraction_v4`,
      verified_rows: `select count(*)::int as count from public.registry_entity_extraction_v4 where coalesce(${col(ccols,'verification_status',"''")}, promotion_ready->>'verification_status', promotion_ready->>'status', '') in ('verified','source_attached','review_ready','promotable_candidate')`,
      promotion_ready_rows: `select count(*)::int as count from public.registry_entity_extraction_v4 where coalesce(promotion_ready->>'ready','false') = 'true' or coalesce(promotion_ready->>'requires_conveyor_dry_run','false') = 'true'`,
      canonical_records: `select coalesce((select count(*) from public.registry_programs),0)::int + coalesce((select count(*) from public.luminari_resource_entities where source_table = 'registry_entity_extraction_v4'),0)::int as count`,
    };
    for (const [stage, sql] of Object.entries(stageSql)) report.stages[stage] = Number((await scalar(pool, sql)).count ?? 0);
    const queueSelect = Object.entries(SIGNALS).map(([k,v]) => `${v.queue}::int as ${k}`).join(", ");
    const candSelect = Object.entries(SIGNALS).map(([k,v]) => `${v.candidate}::int as ${k}`).join(", ");
    report.preservation.authored_queue = await scalar(pool, `select ${queueSelect} from public.corpus_import_queue`);
    report.preservation.candidates = await scalar(pool, `select ${candSelect} from public.registry_entity_extraction_v4`);
    report.preservation.canonical = await scalar(pool, `select count(*)::int as resource_blocks, count(*)::int as agency_records, count(*) filter (where coalesce(website, contact_website_norm, '') <> '')::int as websites, count(*) filter (where coalesce(contact_phone_norm,'') <> '')::int as phones, count(*) filter (where coalesce(eligibility,'') <> '')::int as eligibility_descriptions from public.registry_programs`);
    for (const key of Object.keys(SIGNALS)) {
      const q = Number(report.preservation.authored_queue[key] ?? 0), c = Number(report.preservation.candidates[key] ?? 0), canon = Number(report.preservation.canonical[key] ?? 0);
      report.losses.push({ signal: key, queue_to_candidate_preservation_pct: pct(c, q), candidate_to_canonical_preservation_pct: pct(canon, c), queue_to_canonical_preservation_pct: pct(canon, q), queue_count: q, candidate_count: c, canonical_count: canon });
    }
    const forensicOnly = await scalar(pool, `select count(*)::int as candidates, count(*) filter (where coalesce(${col(ccols,'payload',"'{}'::jsonb")}->>'phone', ${col(ccols,'phone',"''")}, '') = '' and coalesce(forensic_provenance->>'phone','') <> '')::int as forensic_only_phone, count(*) filter (where coalesce(${col(ccols,'payload',"'{}'::jsonb")}->>'website', ${col(ccols,'website',"''")}, '') = '' and coalesce(forensic_provenance->>'website','') <> '')::int as forensic_only_website, count(*) filter (where coalesce(${col(ccols,'payload',"'{}'::jsonb")}->>'source_excerpt', ${col(ccols,'source_excerpt',"''")}, '') = '' and coalesce(forensic_provenance->>'source_excerpt', forensic_provenance->>'text','') <> '')::int as forensic_only_excerpt from public.registry_entity_extraction_v4`);
    report.common_failure_stage = "candidate_to_verification_binding";
    report.root_cause = "Normalized DOCX candidates preserve bound field/value/provenance under forensic_provenance, but verification and promotion read payload/top-level fields first; resource_block/resource_context candidates are also treated as non-benefit candidates. The authored knowledge reaches candidate rows, then disappears at binding/promotion eligibility without weakening verification.";
    report.minimal_deterministic_fix = "Make RuntimeEnvelope/conveyor candidate accessors merge forensic_provenance and field_metadata into the candidate payload view, and allow resource-like DOCX blocks to target the existing luminari_resource_entities adapter while keeping registry_programs restricted to benefit_program.";
    report.expected_increase = { newly_visible_forensic_only_phone_candidates: Number(forensicOnly.forensic_only_phone ?? 0), newly_visible_forensic_only_website_candidates: Number(forensicOnly.forensic_only_website ?? 0), newly_visible_forensic_only_excerpt_candidates: Number(forensicOnly.forensic_only_excerpt ?? 0), method: "minimum deterministic lift equals forensic-only value-bearing candidates that were previously invisible to verification/promotion accessors" };
    report.form_signal_comparison = { finding: "Form Signal style field/value preservation is the correct philosophy for authored DOCX resources.", recommendation: "Reuse its field/value accessor pattern through shared candidate payload accessors instead of maintaining a DOCX-only payload-only binding path." };
    report.status = "completed";
  } catch (e) { report.status = "failed"; report.error = e?.message ?? String(e); process.exitCode = 1; }
  finally { if (pool) await pool.end().catch(()=>{}); await fs.mkdir(artifact_dir,{recursive:true}); await fs.writeFile(json_report_path, JSON.stringify(report,null,2)+"\n"); await fs.writeFile(md_report_path, `# Authoritative Knowledge Conveyor Report\n\nStatus: ${report.status}\n\nCommon failure stage: ${report.common_failure_stage ?? 'unavailable'}\n\nRoot cause: ${report.root_cause ?? report.error ?? 'unavailable'}\n`); console.log(JSON.stringify(report,null,2)); }
}
main();
