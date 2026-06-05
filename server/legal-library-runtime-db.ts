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

function key(parts: string[]) {
  return parts.join("");
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
    return trimmed.split(/[|,]/).map((item) => item.trim()).filter(Boolean);
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
  const sourceValue = firstValue(row, ["data_source", key(["data", "Source"]), "source", "source_ref", "source_reference", "url", "filing_url", "complaint_url"]);
  const urlValue = firstValue(row, ["source_url", key(["source", "Url"]), "url", "filing_url", "complaint_url", "portal_url"]) ?? (typeof sourceValue === "string" && /^https?:\/\//i.test(sourceValue) ? sourceValue : null);

  return {
    id: firstValue(row, ["id", "enforcement_id", "record_id"]),
    jurisdiction: firstValue(row, ["jurisdiction", "state", "state_code", "jurisdiction_code"]),
    agency_name: firstValue(row, ["agency_name", "agency", "agency_short", "agency_abbreviation", "normalized_entity", key(["agency", "Name"]), key(["agency", "Short"])]),
    complaint_type: firstValue(row, ["complaint_type", "type", "complaint", "category", "program_area", "normalized_category", key(["complaint", "Type"])]),
    domains: normalizeDomainsValue(firstValue(row, ["domains", "domain", "legal_domains", "tags"])),
    statutory_requirement: firstValue(row, ["statutory_requirement", "statutory_authority", "authority", "requirement", "statute", key(["statutory", "Requirement"])]),
    statute_citation: firstValue(row, ["statute_citation", "citation", "statute", "statutory_authority", key(["statute", "Citation"])]),
    outcome: firstValue(row, ["outcome", "status", "result", "disposition"]),
    required_response_days: firstValue(row, ["required_response_days", "required_days", "deadline_days", "response_timeline_days", "response_days", key(["required", "Response", "Days"])]),
    observed_response_days: firstValue(row, ["observed_response_days", "observed_days", "actual_response_days", "actual_days", key(["observed", "Response", "Days"])]),
    pattern_description: firstValue(row, ["pattern_description", "description", "details", "notes", "summary", "pattern", key(["pattern", "Description"])]),
    data_source: sourceValue,
    source_url: urlValue,
    created_at: normalizeTimestamp(firstValue(row, ["created_at", key(["created", "At"]), "inserted_at"])),
    updated_at: normalizeTimestamp(firstValue(row, ["updated_at", key(["updated", "At"]), "modified_at"])),
  };
}

function normalizeContradictionRow(rawRow: any) {
  const row = jsonDomains(rawRow ?? {});
  return {
    id: firstValue(row, ["id", "contradiction_id"]),
    title: firstValue(row, ["title", "name", "label"]),
    doctrine_a: firstValue(row, ["doctrine_a", "doctrine_a_text", "doctrine_a_name", "doctrine_a_principle", "a_doctrine", key(["doctrine", "A"])]),
    doctrine_a_citation: firstValue(row, ["doctrine_a_citation", "citation_a", "a_citation", key(["doctrine", "A", "Citation"]), key(["citation", "A"])]),
    doctrine_b: firstValue(row, ["doctrine_b", "doctrine_b_text", "doctrine_b_name", "doctrine_b_principle", "b_doctrine", key(["doctrine", "B"])]),
    doctrine_b_citation: firstValue(row, ["doctrine_b_citation", "citation_b", "b_citation", key(["doctrine", "B", "Citation"]), key(["citation", "B"])]),
    contradiction_description: firstValue(row, ["contradiction_description", "description", "summary", "contradiction", "conflict_description", key(["contradiction", "Description"])]),
    harm_description: firstValue(row, ["harm_description", "harm", "harms", "impact", "affected_population", key(["harm", "Description"])]),
    domains: normalizeDomainsValue(firstValue(row, ["domains", "domain", "legal_domains", "tags"])),
    jurisdiction: firstValue(row, ["jurisdiction", "state", "state_code", "jurisdiction_code"]),
    reform_status: firstValue(row, ["reform_status", "status", "reform", key(["reform", "Status"])]),
    source_url: firstValue(row, ["source_url", key(["source", "Url"]), "url", "source", "source_reference"]),
    created_at: normalizeTimestamp(firstValue(row, ["created_at", key(["created", "At"]), "inserted_at"])),
    updated_at: normalizeTimestamp(firstValue(row, ["updated_at", key(["updated", "At"]), "modified_at"])),
  };
}

function jsonDomains(row: any) {
  if (typeof row.domains !== "string") return row;
  try {
    return { ...row, domains: JSON.parse(row.domains) };
  } catch {
    return { ...row, domains: [] };
  }
}

export async function searchRuntimeStatutes(opts: LegalRuntimeSearch) {
  const { limit, offset } = page(opts);
  const params: unknown[] = [];
  const filters: string[] = [];
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
  return fallbackList([
    { sql: `select * from public.v_paginated_statutes ${where} order by created_at desc limit $${params.length - 1} offset $${params.length}`, params },
    { sql: `select id, citation, short_title, jurisdiction, domains, effective_date, last_amended, summary, verbatim_key_text, source_url, enforcement_agency, statute_of_limitations, verification_status, title, statute_text, metadata, created_at from public.legal_statutes ${where} order by created_at desc limit $${params.length - 1} offset $${params.length}`, params },
  ]).then((items) => items.map(jsonDomains));
}

export async function searchRuntimeCaseLaw(opts: LegalRuntimeSearch) {
  const { limit, offset } = page(opts);
  const params: unknown[] = [];
  const filters: string[] = [];
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
  return fallbackList([
    { sql: `select * from public.v_runtime_case_law ${where} order by created_at desc limit $${params.length - 1} offset $${params.length}`, params },
    { sql: `select id, citation, case_name, jurisdiction, domains, year_decided, court, summary, key_quotes, source_url, title, opinion_text, metadata, created_at from public.legal_case_law ${where} order by created_at desc limit $${params.length - 1} offset $${params.length}`, params },
  ]).then((items) => items.map(jsonDomains));
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
