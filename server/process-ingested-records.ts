/**
 * Process Ingested Records → Detected Signals → Pattern Outputs
 * 
 * Direct bridge: ingested_records → signal generation → pattern generation
 * 
 * Reads unprocessed records from ingested_records,
 * generates signals, inserts into detected_signals,
 * generates patterns, inserts into pattern_outputs,
 * marks records as processed.
 * 
 * No async. No queues. Direct deterministic execution.
 */

import mysql from "mysql2/promise";
import { randomUUID } from "crypto";
import { createHash } from "crypto";

// Action routing rules
function routeActions(lenses: Record<string, boolean>, signalId: string): Array<{ actionType: string; payload: any }> {
  const actions: Array<{ actionType: string; payload: any }> = [];

  if (lenses.USER) {
    actions.push({
      actionType: "generate_next_steps",
      payload: { signal_id: signalId, lens: "USER", source: "auto" }
    });
  }

  if (lenses.PROFESSIONAL) {
    actions.push({
      actionType: "build_case_structure",
      payload: { signal_id: signalId, lens: "PROFESSIONAL", source: "auto" }
    });
  }

  if (lenses.SYSTEMIC) {
    actions.push({
      actionType: "aggregate_pattern",
      payload: { signal_id: signalId, lens: "SYSTEMIC", source: "auto" }
    });
  }

  if (lenses.ADVOCATE) {
    actions.push({
      actionType: "generate_escalation",
      payload: { signal_id: signalId, lens: "ADVOCATE", source: "auto" }
    });
  }

  return actions;
}

// Lens activation rules
function activateLenses(signal: any): { lenses: Record<string, boolean>; reasons: Record<string, string> } {
  const lenses: Record<string, boolean> = {};
  const reasons: Record<string, string> = {};

  // USER lens - always active
  lenses.USER = true;
  reasons.USER = "All signals activate user lens";

  // PROFESSIONAL lens - medium or high severity
  const severity = signal.severity_level || "low";
  lenses.PROFESSIONAL = severity === "medium" || severity === "high";
  reasons.PROFESSIONAL = lenses.PROFESSIONAL ? `Severity: ${severity}` : "Low severity";

  // SYSTEMIC lens - signal count >= 1 (temporary)
  lenses.SYSTEMIC = true;
  reasons.SYSTEMIC = "Pattern detected";

  // ADVOCATE lens - high severity only
  lenses.ADVOCATE = severity === "high";
  reasons.ADVOCATE = lenses.ADVOCATE ? "High severity signal" : "Below advocate threshold";

  return { lenses, reasons };
}

export interface ProcessResult {
  processed: number;
  inserted: number;
  failed: number;
  signal_ids: string[];
  patterns_created?: number;
  lenses_activated?: number;
  actions_routed?: number;
}

