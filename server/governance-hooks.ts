/**
 * Governance Hooks — Transaction-Coupled Enforcement Layer
 * 
 * These hooks wrap governed operations so that:
 * 1. Every governed write happens inside a transaction
 * 2. Every transaction includes a governance log entry
 * 3. If the log entry fails, the governed write rolls back
 * 4. No governed write can bypass the governance layer
 * 
 * Usage:
 *   import { governedThresholdUpdate, governedDataStreamToggle } from "./governance-hooks";
 *   
 *   // In a router:
 *   await governedThresholdUpdate(db, {
 *     table: sunamThresholds,
 *     id: thresholdId,
 *     changes: { passThreshold: "0.6000" },
 *     rationale: "Adjusted based on Q1 data review — false positive rate was 23%",
 *     actorId: ctx.user.openId,
 *     actorRole: "admin",
 *   });
 */

import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { writeGovernanceLog } from "./governance-log";
import type { GovernanceEventType } from "../drizzle/schema";
import {
  dataStreamRegistry,
  sunamThresholds,
  escalationThresholds,
  patternCreationThresholds,
  patternDecayRules,
  patternConfidenceFactors,
  liveSignals,
} from "../drizzle/schema";

// ─── Types ───

interface GovernedWriteBase {
  rationale: string;
  actorId: string;
  actorRole: "admin" | "system" | "engine";
}

// ─── 1. Threshold Updates ───

interface GovernedThresholdUpdateInput extends GovernedWriteBase {
  tableName: "sunam_thresholds" | "escalation_thresholds" | "pattern_creation_thresholds" | "pattern_decay_rules" | "pattern_confidence_factors";
  recordId: number;
  changes: Record<string, unknown>;
}

/**
 * Update any threshold table with governance logging.
 * 
 * T1. Read current state (before).
 * T2. Apply update.
 * T3. Read new state (after).
 * T4. Write governance log entry.
 * All in one transaction — if any step fails, everything rolls back.
 */
export async function governedThresholdUpdate(input: GovernedThresholdUpdateInput): Promise<{
  success: boolean;
  seqNo: number;
  entryHash: string;
}> {
  const tableMap: Record<string, any> = {
    sunam_thresholds: sunamThresholds,
    escalation_thresholds: escalationThresholds,
    pattern_creation_thresholds: patternCreationThresholds,
    pattern_decay_rules: patternDecayRules,
    pattern_confidence_factors: patternConfidenceFactors,
  };
  
  const table = tableMap[input.tableName];
  if (!table) throw new Error(`Unknown governed table: ${input.tableName}`);
  
  return await db.transaction(async (tx: any) => {
    // T1. Read current state
    const [currentState] = await tx.select().from(table).where(eq(table.id, input.recordId));
    if (!currentState) throw new Error(`Record ${input.recordId} not found in ${input.tableName}`);
    
    // T2. Apply update
    await tx.update(table).set(input.changes).where(eq(table.id, input.recordId));
    
    // T3. Read new state
    const [newState] = await tx.select().from(table).where(eq(table.id, input.recordId));
    
    // T4. Write governance log
    const result = await writeGovernanceLog(tx, {
      eventType: "threshold_update",
      component: input.tableName,
      scope: `record_id:${input.recordId}`,
      previousState: currentState,
      newState: newState,
      rationale: input.rationale,
      actorId: input.actorId,
      actorRole: input.actorRole,
    });
    
    return { success: true, ...result };
  });
}

// ─── 2. Data Stream Toggle (Enable/Disable) ───

interface GovernedDataStreamToggleInput extends GovernedWriteBase {
  datasetId: string;
  enabled: boolean;
}

/**
 * Enable or disable a data stream with governance logging.
 */
