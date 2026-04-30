/**
 * Deterministic Output Refs — Type, Builder, Validator
 *
 * All engine output_refs MUST use this format.
 * String references are INVALID.
 * ALL table references MUST be canonical_* tables.
 *
 * Every ref is validated against the DB before emission.
 * If validation fails, the engine THROWS — no silent fallback.
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

// ─── Canonical Table Guard ───

const CANONICAL_PREFIX = "canonical_";

function assertCanonicalTable(table: string, context: string): void {
  if (!table.startsWith(CANONICAL_PREFIX)) {
    throw new Error(
      `[OutputRefs] REJECTED: table "${table}" is not a canonical table. ` +
      `All output_refs MUST reference canonical_* tables only. Context: ${context}`
    );
  }
}

// ─── Types ───

export interface OutputRefEntity {
  type: string;
  id: number;
  table: string; // MUST start with "canonical_"
}

export interface OutputRefMeta {
  engine_id: string;
  run_id: string;
  snapshot_id: number | null;
  trace_path: string;
  created_at: number;
  deterministic: true;
  tables: string[];  // all canonical tables touched by this output
  fields: string[];  // primary key fields referenced
}

export interface OutputRefs {
  primary: OutputRefEntity;
  artifacts: OutputRefEntity[];
  meta: OutputRefMeta;
}

// ─── Validator ───

/**
 * Validates that:
 * 1. Every entity references a canonical_* table
 * 2. Every entity (primary + artifacts) exists in its declared table
 * 3. meta.deterministic === true
 * THROWS if any check fails. No silent skip.
 */
export async function validateOutputRefs(refs: OutputRefs): Promise<void> {
  // Check deterministic flag
  if (refs.meta.deterministic !== true) {
    throw new Error(
      `[OutputRefs] REJECTED: meta.deterministic must be true. ` +
      `Engine: ${refs.meta.engine_id}, Run: ${refs.meta.run_id}`
    );
  }

  const allEntities = [refs.primary, ...refs.artifacts];

  for (const entity of allEntities) {
    // Enforce canonical table
    assertCanonicalTable(entity.table, `${refs.meta.engine_id}/${entity.type}:${entity.id}`);

    // Verify row exists
    const [rows] = await db.execute(
      sql.raw(`SELECT id FROM \`${entity.table}\` WHERE id = ${entity.id} LIMIT 1`)
    );
    const found = (rows as any[]).length > 0;
    if (!found) {
      throw new Error(
        `[OutputRefs] REJECTED: ${entity.type} id=${entity.id} not found in table "${entity.table}". ` +
        `Engine: ${refs.meta.engine_id}, Run: ${refs.meta.run_id}`
      );
    }
  }

  // Verify meta.tables are all canonical
  for (const t of refs.meta.tables) {
    assertCanonicalTable(t, `meta.tables in ${refs.meta.engine_id}`);
  }
}

// ─── Builder ───

interface BuildOutputRefsParams {
  engineId: string;
  runId: string;
  snapshotId?: number | null;
  primary: OutputRefEntity;
  artifacts?: OutputRefEntity[];
  traceParts: string[]; // e.g. ["doc123", "ing456", "pattern-engine", "42"]
}

/**
 * Builds a validated OutputRefs object.
 * 1. Enforces canonical_* table prefix on all entities
 * 2. Constructs the object from params
 * 3. Validates all entities exist in DB
 * 4. Returns the validated object
 * THROWS on validation failure.
 */
export async function buildOutputRefs(params: BuildOutputRefsParams): Promise<OutputRefs> {
  // Pre-check canonical prefix before even building
  assertCanonicalTable(params.primary.table, `buildOutputRefs primary/${params.engineId}`);
  for (const a of params.artifacts ?? []) {
    assertCanonicalTable(a.table, `buildOutputRefs artifact/${params.engineId}`);
  }

  const allEntities = [params.primary, ...(params.artifacts ?? [])];
  const tables = [...new Set(allEntities.map(e => e.table))];
  const fields = [...new Set(allEntities.map(e => `${e.table}.id`))];

  const refs: OutputRefs = {
    primary: params.primary,
    artifacts: params.artifacts ?? [],
    meta: {
      engine_id: params.engineId,
      run_id: params.runId,
      snapshot_id: params.snapshotId ?? null,
      trace_path: params.traceParts.join("→"),
      created_at: Date.now(),
      deterministic: true,
      tables,
      fields,
    },
  };

  // Validate all entities exist before returning
  await validateOutputRefs(refs);

  return refs;
}

// ─── Guard: Reject Legacy String Format + Non-Canonical Tables ───

export function assertOutputRefsFormat(value: unknown): asserts value is OutputRefs {
  if (Array.isArray(value)) {
    throw new Error(
      `[OutputRefs] REJECTED: output_refs is a string array (legacy format). ` +
      `Must be an OutputRefs object with primary/artifacts/meta.`
    );
  }
  if (!value || typeof value !== "object") {
    throw new Error(`[OutputRefs] REJECTED: output_refs must be an object, got ${typeof value}`);
  }
  const obj = value as any;
  if (!obj.primary || typeof obj.primary.type !== "string" || typeof obj.primary.id !== "number" || typeof obj.primary.table !== "string") {
    throw new Error(`[OutputRefs] REJECTED: primary must have type (string), id (number), table (string)`);
  }
  // Enforce canonical table on primary
  assertCanonicalTable(obj.primary.table, `assertOutputRefsFormat/primary`);

  // Enforce canonical table on all artifacts
  if (Array.isArray(obj.artifacts)) {
    for (const a of obj.artifacts) {
      if (a && typeof a.table === "string") {
        assertCanonicalTable(a.table, `assertOutputRefsFormat/artifact`);
      }
    }
  }

  if (!obj.meta || typeof obj.meta.engine_id !== "string" || typeof obj.meta.run_id !== "string") {
    throw new Error(`[OutputRefs] REJECTED: meta must have engine_id and run_id`);
  }
  if (obj.meta.deterministic !== true) {
    throw new Error(`[OutputRefs] REJECTED: meta.deterministic must be true`);
  }
}
