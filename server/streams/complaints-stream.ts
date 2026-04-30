/**
 * Complaints Stream Ingestion
 * 
 * Fetches real complaint data from CFPB API and normalizes into signalFlags.
 * Minimal, deterministic ingestion with duplicate prevention.
 */

import { db as defaultDb } from "../db";
import { signalFlags } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";

export interface ComplaintRecord {
  id: string;
  complaint_type: string;
  consumer_narrative: string;
  date_received: string;
}

export interface NormalizedSignal {
  flagType: string;
  description: string;
  quoteId: string;
  engineVersion: string;
}

/**
 * Fetch complaints from CFPB API (public, no auth required)
 * Limit to 20 records for minimal ingestion
 */
export async function fetchComplaints(): Promise<ComplaintRecord[]> {
  console.log("[Complaints Stream] Fetching complaints from CFPB API...");

  try {
    // CFPB Consumer Complaint Database API
    // Returns recent complaints with limit
    const url = new URL("https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1");
    url.searchParams.set("format", "json");
    url.searchParams.set("size", "20");
    url.searchParams.set("sort", "-date_received");

    const response = await fetch(url.toString(), {
      timeout: 10000, // 10 second timeout
      headers: {
        "User-Agent": "Forensic-Engine/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`CFPB API returned ${response.status}`);
    }

    const data = await response.json();
    const hits = data.hits?.hits || [];

    console.log(`[Complaints Stream] Fetched ${hits.length} complaints`);

    // Normalize to our complaint record format
    return hits.map((hit: any) => ({
      id: hit._id || hit.complaint_id || `complaint-${Date.now()}-${Math.random()}`,
      complaint_type: hit._source?.complaint_type || "unknown",
      consumer_narrative: hit._source?.consumer_narrative || hit._source?.complaint_text || "",
      date_received: hit._source?.date_received || new Date().toISOString(),
    }));
  } catch (error) {
    console.error("[Complaints Stream] Error fetching complaints:", error);
    return [];
  }
}

/**
 * Normalize complaint record into signalFlags format
 */
export function normalizeComplaint(complaint: ComplaintRecord): NormalizedSignal {
  return {
    flagType: complaint.complaint_type || "consumer_complaint",
    description: complaint.consumer_narrative || `Complaint received on ${complaint.date_received}`,
    quoteId: complaint.id,
    engineVersion: "stream-ingest",
  };
}

/**
 * Check if signal already exists (duplicate prevention)
 */
export async function signalExists(
  dbInstance: any,
  quoteId: string
): Promise<boolean> {
  const existing = await dbInstance
    .select()
    .from(signalFlags)
    .where(eq(signalFlags.quoteId, quoteId));

  return existing.length > 0;
}

/**
 * Insert normalized signal into signalFlags
 */
export async function insertSignal(
  dbInstance: any,
  signal: NormalizedSignal
): Promise<boolean> {
  try {
    const now = Date.now();

    await dbInstance.execute(
      sql`
        INSERT INTO signal_flags (
          flag_type, description, quote_id, engine_version,
          sunam_status, confidence_score,
          created_at, updated_at
        ) VALUES (
          ${signal.flagType},
          ${signal.description},
          ${signal.quoteId},
          ${signal.engineVersion},
          NULL,
          NULL,
          ${now},
          ${now}
        )
      `
    );

    console.log(`[Complaints Stream] Inserted signal for ${signal.quoteId}`);
    return true;
  } catch (error) {
    console.error(`[Complaints Stream] Error inserting signal for ${signal.quoteId}:`, error);
    return false;
  }
}

/**
 * Main ingestion runner
 */
export async function runComplaintsStream(
  dbInstance: any = defaultDb
): Promise<{
  fetched: number;
  inserted: number;
  skipped: number;
  failed: number;
}> {
  console.log("[Complaints Stream] Starting complaints ingestion...");

  const stats = {
    fetched: 0,
    inserted: 0,
    skipped: 0,
    failed: 0,
  };

  try {
    // Fetch complaints
    const complaints = await fetchComplaints();
    stats.fetched = complaints.length;

    console.log(`[Complaints Stream] Processing ${complaints.length} complaints...`);

    // Process each complaint
    for (const complaint of complaints) {
      // Normalize
      const signal = normalizeComplaint(complaint);

      // Check for duplicates
      const exists = await signalExists(dbInstance, signal.quoteId);
      if (exists) {
        console.log(`[Complaints Stream] Skipping duplicate: ${signal.quoteId}`);
        stats.skipped++;
        continue;
      }

      // Insert
      const inserted = await insertSignal(dbInstance, signal);
      if (inserted) {
        stats.inserted++;
      } else {
        stats.failed++;
      }
    }

    console.log(
      `[Complaints Stream] Ingestion complete: fetched=${stats.fetched}, inserted=${stats.inserted}, skipped=${stats.skipped}, failed=${stats.failed}`
    );

    return stats;
  } catch (error) {
    console.error("[Complaints Stream] Fatal error during ingestion:", error);
    return stats;
  }
}