export async function governedDataStreamToggle(input: GovernedDataStreamToggleInput): Promise<{
  success: boolean;
  seqNo: number;
  entryHash: string;
}> {
  return await db.transaction(async (tx: any) => {
    // T1. Read current state
    const [currentState] = await tx.select().from(dataStreamRegistry)
      .where(eq(dataStreamRegistry.streamId, input.datasetId));
    if (!currentState) throw new Error(`Data stream ${input.datasetId} not found`);
    
    // T2. Apply update
    await tx.update(dataStreamRegistry)
      .set({ enabled: input.enabled, updatedAt: Date.now() })
      .where(eq(dataStreamRegistry.streamId, input.datasetId));
    
    // T3. Read new state
    const [newState] = await tx.select().from(dataStreamRegistry)
      .where(eq(dataStreamRegistry.streamId, input.datasetId));
    
    // T4. Write governance log
    const eventType: GovernanceEventType = input.enabled
      ? "data_stream_activation"
      : "data_stream_deactivation";
    
    const result = await writeGovernanceLog(tx, {
      eventType,
      component: "data_stream_registry",
      scope: `stream_id:${input.datasetId}`,
      previousState: { enabled: currentState.enabled },
      newState: { enabled: newState.enabled },
      rationale: input.rationale,
      actorId: input.actorId,
      actorRole: input.actorRole,
    });
    
    return { success: true, ...result };
  });
}

// ─── 3. Signal Suppression ───

interface GovernedSignalSuppressionInput extends GovernedWriteBase {
  signalId: number;
  suppress: boolean;  // true = suppress, false = restore
}

/**
 * Suppress or restore a signal with governance logging.
 */
export async function governedSignalSuppression(input: GovernedSignalSuppressionInput): Promise<{
  success: boolean;
  seqNo: number;
  entryHash: string;
}> {
  return await db.transaction(async (tx: any) => {
    // T1. Read current state
    const [currentState] = await tx.select().from(liveSignals)
      .where(eq(liveSignals.id, input.signalId));
    if (!currentState) throw new Error(`Signal ${input.signalId} not found`);
    
    // T2. Apply update
    await tx.update(liveSignals)
      .set({ active: !input.suppress })
      .where(eq(liveSignals.id, input.signalId));
    
    // T3. Read new state
    const [newState] = await tx.select().from(liveSignals)
      .where(eq(liveSignals.id, input.signalId));
    
    // T4. Write governance log
    const eventType: GovernanceEventType = input.suppress
      ? "signal_suppression"
      : "signal_restoration";
    
    const result = await writeGovernanceLog(tx, {
      eventType,
      component: "live_signals",
      scope: `signal_id:${input.signalId}`,
      previousState: {
        active: currentState.active,
        signalType: currentState.signalType,
        title: currentState.title,
      },
      newState: {
        active: newState.active,
        signalType: newState.signalType,
        title: newState.title,
      },
      rationale: input.rationale,
      actorId: input.actorId,
      actorRole: input.actorRole,
    });
    
    return { success: true, ...result };
  });
}

// ─── 4. Engine Activation/Deactivation ───

interface GovernedEngineToggleInput extends GovernedWriteBase {
  engineId: string;
  engineName: string;
  enabled: boolean;
  config?: Record<string, unknown>;
}

/**
 * Enable or disable an engine with governance logging.
 * 
 * Note: This logs the event but doesn't write to a specific table
 * because engine state may be managed in-memory or via config.
 * The governance log becomes the source of truth for engine state changes.
 */
export async function governedEngineToggle(input: GovernedEngineToggleInput): Promise<{
  success: boolean;
  seqNo: number;
  entryHash: string;
}> {
  return await db.transaction(async (tx: any) => {
    const eventType: GovernanceEventType = input.enabled
      ? "engine_activation"
      : "engine_deactivation";
    
    const result = await writeGovernanceLog(tx, {
      eventType,
      component: `engine:${input.engineId}`,
      scope: input.engineName,
      previousState: { enabled: !input.enabled },
      newState: { enabled: input.enabled, config: input.config },
      rationale: input.rationale,
      actorId: input.actorId,
      actorRole: input.actorRole,
    });
    
    return { success: true, ...result };
  });
}

// ─── 5. Engine Config Change ───

