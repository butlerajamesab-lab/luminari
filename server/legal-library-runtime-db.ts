import { read_current_legal_authorities } from "./services/current-legal-authority-reader";
import { getPool } from "./db";
import type { LegalDomain } from "../drizzle/schema";

export type LegalRuntimeSearch = {
  jurisdiction?: string;
  domain?: LegalDomain;
  query?: string;
  source_type?: string;
  court?: string;
  agency?: string;
  severity?: string;
  limit?: number;
  offset?: number;
  record_id?: string;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function page(opts: Pick<LegalRuntimeSearch, "limit" | "offset">) {
  const limit = Math.min(Math.max(Number(opts.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
  const offset = Math.max(Number(opts.offset ?? 0), 0);
  return { limit, offset };
}

function textPattern(value: string) {
  return `%${value}%`;
}

async function rows(sqlText: string, params: unknown[]) {
  const result = await getPool().query(sqlText, params);
  return result.rows ?? [];
}

async function fallbackList(queries: Array<{ sql: string; params: unknown[] }>) {
  for (const query of queries) {
    try {
      return await rows(query.sql, query.params);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/does not exist|column .* does not exist|relation .* does not exist/i.test(message)) {
        throw error;
      }
    }
  }
  return [];
}

const loggedShapes = new Set<string>();

function parseObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function firstValue(row: Record<string, any>, aliases: string[]) {
  const metadata = parseObject(row.metadata);
  const nestedMetadata = ["payload", "raw", "record", "source", "data"]
    .map((alias) => parseObject(metadata[alias]))
    .filter((value) => Object.keys(value).length > 0);
  const sources = [row, metadata, ...nestedMetadata];
  for (const alias of aliases) {
    for (const source of sources) {
      const value = source[alias];
      if (value !== undefined && value !== null && value !== "") return value;
    }
  }
  return null;
}

function normalizeDomainsValue(value: unknown) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall through to delimiter splitting.
    }
    return trimmed.split(/[|,;]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeTimestamp(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return value ?? null;
}

function logRuntimeRowShape(scope: string, row: Record<string, any> | undefined) {
  if (!row || loggedShapes.has(scope)) return;
  loggedShapes.add(scope);
  const metadata = parseObject(row.metadata);
  console.info(`[LegalLibraryRuntime] ${scope} first row shape`, {
    keys: Object.keys(row).sort(),
    metadata_keys: Object.keys(metadata).sort(),
  });
}

function normalizeEnforcementRow(rawRow: any) {
  const row = jsonDomains(rawRow ?? {});
  const sourceValue = firstValue(row, ["data_source", "dataSource", "source", "source_name", "source_ref", "source_reference", "source_table", "dataset", "source_url", "sourceUrl", "url", "filing_url", "complaint_url", "portal_url"]);
  const urlValue = firstValue(row, ["source_url", "sourceUrl", "url", "website", "website_url", "agency_url", "filing_url", "complaint_url", "portal_url"]) ?? (typeof sourceValue === "string" && /^https?:\/\//i.test(sourceValue) ? sourceValue : null);

  return {
    id: firstValue(row, ["id", "enforcement_id", "record_id"]),
    jurisdiction: firstValue(row, ["jurisdiction", "state", "state_code", "jurisdiction_code"]),
    agency_name: firstValue(row, ["agency_name", "agency", "agency_short", "agency_abbreviation", "normalized_entity", "agencyName", "agencyShort"]),
    complaint_type: firstValue(row, ["complaint_type", "complaintType", "complaint_category", "complaint_types", "complaint", "type", "category", "program_area", "normalized_category", "action_type", "record_type", "domains"]),
    domains: normalizeDomainsValue(firstValue(row, ["domains", "domain", "legal_domains", "tags"])),
    statutory_requirement: firstValue(row, ["statutory_requirement", "statutoryRequirement", "statutory_authority", "authority", "requirement", "statute", "legal_authority", "authority_text", "statutory_basis"]),
    statute_citation: firstValue(row, ["statute_citation", "statuteCitation", "citation", "statute", "statutory_authority", "legal_authority", "authority_citation"]),
    outcome: firstValue(row, ["outcome", "outcomes", "case_outcome", "enforcement_outcome", "enforcement_result", "resolution", "resolution_status", "status", "result", "disposition", "action_status"]),
    required_response_days: firstValue(row, ["required_response_days", "requiredResponseDays", "required_days", "deadline_days", "response_timeline_days", "responseTimelineDays", "timeline_days", "response_days", "statutory_response_days", "required_response_time_days"]),
    observed_response_days: firstValue(row, ["observed_response_days", "observedResponseDays", "observed_days", "actual_response_days", "actual_days", "measured_response_days", "average_response_days"]),
    pattern_description: firstValue(row, ["pattern_description", "patternDescription", "description", "details", "notes", "summary", "pattern", "pattern_summary", "documented_pattern", "issue_description"]),
    data_source: sourceValue,
    source_url: urlValue,
    created_at: normalizeTimestamp(firstValue(row, ["created_at", "createdAt", "inserted_at"])),
    updated_at: normalizeTimestamp(firstValue(row, ["updated_at", "updatedAt", "modified_at"])),
  };
}

function normalizeContradictionRow(rawRow: any) {
  const row = jsonDomains(rawRow ?? {});
  return {
    id: firstValue(row, ["id", "contradiction_id"]),
    title: firstValue(row, ["title", "name", "label"]),
    doctrine_a: firstValue(row, ["doctrine_a", "doctrine_a_text", "doctrine_a_name", "doctrine_a_principle", "a_doctrine", "doctrineA"]),
    doctrine_a_citation: firstValue(row, ["doctrine_a_citation", "citation_a", "a_citation", "doctrineACitation", "citationA"]),
    doctrine_b: firstValue(row, ["doctrine_b", "doctrine_b_text", "doctrine_b_name", "doctrine_b_principle", "b_doctrine", "doctrineB"]),
    doctrine_b_citation: firstValue(row, ["doctrine_b_citation", "citation_b", "b_citation", "doctrineBCitation", "citationB"]),
    contradiction_description: firstValue(row, ["contradiction_description", "description", "summary", "contradiction", "conflict_description", "contradictionDescription"]),
    harm_description: firstValue(row, ["harm_description", "harm", "harms", "impact", "affected_population", "harmDescription"]),
    domains: normalizeDomainsValue(firstValue(row, ["domains", "domain", "legal_domains", "tags"])),
    jurisdiction: firstValue(row, ["jurisdiction", "state", "state_code", "jurisdiction_code"]),
    reform_status: firstValue(row, ["reform_status", "status", "reform", "reformStatus"]),
    source_url: firstValue(row, ["source_url", "sourceUrl", "url", "source", "source_reference"]),
    created_at: normalizeTimestamp(firstValue(row, ["created_at", "createdAt", "inserted_at"])),
    updated_at: normalizeTimestamp(firstValue(row, ["updated_at", "updatedAt", "modified_at"])),
  };
}

function jsonDomains(row: any) {
  if (typeof row.domains !== "string") return row;
  try {
    return { ...row, domains: JSON.parse(row.domains) };
  } catch {
    return { ...row, domains: normalizeDomainsValue(row.domains) };
  }
}

function normalizeStatuteRow(rawRow: any) {
  const row = jsonDomains(rawRow ?? {});
  const metadata = parseObject(row.metadata);

  return {
    ...row,
    id:
      typeof row.id === "string"
      && /^\d+$/.test(row.id)
      && metadata.runtime_source === "legacy_compat"
        ? Number(row.id)
        : row.id ?? null,
    key_provisions:
      row.keyProvisions ??
      row.key_provisions ??
      row.verbatim_key_text ??
      null,
  };
}

function normalizeCaseLawRow(rawRow: any) {
  const row = jsonDomains(rawRow ?? {});
  const metadata = parseObject(row.metadata);

  return {
    ...row,
    id:
      typeof row.id === "string"
      && /^\d+$/.test(row.id)
      && metadata.runtime_source === "legacy_compat"
        ? Number(row.id)
        : row.id ?? null,
  };
}

const CURRENT_STATUTE_CTE = `
  with current_source as materialized (
    select
      c.run_id,
      c.object_ref,
      c.source_content_sha256,
      c.parser_version,
      c.source_locator,
      c.artifact_key,
      c.source_candidate_hash,
      c.field_provenance,
      c.reconciled_at,
      c.projection_state,
      c.data_state,
      c.legal_catalog_ready,
      c.state_code,
      c.jurisdiction as object_jurisdiction,
      coalesce(p.payload->'row', p.payload->'record', '{}'::jsonb) as source_record,
      case
        when c.source_locator like 'xlsx:verified_statute:%' then 1
        when c.source_locator like 'xlsx:statute_master:%' then 2
        else 3
      end as family_priority
    from public.v_lighthouse_legal_authority_catalog_v2 c
    join lateral (
      select payload
      from public.luminari_corpus_candidate_v1 p
      where p.candidate_hash = c.source_candidate_hash
        and p.artifact_key = c.artifact_key
        and p.run_id = c.run_id and p.source_locator = c.source_locator
      order by p.created_at desc
      limit 1
    ) p on true
    where c.object_class = 'legal_authority'
      and c.legal_catalog_ready is true
      and (
        c.source_locator like 'xlsx:verified_statute:%'
        or c.source_locator like 'xlsx:statute_master:%'
        or c.source_locator like 'xlsx:statute_key_text:%'
      )
  ), current_ranked as (
    select
      coalesce(
        nullif(source_record->>'statute_uuid',''),
        nullif(source_record->>'statute_uid',''),
        nullif(source_record->>'key_text_uuid','')
      ) as id,
      coalesce(
        nullif(source_record->>'statute_uuid',''),
        nullif(source_record->>'statute_uid',''),
        nullif(source_record->>'key_text_uuid',''),
        nullif(object_ref,'')
      ) as runtime_entity_id,
      source_record->>'citation' as citation,
      coalesce(nullif(source_record->>'short_title',''), nullif(source_record->>'title','')) as short_title,
      coalesce(
        nullif(source_record->>'jurisdiction_code',''),
        nullif(source_record->>'jurisdiction',''),
        nullif(state_code,''),
        nullif(object_jurisdiction,'')
      ) as jurisdiction,
      case
        when jsonb_typeof(source_record->'domains') = 'array' then source_record->'domains'
        when nullif(source_record->>'domains','') is not null
          then to_jsonb(regexp_split_to_array(source_record->>'domains', '\\s*[;,|]\\s*'))
        else '[]'::jsonb
      end as domains,
      source_record->>'effective_date' as effective_date,
      source_record->>'last_amended' as last_amended,
      coalesce(nullif(source_record->>'summary',''), nullif(source_record->>'practical_note','')) as summary,
      coalesce(
        nullif(source_record->>'verbatim_key_text',''),
        nullif(source_record->>'verbatim_excerpt',''),
        nullif(source_record->>'key_provisions','')
      ) as verbatim_key_text,
      coalesce(nullif(source_record->>'official_source_url',''), nullif(source_record->>'source_url','')) as source_url,
      source_record->>'enforcement_agency' as enforcement_agency,
      source_record->>'statute_of_limitations' as statute_of_limitations,
      coalesce(
        nullif(source_record->>'verification_tier',''),
        nullif(source_record->>'verification_status',''),
        nullif(source_record->>'verification','')
      ) as verification_status,
      coalesce(nullif(source_record->>'title',''), nullif(source_record->>'short_title','')) as title,
      coalesce(
        nullif(source_record->>'statute_text',''),
        nullif(source_record->>'verbatim_excerpt',''),
        nullif(source_record->>'key_provisions','')
      ) as statute_text,
      jsonb_build_object(
        'runtime_source','current_corpus',
        'source_type','current_corpus',
        'publication_state',case when legal_catalog_ready then 'catalog_ready' else 'substrate_observed_not_catalog_ready' end,
        'object_ref',object_ref,
        'run_id',run_id,
        'source_content_sha256',source_content_sha256,
        'parser_version',parser_version,
        'source_locator',source_locator,
        'artifact_key',artifact_key,
        'source_candidate_hash',source_candidate_hash,
        'field_provenance',coalesce(field_provenance,'{}'::jsonb),
        'projection_state',projection_state,
        'data_state',data_state
      ) as metadata,
      reconciled_at as created_at,
      case when legal_catalog_ready then 0 else 1 end as publication_rank,
      row_number() over (
        partition by coalesce(nullif(source_record->>'statute_uuid',''), nullif(source_record->>'statute_uid',''), nullif(source_record->>'key_text_uuid',''), object_ref)
        order by
          case when legal_catalog_ready then 0 else 1 end,
          family_priority,
          reconciled_at desc,
          object_ref
      ) as source_rank
    from current_source
    where nullif(btrim(source_record->>'citation'),'') is not null
  ), current_rows as (
    select id,runtime_entity_id,citation,short_title,jurisdiction,domains,effective_date,last_amended,summary,
           verbatim_key_text,source_url,enforcement_agency,statute_of_limitations,
           verification_status,title,statute_text,metadata,created_at,publication_rank as runtime_rank
    from current_ranked
    where source_rank = 1
  ), combined as (
    select * from current_rows
    union all
    select
      l.id::text,l.id::text,l.citation,l.short_title,l.jurisdiction,l.domains,l.effective_date,l.last_amended,l.summary,
      l.verbatim_key_text,l.source_url,l.enforcement_agency,l.statute_of_limitations,
      l.verification_status,l.title,l.statute_text,
      coalesce(l.metadata,'{}'::jsonb) || jsonb_build_object('runtime_source','legacy_compat') as metadata,
      l.created_at,2::int as runtime_rank
    from public.legal_statutes l
    where not exists (
      select 1 from current_rows c where c.id = l.id::text
    )
  )
`;

export async function searchRuntimeStatutes(opts: LegalRuntimeSearch) {
  const { limit, offset } = page(opts);
  const params: unknown[] = [];
  const filters: string[] = [];
  if (opts.record_id) { params.push(opts.record_id); filters.push(`runtime_entity_id = $${params.length}`); }
  if (opts.jurisdiction) {
    params.push(opts.jurisdiction);
    filters.push(`jurisdiction = $${params.length}`);
  }
  if (opts.source_type) {
    params.push(opts.source_type);
    filters.push(`(metadata->>'source_type' = $${params.length} or metadata->>'connector' = $${params.length})`);
  }
  if (opts.query) {
    params.push(textPattern(opts.query));
    filters.push(`(coalesce(citation::text, '') ilike $${params.length} or coalesce(short_title::text, '') ilike $${params.length} or coalesce(title::text, '') ilike $${params.length} or coalesce(summary::text, '') ilike $${params.length} or coalesce(statute_text::text, '') ilike $${params.length} or coalesce(verbatim_key_text::text, '') ilike $${params.length} or coalesce(metadata::text, '') ilike $${params.length})`);
  }
  if (opts.domain) {
    params.push(textPattern(opts.domain));
    filters.push(`(coalesce(domains::text, '') ilike $${params.length} or coalesce(metadata::text, '') ilike $${params.length})`);
  }
  params.push(limit, offset);
  const where = filters.length ? `where ${filters.join(" and ")}` : "";
  return rows(`${CURRENT_STATUTE_CTE}
    select id,runtime_entity_id,citation,short_title,jurisdiction,domains,effective_date,last_amended,summary,
           verbatim_key_text,source_url,enforcement_agency,statute_of_limitations,
           verification_status,title,statute_text,metadata,created_at
    from combined
    ${where}
    order by runtime_rank, created_at desc nulls last, citation
    limit $${params.length - 1} offset $${params.length}
  `, params).then((items) => items.map(normalizeStatuteRow));
}

const CURRENT_CASE_CTE = `
  with current_source as materialized (
    select
      c.run_id,
      c.object_ref,
      c.source_content_sha256,
      c.parser_version,
      c.source_locator,
      c.artifact_key,
      c.source_candidate_hash,
      c.field_provenance,
      c.reconciled_at,
      c.projection_state,
      c.data_state,
      c.legal_catalog_ready,
      c.state_code,
      c.jurisdiction as object_jurisdiction,
      coalesce(p.payload->'row', p.payload->'record', '{}'::jsonb) as source_record,
      case when c.source_locator like 'xlsx:verified_case_law:%' then 1 else 2 end as family_priority
    from public.v_lighthouse_legal_authority_catalog_v2 c
    join lateral (
      select payload
      from public.luminari_corpus_candidate_v1 p
      where p.candidate_hash = c.source_candidate_hash
        and p.artifact_key = c.artifact_key
        and p.run_id = c.run_id and p.source_locator = c.source_locator
      order by p.created_at desc
      limit 1
    ) p on true
    where c.object_class = 'legal_authority'
      and c.legal_catalog_ready is true
      and (
        c.source_locator like 'xlsx:verified_case_law:%'
        or c.source_locator like 'xlsx:case_law_master:%'
      )
  ), current_ranked as (
    select
      coalesce(
        nullif(source_record->>'case_uuid',''),
        nullif(source_record->>'case_uid','')
      ) as id,
      coalesce(
        nullif(source_record->>'case_uuid',''),
        nullif(source_record->>'case_uid',''),
        nullif(object_ref,'')
      ) as runtime_entity_id,
      coalesce(nullif(source_record->>'case_uuid',''), nullif(source_record->>'case_uid',''), object_ref) as dedupe_key,
      source_record->>'citation' as citation,
      coalesce(nullif(source_record->>'case_name',''), nullif(source_record->>'title','')) as case_name,
      coalesce(
        nullif(source_record->>'jurisdiction_code',''),
        nullif(source_record->>'jurisdiction',''),
        nullif(state_code,''),
        nullif(object_jurisdiction,'')
      ) as jurisdiction,
      case
        when jsonb_typeof(source_record->'domains') = 'array' then source_record->'domains'
        when nullif(source_record->>'domains','') is not null
          then to_jsonb(regexp_split_to_array(source_record->>'domains', '\\s*[;,|]\\s*'))
        else '[]'::jsonb
      end as domains,
      coalesce(nullif(source_record->>'year_decided',''), nullif(source_record->>'year','')) as year_decided,
      source_record->>'court' as court,
      coalesce(nullif(source_record->>'holding',''), nullif(source_record->>'summary','')) as summary,
      case
        when jsonb_typeof(source_record->'key_quotes') = 'array' then source_record->'key_quotes'
        when nullif(source_record->>'key_quotes','') is not null then jsonb_build_array(source_record->>'key_quotes')
        else '[]'::jsonb
      end as key_quotes,
      coalesce(nullif(source_record->>'official_source_url',''), nullif(source_record->>'source_url','')) as source_url,
      coalesce(
        nullif(source_record->>'case_name',''),
        nullif(source_record->>'title',''),
        nullif(source_record->>'citation','')
      ) as title,
      coalesce(nullif(source_record->>'opinion_text',''), nullif(source_record->>'holding','')) as opinion_text,
      jsonb_build_object(
        'runtime_source','current_corpus',
        'source_type','current_corpus',
        'publication_state',case when legal_catalog_ready then 'catalog_ready' else 'substrate_observed_not_catalog_ready' end,
        'object_ref',object_ref,
        'run_id',run_id,
        'source_content_sha256',source_content_sha256,
        'parser_version',parser_version,
        'source_locator',source_locator,
        'artifact_key',artifact_key,
        'source_candidate_hash',source_candidate_hash,
        'field_provenance',coalesce(field_provenance,'{}'::jsonb),
        'projection_state',projection_state,
        'data_state',data_state,
        'subsequent_history',source_record->'subsequent_history',
        'statutes_interpreted',source_record->'statutes_interpreted'
      ) as metadata,
      reconciled_at as created_at,
      case when legal_catalog_ready then 0 else 1 end as publication_rank,
      row_number() over (
        partition by coalesce(nullif(source_record->>'case_uuid',''), nullif(source_record->>'case_uid',''), object_ref)
        order by
          case when legal_catalog_ready then 0 else 1 end,
          family_priority,
          reconciled_at desc,
          object_ref
      ) as source_rank
    from current_source
    where coalesce(
      nullif(source_record->>'case_uuid',''),
      nullif(source_record->>'case_uid',''),
      nullif(btrim(source_record->>'citation'),''),
      nullif(object_ref,''),
      case
        when coalesce(
          nullif(source_record->>'case_name',''),
          nullif(source_record->>'title',''),
          nullif(source_record->>'citation','')
        ) is not null
          then md5(lower(coalesce(
            nullif(source_record->>'case_name',''),
            nullif(source_record->>'title',''),
            source_record->>'citation'
          )))
      end
    ) is not null
  ), current_rows as (
    select id,runtime_entity_id,dedupe_key,citation,case_name,jurisdiction,domains,year_decided,court,summary,key_quotes,
           source_url,title,opinion_text,metadata,created_at,publication_rank as runtime_rank
    from current_ranked where source_rank = 1
  ), combined as (
    select * from current_rows
    union all
    select
      l.id::text,
      l.id::text,
      coalesce(
        l.id::text,
        nullif(lower(btrim(l.citation)), ''),
        case
          when coalesce(nullif(l.case_name, ''), nullif(l.title, ''), nullif(l.citation, '')) is not null
            then md5(lower(coalesce(nullif(l.case_name, ''), nullif(l.title, ''), l.citation)))
        end
      ),
      l.citation,l.case_name,l.jurisdiction,l.domains,l.year_decided,l.court,l.summary,l.key_quotes,
      l.source_url,l.title,l.opinion_text,
      coalesce(l.metadata,'{}'::jsonb) || jsonb_build_object('runtime_source','legacy_compat') as metadata,
      l.created_at,2::int as runtime_rank
    from public.legal_case_law l
    where not exists (
      select 1
      from current_rows c
      where c.dedupe_key = coalesce(
        l.id::text,
        nullif(lower(btrim(l.citation)), ''),
        case
          when coalesce(nullif(l.case_name, ''), nullif(l.title, ''), nullif(l.citation, '')) is not null
            then md5(lower(coalesce(nullif(l.case_name, ''), nullif(l.title, ''), l.citation)))
        end
      )
    )
  )
`;

export async function searchRuntimeCaseLaw(opts: LegalRuntimeSearch) {
  const { limit, offset } = page(opts);
  const params: unknown[] = [];
  const filters: string[] = [];
  if (opts.record_id) { params.push(opts.record_id); filters.push(`runtime_entity_id = $${params.length}`); }
  if (opts.jurisdiction) {
    params.push(opts.jurisdiction);
    filters.push(`jurisdiction = $${params.length}`);
  }
  if (opts.court) {
    params.push(textPattern(opts.court));
    filters.push(`(coalesce(court::text, '') ilike $${params.length} or coalesce(metadata->>'court', '') ilike $${params.length})`);
  }
  if (opts.query) {
    params.push(textPattern(opts.query));
    filters.push(`(coalesce(citation::text, '') ilike $${params.length} or coalesce(case_name::text, '') ilike $${params.length} or coalesce(title::text, '') ilike $${params.length} or coalesce(summary::text, '') ilike $${params.length} or coalesce(opinion_text::text, '') ilike $${params.length} or coalesce(metadata::text, '') ilike $${params.length})`);
  }
  if (opts.domain) {
    params.push(textPattern(opts.domain));
    filters.push(`(coalesce(domains::text, '') ilike $${params.length} or coalesce(metadata::text, '') ilike $${params.length})`);
  }
  params.push(limit, offset);
  const where = filters.length ? `where ${filters.join(" and ")}` : "";
  return rows(`${CURRENT_CASE_CTE}
    select id,runtime_entity_id,citation,case_name,jurisdiction,domains,year_decided,court,summary,key_quotes,
           source_url,title,opinion_text,metadata,created_at
    from combined
    ${where}
    order by runtime_rank, created_at desc nulls last, citation
    limit $${params.length - 1} offset $${params.length}
  `, params).then((items) => items.map(normalizeCaseLawRow));
}

export async function getRuntimeLegalLibraryStats(jurisdiction?: string) {
  const params = [jurisdiction || null];
  const [statutes, case_law, catalog, other] = await Promise.all([
    rows(`${CURRENT_STATUTE_CTE} select count(*)::int as count from combined where ($1::text is null or jurisdiction = $1)`, params),
    rows(`${CURRENT_CASE_CTE} select count(*)::int as count from combined where ($1::text is null or jurisdiction = $1)`, params),
    read_current_legal_authorities({ jurisdiction, limit: 1 }),
    rows(`select
      (select count(*)::int from public.legal_enforcement_records where ($1::text is null or jurisdiction = $1)) as enforcement_records,
      (select count(*)::int from public.legal_weak_joints where ($1::text is null or metadata->>'jurisdiction' = $1)) as weak_joints,
      (select count(*)::int from public.legal_contradictions where ($1::text is null or jurisdiction = $1)) as contradictions,
      (select count(*)::int from public.v_lighthouse_legal_authority_catalog_v2
        where legal_catalog_ready is not true and ($1::text is null or upper(coalesce(nullif(state_code,''),jurisdiction)) = upper($1))) as held_legal_references`, params),
  ]);
  const count = (value: unknown): number => {
    if (value == null || !Number.isSafeInteger(Number(value)) || Number(value) < 0) throw new Error("Legal library count was not returned");
    return Number(value);
  };
  return {
    statutes: count(statutes[0]?.count), case_law: count(case_law[0]?.count),
    enforcement_records: count(other[0]?.enforcement_records), weak_joints: count(other[0]?.weak_joints),
    contradictions: count(other[0]?.contradictions),
    current_corpus_legal_authorities: catalog.total,
    held_legal_references: count(other[0]?.held_legal_references),
  };
}

export async function searchRuntimeEnforcement(opts: LegalRuntimeSearch) {
  const { limit, offset } = page(opts);
  const params: unknown[] = [];
  const filters: string[] = [];
  if (opts.jurisdiction) {
    params.push(opts.jurisdiction);
    filters.push(`jurisdiction = $${params.length}`);
  }
  if (opts.agency) {
    params.push(textPattern(opts.agency));
    filters.push(`coalesce(agency_name::text, '') ilike $${params.length}`);
  }
  if (opts.domain) {
    params.push(textPattern(opts.domain));
    filters.push(`coalesce(domains::text, '') ilike $${params.length}`);
  }
  params.push(limit, offset);
  const where = filters.length ? `where ${filters.join(" and ")}` : "";
  return fallbackList([
    { sql: `select * from public.v_runtime_enforcement ${where} order by id desc limit $${params.length - 1} offset $${params.length}`, params },
    { sql: `select * from public.v_paginated_enforcement ${where} order by id desc limit $${params.length - 1} offset $${params.length}`, params },
    { sql: `select * from public.legal_enforcement_records ${where} order by id desc limit $${params.length - 1} offset $${params.length}`, params },
  ]).then((items) => {
    logRuntimeRowShape("searchRuntimeEnforcement", items[0]);
    return items.map(normalizeEnforcementRow);
  });
}

export async function searchRuntimeWeakJoints(opts: LegalRuntimeSearch) {
  const { limit, offset } = page(opts);
  const params: unknown[] = [];
  const filters: string[] = [];
  if (opts.jurisdiction) {
    params.push(opts.jurisdiction);
    filters.push(`coalesce(metadata->>'jurisdiction', '') = $${params.length}`);
  }
  if (opts.severity) {
    params.push(opts.severity);
    filters.push(`severity_level = $${params.length}`);
  }
  if (opts.domain) {
    params.push(textPattern(opts.domain));
    filters.push(`coalesce(metadata::text, '') ilike $${params.length}`);
  }
  params.push(limit, offset);
  const where = filters.length ? `where ${filters.join(" and ")}` : "";
  return fallbackList([
    { sql: `select id, weak_joint_id, title, description, severity_level, severity_rationale, reform_status, metadata, source_url, created_at from public.legal_weak_joints ${where} order by created_at desc limit $${params.length - 1} offset $${params.length}`, params },
  ]).then((items) => items.map(jsonDomains));
}

export async function listRuntimeContradictions(opts: LegalRuntimeSearch) {
  const { limit, offset } = page(opts);
  const params: unknown[] = [];
  const filters: string[] = [];
  if (opts.jurisdiction) {
    params.push(opts.jurisdiction);
    filters.push(`jurisdiction = $${params.length}`);
  }
  if (opts.domain) {
    params.push(textPattern(opts.domain));
    filters.push(`coalesce(domains::text, '') ilike $${params.length}`);
  }
  params.push(limit, offset);
  const where = filters.length ? `where ${filters.join(" and ")}` : "";
  return fallbackList([
    { sql: `select * from public.legal_contradictions ${where} order by updated_at desc limit $${params.length - 1} offset $${params.length}`, params },
  ]).then((items) => {
    logRuntimeRowShape("listRuntimeContradictions", items[0]);
    return items.map(normalizeContradictionRow);
  });
}