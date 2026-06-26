/**
 * persistEngineOutputs(run_id)
 *
 * CANONICAL-ONLY PERSISTENCE LAYER
 *
 * Rules:
 * 1. REJECT non-canonical tables (must start with "canonical_")
 * 2. REJECT missing rows (entity must exist in declared table)
 * 3. REJECT non-deterministic outputs (meta.deterministic must be true)
 * 4. NO legacy string array support — legacy format is permanently rejected
 * 5. NO dual writes — all writes go through this function only
 *
 * Reads engine_runs for the given run_id, validates output_refs,
 * and upserts into knowledge_entries backbone.
 */

import { db } from "./db";
import { sql } from "drizzle-orm";
import type { OutputRefs } from "./output-refs";

const CANONICAL_PREFIX = "canonical_";

// ─── Canonical Table Enforcement ───

function assertCanonical(table: string, context: string): void {
  if (!table.startsWith(CANONICAL_PREFIX)) {
    throw new Error(
      `[PersistEngineOutputs] REJECTED: table "${table}" is not canonical. ` +
      `All output_refs MUST reference canonical_* tables. Context: ${context}`
    );
  }
}

// ─── Row Existence Check ───

async function assertRowExists(table: string, id: number, context: string): Promise<void> {
  assertCanonical(table, context);
  const [rows] = await db.execute(
    sql.raw(`SELECT id FROM "${table}" WHERE id = ${id} LIMIT 1`)
  );
  if ((rows as unknown as any[]).length === 0) {
    throw new Error(
      `[PersistEngineOutputs] REJECTED: id=${id} not found in "${table}". ` +
      `Dangling reference. Context: ${context}`
    );
  }
}

// ─── Knowledge Entry Module Resolution ───

async function getOrCreateBackboneModule(category: string): Promise<number> {
  const [existing] = await db.execute(
    sql`SELECT id FROM knowledge_modules WHERE moduleName LIKE ${`%${category}%`} LIMIT 1`
  );
  const rows = existing as unknown as any[];
  if (rows.length > 0) return rows[0].id;

  const [max_row] = await db.execute(sql`SELECT MAX(id) as max_id FROM knowledge_modules`);
  const max_id = ((max_row as unknown as any[])[0]?.max_id || 0) + 1;

  await db.execute(sql`
    INSERT INTO knowledge_modules (id, moduleName, moduleType, description, version, isActive, createdAt, updatedAt, entryCount)
    VALUES (${max_id}, ${`backbone_${category}`}, ${"backbone"}, ${`Canonical engine output: ${category}`}, ${"1.0.0"}, 1, ${Date.now()}, ${Date.now()}, 0)
  `);

  return max_id;
}

// ─── Source Data Fetcher (canonical tables only) ───

async function fetchCanonicalRow(table: string, id: number): Promise<any | null> {
  assertCanonical(table, `fetchCanonicalRow`);
  try {
    const [rows] = await db.execute(
      sql.raw(`SELECT * FROM "${table}" WHERE id = ${id} LIMIT 1`)
    );
    return (rows as unknown as any[])[0] || null;
  } catch {
    return null;
  }
}

// ─── Canonical Category Mapping ───

function deriveCategory(table: string): string {
  // canonical_claim_catalog → claim_catalog
  // canonical_pattern_registry → pattern_registry
  return table.replace(CANONICAL_PREFIX, "");
}

// ─── Core Function ───