interface GovernedEngineConfigInput extends GovernedWriteBase {
  engineId: string;
  engineName: string;
  previousConfig: Record<string, unknown>;
  newConfig: Record<string, unknown>;
}

/**
 * Change engine configuration with governance logging.
 */
export async function governedEngineConfigChange(input: GovernedEngineConfigInput): Promise<{
  success: boolean;
  seqNo: number;
  entryHash: string;
}> {
  return await db.transaction(async (tx: any) => {
    const result = await writeGovernanceLog(tx, {
      eventType: "engine_config_change",
      component: `engine:${input.engineId}`,
      scope: input.engineName,
      previousState: input.previousConfig,
      newState: input.newConfig,
      rationale: input.rationale,
      actorId: input.actorId,
      actorRole: input.actorRole,
    });
    
    return { success: true, ...result };
  });
}

// ─── 6. Category Reclassification ───

interface GovernedCategoryReclassificationInput extends GovernedWriteBase {
  targetType: "gap" | "signal" | "pattern";
  targetId: string;
  previousCategory: string;
  newCategory: string;
}

/**
 * Reclassify a gap, signal, or pattern category with governance logging.
 */
export async function governedCategoryReclassification(input: GovernedCategoryReclassificationInput): Promise<{
  success: boolean;
  seqNo: number;
  entryHash: string;
}> {
  return await db.transaction(async (tx: any) => {
    const result = await writeGovernanceLog(tx, {
      eventType: "category_reclassification",
      component: `${input.targetType}_category`,
      scope: `${input.targetType}_id:${input.targetId}`,
      previousState: { category: input.previousCategory },
      newState: { category: input.newCategory },
      rationale: input.rationale,
      actorId: input.actorId,
      actorRole: input.actorRole,
    });
    
    return { success: true, ...result };
  });
}

// ─── 7. Version Changes (Gap Standard, Constitution, Signal Taxonomy) ───

interface GovernedVersionChangeInput extends GovernedWriteBase {
  versionType: "gap_standard" | "constitution" | "signal_taxonomy";
  previousVersion: string;
  newVersion: string;
  changelog: string;
}

/**
 * Record a version change for Gap Standard, Constitution, or Signal Taxonomy.
 */
export async function governedVersionChange(input: GovernedVersionChangeInput): Promise<{
  success: boolean;
  seqNo: number;
  entryHash: string;
}> {
  const eventTypeMap: Record<string, GovernanceEventType> = {
    gap_standard: "gap_standard_version",
    constitution: "constitution_version",
    signal_taxonomy: "signal_taxonomy_update",
  };
  
  return await db.transaction(async (tx: any) => {
    const result = await writeGovernanceLog(tx, {
      eventType: eventTypeMap[input.versionType],
      component: input.versionType,
      scope: `v${input.previousVersion} → v${input.newVersion}`,
      previousState: { version: input.previousVersion },
      newState: { version: input.newVersion, changelog: input.changelog },
      rationale: input.rationale,
      actorId: input.actorId,
      actorRole: input.actorRole,
    });
    
    return { success: true, ...result };
  });
}

// ─── 8. Data Stream Creation ───

interface GovernedDataStreamCreateInput extends GovernedWriteBase {
  streamData: {
    streamId: string;
    streamName: string;
    streamType: string;
    source: string;
    sourceUrl?: string;
    apiUrl: string;
    updateFrequency: string;
    jurisdiction: string;
    domain: string;
    description?: string | null;
    fieldMapping?: Record<string, string> | null;
    cronExpression?: string | null;
  };
}

/**
 * Create a new data stream with governance logging.
 */
