/**
 * Atlas Population Engine
 *
 * Curates and activates public data streams that can populate the Atlas/Lighthouse
 * signal backbone. The engine only registers stream metadata; the existing
 * scheduler/adapters remain responsible for live ingestion and signal detection.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { dataStreamRegistry } from "../../drizzle/schema";
import { db } from "../db";
import { governedDataStreamCreate } from "../governance-hooks";


const ATLAS_SIGNAL_INTELLIGENCE_CARD_COLUMNS = [
  "signal_id",
  "source_signal_table",
  "raw_signal_type",
  "canonical_signal_code",
  "canonical_signal_name",
  "signal_family",
  "signal_category",
  "display_title",
  "display_summary",
  "geography_key",
  "jurisdiction_raw_value",
  "jurisdiction_id",
  "entity_ids",
  "source_table",
  "source_record_id",
  "source_connector_id",
  "raw_record_id",
  "statute_id",
  "source_url",
  "confidence_score",
  "severity",
  "severity_score",
  "signal_status",
  "verification_status",
  "record_origin",
  "exclude_from_production",
  "quarantine_reason",
  "evidence_payload",
  "metadata_json",
  "provenance_metadata",
  "detected_at",
  "created_at",
].join(",");

const ATLAS_SIGNAL_INTELLIGENCE_SUMMARY_COLUMNS = [
  "canonical_signal_code",
  "signal_family",
  "verification_status",
  "severity",
  "exclude_from_production",
].join(",");

export type atlas_signal_intelligence_card = {
  signal_id: string | number | null;
  source_signal_table: string | null;
  raw_signal_type: string | null;
  canonical_signal_code: string | null;
  canonical_signal_name: string | null;
  signal_family: string | null;
  signal_category: string | null;
  display_title: string | null;
  display_summary: string | null;
  geography_key: string | null;
  jurisdiction_raw_value: string | null;
  jurisdiction_id: string | number | null;
  entity_ids: unknown;
  source_table: string | null;
  source_record_id: string | null;
  source_connector_id: string | null;
  raw_record_id: string | null;
  statute_id: string | number | null;
  source_url: string | null;
  confidence_score: number | string | null;
  severity: string | null;
  severity_score: number | string | null;
  signal_status: string | null;
  verification_status: string | null;
  record_origin: string | null;
  exclude_from_production: boolean | null;
  quarantine_reason: string | null;
  evidence_payload: unknown;
  metadata_json: unknown;
  provenance_metadata: unknown;
  detected_at: string | null;
  created_at: string | null;
};

export type atlas_signal_intelligence_cards_input = {
  limit?: number;
  canonical_signal_code?: string;
  signal_family?: string;
  include_excluded?: boolean;
};

type atlas_signal_intelligence_summary_row = {
  canonical_signal_code: string | null;
  signal_family: string | null;
  verification_status: string | null;
  severity: string | null;
  exclude_from_production: boolean | null;
};

function get_atlas_client(): { configured: true; atlas_client: SupabaseClient } | { configured: false; atlas_client: null } {
  const atlas_supabase_url = process.env.ATLAS_SUPABASE_URL;
  const atlas_supabase_key = process.env.ATLAS_SUPABASE_SERVICE_ROLE_KEY ?? process.env.ATLAS_SUPABASE_ANON_KEY;

  if (!atlas_supabase_url || !atlas_supabase_key) {
    return { configured: false, atlas_client: null };
  }

  return {
    configured: true,
    atlas_client: createClient(atlas_supabase_url, atlas_supabase_key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }),
  };
}

function increment_group_count(grouped_counts: Record<string, number>, raw_key: string | null | undefined) {
  const key = raw_key && raw_key.trim().length > 0 ? raw_key : "unknown";
  grouped_counts[key] = (grouped_counts[key] ?? 0) + 1;
}

export async function get_atlas_signal_intelligence_cards(input: atlas_signal_intelligence_cards_input = {}) {
  const atlas_client_result = get_atlas_client();

  if (!atlas_client_result.configured) {
    return {
      configured: false,
      source_status: "not_configured",
      cards: [] as atlas_signal_intelligence_card[],
      count: 0,
    };
  }

  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  let query = atlas_client_result.atlas_client
    .schema("atlas")
    .from("v_signal_intelligence_cards")
    .select(ATLAS_SIGNAL_INTELLIGENCE_CARD_COLUMNS, { count: "exact" });

  if (!input.include_excluded) {
    query = query.or("exclude_from_production.is.false,exclude_from_production.is.null");
  }

  if (input.canonical_signal_code) {
    query = query.eq("canonical_signal_code", input.canonical_signal_code);
  }

  if (input.signal_family) {
    query = query.eq("signal_family", input.signal_family);
  }

  const { data, error, count } = await query
    .order("severity_score", { ascending: false, nullsFirst: false })
    .order("confidence_score", { ascending: false, nullsFirst: false })
    .order("detected_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    return {
      configured: true,
      source_status: "error",
      cards: [] as atlas_signal_intelligence_card[],
      count: 0,
      error_message: error.message,
    };
  }

  const cards = (data ?? []) as unknown as atlas_signal_intelligence_card[];

  return {
    configured: true,
    source_status: "ok",
    cards,
    count: count ?? cards.length,
  };
}

export async function get_atlas_signal_intelligence_summary() {
  const atlas_client_result = get_atlas_client();

  if (!atlas_client_result.configured) {
    return {
      configured: false,
      source_status: "not_configured",
      total_cards: 0,
      production_cards: 0,
      excluded_cards: 0,
      by_canonical_signal_code: {} as Record<string, number>,
      by_signal_family: {} as Record<string, number>,
      by_verification_status: {} as Record<string, number>,
      by_severity: {} as Record<string, number>,
    };
  }

  const { data, error } = await atlas_client_result.atlas_client
    .schema("atlas")
    .from("v_signal_intelligence_cards")
    .select(ATLAS_SIGNAL_INTELLIGENCE_SUMMARY_COLUMNS)
    .limit(10000);

  if (error) {
    return {
      configured: true,
      source_status: "error",
      total_cards: 0,
      production_cards: 0,
      excluded_cards: 0,
      by_canonical_signal_code: {} as Record<string, number>,
      by_signal_family: {} as Record<string, number>,
      by_verification_status: {} as Record<string, number>,
      by_severity: {} as Record<string, number>,
      error_message: error.message,
    };
  }

  const rows = (data ?? []) as unknown as atlas_signal_intelligence_summary_row[];
  const by_canonical_signal_code: Record<string, number> = {};
  const by_signal_family: Record<string, number> = {};
  const by_verification_status: Record<string, number> = {};
  const by_severity: Record<string, number> = {};
  let production_cards = 0;
  let excluded_cards = 0;

  for (const row of rows) {
    if (row.exclude_from_production) {
      excluded_cards++;
    } else {
      production_cards++;
    }

    increment_group_count(by_canonical_signal_code, row.canonical_signal_code);
    increment_group_count(by_signal_family, row.signal_family);
    increment_group_count(by_verification_status, row.verification_status);
    increment_group_count(by_severity, row.severity);
  }

  return {
    configured: true,
    source_status: "ok",
    total_cards: rows.length,
    production_cards,
    excluded_cards,
    by_canonical_signal_code,
    by_signal_family,
    by_verification_status,
    by_severity,
  };
}

export type AtlasPublicStreamDefinition = {
  streamId: string;
  streamName: string;
  streamType:
    | "government_complaints"
    | "court_filings"
    | "regulatory_enforcement"
    | "public_records"
    | "media_reports"
    | "civil_society_reports"
    | "verified_user_reports";
  source: "socrata" | "cfpb_native";
  sourceUrl: string;
  apiUrl: string;
  updateFrequency: "hourly" | "daily" | "weekly" | "monthly" | "manual";
  jurisdiction: string;
  domain: string;
  description: string;
  fieldMapping: Record<string, string>;
  cronExpression?: string;
  tags: string[];
};

export const ATLAS_PUBLIC_STREAM_CATALOG: AtlasPublicStreamDefinition[] = [
  {
    streamId: "cfpb-consumer-complaints",
    streamName: "CFPB Consumer Complaint Database",
    streamType: "government_complaints",
    source: "cfpb_native",
    sourceUrl: "https://www.consumerfinance.gov/data-research/consumer-complaints/",
    apiUrl: "https://api.consumerfinance.gov/data-research/consumer-complaints/search.json",
    updateFrequency: "daily",
    jurisdiction: "United States",
    domain: "consumer_finance",
    description: "Nationwide consumer finance complaints published by the Consumer Financial Protection Bureau.",
    fieldMapping: {
      complaint_id: "sourceRecordId",
      date_received: "normalizedDate",
      product: "normalizedCategory",
      company: "normalizedEntity",
      state: "normalizedState",
      zip_code: "normalizedZip",
      company_response: "normalizedStatus",
      issue: "normalizedDescription",
    },
    tags: ["federal", "complaints", "finance", "consumer_protection"],
  },
  {
    streamId: "gpri-47xz",
    streamName: "WA Attorney General Consumer Complaints",
    streamType: "government_complaints",
    source: "socrata",
    sourceUrl: "https://data.wa.gov/Consumer-Protection/Consumer-Complaints/gpri-47xz",
    apiUrl: "https://data.wa.gov/resource/gpri-47xz.json",
    updateFrequency: "daily",
    jurisdiction: "Washington",
    domain: "consumer_protection",
    description: "Consumer complaints filed with the Washington State Attorney General's Office.",
    fieldMapping: {
      id: "sourceRecordId",
      openeddate: "normalizedDate",
      businesscategory: "normalizedCategory",
      business: "normalizedEntity",
      businessstate: "normalizedState",
      businesscity: "normalizedCity",
      businesszip: "normalizedZip",
      status: "normalizedStatus",
      actualsavings: "normalizedAmount",
      naics: "normalizedDescription",
    },
    tags: ["state", "complaints", "consumer_protection", "washington"],
  },
  {
    streamId: "j78t-andi",
    streamName: "WA Public Disclosure Commission Documents",
    streamType: "public_records",
    source: "socrata",
    sourceUrl: "https://data.wa.gov/Politics/Public-Disclosure-Commission-Imaged-Documents/j78t-andi",
    apiUrl: "https://data.wa.gov/resource/j78t-andi.json",
    updateFrequency: "daily",
    jurisdiction: "Washington",
    domain: "campaign_finance",
    description: "Campaign finance filings and disclosure documents from the Washington Public Disclosure Commission.",
    fieldMapping: {
      id: "sourceRecordId",
      receipt_date: "normalizedDate",
      type: "normalizedCategory",
      filer_name: "normalizedEntity",
      office: "normalizedJurisdiction",
      legislative_district: "normalizedCity",
      party: "normalizedState",
      election_year: "normalizedZip",
      origin: "normalizedStatus",
      document_description: "normalizedDescription",
    },
    tags: ["state", "campaign_finance", "public_records", "washington"],
  },
  {
    streamId: "nyc-311-service-requests",
    streamName: "NYC 311 Service Requests",
    streamType: "public_records",
    source: "socrata",
    sourceUrl: "https://data.cityofnewyork.us/Social-Services/311-Service-Requests/erm2-nwe9",
    apiUrl: "https://data.cityofnewyork.us/resource/erm2-nwe9.json",
    updateFrequency: "hourly",
    jurisdiction: "New York City",
    domain: "municipal_services",
    description: "New York City 311 service requests for live municipal service pressure, agency routing, and neighborhood cluster signals.",
    fieldMapping: {
      unique_key: "sourceRecordId",
      created_date: "normalizedDate",
      complaint_type: "normalizedCategory",
      agency_name: "normalizedEntity",
      borough: "normalizedJurisdiction",
      city: "normalizedCity",
      incident_zip: "normalizedZip",
      status: "normalizedStatus",
      descriptor: "normalizedDescription",
    },
    tags: ["local", "311", "municipal_services", "new_york_city"],
  },
  {
    streamId: "chicago-311-service-requests",
    streamName: "Chicago 311 Service Requests",
    streamType: "public_records",
    source: "socrata",
    sourceUrl: "https://data.cityofchicago.org/Service-Requests/311-Service-Requests/v6vf-nfxy",
    apiUrl: "https://data.cityofchicago.org/resource/v6vf-nfxy.json",
    updateFrequency: "hourly",
    jurisdiction: "Chicago",
    domain: "municipal_services",
    description: "Chicago 311 service request stream for service delays, neighborhood clusters, and agency routing pressure.",
    fieldMapping: {
      sr_number: "sourceRecordId",
      created_date: "normalizedDate",
      sr_type: "normalizedCategory",
      owner_department: "normalizedEntity",
      community_area: "normalizedJurisdiction",
      city: "normalizedCity",
      zip_code: "normalizedZip",
      status: "normalizedStatus",
      street_address: "normalizedDescription",
    },
    tags: ["local", "311", "municipal_services", "chicago"],
  },
];

function toWireStream(stream: AtlasPublicStreamDefinition) {
  return {
    stream_id: stream.streamId,
    stream_name: stream.streamName,
    stream_type: stream.streamType,
    source: stream.source,
    source_url: stream.sourceUrl,
    api_url: stream.apiUrl,
    update_frequency: stream.updateFrequency,
    jurisdiction: stream.jurisdiction,
    domain: stream.domain,
    description: stream.description,
    field_mapping: stream.fieldMapping,
    cron_expression: stream.cronExpression ?? null,
    tags: stream.tags,
  };
}

export function summarizeAtlasCatalog() {
  const byDomain = new Map<string, number>();
  const byJurisdiction = new Map<string, number>();
  for (const stream of ATLAS_PUBLIC_STREAM_CATALOG) {
    byDomain.set(stream.domain, (byDomain.get(stream.domain) ?? 0) + 1);
    byJurisdiction.set(stream.jurisdiction, (byJurisdiction.get(stream.jurisdiction) ?? 0) + 1);
  }

  return {
    total_streams: ATLAS_PUBLIC_STREAM_CATALOG.length,
    by_domain: Object.fromEntries(byDomain),
    by_jurisdiction: Object.fromEntries(byJurisdiction),
    streams: ATLAS_PUBLIC_STREAM_CATALOG.map(toWireStream),
  };
}

export async function populateAtlasPublicStreams(input?: {
  actorId?: string;
  actorRole?: "admin" | "system" | "engine";
  streamIds?: string[];
}) {
  const selected = input?.streamIds?.length
    ? ATLAS_PUBLIC_STREAM_CATALOG.filter((stream) => input.streamIds?.includes(stream.streamId))
    : ATLAS_PUBLIC_STREAM_CATALOG;

  let created = 0;
  let skipped = 0;
  const createdStreamIds: string[] = [];
  const skippedStreamIds: string[] = [];

  for (const stream of selected) {
    const [existing] = await db
      .select({ id: dataStreamRegistry.id })
      .from(dataStreamRegistry)
      .where(eq(dataStreamRegistry.streamId, stream.streamId))
      .limit(1);

    if (existing) {
      skipped++;
      skippedStreamIds.push(stream.streamId);
      continue;
    }

    await governedDataStreamCreate({
      streamData: {
        streamId: stream.streamId,
        streamName: stream.streamName,
        streamType: stream.streamType,
        source: stream.source,
        sourceUrl: stream.sourceUrl,
        apiUrl: stream.apiUrl,
        updateFrequency: stream.updateFrequency,
        jurisdiction: stream.jurisdiction,
        domain: stream.domain,
        description: `${stream.description} Tags: ${stream.tags.join(", ")}.`,
        fieldMapping: stream.fieldMapping,
        cronExpression: stream.cronExpression ?? null,
      },
      rationale: `Atlas Population Engine activated public stream: ${stream.streamName}`,
      actorId: input?.actorId ?? "SYSTEM:atlas-population-engine",
      actorRole: input?.actorRole ?? "system",
    });

    created++;
    createdStreamIds.push(stream.streamId);
  }

  return {
    created,
    skipped,
    total_selected: selected.length,
    created_stream_ids: createdStreamIds,
    skipped_stream_ids: skippedStreamIds,
  };
}
