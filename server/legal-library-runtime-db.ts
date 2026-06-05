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
    { sql: `select id, jurisdiction, agency_name, complaint_type, domains, statutory_requirement, statute_citation, outcome, required_response_days, observed_response_days, pattern_description, data_source, period_start, period_end, added_by, created_at, updated_at from public.legal_enforcement_records ${where} order by id desc limit $${params.length - 1} offset $${params.length}`, params },
  ]).then((items) => items.map(jsonDomains));
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
    { sql: `select id, title, doctrine_a, doctrine_a_citation, doctrine_b, doctrine_b_citation, contradiction_description, harm_description, domains, jurisdiction, reform_status, added_by, created_at, updated_at from public.legal_contradictions ${where} order by updated_at desc limit $${params.length - 1} offset $${params.length}`, params },
  ]).then((items) => items.map(jsonDomains));
}