export async function governedDataStreamCreate(input: GovernedDataStreamCreateInput): Promise<{
  success: boolean;
  seqNo: number;
  entryHash: string;
}> {
  return await db.transaction(async (tx: any) => {
    const now = Date.now();
    // T1. Insert the new stream
    await tx.insert(dataStreamRegistry).values({
      streamId: input.streamData.streamId,
      streamName: input.streamData.streamName,
      streamType: input.streamData.streamType as any,
      source: input.streamData.source,
      sourceUrl: input.streamData.sourceUrl ?? null,
      apiUrl: input.streamData.apiUrl,
      updateFrequency: input.streamData.updateFrequency as any,
      jurisdiction: input.streamData.jurisdiction,
      domain: input.streamData.domain,
      description: input.streamData.description ?? null,
      fieldMapping: input.streamData.fieldMapping ?? null,
      enabled: true,
      recordsIngested: 0,
      cronExpression: input.streamData.cronExpression ?? null,
      createdAt: now,
      updatedAt: now,
    });

    // T2. Write governance log
    const result = await writeGovernanceLog(tx, {
      eventType: "data_stream_created",
      component: "data_stream_registry",
      scope: `stream_id:${input.streamData.streamId}`,
      previousState: null,
      newState: { ...input.streamData, enabled: true, createdAt: now },
      rationale: input.rationale,
      actorId: input.actorId,
      actorRole: input.actorRole,
    });

    return { success: true, ...result };
  });
}

// ─── 9. Data Stream Deletion ───

interface GovernedDataStreamDeleteInput extends GovernedWriteBase {
  datasetId: string;
}

/**
 * Delete a data stream with governance logging.
 * Captures the full state before deletion for audit trail.
 */
export async function governedDataStreamDelete(input: GovernedDataStreamDeleteInput): Promise<{
  success: boolean;
  seqNo: number;
  entryHash: string;
}> {
  return await db.transaction(async (tx: any) => {
    // T1. Read current state (capture before deletion)
    const [currentState] = await tx.select().from(dataStreamRegistry)
      .where(eq(dataStreamRegistry.streamId, input.datasetId));
    if (!currentState) throw new Error(`Data stream ${input.datasetId} not found`);

    // T2. Delete the stream
    await tx.delete(dataStreamRegistry)
      .where(eq(dataStreamRegistry.streamId, input.datasetId));

    // T3. Write governance log
    const result = await writeGovernanceLog(tx, {
      eventType: "data_stream_deleted",
      component: "data_stream_registry",
      scope: `stream_id:${input.datasetId}`,
      previousState: {
        streamId: currentState.streamId,
        streamName: currentState.streamName,
        enabled: currentState.enabled,
        source: currentState.source,
        domain: currentState.domain,
        jurisdiction: currentState.jurisdiction,
      },
      newState: { deleted: true, deletedAt: Date.now() },
      rationale: input.rationale,
      actorId: input.actorId,
      actorRole: input.actorRole,
    });

    return { success: true, ...result };
  });
}

// ─── 10. Data Stream Config Change ───

interface GovernedDataStreamConfigInput extends GovernedWriteBase {
  stream_id: string;
  changes: Record<string, unknown>;
}

/**
 * Update data stream configuration with governance logging.
 */
export async function governedDataStreamConfigChange(input: GovernedDataStreamConfigInput): Promise<{
  success: boolean;
  seqNo: number;
  entryHash: string;
}> {
  return await db.transaction(async (tx: any) => {
    // T1. Read current state
    const [currentState] = await tx.select().from(dataStreamRegistry)
      .where(eq(dataStreamRegistry.streamId, input.stream_id));
    if (!currentState) throw new Error(`Data stream ${input.stream_id} not found`);

    // T2. Apply update
    const setValues: any = { ...input.changes, updatedAt: Date.now() };
    await tx.update(dataStreamRegistry)
      .set(setValues)
      .where(eq(dataStreamRegistry.streamId, input.stream_id));

    // T3. Read new state
    const [newState] = await tx.select().from(dataStreamRegistry)
      .where(eq(dataStreamRegistry.streamId, input.stream_id));

    // T4. Write governance log
    const result = await writeGovernanceLog(tx, {
      eventType: "data_stream_config_changed",
      component: "data_stream_registry",
      scope: `stream_id:${input.stream_id}`,
      previousState: {
        apiUrl: currentState.apiUrl,
        cronExpression: currentState.cronExpression,
        fieldMapping: currentState.fieldMapping,
        sourceUrl: currentState.sourceUrl,
      },
      newState: {
        apiUrl: newState.apiUrl,
        cronExpression: newState.cronExpression,
        fieldMapping: newState.fieldMapping,
        sourceUrl: newState.sourceUrl,
      },
      rationale: input.rationale,
      actorId: input.actorId,
      actorRole: input.actorRole,
    });

    return { success: true, ...result };
  });
}

