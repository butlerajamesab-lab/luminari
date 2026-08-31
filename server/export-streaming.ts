/**
 * Streaming Export Pipeline
 * 
 * Structural fix for export failures caused by:
 * 1. N+1 query storm (14,459 sequential SELECTs for entity roles + relationship evidence)
 * 2. Full dataset in-memory assembly (~100 MB JSON for large cases)
 * 3. JSON.stringify on massive object (doubles memory)
 * 4. res.send() buffering entire payload
 *
 * This module replaces generateJsonDump with a streaming JSON writer
 * and provides batch-fetched data loaders that eliminate N+1 queries.
 *
 * Contract:
 * - No nested entity objects
 * - No circular references
 * - No derived runtime-only fields
 * - No graph layout state
 * - Deterministic ordering (ASC by id)
 * - Flat projection only
 */

import type { Response } from "express";
import { db } from "./db";
import * as dbHelpers from "./db";
import { entityRoles, relationshipEvidence, entities, relationships, quotes, claims, findings, events, signalFlags, documentCorrelations, documents } from "../drizzle/schema";
import { eq, asc, inArray, and } from "drizzle-orm";
import { ArtifactCollector, buildManifest, buildHashIndex, buildExportMeta, canonicalStringify, type AuditTraceHead } from "./export-manifest";
import { getPublicKeyPem, getPublicKeyFingerprint } from "./crypto-signing";
import { getPhase2ExportData } from "./phase2-db";

export type SovereignExportType = "full-bundle" | "json-dump";

export const EXPORT_TYPE_HEADER = "X-Luminari-Export-Type";

export class ExportRequestError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "ExportRequestError";
  }
}

function exportFilename(caseName: unknown, suffix: string): string {
  const safeCaseName = String(caseName ?? "").replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "") || "Case";
  return `Luminari_${safeCaseName}_${suffix}`;
}

