/**
 * Metadata Conduit — Structural metadata layer for governance + traceability
 *
 * Functions:
 *   scanSchema()          — Populate table_registry + field_dictionary from INFORMATION_SCHEMA
 *   detectDrift()         — Find orphan fields and unregistered tables
 *   logConduitEvent()     — Insert governance event into conduit_events
 *   validateMetadataCompleteness() — Gate: verify output_refs resolve + tables registered
 *   bindSnapshotToRun()   — Bind a snapshot_id to an engine_run
 *   generateOutput()      — Alpha Lake export (snapshot-only access)
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

// ─── scanSchema: populate table_registry + field_dictionary ───

export async function scanSchema(): Promise<{
  tablesScanned: number;
  fieldsScanned: number;
  newTables: number;
  newFields: number;
}> {
  const now = Date.now();
  let newTables = 0;
  let newFields = 0;

  // PostgreSQL catalog scan. pg_stat_user_tables supplies a non-blocking row
  // estimate; exact COUNT(*) scans here would turn governance into an outage.
  const [allTables] = await db.execute(sql`
    SELECT t.table_name, COALESCE(s.n_live_tup, 0)::bigint AS table_rows
    FROM information_schema.tables t
    LEFT JOIN pg_stat_user_tables s
      ON s.schemaname = t.table_schema AND s.relname = t.table_name
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name
  `);
  const tables = allTables as unknown as any[];

  for (const t of tables) {
    const tableName = t.table_name;
    const rowCount = Number(t.table_rows) || 0;

    // Check if already registered
    const [existing] = await db.execute(
      sql`SELECT id FROM table_registry WHERE table_name = ${tableName} LIMIT 1`
    );
    const existingRows = existing as unknown as any[];

    let tableId: number;

    // Determine category
    const category = categorizeTable(tableName);

    // Get column count
    const [cols] = await db.execute(sql`
      SELECT COUNT(*)::int as cnt FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${tableName}
    `);
    const columnCount = (cols as unknown as any[])[0]?.cnt || 0;

    if (existingRows.length > 0) {
      tableId = existingRows[0].id;
      // Update counts
      await db.execute(sql`
        UPDATE table_registry 
        SET row_count = ${rowCount}, column_count = ${columnCount},
            last_scanned_at = ${now}, updated_at = ${now},
            status = ${rowCount > 0 ? 'active' : 'empty'}
        WHERE id = ${tableId}
      `);
    } else {
      const [inserted] = await db.execute(sql`
        INSERT INTO table_registry (table_name, category, description, row_count, column_count, last_scanned_at, status, created_at, updated_at)
        VALUES (${tableName}, ${category}, ${`Auto-scanned: ${tableName}`}, ${rowCount}, ${columnCount}, ${now}, ${rowCount > 0 ? 'active' : 'empty'}, ${now}, ${now})
        RETURNING id
      `);
      tableId = Number((inserted as unknown as any[])[0]?.id);
      newTables++;
    }

    // Scan fields
    const [fields] = await db.execute(sql`
      SELECT c.column_name, c.data_type, c.is_nullable,
             EXISTS (
               SELECT 1
               FROM information_schema.table_constraints tc
               JOIN information_schema.key_column_usage kcu
                 ON kcu.constraint_name = tc.constraint_name
                AND kcu.constraint_schema = tc.constraint_schema
               WHERE tc.table_schema = c.table_schema
                 AND tc.table_name = c.table_name
                 AND tc.constraint_type = 'PRIMARY KEY'
                 AND kcu.column_name = c.column_name
             ) AS is_primary_key,
             EXISTS (
               SELECT 1
               FROM pg_index i
               JOIN pg_class rel ON rel.oid = i.indrelid
               JOIN pg_namespace ns ON ns.oid = rel.relnamespace
               JOIN pg_attribute a ON a.attrelid = rel.oid AND a.attnum = ANY(i.indkey)
               WHERE ns.nspname = c.table_schema
                 AND rel.relname = c.table_name
                 AND a.attname = c.column_name
             ) AS is_indexed
      FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = ${tableName}
      ORDER BY c.ordinal_position
    `);

    // @ts-ignore - cast is valid at runtime
    for (const f of fields as any[]) {
      const [existingField] = await db.execute(sql`
        SELECT id FROM field_dictionary 
        WHERE table_id = ${tableId} AND field_name = ${f.column_name} LIMIT 1
      `);

      if ((existingField as unknown as any[]).length === 0) {
        await db.execute(sql`
          INSERT INTO field_dictionary (table_id, field_name, field_type, is_nullable, is_primary_key, is_indexed, created_at)
          VALUES (
            ${tableId}, 
            ${f.column_name},
            ${f.data_type},
            ${f.is_nullable === 'YES' ? 1 : 0},
            ${f.is_primary_key ? 1 : 0},
            ${f.is_indexed ? 1 : 0},
            ${now}
          )
        `);
        newFields++;
      }
    }
  }

  return {
    tablesScanned: tables.length,
    fieldsScanned: newFields,
    newTables,
    newFields,
  };
}

function categorizeTable(name: string): string {
  if (name.startsWith('registry_') || name.endsWith('_registry')) return 'registry';
  if (name.startsWith('engine_') || name === 'engine_registry') return 'engine';
  if (name.startsWith('pipeline_')) return 'pipeline';
  if (name.startsWith('strategy_')) return 'strategy';
  if (name.startsWith('trend_')) return 'trend';
  if (name.startsWith('pattern_')) return 'pattern';
  if (name.startsWith('outcome_')) return 'outcome';
  if (name.startsWith('campaign_')) return 'campaign';
  if (['table_registry', 'field_dictionary', 'relation_catalog', 'pipeline_map', 'transform_profiles', 'conduit_events', 'alpha_lake_exports'].includes(name)) return 'conduit';
  if (['cases', 'documents', 'quotes', 'entities', 'entity_roles', 'relationships', 'claims', 'findings', 'events', 'signal_flags', 'correlations'].includes(name)) return 'core';
  if (name.includes('knowledge')) return 'knowledge';
  if (name.includes('signal') || name.includes('live_')) return 'signals';
  if (name.includes('snapshot')) return 'snapshot';
  return 'other';
}

// ─── detectDrift: find orphan fields and unregistered tables ───

export async function detectDrift(): Promise<{
  orphanFields: number;
  unknownTables: number;
  unknownTableNames: string[];
  totalDbTables: number;
  registeredTables: number;
}> {
  // Orphan fields: fields referencing tables not in table_registry
  const [orphans] = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM field_dictionary fd
    LEFT JOIN table_registry tr ON fd.table_id = tr.id
    WHERE tr.id IS NULL
  `);
  const orphanFields = (orphans as unknown as any[])[0]?.cnt || 0;

  // Unknown tables: tables in DB not in table_registry
  const [allTables] = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  const [registeredRows] = await db.execute(sql`SELECT table_name FROM table_registry`);
  const registered = new Set((registeredRows as unknown as any[]).map(r => r.table_name));
  const unknown = (allTables as unknown as any[]).filter(r => !registered.has(r.table_name)).map(r => r.table_name);

  return {
    orphanFields,
    unknownTables: unknown.length,
    unknownTableNames: unknown,
    totalDbTables: (allTables as unknown as any[]).length,
    registeredTables: registered.size,
  };
}

// ─── logConduitEvent: governance event logging ───

export async function logConduitEvent(params: {
  eventType: string;
  pipelineId?: string;
  engineId?: string;
  runId?: string;
  snapshotId?: number;
  metadata?: Record<string, any>;
}): Promise<number> {
  const now = Date.now();
  const [inserted] = await db.execute(sql`
    INSERT INTO conduit_events (event_type, pipeline_id, engine_id, run_id, snapshot_id, metadata, created_at)
    VALUES (
      ${params.eventType},
      ${params.pipelineId ?? null},
      ${params.engineId ?? null},
      ${params.runId ?? null},
      ${params.snapshotId ?? null},
      ${JSON.stringify(params.metadata ?? {})},
      ${now}
    )
    RETURNING id
  `);
  return Number((inserted as unknown as any[])[0]?.id);
}

// ─── validateMetadataCompleteness: gate before snapshot ───

export async function validateMetadataCompleteness(runId: string): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  // Get the engine_run
  const [runRows] = await db.execute(
    sql`SELECT run_id, engine_id, output_refs, status FROM engine_runs WHERE run_id = ${runId}`
  );
  const runs = runRows as unknown as any[];
  if (runs.length === 0) {
    return { valid: false, errors: [`No engine_run found for run_id: ${runId}`] };
  }

  const run = runs[0];

  // Check status
  if (run.status !== 'success') {
    errors.push(`Run status is "${run.status}", expected "success"`);
  }

  // Check output_refs exist
  if (!run.output_refs) {
    errors.push('Missing output_refs');
    return { valid: false, errors };
  }

  const refs = typeof run.output_refs === 'string' ? JSON.parse(run.output_refs) : run.output_refs;

  // New format: check primary resolves
  if (refs.primary) {
    const table = refs.primary.table;
    const id = refs.primary.id;

    // Check table exists in table_registry
    const [trCheck] = await db.execute(
      sql`SELECT id FROM table_registry WHERE table_name = ${table} LIMIT 1`
    );
    if ((trCheck as unknown as any[]).length === 0) {
      errors.push(`Primary table "${table}" not found in table_registry`);
    }

    // Check row exists
    try {
      if (!/^[a-z_][a-z0-9_]*$/i.test(table)) {
        errors.push(`Unsafe primary table identifier: "${table}"`);
        return { valid: false, errors };
      }
      const [rowCheck] = await db.execute(
        sql`SELECT id FROM ${sql.raw(`"${table}"`)} WHERE id::text = ${String(id)} LIMIT 1`
      );
      if ((rowCheck as unknown as any[]).length === 0) {
        errors.push(`Primary entity id=${id} not found in ${table}`);
      }
    } catch (e: any) {
      errors.push(`Failed to verify primary entity: ${e.message}`);
    }

    // Check artifacts
    if (refs.artifacts && Array.isArray(refs.artifacts)) {
      for (const artifact of refs.artifacts) {
        const [artTrCheck] = await db.execute(
          sql`SELECT id FROM table_registry WHERE table_name = ${artifact.table} LIMIT 1`
        );
        if ((artTrCheck as unknown as any[]).length === 0) {
          errors.push(`Artifact table "${artifact.table}" not found in table_registry`);
        }
        try {
          if (!/^[a-z_][a-z0-9_]*$/i.test(artifact.table)) {
            errors.push(`Unsafe artifact table identifier: "${artifact.table}"`);
            continue;
          }
          const [artRowCheck] = await db.execute(
            sql`SELECT id FROM ${sql.raw(`"${artifact.table}"`)} WHERE id::text = ${String(artifact.id)} LIMIT 1`
          );
          if ((artRowCheck as unknown as any[]).length === 0) {
            errors.push(`Artifact entity id=${artifact.id} not found in ${artifact.table}`);
          }
        } catch (e: any) {
          errors.push(`Failed to verify artifact entity: ${e.message}`);
        }
      }
    }

    // Check meta.tables against table_registry
    if (refs.meta?.tables && Array.isArray(refs.meta.tables)) {
      for (const t of refs.meta.tables) {
        const [tCheck] = await db.execute(
          sql`SELECT id FROM table_registry WHERE table_name = ${t} LIMIT 1`
        );
        if ((tCheck as unknown as any[]).length === 0) {
          errors.push(`Meta table "${t}" not found in table_registry`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── validateRunBeforeSnapshot: block if missing engine, failed status, missing outputs ───

export async function validateRunBeforeSnapshot(runId: string): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  const [runRows] = await db.execute(
    sql`SELECT run_id, engine_id, output_refs, status FROM engine_runs WHERE run_id = ${runId}`
  );
  const runs = runRows as unknown as any[];

  if (runs.length === 0) {
    return { valid: false, errors: ['No engine_run found'] };
  }

  const run = runs[0];

  // Check engine exists in registry
  if (run.engine_id) {
    const [engineCheck] = await db.execute(
      sql`SELECT id FROM engine_registry WHERE engine_id_er = ${run.engine_id} LIMIT 1`
    );
    if ((engineCheck as unknown as any[]).length === 0) {
      errors.push(`Engine "${run.engine_id}" not found in engine_registry`);
    }
  } else {
    errors.push('Missing engine_id');
  }

  // Check status
  if (run.status !== 'success') {
    errors.push(`Run status is "${run.status}", must be "success"`);
  }

  // Check outputs
  if (!run.output_refs) {
    errors.push('Missing output_refs');
  }

  return { valid: errors.length === 0, errors };
}

// ─── bindSnapshotToRun: bind snapshot_id to engine_run ───

export async function bindSnapshotToRun(runId: string, snapshotId: number): Promise<{
  bound: boolean;
  error?: string;
}> {
  // Validate run first
  const runValidation = await validateRunBeforeSnapshot(runId);
  if (!runValidation.valid) {
    return { bound: false, error: `Run validation failed: ${runValidation.errors.join('; ')}` };
  }

  // Validate metadata completeness
  const metaValidation = await validateMetadataCompleteness(runId);
  if (!metaValidation.valid) {
    return { bound: false, error: `Metadata validation failed: ${metaValidation.errors.join('; ')}` };
  }

  // Bind
  await db.execute(sql`
    UPDATE engine_runs SET snapshot_id = ${snapshotId} WHERE run_id = ${runId}
  `);

  // Log conduit event
  await logConduitEvent({
    eventType: 'SNAPSHOT_BOUND',
    runId,
    snapshotId,
    metadata: { bound_at: Date.now() },
  });

  return { bound: true };
}

// ─── generateOutput: Alpha Lake export (snapshot-only) ───

export async function generateOutput(snapshotId: number): Promise<{
  snapshotId: number;
  runs: any[];
  exportId: number;
}> {
  if (!snapshotId) throw new Error("Snapshot required — Alpha Lake only accepts snapshot_id");

  // Fetch all engine_runs for this snapshot
  const [runRows] = await db.execute(sql`
    SELECT run_id, engine_id, status, output_refs, case_id, started_at, completed_at
    FROM engine_runs
    WHERE snapshot_id = ${snapshotId}
    ORDER BY started_at ASC
  `);
  const runs = runRows as unknown as any[];

  if (runs.length === 0) {
    throw new Error(`No engine_runs found for snapshot_id=${snapshotId}`);
  }

  // Assemble document
  const assembled = {
    snapshot_id: snapshotId,
    generated_at: Date.now(),
    engine_count: runs.length,
    runs: runs.map(r => ({
      run_id: r.run_id,
      engine_id: r.engine_id,
      status: r.status,
      output_refs: typeof r.output_refs === 'string' ? JSON.parse(r.output_refs) : r.output_refs,
      case_id: r.case_id,
      started_at: r.started_at,
      completed_at: r.completed_at,
    })),
  };

  // Insert into alpha_lake_exports
  const now = Date.now();
  const [inserted] = await db.execute(sql`
    INSERT INTO alpha_lake_exports (snapshot_id, export_type, engine_run_ids, output_payload, status, created_at)
    VALUES (
      ${snapshotId},
      ${'full'},
      ${JSON.stringify(runs.map(r => r.run_id))},
      ${JSON.stringify(assembled)},
      ${'completed'},
      ${now}
    )
    RETURNING id
  `);
  const exportId = Number((inserted as unknown as any[])[0]?.id);

  // Governance logging
  await logConduitEvent({
    eventType: 'ALPHA_EXPORT',
    pipelineId: 'alpha_lake',
    snapshotId,
    metadata: { export_id: exportId, engine_count: runs.length, timestamp: now },
  });

  return { snapshotId, runs: assembled.runs, exportId };
}
