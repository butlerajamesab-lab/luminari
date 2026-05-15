/**
 * Unified Registry Loader — Session 22
 *
 * Read-only integration layer that loads the unified pipeline registry and its
 * modular sub-registries (workflows, oversight, records entitlements). Provides
 * typed lookup functions consumed by the pipeline resolver, benefits navigator,
 * FOIA generator, and future UI surfaces.
 *
 * Architecture:
 * T1. Load JSON files at module init (same pattern as lens-engine, pipeline-resolver)
 * T2. Build in-memory indexes keyed by pipeline_id, workflow_id, entity_id, record_id
 * T3. Expose pure lookup functions — no mutations, no side effects
 * T4. Cross-reference helpers resolve pipeline_id → lenses, benefits, records, oversight, workflow
 *
 * This module does NOT modify any existing engine behavior. It is an overlay
 * that existing systems can optionally query for enriched context.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ─── Types ───

export interface UnifiedPipeline {
  pipeline_id: string;
  category: string;
  description: string;
  aliases: string[];
  default_lenses: string[];
  situations: string[];
  benefit_categories: string[];
  program_ids: string[];
  records_entitlements: string[];
  foia_profile: {
    agencies: string[];
    record_types: string[];
    pathways: string[];
  };
  workflow_id: string;
  oversight_entities: string[];
  pattern_signals: string[];
  escalation_profile: {
    primary: string;
    secondary: string;
    federal_hook: string;
  };
}

export interface WorkflowStep {
  step_id: number;
  label: string;
  description: string;
  required: boolean;
  outputs: string[];
}

export interface Workflow {
  workflow_id: string;
  label: string;
  category: string;
  steps: WorkflowStep[];
}

export interface OversightEntity {
  entity_id: string;
  label: string;
  type: string;
  jurisdiction: string;
  description: string;
  complaint_pathway: string;
  website_pattern: string;
  applicable_pipelines: string[];
}

export interface RecordEntitlement {
  record_id: string;
  label: string;
  custodian: string;
  legal_basis: string;
  acquisition_pathway: string;
  typical_cost: string;
  typical_turnaround: string;
  applicable_pipelines: string[];
}

export interface PipelineContext {
  pipeline: UnifiedPipeline;
  workflow: Workflow | null;
  oversight: OversightEntity[];
  records: RecordEntitlement[];
}

// ─── T1. Load JSON at module init ───

const __dirname = dirname(fileURLToPath(import.meta.url));
const configDir = join(__dirname, "config");

function loadJSON<T>(filename: string): T {
  const raw = readFileSync(join(configDir, filename), "utf-8");
  return JSON.parse(raw) as T;
}

interface UnifiedRegistryFile {
  version: string;
  pipelines: UnifiedPipeline[];
}

interface WorkflowsFile {
  version: string;
  workflows: Workflow[];
}

interface OversightFile {
  version: string;
  entities: OversightEntity[];
}

interface RecordsFile {
  version: string;
  records: RecordEntitlement[];
}

const unifiedData = loadJSON<UnifiedRegistryFile>("unified_pipeline_registry.json");
const workflowData = loadJSON<WorkflowsFile>("workflows.json");
const oversightData = loadJSON<OversightFile>("oversight_registry.json");
const recordsData = loadJSON<RecordsFile>("records_entitlements.json");

// ─── T2. Build in-memory indexes ───

const pipelineIndex = new Map<string, UnifiedPipeline>();
for (const p of unifiedData.pipelines) {
  pipelineIndex.set(p.pipeline_id, p);
}

const workflowIndex = new Map<string, Workflow>();
for (const w of workflowData.workflows) {
  workflowIndex.set(w.workflow_id, w);
}

const oversightIndex = new Map<string, OversightEntity>();
for (const e of oversightData.entities) {
  oversightIndex.set(e.entity_id, e);
}

const recordIndex = new Map<string, RecordEntitlement>();
for (const r of recordsData.records) {
  recordIndex.set(r.record_id, r);
}

// ─── T3. Pure lookup functions ───

/**
 * Get a unified pipeline entry by pipeline_id.
 * Returns null if the pipeline is not in the unified registry (i.e., not yet expanded).
 */
export function getUnifiedPipeline(pipelineId: string): UnifiedPipeline | null {
  return pipelineIndex.get(pipelineId) ?? null;
}