export async function persistEngineOutputs(runId: string): Promise<{
  runId: string;
  persisted: number;
  rejected: number;
  errors: string[];
  details: Array<{ ref: string; table: string; action: string }>;
}> {
  const result = {
    runId,
    persisted: 0,
    rejected: 0,
    errors: [] as string[],
    details: [] as Array<{ ref: string; table: string; action: string }>,
  };

  // Step 1: Read engine_runs for this run_id
  const [runRows] = await db.execute(
    sql`SELECT run_id, engine_id, output_refs, caseId, status FROM engine_runs WHERE run_id = ${runId}`
  );
  const runs = runRows as unknown as any[];

  if (runs.length === 0) {
    result.errors.push(`REJECTED: No engine_run found for run_id: ${runId}`);
    result.rejected++;
    return result;
  }

  const run = runs[0];

  if (run.status !== "success") {
    result.errors.push(`REJECTED: Run ${runId} status is "${run.status}", not "success".`);
    result.rejected++;
    return result;
  }

  // Step 2: Parse output_refs
  let rawRefs = run.output_refs;
  if (typeof rawRefs === "string") rawRefs = JSON.parse(rawRefs);

  if (!rawRefs) {
    result.errors.push(`REJECTED: Run ${runId} has null/empty output_refs.`);
    result.rejected++;
    return result;
  }

  // Step 3: REJECT legacy string array format
  if (Array.isArray(rawRefs)) {
    result.errors.push(
      `REJECTED: Run ${runId} uses legacy string array output_refs. ` +
      `Must be OutputRefs object with canonical_* tables.`
    );
    result.rejected++;
    return result;
  }

  // Step 4: Validate OutputRefs object structure
  const outputRefs = rawRefs as OutputRefs;

  if (!outputRefs.primary || typeof outputRefs.primary.table !== "string") {
    result.errors.push(`REJECTED: Run ${runId} output_refs missing primary.table.`);
    result.rejected++;
    return result;
  }

  // Step 5: REJECT non-deterministic
  if (outputRefs.meta?.deterministic !== true) {
    result.errors.push(`REJECTED: Run ${runId} output_refs meta.deterministic is not true.`);
    result.rejected++;
    return result;
  }

  // Step 6: Process all entities — canonical only
  const allEntities = [outputRefs.primary, ...(outputRefs.artifacts || [])];

  for (const entity of allEntities) {
    const { type, id, table } = entity;
    const context = `${run.engine_id}/${type}:${id}`;

    // REJECT non-canonical table
    try {
      assertCanonical(table, context);
    } catch (e: any) {
      result.errors.push(e.message);
      result.rejected++;
      continue;
    }

    // REJECT missing row
    try {
      await assertRowExists(table, id, context);
    } catch (e: any) {
      result.errors.push(e.message);
      result.rejected++;
      continue;
    }

    // Derive backbone category from canonical table name
    const backboneCategory = deriveCategory(table);
    const sourceRow = await fetchCanonicalRow(table, id);

    const entryId = `canonical_${backboneCategory}_${type}:${id}`;
    const entryName = sourceRow?.name || sourceRow?.claimType || sourceRow?.description?.substring(0, 200) || `${type}:${id}`;
    const domain = sourceRow?.jurisdiction || sourceRow?.domains?.[0] || "canonical";

    const payload = {
      trace_path: outputRefs.meta?.trace_path || runId,
      engine_id: run.engine_id,
      case_id: run.caseId,
      source_table: table,
      source_id: id,
      ref: `${type}:${id}`,
      deterministic: true,
      tables: outputRefs.meta?.tables ?? [],
      fields: outputRefs.meta?.fields ?? [],
    };

    const moduleId = await getOrCreateBackboneModule(backboneCategory);

    const [existingEntries] = await db.execute(
      sql`SELECT id FROM knowledge_entries WHERE entryId = ${entryId} LIMIT 1`
    );

    if ((existingEntries as unknown as any[]).length > 0) {
      await db.execute(sql`
        UPDATE knowledge_entries 
        SET payload = ${JSON.stringify(payload)}, createdAt = ${Date.now()}
        WHERE entryId = ${entryId}
      `);
      result.details.push({ ref: `${type}:${id}`, table, action: "updated" });
      result.persisted++;
    } else {
      await db.execute(sql`
        INSERT INTO knowledge_entries (moduleId, entryId, entryName, category, severity, domain, payload, tags, crossRefModules, createdAt)
        VALUES (
          ${moduleId},
          ${entryId},
          ${String(entryName).substring(0, 500)},
          ${backboneCategory},
          ${"medium"},
          ${String(domain)},
          ${JSON.stringify(payload)},
          ${JSON.stringify([run.engine_id, backboneCategory, "canonical"])},
          ${JSON.stringify([])},
          ${Date.now()}
        )
      `);
      result.details.push({ ref: `${type}:${id}`, table, action: "inserted" });
      result.persisted++;
    }
  }

  // Step 7: Update module entry counts
  await db.execute(sql`
    UPDATE knowledge_modules km
    SET entryCount = (SELECT COUNT(*) FROM knowledge_entries ke WHERE ke.moduleId = km.id)
    WHERE km.moduleName LIKE 'backbone_%'
  `);

  console.log(
    `[PersistEngineOutputs] run ${runId}: persisted=${result.persisted}, rejected=${result.rejected}, errors=${result.errors.length}`
  );

  return result;
}

// ─── Batch Persist (for all runs of a case) ───

export async function persistAllOutputsForCase(caseId: number): Promise<{
  totalPersisted: number;
  totalRejected: number;
  totalErrors: string[];
  runResults: Array<{ runId: string; persisted: number; rejected: number }>;
}> {
  const [runRows] = await db.execute(
    sql`SELECT run_id FROM engine_runs WHERE caseId = ${caseId} AND status = 'success' ORDER BY createdAt ASC`
  );
  const runs = runRows as unknown as any[];

  const totals = { totalPersisted: 0, totalRejected: 0, totalErrors: [] as string[], runResults: [] as any[] };

  for (const run of runs) {
    const r = await persistEngineOutputs(run.run_id);
    totals.totalPersisted += r.persisted;
    totals.totalRejected += r.rejected;
    totals.totalErrors.push(...r.errors);
    totals.runResults.push({ runId: r.runId, persisted: r.persisted, rejected: r.rejected });
  }

  return totals;
}

// ─── Verification Query ───

export async function getBackboneTableCounts(): Promise<Array<{ table_name: string; count: number }>> {
  const [rows] = await db.execute(sql`
    SELECT category AS table_name, COUNT(*) AS count
    FROM knowledge_entries
    WHERE tags LIKE '%canonical%'
    GROUP BY category
    ORDER BY count DESC
  `);
  return rows as unknown as any[];
}
