import { createHash } from "node:crypto";
import { getPool } from "./db";

const FOIA_GOV_SOURCE_KEY = "foia_gov_agency_components";
const FOIA_GOV_BASE_URL = "https://api.foia.gov/api/agency_components";
const FOIA_GOV_CONNECTOR_VERSION = "1.0.0";
const FOIA_GOV_PARSER_VERSION = "1.0.0";
const FOIA_GOV_NORMALIZATION_VERSION = "1.0.0";

type json_record = Record<string, unknown>;
type json_api_resource = {
  id: string;
  type?: string;
  attributes?: json_record;
  relationships?: Record<string, { data?: { id?: string; type?: string } | Array<{ id?: string; type?: string }> | null }>;
};
type json_api_document = {
  data?: json_api_resource[];
  included?: json_api_resource[];
  links?: { next?: string | { href?: string } | null };
};

export type foia_gov_component = {
  source_external_id: string;
  agency_name: string;
  agency_abbreviation: string | null;
  component_name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  submission_portal: string;
  reading_room: string | null;
  submission_methods: "portal" | "email" | "mail" | "mixed";
  raw_payload: json_record;
};

function canonical_json(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical_json).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as json_record;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical_json(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function object_value(value: unknown): json_record | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as json_record
    : null;
}

