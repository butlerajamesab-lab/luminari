/**
 * Enforcement Rules — 5 System-Wide Runtime Assertions
 *
 * These rules are the hard constraints of the Alpha Lake + Metadata Conduit layer.
 * They are checked at governance boundaries and block execution on violation.
 *
 * Rule 1: NO_UNREGISTERED_ENGINE — Every engine_run must reference a registered engine
 * Rule 2: NO_ORPHAN_OUTPUT — Every output_ref entity must resolve to a real row
 * Rule 3: NO_SNAPSHOT_WITHOUT_VALIDATION — Snapshot binding requires run + metadata validation
 * Rule 4: NO_ALPHA_EXPORT_WITHOUT_SNAPSHOT — Alpha Lake only accepts snapshot_id
 * Rule 5: NO_UNDETERMINISTIC_REFS — output_refs.meta.deterministic must be true
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

export interface EnforcementResult {
  rule: string;
  passed: boolean;
  message: string;
  details?: any;
}

// ─── Rule 1: NO_UNREGISTERED_ENGINE ───

export async function enforceRegisteredEngine(engineId: string): Promise<EnforcementResult> {
  const [rows] = await db.execute(
    sql`SELECT engine_id_er, enabled_er FROM engine_registry WHERE engine_id_er = ${engineId} LIMIT 1`
  );
  const found = (rows as unknown as any[]).length > 0;
  const enabled = found && (rows as unknown as any[])[0].enabled_er === 1;

  if (!found) {
    return { rule: "NO_UNREGISTERED_ENGINE", passed: false, message: `Engine "${engineId}" not found in engine_registry` };
  }
  if (!enabled) {
    return { rule: "NO_UNREGISTERED_ENGINE", passed: false, message: `Engine "${engineId}" is disabled in engine_registry` };
  }
  return { rule: "NO_UNREGISTERED_ENGINE", passed: true, message: `Engine "${engineId}" is registered and enabled` };
}

// ─── Rule 2: NO_ORPHAN_OUTPUT ───

export async function enforceNoOrphanOutput(outputRefs: any): Promise<EnforcementResult> {
  if (!outputRefs || typeof outputRefs !== "object" || !outputRefs.primary) {
    return { rule: "NO_ORPHAN_OUTPUT", passed: false, message: "output_refs is missing or invalid" };
  }

  const allEntities = [outputRefs.primary, ...(outputRefs.artifacts || [])];
  const orphans: string[] = [];

  for (const entity of allEntities) {
    try {
      const [rows] = await db.execute(
        sql.raw(`SELECT id FROM \`${entity.table}\` WHERE id = ${entity.id} LIMIT 1`)
      );
      if ((rows as unknown as any[]).length === 0) {
        orphans.push(`${entity.type}:${entity.id} in ${entity.table}`);
      }
    } catch (e: any) {
      orphans.push(`${entity.type}:${entity.id} — table "${entity.table}" error: ${e.message}`);
    }
  }

  if (orphans.length > 0) {
    return { rule: "NO_ORPHAN_OUTPUT", passed: false, message: `Orphan outputs found: ${orphans.join("; ")}`, details: orphans };
  }
  return { rule: "NO_ORPHAN_OUTPUT", passed: true, message: "All output entities resolve to real rows" };
}

// ─── Rule 3: NO_SNAPSHOT_WITHOUT_VALIDATION ───

export async function enforceSnapshotValidation(runId: string): Promise<EnforcementResult> {
  const [runRows] = await db.execute(
    sql`SELECT run_id, engine_id, status, output_refs, snapshot_id FROM engine_runs WHERE run_id = ${runId}`
  );
  const runs = runRows as unknown as any[];

  if (runs.length === 0) {
    return { rule: "NO_SNAPSHOT_WITHOUT_VALIDATION", passed: false, message: `No engine_run found for run_id: ${runId}` };
  }

  const run = runs[0];
  const errors: string[] = [];

  // Must have engine in registry
  if (run.engine_id) {
    const [engineCheck] = await db.execute(
      sql`SELECT id FROM engine_registry WHERE engine_id_er = ${run.engine_id} LIMIT 1`
    );
    if ((engineCheck as unknown as any[]).length === 0) {
      errors.push(`Engine "${run.engine_id}" not in engine_registry`);
    }
  } else {
    errors.push("Missing engine_id");
  }

  // Must be success
  if (run.status !== "success") {
    errors.push(`Status is "${run.status}", must be "success"`);
  }

  // Must have output_refs
  if (!run.output_refs) {
    errors.push("Missing output_refs");
  }

  if (errors.length > 0) {
    return { rule: "NO_SNAPSHOT_WITHOUT_VALIDATION", passed: false, message: errors.join("; "), details: errors };
  }
  return { rule: "NO_SNAPSHOT_WITHOUT_VALIDATION", passed: true, message: "Run passes snapshot validation" };
}

// ─── Rule 4: NO_ALPHA_EXPORT_WITHOUT_SNAPSHOT ───

export function enforceAlphaExportSnapshot(snapshotId: number | null | undefined): EnforcementResult {
  if (!snapshotId || snapshotId <= 0) {
    return { rule: "NO_ALPHA_EXPORT_WITHOUT_SNAPSHOT", passed: false, message: "Alpha Lake export requires a valid snapshot_id" };
  }
  return { rule: "NO_ALPHA_EXPORT_WITHOUT_SNAPSHOT", passed: true, message: `Snapshot ${snapshotId} provided for Alpha Lake export` };
}

// ─── Rule 5: NO_UNDETERMINISTIC_REFS ───

export function enforceOutputRefsDeterministic(outputRefs: any): EnforcementResult {
  if (!outputRefs || typeof outputRefs !== "object") {
    return { rule: "NO_UNDETERMINISTIC_REFS", passed: false, message: "output_refs is missing or not an object" };
  }

  // Legacy string array format is non-deterministic
  if (Array.isArray(outputRefs)) {
    return { rule: "NO_UNDETERMINISTIC_REFS", passed: false, message: "output_refs is a legacy string array — not deterministic" };
  }

  if (!outputRefs.meta) {
    return { rule: "NO_UNDETERMINISTIC_REFS", passed: false, message: "output_refs.meta is missing" };
  }

  if (outputRefs.meta.deterministic !== true) {
    return { rule: "NO_UNDETERMINISTIC_REFS", passed: false, message: `output_refs.meta.deterministic is ${outputRefs.meta.deterministic}, must be true` };
  }

  // Check tables and fields exist
  if (!Array.isArray(outputRefs.meta.tables) || outputRefs.meta.tables.length === 0) {
    return { rule: "NO_UNDETERMINISTIC_REFS", passed: false, message: "output_refs.meta.tables is missing or empty" };
  }

  if (!Array.isArray(outputRefs.meta.fields) || outputRefs.meta.fields.length === 0) {
    return { rule: "NO_UNDETERMINISTIC_REFS", passed: false, message: "output_refs.meta.fields is missing or empty" };
  }

  return { rule: "NO_UNDETERMINISTIC_REFS", passed: true, message: "output_refs is deterministic with tables and fields" };
}

// ─── Run All Rules Against a Run ───

export async function enforceAllRules(runId: string): Promise<{
  allPassed: boolean;
  results: EnforcementResult[];
}> {
  const [runRows] = await db.execute(
    sql`SELECT run_id, engine_id, status, output_refs, snapshot_id FROM engine_runs WHERE run_id = ${runId}`
  );
  const runs = runRows as unknown as any[];

  if (runs.length === 0) {
    return {
      allPassed: false,
      results: [{ rule: "SYSTEM", passed: false, message: `No engine_run found for run_id: ${runId}` }],
    };
  }

  const run = runs[0];
  const outputRefs = typeof run.output_refs === "string" ? JSON.parse(run.output_refs) : run.output_refs;

  const results: EnforcementResult[] = [];

  // Rule 1
  results.push(await enforceRegisteredEngine(run.engine_id));

  // Rule 2
  if (outputRefs && !Array.isArray(outputRefs)) {
    results.push(await enforceNoOrphanOutput(outputRefs));
  } else {
    results.push({ rule: "NO_ORPHAN_OUTPUT", passed: false, message: "output_refs not in new format — cannot verify" });
  }

  // Rule 3
  results.push(await enforceSnapshotValidation(runId));

  // Rule 4
  results.push(enforceAlphaExportSnapshot(run.snapshot_id));

  // Rule 5
  results.push(enforceOutputRefsDeterministic(outputRefs));

  return {
    allPassed: results.every(r => r.passed),
    results,
  };
}