// ─── 11. Strategy Path Update ───

interface GovernedStrategyPathUpdateInput extends GovernedWriteBase {
  pathId: number;
  status: string;
}

/**
 * Update strategy path status with governance logging.
 */
export async function governedStrategyPathUpdate(input: GovernedStrategyPathUpdateInput): Promise<{
  success: boolean;
  seqNo: number;
  entryHash: string;
}> {
  const { strategyPaths } = await import("../drizzle/schema");
  return await db.transaction(async (tx: any) => {
    // T1. Read current state
    const [currentState] = await tx.select().from(strategyPaths)
      .where(eq(strategyPaths.id, input.pathId as any));
    if (!currentState) throw new Error(`Strategy path ${input.pathId} not found`);

    // T2. Apply update
    await tx.update(strategyPaths)
      .set({ pathStatus: input.status as any, updatedAt: Date.now() })
      .where(eq(strategyPaths.id, input.pathId as any));

    // T3. Read new state
    const [newState] = await tx.select().from(strategyPaths)
      .where(eq(strategyPaths.id, input.pathId as any));

    // T4. Write governance log
    const result = await writeGovernanceLog(tx, {
      eventType: "strategy_path_updated",
      component: "strategy_paths",
      scope: `path_id:${input.pathId}`,
      previousState: { pathStatus: currentState.pathStatus },
      newState: { pathStatus: newState.pathStatus },
      rationale: input.rationale,
      actorId: input.actorId,
      actorRole: input.actorRole,
    });

    return { success: true, ...result };
  });
}

// ─── 12. Engine Config Change (with DB write) ───

interface GovernedEngineConfigDBInput extends GovernedWriteBase {
  engineId: string;
  changes: Record<string, unknown>;
}

/**
 * Update engine config in engineRegistry table with governance logging.
 */
export async function governedEngineConfigDB(input: GovernedEngineConfigDBInput): Promise<{
  success: boolean;
  seqNo: number;
  entryHash: string;
}> {
  const { engineRegistry } = await import("../drizzle/schema");
  return await db.transaction(async (tx: any) => {
    // T1. Read current state
    const [currentState] = await tx.select().from(engineRegistry)
      .where(eq(engineRegistry.engineId, input.engineId));
    if (!currentState) throw new Error(`Engine ${input.engineId} not found`);

    // T2. Apply update
    const setValues: any = { ...input.changes, updatedAt: Date.now() };
    await tx.update(engineRegistry)
      .set(setValues)
      .where(eq(engineRegistry.engineId, input.engineId));

    // T3. Read new state
    const [newState] = await tx.select().from(engineRegistry)
      .where(eq(engineRegistry.engineId, input.engineId));

    // T4. Write governance log
    const result = await writeGovernanceLog(tx, {
      eventType: "engine_config_change",
      component: `engine:${input.engineId}`,
      scope: `engine_id:${input.engineId}`,
      previousState: {
        configJson: currentState.configJson,
        version: currentState.version,
        description: currentState.description,
        category: currentState.category,
      },
      newState: {
        configJson: newState.configJson,
        version: newState.version,
        description: newState.description,
        category: newState.category,
      },
      rationale: input.rationale,
      actorId: input.actorId,
      actorRole: input.actorRole,
    });

    return { success: true, ...result };
  });
}

// ─── 13. Pattern Candidate Status Change ───

interface GovernedPatternCandidateStatusInput extends GovernedWriteBase {
  candidateId: number;
  status: string;
}

/**
 * Update pattern candidate status with governance logging.
 */