function scalar_text(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function pick_text(record: json_record | undefined, aliases: string[]): string | null {
  if (!record) return null;
  for (const alias of aliases) {
    const direct = scalar_text(record[alias]);
    if (direct) return direct;
    const nested = object_value(record[alias]);
    if (nested) {
      for (const candidate of ["value", "uri", "url", "href", "email", "phone", "address"]) {
        const text = scalar_text(nested[candidate]);
        if (text) return text;
      }
    }
  }
  return null;
}

function flatten_address(value: unknown): string | null {
  const direct = scalar_text(value);
  if (direct) return direct;
  const record = object_value(value);
  if (!record) return null;
  const ordered = [
    "name", "attention", "address_line1", "address_line2", "street", "city",
    "state", "province", "zip", "postal_code", "country",
  ].map(key => scalar_text(record[key])).filter((part): part is string => Boolean(part));
  return ordered.length ? ordered.join(", ") : null;
}

function relationship_id(resource: json_api_resource, key: string): string | null {
  const data = resource.relationships?.[key]?.data;
  if (!data || Array.isArray(data)) return null;
  return scalar_text(data.id);
}

export function normalize_foia_gov_component(
  resource: json_api_resource,
  included: json_api_resource[] = [],
): foia_gov_component | null {
  const source_external_id = scalar_text(resource.id);
  const attrs = resource.attributes ?? {};
  const component_name = pick_text(attrs, ["title", "name", "component_name"]);
  if (!source_external_id || !component_name) return null;

  const agency_id = relationship_id(resource, "agency");
  const parent = agency_id ? included.find(item => item.id === agency_id) : undefined;
  const parent_attrs = parent?.attributes ?? {};
  const agency_name =
    pick_text(parent_attrs, ["name", "title", "agency_name"]) ??
    pick_text(attrs, ["agency_name", "agency", "parent_agency"]) ??
    component_name;
  const agency_abbreviation =
    pick_text(parent_attrs, ["abbreviation", "agency_abbreviation", "acronym"]) ??
    pick_text(attrs, ["agency_abbreviation", "abbreviation", "acronym"]);

  const address =
    flatten_address(attrs.address) ??
    flatten_address(attrs.mailing_address) ??
    flatten_address(attrs.request_address) ??
    flatten_address(attrs.submission_address);
  const email = pick_text(attrs, [
    "email", "foia_email", "request_email", "submission_email", "contact_email",
  ]);
  const phone = pick_text(attrs, [
    "phone", "telephone", "foia_phone", "request_phone", "contact_phone",
  ]);
  const website = pick_text(attrs, [
    "website", "website_url", "foia_url", "foia_website", "url",
  ]);
  const reading_room = pick_text(attrs, [
    "reading_room", "reading_room_url", "electronic_reading_room", "foia_library",
  ]);
  const explicit_portal = pick_text(attrs, [
    "submission_portal", "submission_portal_url", "request_form_url", "online_request_url",
    "request_url", "portal_url",
  ]);
  const submission_portal =
    explicit_portal ??
    `https://www.foia.gov/agency-search.html?id=${encodeURIComponent(source_external_id)}&type=component`;

  const submission_methods: foia_gov_component["submission_methods"] =
    explicit_portal ? "portal" : email ? "email" : address ? "mail" : "mixed";

  return {
    source_external_id,
    agency_name,
    agency_abbreviation,
    component_name,
    address,
    email,
    phone,
    website,
    submission_portal,
    reading_room,
    submission_methods,
    raw_payload: {
      data: resource,
      included_agency: parent ?? null,
    },
  };
}

export function resolve_foia_gov_api_key(): { name: string; value: string } | null {
  for (const name of ["FOIA_GOV_API_KEY", "FOIA_API_KEY", "DATA_GOV_API_KEY"]) {
    const value = process.env[name]?.trim();
    if (value) return { name, value };
  }
  return null;
}

function next_link(value: json_api_document["links"] extends infer L ? L : never): string | null {
  const next = (value as { next?: string | { href?: string } | null } | undefined)?.next;
  if (typeof next === "string") return next;
  if (next && typeof next === "object") return scalar_text(next.href);
  return null;
}

async function fetch_all_components(api_key: string): Promise<{
  components: foia_gov_component[];
  response_hash: string;
  response_status: number;
  content_type: string | null;
}> {
  let url: string | null = `${FOIA_GOV_BASE_URL}?include=agency&page%5Blimit%5D=50`;
  const components: foia_gov_component[] = [];
  const response_documents: json_api_document[] = [];
  let response_status = 0;
  let content_type: string | null = null;
  let pages = 0;

  while (url) {
    pages += 1;
    if (pages > 100) throw new Error("foia_gov_pagination_limit_exceeded");
    const response = await fetch(url, {
      headers: {
        "X-API-Key": api_key,
        Accept: "application/vnd.api+json, application/json",
      },
    });
    response_status = response.status;
    content_type = response.headers.get("content-type");
    if (!response.ok) throw new Error(`foia_gov_http_${response.status}`);

    const document = await response.json() as json_api_document;
    response_documents.push(document);
    const included = Array.isArray(document.included) ? document.included : [];
    for (const resource of Array.isArray(document.data) ? document.data : []) {
      const normalized = normalize_foia_gov_component(resource, included);
      if (normalized) components.push(normalized);
    }
    url = next_link(document.links);
  }

  return {
    components,
    response_hash: sha256(canonical_json(response_documents)),
    response_status,
    content_type,
  };
}

export async function refresh_foia_gov_agency_components(): Promise<{
  source_id: string;
  pull_run_id: string;
  component_count: number;
  inserted: number;
  updated: number;
  rejected: number;
}> {
  const credential = resolve_foia_gov_api_key();
  if (!credential) throw new Error("foia_gov_api_key_missing");

  const pool = getPool();
  const source_result = await pool.query(
    `insert into public.api_source_registry (
       source_key, source_name, source_owner, source_type, base_url, documentation_url,
       jurisdiction_scope, geographic_scope, domain, auth_type, requires_secret, secret_name,
       freshness_expectation, is_active
     ) values (
       $1, 'FOIA.gov Agency Component API', 'U.S. Department of Justice Office of Information Policy',
       'government_api', $2, 'https://www.foia.gov/developer/',
       'federal', 'national', 'public_records', 'api_key', true, $3, 'daily', true
     )
     on conflict (source_key) do update set
       source_name = excluded.source_name,
       source_owner = excluded.source_owner,
       source_type = excluded.source_type,
       base_url = excluded.base_url,
       documentation_url = excluded.documentation_url,
       jurisdiction_scope = excluded.jurisdiction_scope,
       geographic_scope = excluded.geographic_scope,
       domain = excluded.domain,
       auth_type = excluded.auth_type,
       requires_secret = excluded.requires_secret,
       secret_name = excluded.secret_name,
       freshness_expectation = excluded.freshness_expectation,
       is_active = true
     returning id`,
    [FOIA_GOV_SOURCE_KEY, FOIA_GOV_BASE_URL, credential.name],
  );
  const source_id = String(source_result.rows[0].id);
  const run_key = `${FOIA_GOV_SOURCE_KEY}_${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}_${process.pid}`;
  const run_result = await pool.query(
    `insert into public.api_pull_run (
       source_id, run_key, connector_version, parser_version, normalization_version,
       status, request_url, request_method, request_params, request_headers_safe
     ) values ($1,$2,$3,$4,$5,'started',$6,'GET',$7::jsonb,$8::jsonb)
     returning id`,
    [
      source_id,
      run_key,
      FOIA_GOV_CONNECTOR_VERSION,
      FOIA_GOV_PARSER_VERSION,
      FOIA_GOV_NORMALIZATION_VERSION,
      FOIA_GOV_BASE_URL,
      JSON.stringify({ include: "agency", pagination: "json_api_next_link" }),
      JSON.stringify({ authentication: "configured", header_name: "X-API-Key" }),
    ],
  );
  const pull_run_id = String(run_result.rows[0].id);

  let inserted = 0;
  let updated = 0;
  let rejected = 0;

  try {
    const fetched = await fetch_all_components(credential.value);

    for (const component of fetched.components) {
      const payload_json = canonical_json(component.raw_payload);
      const raw_payload_hash = sha256(payload_json);
      const record_fingerprint = sha256(`${FOIA_GOV_SOURCE_KEY}|agency_component|${component.source_external_id}`);

      await pool.query(
        `insert into public.raw_api_record (
           source_id, pull_run_id, external_record_id, external_record_url,
           source_table_or_endpoint, raw_payload, raw_payload_hash, record_fingerprint,
           retrieval_method, provenance_status
         ) values ($1,$2,$3,$4,'agency_components',$5::jsonb,$6,$7,'api_pull','normalized')
         on conflict (record_fingerprint) do update set
           pull_run_id = excluded.pull_run_id,
           external_record_url = excluded.external_record_url,
           raw_payload = excluded.raw_payload,
           raw_payload_hash = excluded.raw_payload_hash,
           retrieved_at = now(),
           provenance_status = 'normalized'`,
        [
          source_id,
          pull_run_id,
          component.source_external_id,
          component.submission_portal,
          payload_json,
          raw_payload_hash,
          record_fingerprint,
        ],
      );

      const existing = await pool.query(
        `select id
           from public.foia_agencies
          where source_external_id = $1
          limit 1`,
        [component.source_external_id],
      );

      if (!existing.rowCount) {
        const legacy = await pool.query(
          `select id
             from public.foia_agencies
            where source_external_id is null
              and source_ref = 'api.foia.gov'
              and lower(btrim(coalesce(component_name,''))) = lower(btrim($1))
            order by id
            limit 2`,
          [component.component_name],
        );
        if (legacy.rowCount === 1) {
          await pool.query(
            `update public.foia_agencies set source_external_id = $1 where id = $2`,
            [component.source_external_id, legacy.rows[0].id],
          );
        } else if ((legacy.rowCount ?? 0) > 1) {
          rejected += 1;
          continue;
        }
      }

      const upsert = await pool.query(
        `insert into public.foia_agencies (
           state_code, agency_name, agency_abbreviation, component_name, jurisdiction_level,
           address, email, phone, website, submission_portal, reading_room, submission_methods,
           source_ref, source_hash8, source_external_id, updated_at
         ) values (
           'US',$1,$2,$3,'federal',$4,$5,$6,$7,$8,$9,$10,'api.foia.gov',$11,$12,now()
         )
         on conflict (source_external_id) where source_external_id is not null do update set
           state_code = 'US',
           agency_name = coalesce(excluded.agency_name, public.foia_agencies.agency_name),
           agency_abbreviation = coalesce(excluded.agency_abbreviation, public.foia_agencies.agency_abbreviation),
           component_name = coalesce(excluded.component_name, public.foia_agencies.component_name),
           jurisdiction_level = 'federal',
           address = coalesce(excluded.address, public.foia_agencies.address),
           email = coalesce(excluded.email, public.foia_agencies.email),
           phone = coalesce(excluded.phone, public.foia_agencies.phone),
           website = coalesce(excluded.website, public.foia_agencies.website),
           submission_portal = coalesce(excluded.submission_portal, public.foia_agencies.submission_portal),
           reading_room = coalesce(excluded.reading_room, public.foia_agencies.reading_room),
           submission_methods = excluded.submission_methods,
           source_ref = 'api.foia.gov',
           source_hash8 = excluded.source_hash8,
           updated_at = now()
         returning (xmax = 0) as inserted`,
        [
          component.agency_name,
          component.agency_abbreviation,
          component.component_name,
          component.address,
          component.email,
          component.phone,
          component.website,
          component.submission_portal,
          component.reading_room,
          component.submission_methods,
          raw_payload_hash.slice(0, 8),
          component.source_external_id,
        ],
      );
      if (upsert.rows[0]?.inserted) inserted += 1;
      else updated += 1;
    }

    const snapshot_hash = sha256(
      fetched.components
        .map(component => component.source_external_id)
        .sort()
        .join("\n"),
    );
    await pool.query(
      `update public.api_pull_run set
         finished_at = now(),
         status = $2,
         response_status = $3,
         response_content_type = $4,
         response_record_count = $5,
         records_inserted = $6,
         records_updated = $7,
         records_rejected = $8,
         source_snapshot_hash = $9,
         response_body_hash = $10,
         notes = $11
       where id = $1`,
      [
        pull_run_id,
        rejected ? "partial_success" : "success",
        fetched.response_status,
        fetched.content_type,
        fetched.components.length,
        inserted,
        updated,
        rejected,
        snapshot_hash,
        fetched.response_hash,
        `credential=${credential.name}; existing rows preserved on ambiguous legacy identity matches`,
      ],
    );

    return {
      source_id,
      pull_run_id,
      component_count: fetched.components.length,
      inserted,
      updated,
      rejected,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "unknown_foia_gov_refresh_failure";
    await pool.query(
      `update public.api_pull_run
          set finished_at = now(), status = 'failed', error_message = $2
        where id = $1`,
      [pull_run_id, message],
    );
    throw error;
  }
}
