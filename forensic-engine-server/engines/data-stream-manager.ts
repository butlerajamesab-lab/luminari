/**
 * Data Stream Manager
 * 
 * Admin UI service for managing ingestion data streams:
 * - Add new streams (government_complaints, court_filings, etc.)
 * - Edit stream configuration (weights, frequency, field mapping)
 * - Enable/disable streams
 * - View stream health and statistics
 */
import { db } from "../db";
import { eq, desc, sql, and } from "drizzle-orm";
import {
  dataStreamRegistry,
  ingestRuns,
  detectedSignals,
} from "../../drizzle/schema";

export const STREAM_TYPES = [
  { id: "government_complaints", label: "Government Complaints", description: "Consumer complaints filed with government agencies" },
  { id: "court_filings", label: "Court Filings", description: "Federal and state court case filings" },
  { id: "regulatory_enforcement", label: "Regulatory Enforcement", description: "Enforcement actions by regulatory agencies" },
  { id: "public_records", label: "Public Records", description: "Government public records and disclosures" },
  { id: "media_reports", label: "Media Reports", description: "News and investigative journalism reports" },
  { id: "civil_society_reports", label: "Civil Society Reports", description: "Reports from NGOs and advocacy organizations" },
  { id: "verified_user_reports", label: "Verified User Reports", description: "Reports submitted and verified by platform users" },
] as const;

export const UPDATE_FREQUENCIES = [
  { id: "realtime", label: "Real-time" },
  { id: "hourly", label: "Hourly" },
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "manual", label: "Manual Only" },
] as const;

/** Get all streams with health stats — includes self-healing columns */
export async function getStreamsWithHealth() {
  const streams = await db.select().from(dataStreamRegistry);
  
  return streams.map(stream => ({
    ...stream,
    linkedDatasetCount: 1,
    healthStatus: (stream as any).autoDisabled
      ? "auto_disabled"
      : stream.enabled
        ? (stream.lastIngestedAt && Date.now() - Number(stream.lastIngestedAt) < 7 * 24 * 60 * 60 * 1000
          ? "healthy" : "stale")
        : "disabled",
  }));
}

/** Get stream detail with recent activity */
export async function getStreamDetail(streamId: string) {
  const [stream] = await db.select().from(dataStreamRegistry).where(eq(dataStreamRegistry.streamId, streamId));
  if (!stream) return null;

  // Stream IS the dataset — no separate linked datasets
  return {
    ...stream,
    linkedDatasets: [{
      datasetId: stream.streamId,
      datasetName: stream.streamName,
      source: stream.source ?? 'unknown',
      enabled: stream.enabled,
      totalRecordsIngested: stream.recordsIngested ?? 0,
      lastIngestedAt: stream.lastIngestedAt,
    }],
  };
}

/** Create a new stream */
export async function createStream(input: {
  streamId: string;
  streamName: string;
  streamType: string;
  sourceUrl?: string;
  updateFrequency?: string;
  signalWeight?: number;
  confidenceMultiplier?: number;
  description?: string;
  fieldMapping?: Record<string, string>;
}) {
  const [result] = await db.insert(dataStreamRegistry).values({
    streamId: input.streamId,
    streamName: input.streamName,
    streamType: input.streamType as any,
    sourceUrl: input.sourceUrl,
    updateFrequency: (input.updateFrequency as any) || "daily",
    signalWeight: input.signalWeight ?? 100,
    confidenceMultiplier: input.confidenceMultiplier ?? 100,
    description: input.description,
    fieldMapping: input.fieldMapping,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  return { id: (result as any).insertId, streamId: input.streamId };
}

/** Update a stream */
export async function updateStream(streamId: string, updates: {
  streamName?: string;
  signalWeight?: number;
  confidenceMultiplier?: number;
  enabled?: boolean;
  description?: string;
  sourceUrl?: string;
  updateFrequency?: string;
  fieldMapping?: Record<string, string>;
}) {
  const setValues: any = { updatedAt: Date.now() };
  if (updates.streamName !== undefined) setValues.streamName = updates.streamName;
  if (updates.signalWeight !== undefined) setValues.signalWeight = updates.signalWeight;
  if (updates.confidenceMultiplier !== undefined) setValues.confidenceMultiplier = updates.confidenceMultiplier;
  if (updates.enabled !== undefined) setValues.enabled = updates.enabled;
  if (updates.description !== undefined) setValues.description = updates.description;
  if (updates.sourceUrl !== undefined) setValues.sourceUrl = updates.sourceUrl;
  if (updates.updateFrequency !== undefined) setValues.updateFrequency = updates.updateFrequency;
  if (updates.fieldMapping !== undefined) setValues.fieldMapping = updates.fieldMapping;

  await db.update(dataStreamRegistry).set(setValues).where(eq(dataStreamRegistry.streamId, streamId));
  return { success: true };
}

/** Delete a stream */
export async function deleteStream(streamId: string) {
  await db.delete(dataStreamRegistry).where(eq(dataStreamRegistry.streamId, streamId));
  return { success: true };
}

/** Get stream statistics */
export async function getStreamStats() {
  const streams = await db.select().from(dataStreamRegistry);
  const totalRecords = streams.reduce((sum, s) => sum + s.recordsIngested, 0);
  const totalSignals = streams.reduce((sum, s) => sum + s.signalsGenerated, 0);

  return {
    totalStreams: streams.length,
    enabledStreams: streams.filter(s => s.enabled).length,
    disabledStreams: streams.filter(s => !s.enabled).length,
    autoDisabledStreams: streams.filter(s => (s as any).autoDisabled).length,
    totalRecordsIngested: totalRecords,
    totalSignalsGenerated: totalSignals,
    totalFailures: streams.reduce((sum, s) => sum + ((s as any).failureCount ?? 0), 0),
    byType: STREAM_TYPES.map(t => ({
      type: t.id,
      label: t.label,
      count: streams.filter(s => s.streamType === t.id).length,
    })),
  };
}
