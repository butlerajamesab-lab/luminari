/**
 * Atlas Population Engine
 *
 * Curates and activates public data streams that can populate the Atlas/Lighthouse
 * signal backbone. The engine only registers stream metadata; the existing
 * scheduler/adapters remain responsible for live ingestion and signal detection.
 */

import { eq } from "drizzle-orm";
import { dataStreamRegistry } from "../../drizzle/schema";
import { db } from "../db";
import { governedDataStreamCreate } from "../governance-hooks";

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