export async function governedPatternCandidateStatus(input: GovernedPatternCandidateStatusInput): Promise<{
  success: boolean;
  seqNo: number;
  entryHash: string;
}> {
  const { patternCandidates } = await import("../drizzle/schema");
  return await db.transaction(async (tx: any) => {
    // T1. Read current state
    const [currentState] = await tx.select().from(patternCandidates)
      .where(eq(patternCandidates.id, input.candidateId));
    if (!currentState) throw new Error(`Pattern candidate ${input.candidateId} not found`);

    // T2. Apply update
    await tx.update(patternCandidates)
      .set({ patternStatus: input.status as any, updatedAt: Date.now() })
      .where(eq(patternCandidates.id, input.candidateId));

    // T3. Write governance log
    const result = await writeGovernanceLog(tx, {
      eventType: "pattern_candidate_status_changed",
      component: "pattern_candidates",
      scope: `candidate_id:${input.candidateId}`,
      previousState: { patternStatus: currentState.patternStatus },
      newState: { patternStatus: input.status },
      rationale: input.rationale,
      actorId: input.actorId,
      actorRole: input.actorRole,
    });

    return { success: true, ...result };
  });
}

// ─── 14. Pattern Strategy Boost (system-driven) ───

interface GovernedPatternStrategyBoostInput extends GovernedWriteBase {
  pathId: number;
  patternEntityClusterId: number | null;
  patternConductClusterId: number | null;
  patternConfidence: string;
  patternNotes: string;
}

/**
 * Update strategy path with pattern analysis data — governance logged.
 */
export async function governedPatternStrategyBoost(input: GovernedPatternStrategyBoostInput): Promise<{
  success: boolean;
  seqNo: number;
  entryHash: string;
}> {
  const { strategyPaths } = await import("../drizzle/schema");
  return await db.transaction(async (tx: any) => {
    // T1. Read current state
    const [currentState] = await tx.select().from(strategyPaths)
      .where(eq(strategyPaths.id, input.pathId as any));
    if (!currentState) throw new Error(`Strategy path ${input.pathId} not found`);

    // T2. Apply update
    await tx.update(strategyPaths)
      .set({
        patternEntityClusterId: input.patternEntityClusterId,
        patternConductClusterId: input.patternConductClusterId,
        patternConfidence: input.patternConfidence,
        patternNotes: input.patternNotes,
        updatedAt: Date.now(),
      })
      .where(eq(strategyPaths.id, input.pathId as any));

    // T3. Write governance log
    const result = await writeGovernanceLog(tx, {
      eventType: "pattern_strategy_boost",
      component: "strategy_paths",
      scope: `path_id:${input.pathId}`,
      previousState: {
        patternEntityClusterId: currentState.patternEntityClusterId,
        patternConductClusterId: currentState.patternConductClusterId,
        patternConfidence: currentState.patternConfidence,
        patternNotes: currentState.patternNotes,
      },
      newState: {
        patternEntityClusterId: input.patternEntityClusterId,
        patternConductClusterId: input.patternConductClusterId,
        patternConfidence: input.patternConfidence,
        patternNotes: input.patternNotes,
      },
      rationale: input.rationale,
      actorId: input.actorId,
      actorRole: input.actorRole,
    });

    return { success: true, ...result };
  });
}

// ─── Export all hooks ───

export {
  type GovernedThresholdUpdateInput,
  type GovernedDataStreamToggleInput,
  type GovernedSignalSuppressionInput,
  type GovernedEngineToggleInput,
  type GovernedEngineConfigInput,
  type GovernedCategoryReclassificationInput,
  type GovernedVersionChangeInput,
  type GovernedDataStreamCreateInput,
  type GovernedDataStreamDeleteInput,
  type GovernedDataStreamConfigInput,
  type GovernedStrategyPathUpdateInput,
  type GovernedEngineConfigDBInput,
  type GovernedPatternCandidateStatusInput,
  type GovernedPatternStrategyBoostInput,
};