/**
 * Get all unified pipeline entries.
 */
export function getAllUnifiedPipelines(): UnifiedPipeline[] {
  return unifiedData.pipelines;
}

/**
 * Get unified pipelines by category.
 */
export function getUnifiedPipelinesByCategory(category: string): UnifiedPipeline[] {
  return unifiedData.pipelines.filter(p => p.category === category);
}

/**
 * Get a workflow by workflow_id.
 */
export function getWorkflow(workflowId: string): Workflow | null {
  return workflowIndex.get(workflowId) ?? null;
}

/**
 * Get an oversight entity by entity_id.
 */
export function getOversightEntity(entityId: string): OversightEntity | null {
  return oversightIndex.get(entityId) ?? null;
}

/**
 * Get all oversight entities applicable to a pipeline.
 */
export function getOversightForPipeline(pipelineId: string): OversightEntity[] {
  const pipeline = pipelineIndex.get(pipelineId);
  if (!pipeline) return [];
  return pipeline.oversight_entities
    .map(id => oversightIndex.get(id))
    .filter((e): e is OversightEntity => e != null);
}

/**
 * Get a record entitlement by record_id.
 */
export function getRecordEntitlement(recordId: string): RecordEntitlement | null {
  return recordIndex.get(recordId) ?? null;
}

/**
 * Get all record entitlements applicable to a pipeline.
 */
export function getRecordsForPipeline(pipelineId: string): RecordEntitlement[] {
  const pipeline = pipelineIndex.get(pipelineId);
  if (!pipeline) return [];
  return pipeline.records_entitlements
    .map(id => recordIndex.get(id))
    .filter((r): r is RecordEntitlement => r != null);
}

/**
 * Get all oversight entities for a given jurisdiction level.
 */
export function getOversightByJurisdiction(jurisdiction: "local" | "state" | "federal" | "national"): OversightEntity[] {
  return oversightData.entities.filter(e => e.jurisdiction === jurisdiction);
}

/**
 * Get all records entitlements for a given pipeline category (across all pipelines in that category).
 */
export function getRecordsByCategory(category: string): RecordEntitlement[] {
  const pipelines = unifiedData.pipelines.filter(p => p.category === category);
  const recordIds = new Set<string>();
  for (const p of pipelines) {
    for (const rid of p.records_entitlements) {
      recordIds.add(rid);
    }
  }
  return Array.from(recordIds)
    .map(id => recordIndex.get(id))
    .filter((r): r is RecordEntitlement => r != null);
}

// ─── T4. Cross-reference resolver ───

/**
 * Resolve full pipeline context: pipeline entry + workflow + oversight entities + record entitlements.
 * This is the primary integration point — given a pipeline_id, return everything the system
 * knows about that pipeline's support structure.
 *
 * Returns null if the pipeline is not in the unified registry.
 */
export function resolvePipelineContext(pipelineId: string): PipelineContext | null {
  const pipeline = pipelineIndex.get(pipelineId);
  if (!pipeline) return null;

  const workflow = workflowIndex.get(pipeline.workflow_id) ?? null;

  const oversight = pipeline.oversight_entities
    .map(id => oversightIndex.get(id))
    .filter((e): e is OversightEntity => e != null);

  const records = pipeline.records_entitlements
    .map(id => recordIndex.get(id))
    .filter((r): r is RecordEntitlement => r != null);

  return { pipeline, workflow, oversight, records };
}

/**
 * Check whether a pipeline_id has a unified registry entry.
 * Useful for conditional enrichment: if true, the system can offer
 * workflow guidance, oversight referrals, and records acquisition paths.
 */
export function hasUnifiedEntry(pipelineId: string): boolean {
  return pipelineIndex.has(pipelineId);
}

/**
 * Get registry statistics for diagnostics.
 */
export function getRegistryStats(): {
  unified_pipelines: number;
  workflows: number;
  oversight_entities: number;
  record_entitlements: number;
  version: string;
} {
  return {
    unified_pipelines: unifiedData.pipelines.length,
    workflows: workflowData.workflows.length,
    oversight_entities: oversightData.entities.length,
    record_entitlements: recordsData.records.length,
    version: unifiedData.version,
  };
}