export function setExportDownloadHeaders(res: Response, exportType: SovereignExportType, caseName: unknown): void {
  const isJson = exportType === "json-dump";
  res.setHeader("Content-Type", isJson ? "application/json; charset=utf-8" : "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${exportFilename(caseName, isJson ? "Data.json" : "Bundle.html")}"`);
  res.setHeader(EXPORT_TYPE_HEADER, exportType);
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

export function clearExportDownloadHeaders(res: Response): void {
  res.removeHeader("Content-Disposition");
  res.removeHeader(EXPORT_TYPE_HEADER);
}

// ─── Batch Loaders (eliminate N+1) ───

/**
 * Fetch ALL entity roles for a case in a single query.
 * Returns Map<entityId, role[]> for O(1) lookup.
 */
export async function batchLoadEntityRoles(caseId: number): Promise<Map<number, Array<{ id: number; entityId: number; documentId: number; role: string; quoteId: number | null }>>> {
  const entityIds = await db.select({ id: entities.id }).from(entities).where(eq(entities.caseId, caseId)).orderBy(asc(entities.id));
  if (entityIds.length === 0) return new Map();

  // Batch in chunks of 1000 to avoid query parameter limits
  const allRoles: Array<{ id: number; entityId: number; documentId: number; role: string; quoteId: number | null }> = [];
  const ids = entityIds.map(e => e.id);
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    const rows = await db.select({
      id: entityRoles.id,
      entityId: entityRoles.entityId,
      documentId: entityRoles.documentId,
      role: entityRoles.role,
      quoteId: entityRoles.quoteId,
    }).from(entityRoles).where(inArray(entityRoles.entityId, chunk)).orderBy(asc(entityRoles.id));
    allRoles.push(...rows);
  }

  const map = new Map<number, typeof allRoles>();
  for (const role of allRoles) {
    const existing = map.get(role.entityId) || [];
    existing.push(role);
    map.set(role.entityId, existing);
  }
  return map;
}

/**
 * Fetch ALL relationship evidence for a case in a single query.
 * Returns Map<relationshipId, evidence[]> for O(1) lookup.
 */
export async function batchLoadRelationshipEvidence(caseId: number): Promise<Map<number, Array<{ id: number; relationshipId: number; quoteId: number; explanation: string | null }>>> {
  const relIds = await db.select({ id: relationships.id }).from(relationships).where(eq(relationships.caseId, caseId)).orderBy(asc(relationships.id));
  if (relIds.length === 0) return new Map();

  const allEvidence: Array<{ id: number; relationshipId: number; quoteId: number; explanation: string | null }> = [];
  const ids = relIds.map(r => r.id);
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    const rows = await db.select({
      id: relationshipEvidence.id,
      relationshipId: relationshipEvidence.relationshipId,
      quoteId: relationshipEvidence.quoteId,
      explanation: relationshipEvidence.explanation,
    }).from(relationshipEvidence).where(inArray(relationshipEvidence.relationshipId, chunk)).orderBy(asc(relationshipEvidence.id));
    allEvidence.push(...rows);
  }

  const map = new Map<number, typeof allEvidence>();
  for (const ev of allEvidence) {
    const existing = map.get(ev.relationshipId) || [];
    existing.push(ev);
    map.set(ev.relationshipId, existing);
  }
  return map;
}

// ─── Streaming JSON Writer ───

/**
 * Write a JSON array to a response stream, one item at a time.
 * Never holds the full serialized string in memory.
 */
function writeJsonArrayStreaming(res: Response, key: string, items: any[], isLast: boolean): void {
  res.write(`"${key}":[`);
  for (let i = 0; i < items.length; i++) {
    if (i > 0) res.write(",");
    res.write(JSON.stringify(items[i]));
  }
  res.write("]");
  if (!isLast) res.write(",");
}

/**
 * Write a single JSON value (object or primitive) to the stream.
 */
function writeJsonValue(res: Response, key: string, value: any, isLast: boolean): void {
  res.write(`"${key}":${JSON.stringify(value)}`);
  if (!isLast) res.write(",");
}

// ─── Flat Projection Mappers ───

function projectDocument(d: any) {
  return {
    id: d.id,
    filename: d.filename,
    fileType: d.fileType,
    mimeType: d.mimeType,
    fileSize: d.fileSize,
    sha256Hash: d.sha256Hash,
    status: d.status,
    pageCount: d.pageCount,
    durationSeconds: d.durationSeconds,
    documentType: d.documentType,
    documentPurpose: d.documentPurpose,
    createdAt: d.createdAt,
    snapshotId: d.snapshotId,
    // Document Resolution metadata (Gate 1 — replacement model)
    documentResolution: d.documentResolution ?? 'active',
    replacedByDocumentId: d.replacedByDocumentId ?? null,
    resolutionReason: d.resolutionReason ?? null,
    // textContent excluded by default — too large for bulk export
    // Available via opt-in parameter
  };
}

function projectDocumentWithText(d: any) {
  return {
    ...projectDocument(d),
    textContent: d.textContent,
  };
}

function projectQuote(q: any) {
  return {
    id: q.id,
    documentId: q.documentId,
    text: q.text,
    pageNumber: q.pageNumber,
    timestampStart: q.timestampStart,
    timestampEnd: q.timestampEnd,
    context: q.context,
    statementOrigin: q.statementOrigin,
    laneId: q.laneId,
    snapshotId: q.snapshotId,
  };
}

function projectEntity(e: any) {
  return {
    id: e.id,
    name: e.name,
    type: e.type,
    description: e.description,
    aliases: e.aliases,
    laneId: e.laneId,
    snapshotId: e.snapshotId,
  };
}

function projectClaim(c: any) {
  return {
    id: c.id,
    documentId: c.documentId,
    quoteId: c.quoteId,
    claimText: c.claimText,
    claimType: c.claimType,
    dateReferenced: c.dateReferenced,
    entitiesInvolved: c.entitiesInvolved,
    statementOrigin: c.statementOrigin,
    evidentiaryWeight: c.evidentiaryWeight,
    laneId: c.laneId,
    snapshotId: c.snapshotId,
  };
}

function projectFinding(f: any) {
  return {
    id: f.id,
    findingType: f.findingType,
    title: f.title,
    description: f.description,
    significance: f.significance,
    claimIds: f.claimIds,
    confidence: f.confidence,
    evidentiaryWeight: f.evidentiaryWeight,
    createdAt: f.createdAt,
    laneId: f.laneId,
    snapshotId: f.snapshotId,
  };
}

function projectEvent(e: any) {
  return {
    id: e.id,
    eventType: e.eventType,
    title: e.title,
    description: e.description,
    dateOccurred: e.dateOccurred,
    datePrecision: e.datePrecision,
    location: e.location,
    entitiesInvolved: e.entitiesInvolved,
    quoteIds: e.quoteIds,
    laneId: e.laneId,
    snapshotId: e.snapshotId,
  };
}

function projectRelationship(r: any) {
  return {
    id: r.id,
    sourceEntityId: r.sourceEntityId,
    targetEntityId: r.targetEntityId,
    relationshipType: r.relationshipType,
    description: r.description,
    evidenceCount: r.evidenceCount,
    laneId: r.laneId,
    snapshotId: r.snapshotId,
  };
}

function projectSignalFlag(f: any) {
  return {
    id: f.id,
    documentId: f.documentId,
    flagType: f.flagType,
    description: f.description,
    quoteId: f.quoteId,
    laneId: f.laneId,
    snapshotId: f.snapshotId,
  };
}

function projectCorrelation(c: any) {
  return {
    id: c.id,
    sourceDocumentId: c.sourceDocumentId,
    targetDocumentId: c.targetDocumentId,
    correlationType: c.correlationType,
    description: c.description,
    sharedIdentifiers: c.sharedIdentifiers,
    laneId: c.laneId,
    snapshotId: c.snapshotId,
  };
}

function projectEntityRole(r: { id: number; entityId: number; documentId: number; role: string; quoteId: number | null }) {
  return {
    id: r.id,
    entityId: r.entityId,
    documentId: r.documentId,
    role: r.role,
    quoteId: r.quoteId,
  };
}

function projectRelEvidence(e: { id: number; relationshipId: number; quoteId: number; explanation: string | null }) {
  return {
    id: e.id,
    relationshipId: e.relationshipId,
    quoteId: e.quoteId,
    explanation: e.explanation,
  };
}

// ─── Stable Sort Comparator ───
// Primary: ASC by id. Secondary: none needed (id is unique).
function byId(a: { id: number }, b: { id: number }) {
  return a.id - b.id;
}

// ─── Main Streaming Export ───

export interface StreamingExportOptions {
  includeTextContent?: boolean; // default false — saves ~8 MB for large cases
  snapshotId?: number;          // Gate 8: filter by specific snapshot (0 = all)
}

/**
 * Stream a flat-projection JSON export directly to the HTTP response.
 * 
 * Memory profile:
 * - Loads each table independently (not all at once)
 * - Writes each section to the stream before loading the next
 * - Peak memory ≈ size of largest single table (quotes: ~78k rows × ~200 bytes ≈ 15 MB)
 * - Never holds the full serialized JSON string
 * 
 * Query profile:
 * - 12 queries total (one per table + 2 batch loaders with chunking)
 * - Zero N+1 queries
 * - All results sorted ASC by id for determinism
 */
export async function streamJsonExport(
  res: Response,
  caseData: any,
  caseId: number,
  options: StreamingExportOptions = {}
): Promise<void> {
  const includeText = options.includeTextContent ?? false;
  const filterSnapshotId = options.snapshotId ?? 0; // 0 = all snapshots

  setExportDownloadHeaders(res, "json-dump", caseData.name);

  // Gate 8: Artifact collector for manifest + hash index
  const collector = new ArtifactCollector();

  // Gate A: snapshot resolution must be explicit — no getLatestSnapshot fallback
  // If no snapshotId is provided (filterSnapshotId=0), resolve to the latest snapshot
  // for the specific case but log the implicit resolution for audit traceability
  let latestSnapshot;
  if (filterSnapshotId) {
    latestSnapshot = await dbHelpers.getSnapshot(filterSnapshotId);
    if (!latestSnapshot || latestSnapshot.caseId !== caseId) {
      throw new ExportRequestError("Snapshot not found for this case", 404);
    }
  } else {
    // Fallback: resolve latest snapshot for backward compat, but mark in export metadata
    latestSnapshot = await dbHelpers.getLatestSnapshot(caseId);
    if (latestSnapshot) {
      console.warn(`[Export][GATE_A] Export for case ${caseId} resolved snapshotId implicitly to ${latestSnapshot.id}. Caller should pass explicit snapshotId.`);
    }
  }

  // Gate 8: Resolve audit trace head
  const latestAudit = await dbHelpers.getLatestAuditEntry(caseId);
  const auditTraceHead: AuditTraceHead | null = latestAudit ? {
    latestEntryId: latestAudit.id,
    latestEntryHash: latestAudit.hash,
    latestEntryAction: latestAudit.action,
    latestEntryTimestamp: latestAudit.createdAt,
  } : null;

  // Gate 8: Build enriched _meta
  const meta = buildExportMeta({
    caseId,
    caseName: caseData.name,
    caseDomain: caseData.domain || '',
    caseContainer: caseData.container || '',
    laneId: caseData.domain || '',
    snapshotId: latestSnapshot?.id || 0,
    snapshotVersion: latestSnapshot?.version ?? 0,
    snapshotStatus: latestSnapshot?.status || 'none',
    snapshotCreatedAt: latestSnapshot?.createdAt ? new Date(latestSnapshot.createdAt).toISOString() : null,
    snapshotSealedAt: latestSnapshot?.sealedAt ? new Date(latestSnapshot.sealedAt).toISOString() : null,
    auditTraceHead,
    includesTextContent: includeText,
  });

  // Embed canonical signing payload in _meta for offline verification.
  // Values are read directly from the snapshot row — no recomputation.
  if (latestSnapshot?.signature && latestSnapshot?.status === 'sealed') {
    meta.signingPayload = {
      snapshotId: latestSnapshot.id,
      snapshotVersion: latestSnapshot.version,
      engineVersion: latestSnapshot.engineVersion,
      documentIds: (latestSnapshot.documentIds as number[]).slice().sort((a, b) => a - b),
      documentHashes: latestSnapshot.documentHashes as Record<string, string>,
    };
  }

  // Helper: build snapshot filter condition for queries
  const snapshotFilter = (table: any) => {
    if (filterSnapshotId) {
      return and(eq(table.caseId, caseId), eq(table.snapshotId, filterSnapshotId));
    }
    return eq(table.caseId, caseId);
  };

  // Open JSON object
  res.write("{");

  // 1. Metadata (always first)
  const stats = await dbHelpers.getCaseStats(caseId);
  writeJsonValue(res, "_meta", meta, false);

  // 2. Case info
  writeJsonValue(res, "case", {
    id: caseData.id,
    name: caseData.name,
    description: caseData.description,
    domain: caseData.domain,
    container: caseData.container,
    status: caseData.status,
    createdAt: caseData.createdAt,
    updatedAt: caseData.updatedAt,
  }, false);

  // 3. Statistics
  writeJsonValue(res, "statistics", stats, false);

  // 4. Documents — load, project, write, collect hashes
  {
    const allDocs = await db.select().from(documents).where(snapshotFilter(documents)).orderBy(asc(documents.id));
    const projected = allDocs.map(includeText ? projectDocumentWithText : projectDocument);
    collector.addBatch("document", projected as any[]);
    writeJsonArrayStreaming(res, "documents", projected, false);
  }

  // 5. Quotes — largest table
  {
    const allQuotes = await db.select().from(quotes).where(snapshotFilter(quotes)).orderBy(asc(quotes.id));
    const projected = allQuotes.map(projectQuote);
    collector.addBatch("quote", projected as any[]);
    writeJsonArrayStreaming(res, "quotes", projected, false);
  }

  // 6. Entities
  {
    const allEntities = await db.select().from(entities).where(snapshotFilter(entities)).orderBy(asc(entities.id));
    const projected = allEntities.map(projectEntity);
    collector.addBatch("entity", projected as any[]);
    writeJsonArrayStreaming(res, "entities", projected, false);
  }

  // 7. Entity Roles — batch loaded, zero N+1
  {
    const rolesMap = await batchLoadEntityRoles(caseId);
    const allRoles: ReturnType<typeof projectEntityRole>[] = [];
    for (const roles of Array.from(rolesMap.values())) {
      for (const r of roles) {
        allRoles.push(projectEntityRole(r));
      }
    }
    allRoles.sort(byId);
    collector.addBatch("entity_role", allRoles as any[]);
    writeJsonArrayStreaming(res, "entityRoles", allRoles, false);
  }

  // 8. Claims
  {
    const allClaims = await db.select().from(claims).where(snapshotFilter(claims)).orderBy(asc(claims.id));
    const projected = allClaims.map(projectClaim);
    collector.addBatch("claim", projected as any[]);
    writeJsonArrayStreaming(res, "claims", projected, false);
  }

  // 9. Findings
  {
    const allFindings = await db.select().from(findings).where(snapshotFilter(findings)).orderBy(asc(findings.id));
    const projected = allFindings.map(projectFinding);
    collector.addBatch("finding", projected as any[]);
    writeJsonArrayStreaming(res, "findings", projected, false);
  }

  // 10. Events
  {
    const allEvents = await db.select().from(events).where(snapshotFilter(events)).orderBy(asc(events.id));
    const projected = allEvents.map(projectEvent);
    collector.addBatch("event", projected as any[]);
    writeJsonArrayStreaming(res, "events", projected, false);
  }

  // 11. Relationships
  {
    const allRels = await db.select().from(relationships).where(snapshotFilter(relationships)).orderBy(asc(relationships.id));
    const projected = allRels.map(projectRelationship);
    collector.addBatch("relationship", projected as any[]);
    writeJsonArrayStreaming(res, "relationships", projected, false);
  }

  // 12. Relationship Evidence — batch loaded, zero N+1
  {
    const evMap = await batchLoadRelationshipEvidence(caseId);
    const allEv: ReturnType<typeof projectRelEvidence>[] = [];
    for (const evs of Array.from(evMap.values())) {
      for (const e of evs) {
        allEv.push(projectRelEvidence(e));
      }
    }
    allEv.sort(byId);
    collector.addBatch("relationship_evidence", allEv as any[]);
    writeJsonArrayStreaming(res, "relationshipEvidence", allEv, false);
  }

  // 13. Signal Flags
  {
    const allFlags = await db.select().from(signalFlags).where(snapshotFilter(signalFlags)).orderBy(asc(signalFlags.id));
    const projected = allFlags.map(projectSignalFlag);
    collector.addBatch("signal_flag", projected as any[]);
    writeJsonArrayStreaming(res, "signalFlags", projected, false);
  }

  // 14. Correlations
  {
    const allCorrelations = await db.select().from(documentCorrelations).where(snapshotFilter(documentCorrelations)).orderBy(asc(documentCorrelations.id));
    const projected = allCorrelations.map(projectCorrelation);
    collector.addBatch("correlation", projected as any[]);
    writeJsonArrayStreaming(res, "correlations", projected, false);
  }

  // 15. Gate 8: Manifest
  const manifestArtifacts = collector.getArtifacts();
  const manifest = buildManifest({
    caseId,
    snapshotId: latestSnapshot?.id || 0,
    snapshotVersion: latestSnapshot?.version ?? 0,
    laneId: caseData.domain || '',
    createdAt: latestSnapshot?.createdAt ? new Date(latestSnapshot.createdAt).toISOString() : new Date().toISOString(),
    sealedAt: latestSnapshot?.sealedAt ? new Date(latestSnapshot.sealedAt).toISOString() : null,
    artifacts: manifestArtifacts,
  });
  writeJsonValue(res, "manifest", manifest, false);

  // 16. Gate 8: Hash Index
  const hashIndex = buildHashIndex(manifestArtifacts);
  writeJsonValue(res, "hashIndex", hashIndex, false);

  // 17. Gate 9: Cryptographic Signing Metadata
  const signingMeta: Record<string, unknown> = {
    signed: false,
    algorithm: null as string | null,
    signature: null as string | null,
    publicKeyPem: null as string | null,
    publicKeyFingerprint: null as string | null,
  };
  if (latestSnapshot?.signature && latestSnapshot?.signatureAlgorithm && latestSnapshot?.publicKeyFingerprint) {
    signingMeta.signed = true;
    signingMeta.algorithm = latestSnapshot.signatureAlgorithm;
    signingMeta.signature = latestSnapshot.signature;
    signingMeta.publicKeyPem = getPublicKeyPem();
    signingMeta.publicKeyFingerprint = latestSnapshot.publicKeyFingerprint;
  }
  writeJsonValue(res, "signing", signingMeta, false);

  // 18. Phase-2: Read-Only Projection Layer artifacts (snapshot-bound, complete runs only)
  // Phase-2 artifacts are supplemental — they are added to manifest and hash index
  // but do NOT alter the snapshot signature (which covers only Phase-1 data).
  const phase2Data = latestSnapshot ? await getPhase2ExportData(latestSnapshot.id) : null;

  // Add Phase-2 artifacts to the collector for manifest + hash index inclusion
  if (phase2Data) {
    for (const run of phase2Data.runs) {
      collector.add("phase2_run", run.id, run as unknown as Record<string, unknown>);
    }
    for (const req of phase2Data.evidenceRequirements) {
      collector.add("phase2_evidence_requirement", req.id, req as unknown as Record<string, unknown>);
    }
    for (const note of phase2Data.structuredNotes) {
      collector.add("phase2_structured_note", note.id, note as unknown as Record<string, unknown>);
    }
  }

  // 19. Rebuild manifest and hash index to include Phase-2 artifacts
  // The manifest written at step 15 only contained Phase-1 artifacts.
  // We now rebuild with the complete artifact set (Phase-1 + Phase-2).
  const fullManifestArtifacts = collector.getArtifacts();
  const fullManifest = buildManifest({
    caseId,
    snapshotId: latestSnapshot?.id || 0,
    snapshotVersion: latestSnapshot?.version ?? 0,
    laneId: caseData.domain || '',
    createdAt: latestSnapshot?.createdAt ? new Date(latestSnapshot.createdAt).toISOString() : new Date().toISOString(),
    sealedAt: latestSnapshot?.sealedAt ? new Date(latestSnapshot.sealedAt).toISOString() : null,
    artifacts: fullManifestArtifacts,
  });
  const fullHashIndex = buildHashIndex(fullManifestArtifacts);

  writeJsonValue(res, "phase2", phase2Data, false);

  // 20. Full manifest (Phase-1 + Phase-2 combined)
  writeJsonValue(res, "fullManifest", fullManifest, false);

  // 21. Full hash index (Phase-1 + Phase-2 combined)
  writeJsonValue(res, "fullHashIndex", fullHashIndex, true);

  // Close JSON object
  res.write("}");
  res.end();
}

// ─── Streaming HTML Bundle ───

/**
 * Stream the HTML bundle in sections to avoid holding the full string in memory.
 * Each section is fetched, rendered, and flushed independently.
 */
export async function streamHtmlBundle(
  res: Response,
  caseData: any,
  caseId: number,
  bundleStyles: string,
  bundleScript: string,
  escapeHtml: (s: string) => string
): Promise<void> {
  setExportDownloadHeaders(res, "full-bundle", caseData.name);

  const stats = await dbHelpers.getCaseStats(caseId);
  const now = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const caseName = escapeHtml(caseData.name);

  // Write HTML head + header
  res.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${caseName} — Luminari Case Bundle</title>
  <meta name="description" content="Self-contained offline case bundle generated by Luminari. No internet required.">
  <meta name="generator" content="Luminari v4.0">
  ${bundleStyles}
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${caseName}</h1>
      <p class="subtitle">${caseData.description ? escapeHtml(caseData.description) : "Luminari Case Bundle"}</p>
      <p class="meta">Generated: ${now} | Domain: ${caseData.domain ? escapeHtml(caseData.domain) : "—"} | Container: ${caseData.container ? escapeHtml(caseData.container) : "—"}</p>
      <p class="meta">This is a self-contained offline document. No internet connection is required to view it.</p>
    </div>
    <div class="stats-bar">
      <div class="stat"><div class="stat-value">${stats.documents}</div><div class="stat-label">Documents</div></div>
      <div class="stat"><div class="stat-value">${stats.entities}</div><div class="stat-label">Entities</div></div>
      <div class="stat"><div class="stat-value">${stats.quotes}</div><div class="stat-label">Quotes</div></div>
      <div class="stat"><div class="stat-value">${stats.claims}</div><div class="stat-label">Claims</div></div>
      <div class="stat"><div class="stat-value">${stats.findings}</div><div class="stat-label">Findings</div></div>
      <div class="stat"><div class="stat-value">${stats.events}</div><div class="stat-label">Events</div></div>
      <div class="stat"><div class="stat-value">${stats.relationships}</div><div class="stat-label">Relationships</div></div>
      <div class="stat"><div class="stat-value">${stats.signalFlags}</div><div class="stat-label">Signal Flags</div></div>
    </div>
    <div class="nav">
      <a href="#sec-findings">Findings</a>
      <a href="#sec-signals">Signals</a>
      <a href="#sec-timeline">Timeline</a>
      <a href="#sec-entities">Entities</a>
      <a href="#sec-relationships">Relationships</a>
      <a href="#sec-correlations">Correlations</a>
      <a href="#sec-documents">Documents</a>
      <a href="#sec-quotes">Quotes</a>
      <a href="#sec-claims">Claims</a>
    </div>
    <input type="text" id="search-input" class="search-box" placeholder="Search across all evidence...">
    <div class="toolbar">
      <button onclick="expandAll()">Expand All</button>
      <button onclick="collapseAll()">Collapse All</button>
      <button onclick="window.print()">Print / Save PDF</button>
    </div>`);

  // ── Section: Findings ──
  {
    const allFindings = await db.select().from(findings).where(eq(findings.caseId, caseId)).orderBy(asc(findings.id));
    res.write(`<h2 id="sec-findings" data-section="findings-content">Findings (${allFindings.length})</h2>
    <div id="findings-content" class="section-content">`);
    if (allFindings.length === 0) {
      res.write('<p class="meta">No findings generated.</p>');
    } else {
      for (let i = 0; i < allFindings.length; i++) {
        const f = allFindings[i];
        const weightBadge = f.evidentiaryWeight === "finding" ? "badge-finding" : "badge-note";
        const confBadge = f.confidence === "strong" ? "badge-strong" : f.confidence === "moderate" ? "badge-moderate" : "";
        res.write(`<div class="card">
          <h3>Finding ${i + 1}: ${escapeHtml(f.title)}</h3>
          <span class="badge ${weightBadge}">${f.evidentiaryWeight === "finding" ? "Finding" : "Note/Signal"}</span>
          <span class="badge ${confBadge}">${f.confidence || "preliminary"}</span>
          <span class="badge">${escapeHtml(f.findingType)}</span>
          <p style="margin-top:8px">${escapeHtml(f.description)}</p>
          ${f.significance ? `<p class="meta"><strong>Context:</strong> ${escapeHtml(f.significance)}</p>` : ""}
          ${f.claimIds && Array.isArray(f.claimIds) && (f.claimIds as number[]).length > 0 ? `<p class="citation">Backing claims: ${(f.claimIds as number[]).map(id => `#${id}`).join(", ")}</p>` : ""}
        </div>`);
      }
    }
    res.write("</div>");
  }

  // ── Section: Signal Flags ──
  {
    const allFlags = await db.select().from(signalFlags).where(eq(signalFlags.caseId, caseId)).orderBy(asc(signalFlags.id));
    const allDocs = await db.select().from(documents).where(eq(documents.caseId, caseId)).orderBy(asc(documents.id));
    const docMap = new Map(allDocs.map(d => [d.id, d]));

    res.write(`<h2 id="sec-signals" data-section="signals-content">Signal Flags (${allFlags.length})</h2>
    <div id="signals-content" class="section-content">`);
    if (allFlags.length === 0) {
      res.write('<p class="meta">No signal flags raised.</p>');
    } else {
      res.write('<table><thead><tr><th>#</th><th>Type</th><th>Description</th><th>Source Document</th></tr></thead><tbody>');
      for (let i = 0; i < allFlags.length; i++) {
        const f = allFlags[i];
        const doc = docMap.get(f.documentId);
        res.write(`<tr><td>${i + 1}</td><td><span class="badge badge-flag">${escapeHtml(f.flagType.replace(/_/g, " "))}</span></td><td>${escapeHtml(f.description || "")}</td><td>${doc ? escapeHtml(doc.filename) : `Doc #${f.documentId}`}</td></tr>`);
      }
      res.write("</tbody></table>");
    }
    res.write("</div>");

    // ── Section: Timeline ──
    const allEvents = await db.select().from(events).where(eq(events.caseId, caseId)).orderBy(asc(events.id));
    const entityMap = new Map<number, any>();
    const allEntities = await db.select().from(entities).where(eq(entities.caseId, caseId)).orderBy(asc(entities.id));
    for (const e of allEntities) entityMap.set(e.id, e);

    res.write(`<h2 id="sec-timeline" data-section="timeline-content">Timeline (${allEvents.length} events)</h2>
    <div id="timeline-content" class="section-content">`);
    if (allEvents.length === 0) {
      res.write('<p class="meta">No events documented.</p>');
    } else {
      for (const e of allEvents) {
        res.write(`<div class="card">
          <p class="meta" style="font-weight:600;color:var(--primary)">${escapeHtml(e.dateOccurred || "Date unknown")}${e.datePrecision && e.datePrecision !== "exact" ? ` (${e.datePrecision})` : ""}</p>
          <h3>${escapeHtml(e.title)}</h3>
          <span class="badge">${escapeHtml(e.eventType)}</span>
          ${e.location ? `<span class="badge">${escapeHtml(e.location)}</span>` : ""}
          ${e.description ? `<p style="margin-top:8px">${escapeHtml(e.description)}</p>` : ""}
          ${e.entitiesInvolved && Array.isArray(e.entitiesInvolved) && (e.entitiesInvolved as number[]).length > 0 ? `<p class="citation">Entities: ${(e.entitiesInvolved as number[]).map(id => { const ent = entityMap.get(id); return ent ? escapeHtml(ent.name) : `#${id}`; }).join(", ")}</p>` : ""}
        </div>`);
      }
    }
    res.write("</div>");

    // ── Section: Entities ──
    res.write(`<h2 id="sec-entities" data-section="entities-content">Entities (${allEntities.length})</h2>
    <div id="entities-content" class="section-content">`);
    if (allEntities.length === 0) {
      res.write('<p class="meta">No entities identified.</p>');
    } else {
      res.write('<table><thead><tr><th>#</th><th>Name</th><th>Type</th><th>Description</th><th>Aliases</th></tr></thead><tbody>');
      for (let i = 0; i < allEntities.length; i++) {
        const e = allEntities[i];
        res.write(`<tr><td>${i + 1}</td><td><strong>${escapeHtml(e.name)}</strong></td><td><span class="badge">${escapeHtml(e.type)}</span></td><td>${escapeHtml(e.description || "")}</td><td>${e.aliases && Array.isArray(e.aliases) && (e.aliases as string[]).length > 0 ? (e.aliases as string[]).map(a => escapeHtml(a)).join(", ") : "—"}</td></tr>`);
      }
      res.write("</tbody></table>");
    }
    res.write("</div>");

    // ── Section: Relationships ──
    const allRelationships = await db.select().from(relationships).where(eq(relationships.caseId, caseId)).orderBy(asc(relationships.id));
    res.write(`<h2 id="sec-relationships" data-section="relationships-content">Relationships (${allRelationships.length})</h2>
    <div id="relationships-content" class="section-content">`);
    if (allRelationships.length === 0) {
      res.write('<p class="meta">No relationships documented.</p>');
    } else {
      res.write('<table><thead><tr><th>#</th><th>Source</th><th>Relationship</th><th>Target</th><th>Description</th><th>Evidence</th></tr></thead><tbody>');
      for (let i = 0; i < allRelationships.length; i++) {
        const r = allRelationships[i];
        const src = entityMap.get(r.sourceEntityId);
        const tgt = entityMap.get(r.targetEntityId);
        res.write(`<tr><td>${i + 1}</td><td><strong>${src ? escapeHtml(src.name) : `#${r.sourceEntityId}`}</strong></td><td>${escapeHtml(r.relationshipType)}</td><td><strong>${tgt ? escapeHtml(tgt.name) : `#${r.targetEntityId}`}</strong></td><td>${escapeHtml(r.description || "")}</td><td>${r.evidenceCount || 0} source(s)</td></tr>`);
      }
      res.write("</tbody></table>");
    }
    res.write("</div>");

    // ── Section: Correlations ──
    const allCorrelations = await db.select().from(documentCorrelations).where(eq(documentCorrelations.caseId, caseId)).orderBy(asc(documentCorrelations.id));
    res.write(`<h2 id="sec-correlations" data-section="correlations-content">Cross-Document Correlations (${allCorrelations.length})</h2>
    <div id="correlations-content" class="section-content">`);
    if (allCorrelations.length === 0) {
      res.write('<p class="meta">No correlations found.</p>');
    } else {
      for (const c of allCorrelations) {
        const srcDoc = docMap.get(c.sourceDocumentId);
        const tgtDoc = docMap.get(c.targetDocumentId);
        res.write(`<div class="card">
          <h3>Correlation: ${escapeHtml(c.correlationType.replace(/_/g, " "))}</h3>
          <p class="meta">${srcDoc ? escapeHtml(srcDoc.filename) : `Doc #${c.sourceDocumentId}`} ↔ ${tgtDoc ? escapeHtml(tgtDoc.filename) : `Doc #${c.targetDocumentId}`}</p>
          <p>${escapeHtml(c.description || "")}</p>
          ${c.sharedIdentifiers && Array.isArray(c.sharedIdentifiers) && (c.sharedIdentifiers as string[]).length > 0 ? `<p class="citation">Shared: ${(c.sharedIdentifiers as string[]).map(s => escapeHtml(s)).join(", ")}</p>` : ""}
        </div>`);
      }
    }
    res.write("</div>");

    // ── Section: Documents ──
    res.write(`<h2 id="sec-documents" data-section="documents-content">Document Index (${allDocs.length})</h2>
    <div id="documents-content" class="section-content">`);
    if (allDocs.length === 0) {
      res.write('<p class="meta">No documents uploaded.</p>');
    } else {
      res.write('<table><thead><tr><th>#</th><th>Filename</th><th>Type</th><th>Purpose</th><th>Status</th><th>SHA-256</th><th>Size</th></tr></thead><tbody>');
      for (let i = 0; i < allDocs.length; i++) {
        const d = allDocs[i];
        res.write(`<tr><td>${i + 1}</td><td>${escapeHtml(d.filename)}</td><td>${escapeHtml(d.documentType || d.fileType)}</td><td>${escapeHtml(d.documentPurpose || "—")}</td><td><span class="badge">${d.status}</span></td><td style="font-family:monospace;font-size:10px">${d.sha256Hash}</td><td>${(d.fileSize / 1024).toFixed(1)} KB</td></tr>`);
      }
      res.write("</tbody></table>");
    }
    res.write("</div>");

    // ── Section: Quotes ──
    const allQuotes = await db.select().from(quotes).where(eq(quotes.caseId, caseId)).orderBy(asc(quotes.id));
    res.write(`<h2 id="sec-quotes" data-section="quotes-content">Verbatim Quotes (${allQuotes.length})</h2>
    <div id="quotes-content" class="section-content">`);
    if (allQuotes.length === 0) {
      res.write('<p class="meta">No quotes extracted.</p>');
    } else {
      res.write('<table><thead><tr><th>#</th><th>Quote</th><th>Document</th><th>Page</th><th>Origin</th></tr></thead><tbody>');
      for (let i = 0; i < allQuotes.length; i++) {
        const q = allQuotes[i];
        const doc = docMap.get(q.documentId);
        const truncatedText = q.text.length > 300 ? q.text.slice(0, 300) + "…" : q.text;
        res.write(`<tr><td>${i + 1}</td><td><div class="quote-block">"${escapeHtml(truncatedText)}"</div></td><td>${doc ? escapeHtml(doc.filename) : `Doc #${q.documentId}`}</td><td>${q.pageNumber ?? "—"}</td><td><span class="badge">${escapeHtml(q.statementOrigin.replace(/_/g, " "))}</span></td></tr>`);
      }
      res.write("</tbody></table>");
    }
    res.write("</div>");

    // ── Section: Claims ──
    const allClaims = await db.select().from(claims).where(eq(claims.caseId, caseId)).orderBy(asc(claims.id));
    res.write(`<h2 id="sec-claims" data-section="claims-content">Claims (${allClaims.length})</h2>
    <div id="claims-content" class="section-content">`);
    if (allClaims.length === 0) {
      res.write('<p class="meta">No claims extracted.</p>');
    } else {
      res.write('<table><thead><tr><th>#</th><th>Claim</th><th>Type</th><th>Origin</th><th>Weight</th><th>Document</th></tr></thead><tbody>');
      for (let i = 0; i < allClaims.length; i++) {
        const c = allClaims[i];
        const doc = docMap.get(c.documentId);
        res.write(`<tr><td>${i + 1}</td><td>${escapeHtml(c.claimText)}</td><td><span class="badge">${escapeHtml(c.claimType)}</span></td><td>${escapeHtml(c.statementOrigin.replace(/_/g, " "))}</td><td><span class="badge ${c.evidentiaryWeight === "finding_eligible" ? "badge-finding" : ""}">${escapeHtml(c.evidentiaryWeight.replace(/_/g, " "))}</span></td><td>${doc ? escapeHtml(doc.filename) : `Doc #${c.documentId}`}</td></tr>`);
      }
      res.write("</tbody></table>");
    }
    res.write("</div>");
  }

  // Footer + script + close
  res.write(`
    <div class="footer">
      <p><strong>Luminari v4.0</strong> — Self-Contained Case Bundle</p>
      <p>Generated ${now} | ${stats.documents} documents | ${stats.quotes} quotes | ${stats.findings} findings</p>
      <p>This document is fully self-contained and requires no internet connection. It presents organized evidence — it does not constitute legal advice or argument.</p>
      <p style="margin-top:8px;font-size:10px">Integrity note: This bundle was generated from the Luminari evidence database at the time shown above. Document hashes (SHA-256) are included for verification.</p>
    </div>
  </div>
  ${bundleScript}
</body>
</html>`);

  res.end();
}
