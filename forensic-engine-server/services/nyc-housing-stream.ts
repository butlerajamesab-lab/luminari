/**
 * NYC Housing Maintenance Code Complaints Live Data Stream
 * 
 * Follows Luminari Live Data Stream Specification v1.0.0 (LOCKED)
 * Pattern: Config → Fetch → Transform → Insert → Orchestration
 * 
 * Endpoint: ygpa-z7cr (Housing Maintenance Code Complaints)
 * DO NOT DEVIATE from this pattern.
 */

import { pool } from "../db";

// ─────────────────────────────────────────────────────────────────────
// PART 1: Configuration & Types
// ─────────────────────────────────────────────────────────────────────

const SOCRATA_ENDPOINT = "https://data.cityofnewyork.us/resource/ygpa-z7cr.json";

interface SocrataComplaintRecord {
  received_date?: string;
  problem_id?: string;
  complaint_id?: string;
  building_id?: string;
  borough?: string;
  house_number?: string;
  street_name?: string;
  post_code?: string;
  block?: string;
  lot?: string;
  apartment?: string;
  community_board?: string;
  unit_type?: string;
  space_type?: string;
  type?: string;
  major_category?: string;
  minor_category?: string;
  problem_code?: string;
  complaint_status?: string;
  complaint_status_date?: string;
  problem_status?: string;
  problem_status_date?: string;
  status_description?: string;
  problem_duplicate_flag?: string;
  complaint_anonymous_flag?: string;
  unique_key?: string;
  latitude?: string;
  longitude?: string;
  council_district?: string;
  census_tract?: string;
  bin?: string;
  bbl?: string;
  nta?: string;
  [key: string]: any;
}

interface LiveSignal {
  signalType: string;
  sourceId: string;
  value: string;
  numericValue: number | null;
  latitude: number | null;
  longitude: number | null;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

interface StreamResult {
  fetched: number;
  transformed: number;
  inserted: number;
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────
// PART 2: Fetch
// ─────────────────────────────────────────────────────────────────────

export async function fetchHousingComplaints(limit: number = 100): Promise<SocrataComplaintRecord[]> {
  try {
    const url = `${SOCRATA_ENDPOINT}?\$limit=${limit}&\$order=received_date DESC`;
    console.log(`[NYC Housing Stream] Fetching from: ${url}`);
    
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Socrata API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error("Socrata API returned non-array response");
    }

    console.log(`[NYC Housing Stream] Fetched ${data.length} records`);
    return data;
  } catch (error) {
    console.error("[NYC Housing Stream] Fetch error:", error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────
// PART 3: Transform
// ─────────────────────────────────────────────────────────────────────

export function transformToSignal(record: SocrataComplaintRecord): LiveSignal | null {
  // Require unique identifier and timestamp
  if (!record.unique_key || !record.received_date) {
    return null;
  }

  // Parse received date
  let timestamp: Date;
  try {
    timestamp = new Date(record.received_date);
    if (isNaN(timestamp.getTime())) {
      return null;
    }
  } catch {
    return null;
  }

  // Parse coordinates
  let latitude: number | null = null;
  let longitude: number | null = null;
  
  if (record.latitude) {
    const lat = parseFloat(record.latitude);
    if (!isNaN(lat)) {
      latitude = lat;
    }
  }
  
  if (record.longitude) {
    const lng = parseFloat(record.longitude);
    if (!isNaN(lng)) {
      longitude = lng;
    }
  }

  // Build human-readable value
  const location = `${record.house_number || "?"} ${record.street_name || "?"}, ${record.borough || "?"}`;
  const value = `Housing complaint: ${record.major_category || "Unknown"} - ${record.status_description || record.problem_code || "Unknown"}`;

  // Numeric severity based on type (EMERGENCY, URGENT, etc.)
  let numericValue: number | null = null;
  if (record.type === "EMERGENCY") {
    numericValue = 3;
  } else if (record.type === "URGENT") {
    numericValue = 2;
  } else if (record.type) {
    numericValue = 1;
  }

  // Build metadata with complete record
  const metadata: Record<string, unknown> = {
    ...record,
    location,
    complaintCategory: record.major_category,
    complaintType: record.type,
    complaintStatus: record.complaint_status,
    problemStatus: record.problem_status,
    statusDescription: record.status_description,
    problemCode: record.problem_code,
  };

  return {
    signalType: "nyc-housing-complaint",
    sourceId: `nyc-housing-${record.unique_key}`,
    value,
    numericValue,
    latitude,
    longitude,
    metadata,
    timestamp,
  };
}

// ─────────────────────────────────────────────────────────────────────
// PART 4: Insert
// ─────────────────────────────────────────────────────────────────────

export async function insertSignals(signals: LiveSignal[]): Promise<number> {
  if (signals.length === 0) {
    return 0;
  }

  try {
    // Build parameterized multi-row INSERT with all 10 columns
    const now = Date.now();
    const placeholders = signals.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",");
    const params: any[] = [];

    for (const signal of signals) {
      params.push(
        signal.signalType,
        signal.sourceId,
        signal.value,
        signal.numericValue,
        signal.latitude,
        signal.longitude,
        JSON.stringify(signal.metadata),
        signal.timestamp.getTime(),  // timestamp as milliseconds
        now,  // createdAt
        now   // updatedAt
      );
    }

    const query = `
      INSERT INTO raw_live_signals 
        (signalType, sourceId, value, numericValue, latitude, longitude, metadata, timestamp, createdAt, updatedAt)
      VALUES ${placeholders}
    `;

    const result = await pool.query(query, params);
    
    // Return number of rows inserted (affectedRows includes updates, so we check insertId)
    const rows = result as any;
    return rows.affectedRows || 0;
  } catch (error) {
    console.error("[NYC Housing Stream] Insert error:", error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────
// PART 5: Pipeline Orchestration
// ─────────────────────────────────────────────────────────────────────

export async function runNycHousingStream(
  options: { limit?: number } = {}
): Promise<StreamResult> {
  const limit = options.limit ?? 100;
  const errors: string[] = [];
  let fetched = 0;
  let transformed = 0;
  let inserted = 0;

  try {
    // Step 1: Fetch
    console.log(`[NYC Housing Stream] Fetching up to ${limit} records...`);
    const records = await fetchHousingComplaints(limit);
    fetched = records.length;
    console.log(`[NYC Housing Stream] Fetched ${fetched} records`);

    // Step 2: Transform
    console.log("[NYC Housing Stream] Transforming records...");
    const signals: LiveSignal[] = [];
    for (const record of records) {
      const signal = transformToSignal(record);
      if (signal) {
        signals.push(signal);
        transformed++;
      }
    }
    console.log(`[NYC Housing Stream] Transformed ${transformed} records`);

    // Step 3: Insert
    if (signals.length > 0) {
      console.log(`[NYC Housing Stream] Inserting ${signals.length} signals...`);
      inserted = await insertSignals(signals);
      console.log(`[NYC Housing Stream] Inserted ${inserted} signals`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    console.error(`[NYC Housing Stream] Error: ${message}`);
  }

  return {
    fetched,
    transformed,
    inserted,
    errors,
  };
}
