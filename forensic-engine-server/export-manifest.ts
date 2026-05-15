/**
 * Export Manifest & Hash Index (Gate 8)
 * 
 * Provides deterministic serialization, manifest generation,
 * hash index computation, and audit trace head reference
 * for hardened export bundles.
 * 
 * Contract:
 * - All serialization is deterministic (sorted keys, sorted arrays, no volatile fields)
 * - SHA-256 hashes computed on canonical JSON representation
 * - Manifest lists every artifact in the export
 * - Hash index maps artifact type+id → SHA-256
 * - Audit trace head references the latest chain entry without exporting full log
 */

import { createHash } from "crypto";
import { ENGINE_VERSION, ENGINE_MODEL_IDENTIFIER, ENGINE_DETERMINISM_PARAMS } from "../shared/const";

// ─── Deterministic Serialization ───

/**
 * Produce a canonical JSON string with:
 * - Keys sorted lexicographically at every nesting level
 * - Arrays preserved in original order (they are already sorted by id)
 * - No non-deterministic fields (these must be stripped before calling)
 * - Consistent formatting (no whitespace)
 */
export function canonicalStringify(obj: unknown): string {
  return JSON.stringify(obj, (_key, value) => {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(value).sort()) {
        sorted[k] = value[k];
      }
      return sorted;
    }
    return value;
  });
}

/**
 * Compute SHA-256 of a canonical JSON representation.
 */
export function sha256(data: string): string {
  return createHash("sha256").update(data, "utf-8").digest("hex");
}

/**
 * Compute SHA-256 of an artifact's canonical JSON representation.
 */
export function artifactHash(artifact: Record<string, unknown>): string {
  return sha256(canonicalStringify(artifact));
}

// ─── Artifact Types ───

export type ArtifactType =
  | "document"
  | "quote"
  | "claim"
  | "entity"
  | "event"
  | "relationship"
  | "finding"
  | "signal_flag"
  | "correlation"
  | "entity_role"
  | "relationship_evidence"
  | "phase2_run"
  | "phase2_evidence_requirement"
  | "phase2_structured_note";

export interface ManifestArtifact {
  type: ArtifactType;
  id: number;
  sha256: string;
}

// ─── Manifest ───

export interface ExportManifest {
  caseId: number;
  snapshotId: number;
  snapshotVersion: number;
  engineVersion: string;
  laneId: string;
  createdAt: string;
  sealedAt: string | null;
  artifactCount: number;
  artifacts: ManifestArtifact[];
}

/**
 * Build the manifest from collected artifact entries.
 */
export function buildManifest(params: {
  caseId: number;
  snapshotId: number;
  snapshotVersion: number;
  laneId: string;
  createdAt: string;
  sealedAt: string | null;
  artifacts: ManifestArtifact[];
}): ExportManifest {
  return {
    caseId: params.caseId,
    snapshotId: params.snapshotId,
    snapshotVersion: params.snapshotVersion,
    engineVersion: ENGINE_VERSION,
    laneId: params.laneId,
    createdAt: params.createdAt,
    sealedAt: params.sealedAt,
    artifactCount: params.artifacts.length,
    artifacts: params.artifacts,
  };
}

// ─── Hash Index ───

export interface HashIndexEntry {
  path: string;       // e.g., "documents/42", "quotes/108"
  artifactType: ArtifactType;
  artifactId: number;
  sha256: string;
}

export interface HashIndex {
  generatedAt: string;
  algorithm: "SHA-256";
  serialization: "canonical-json-sorted-keys";
  entries: HashIndexEntry[];
}

/**
 * Build the hash index from collected artifact entries.
 */
export function buildHashIndex(artifacts: ManifestArtifact[]): HashIndex {
  const entries: HashIndexEntry[] = artifacts.map(a => ({
    path: `${a.type}s/${a.id}`,
    artifactType: a.type,
    artifactId: a.id,
    sha256: a.sha256,
  }));

  return {
    generatedAt: new Date().toISOString(),
    algorithm: "SHA-256",
    serialization: "canonical-json-sorted-keys",
    entries,
  };
}

// ─── Enriched _meta ───

export interface ExportMeta {
  generator: string;
  exportVersion: string;
  exportedAt: string;
  exportedAtTimestamp: number;
  format: string;
  engineVersion: string;
  modelIdentifier: string;
  determinismParams: typeof ENGINE_DETERMINISM_PARAMS;
  caseId: number;
  caseName: string;
  caseDomain: string;
  caseContainer: string;
  laneId: string;
  snapshotId: number;
  snapshotVersion: number;
  snapshotStatus: string;
  snapshotCreatedAt: string | null;
  snapshotSealedAt: string | null;
  auditTraceHead: AuditTraceHead | null;
  includesTextContent: boolean;
  description: string;
  signingPayload?: {
    snapshotId: number;
    snapshotVersion: number;
    engineVersion: string;
    documentIds: number[];
    documentHashes: Record<string, string>;
  } | null;
}

export interface AuditTraceHead {
  latestEntryId: number;
  latestEntryHash: string;
  latestEntryAction: string;
  latestEntryTimestamp: number;
}

/**
 * Build the enriched _meta section for the export.
 */
export function buildExportMeta(params: {
  caseId: number;
  caseName: string;
  caseDomain: string;
  caseContainer: string;
  laneId: string;
  snapshotId: number;
  snapshotVersion: number;
  snapshotStatus: string;
  snapshotCreatedAt: string | null;
  snapshotSealedAt: string | null;
  auditTraceHead: AuditTraceHead | null;
  includesTextContent?: boolean;
}): ExportMeta {
  const now = new Date();
  return {
    generator: "Luminari v4.0",
    exportVersion: "v4",
    exportedAt: now.toISOString(),
    exportedAtTimestamp: now.getTime(),
    format: "luminari-case-dump-v4",
    engineVersion: ENGINE_VERSION,
    modelIdentifier: ENGINE_MODEL_IDENTIFIER,
    determinismParams: ENGINE_DETERMINISM_PARAMS,
    caseId: params.caseId,
    caseName: params.caseName,
    caseDomain: params.caseDomain,
    caseContainer: params.caseContainer,
    laneId: params.laneId,
    snapshotId: params.snapshotId,
    snapshotVersion: params.snapshotVersion,
    snapshotStatus: params.snapshotStatus,
    snapshotCreatedAt: params.snapshotCreatedAt,
    snapshotSealedAt: params.snapshotSealedAt,
    auditTraceHead: params.auditTraceHead,
    includesTextContent: params.includesTextContent ?? false,
    description: "Complete case data export. Flat projection — no nested references, no circular dependencies, deterministic ordering by id. Per-row laneId (Gate 5), snapshotId (Gate 6), manifest + hash index (Gate 8).",
  };
}

// ─── Artifact Collector ───

/**
 * Utility class to collect artifacts during export streaming.
 * Call `add()` for each projected row; it computes the hash and stores the entry.
 * After all sections are written, call `getManifestArtifacts()` to retrieve the list.
 */
export class ArtifactCollector {
  private artifacts: ManifestArtifact[] = [];

  add(type: ArtifactType, id: number, projectedRow: Record<string, unknown>): void {
    this.artifacts.push({
      type,
      id,
      sha256: artifactHash(projectedRow),
    });
  }

  addBatch(type: ArtifactType, rows: Array<Record<string, unknown> & { id: number }>): void {
    for (const row of rows) {
      this.add(type, row.id, row);
    }
  }

  getArtifacts(): ManifestArtifact[] {
    return [...this.artifacts];
  }

  count(): number {
    return this.artifacts.length;
  }
}