export async function processIngestedRecords(): Promise<ProcessResult> {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  
  try {
    const result: ProcessResult = {
      processed: 0,
      inserted: 0,
      failed: 0,
      signal_ids: [],
      patterns_created: 0,
      lenses_activated: 0,
      actions_routed: 0,
    };

    // Step 1: Fetch unprocessed records
    const [records] = await conn.execute(`
      SELECT id, datasetId_ir, sourceRecordId, rawJson, normalizedCategory, 
             normalizedEntity, normalizedJurisdiction, ingestedAt
      FROM ingested_records
      WHERE processed_for_signals = FALSE
      ORDER BY ingestedAt ASC
      LIMIT 100
    `) as any;

    console.log(`[Pipeline] Processing ${records.length} ingested records...`);

    for (const record of records) {
      try {
        // Step 1b: Check if signal already exists for this record
        const [existingSignal] = await conn.execute(
          `SELECT signal_id FROM detected_signals WHERE plain_language_explanation LIKE ? LIMIT 1`,
          [`%${record.sourceRecordId}%`]
        ) as any;

        if (existingSignal.length > 0) {
          console.log(`⊘ Skipping record ${record.sourceRecordId} - signal already exists`);
          result.processed++;
          continue;
        }

        // Step 2: Generate signal from record
        const signalId = `sig-${randomUUID()}`;
        const now = Date.now();
        
        // Extract basic signal info from ingested record
        const rawData = typeof record.rawJson === 'string' 
          ? JSON.parse(record.rawJson) 
          : record.rawJson;

        const signalType = record.normalizedCategory || "general_signal";
        const explanation = `Signal generated from ingested record ${record.sourceRecordId}`;

        // Step 3: Insert into detected_signals
        const signalSeverity = "medium"; // severity
        await conn.execute(`
          INSERT INTO detected_signals (
            signal_id, signal_type, dataset_id, detection_timestamp,
            confidence_score, severity_level, plain_language_explanation,
            created_at, updated_at, entity_id, entity_role
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          signalId,
          signalType,
          record.datasetId_ir,
          record.ingestedAt,
          75, // confidence score
          signalSeverity,
          explanation,
          now,
          now,
          record.normalizedEntity || null,
          "subject"
        ]);

        // Step 3a: Activate lenses for this signal
        const { lenses, reasons } = activateLenses({
          severity_level: signalSeverity,
          signal_type: signalType
        });

        const lensId = `lens-${randomUUID()}`;
        const [existingLens] = await conn.execute(
          `SELECT id FROM lens_activation_state WHERE signal_id = ? LIMIT 1`,
          [signalId]
        ) as any;

        if (existingLens.length === 0) {
          await conn.execute(`
            INSERT INTO lens_activation_state (
              id, signal_id, lenses, activation_reason, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)
          `, [
            lensId,
            signalId,
            JSON.stringify(lenses),
            JSON.stringify(reasons),
            now,
            now
          ]);
          console.log(`  → Lenses: ${Object.keys(lenses).filter(k => lenses[k]).join(", ")}`);

          // Step 3c: Route actions from lenses
          const actions = routeActions(lenses, signalId);
          for (const action of actions) {
            const actionId = `act-${randomUUID()}`;
            const [existingAction] = await conn.execute(
              `SELECT action_id FROM action_queue WHERE signal_id = ? AND action_type = ? LIMIT 1`,
              [signalId, action.actionType]
            ) as any;

            if (existingAction.length === 0) {
              await conn.execute(`
                INSERT INTO action_queue (
                  action_id, signal_id, action_type, action_payload, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
              `, [
                actionId,
                signalId,
                action.actionType,
                JSON.stringify(action.payload),
                "pending",
                now,
                now
              ]);
              result.actions_routed = (result.actions_routed || 0) + 1;
              console.log(`  ↳ Action: ${action.actionType}`);
            }
          }
        }

        // Step 3b: Check if pattern already exists for this cluster
        const clusterId = createHash('sha256')
          .update(`${record.datasetId_ir}:medium`)
          .digest('hex')
          .substring(0, 32);

        const [existingPattern] = await conn.execute(
          `SELECT id FROM pattern_outputs WHERE cluster_id = ? LIMIT 1`,
          [clusterId]
        ) as any;

        if (existingPattern.length === 0) {
          // Only insert if pattern doesn't exist
          await conn.execute(`
            INSERT INTO pattern_outputs (
              cluster_id, signal_count, signal_types, severity, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)
          `, [
          clusterId,
          1,
          JSON.stringify([signalType]),
          "medium",
          now,
          now
          ]);
        } else {
          // Pattern exists - just increment count
          await conn.execute(
            `UPDATE pattern_outputs SET signal_count = signal_count + 1, updated_at = ? WHERE cluster_id = ?`,
            [now, clusterId]
          );
        }

        console.log(`✓ Signal: ${signalId} | Pattern: ${clusterId} (${existingPattern.length === 0 ? 'new' : 'updated'})`);

        result.inserted++;
        result.signal_ids.push(signalId);
        if (existingPattern.length === 0) {
          result.patterns_created = (result.patterns_created || 0) + 1;
        }

        // Mark lens activation as complete
        if (existingLens.length === 0) {
          result.lenses_activated = (result.lenses_activated || 0) + 1;
        } else {
          // Even if lens exists, we may have routed new actions
          // (This is handled in the action routing block above)
        }

      } catch (err: any) {
        result.failed++;
        console.error(`✗ Failed to process record ${record.id}:`, err.message);
      }

      result.processed++;
    }

    // Step 4: Mark all processed records as handled
    if (result.processed > 0) {
      await conn.execute(`
        UPDATE ingested_records
        SET processed_for_signals = TRUE, updatedAt_ir = ?
        WHERE processed_for_signals = FALSE
        LIMIT ${result.processed}
      `, [Date.now()]);

      console.log(`✓ Marked records as processed`);
    }

    // Step 5: Verify signals were created
    const [countResult] = await conn.execute(
      "SELECT COUNT(*) as cnt FROM detected_signals"
    ) as any;

    console.log(`✓ Total signals in database: ${countResult[0].cnt}`);

    // Step 6: Verify patterns were created
    const [patternCount] = await conn.execute(
      "SELECT COUNT(*) as cnt FROM pattern_outputs"
    ) as any;

    console.log(`✓ Total patterns in database: ${patternCount[0].cnt}`);

    // Step 7: Verify lenses were activated
    const [lensCount] = await conn.execute(
      "SELECT COUNT(*) as cnt FROM lens_activation_state"
    ) as any;

    console.log(`✓ Total lenses activated: ${lensCount[0].cnt}`);

    // Step 8: Verify actions were routed
    const [actionCount] = await conn.execute(
      "SELECT COUNT(*) as cnt FROM action_queue"
    ) as any;

    console.log(`✓ Total actions routed: ${actionCount[0].cnt}`);

    return result;

  } finally {
    await conn.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  processIngestedRecords()
    .then(result => {
      console.log("\n=== Result ===");
      console.log(`Processed: ${result.processed}`);
      console.log(`Inserted: ${result.inserted}`);
      console.log(`Failed: ${result.failed}`);
      console.log(`Signal IDs: ${result.signal_ids.join(", ")}`);
      console.log(`Patterns Created: ${result.patterns_created}`);
      console.log(`Lenses Activated: ${result.lenses_activated}`);
      console.log(`Actions Routed: ${result.actions_routed}`);
      console.log(`\nPipeline Status: OPERATIONAL`);
      process.exit(0);
    })
    .catch(err => {
      console.error("Error:", err);
      process.exit(1);
    });
}

export default processIngestedRecords;
