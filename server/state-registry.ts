/**
 * State Registry Loader — Session 23
 *
 * Loads state-specific registries (programs, workflow overrides, oversight chains)
 * from /config/states/{state_code}_*.json files. Provides typed lookup functions
 * that overlay federal/generic data with state-specific detail.
 *
 * Architecture:
 * S1. Discover and load state JSON files at module init
 * S2. Build in-memory indexes keyed by state_code + entity type
 * S3. Expose pure lookup functions — no mutations, no side effects
 * S4. Integration helpers that merge state data with unified registry context
 *
 * This module does NOT modify any existing engine behavior. It is an overlay
 * that the unified registry and benefits navigator can optionally query for
 * state-specific enrichment.
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ─── Types ───

export interface StateProgram {
  program_id: string;
  program_name: string;
  agency: string;
  layer: "state" | "county" | "city" | "tribal" | "nonprofit" | "community";
  benefit_category: string;
  eligibility: string;
  phone: string | null;
  website: string | null;
  apply_notes: string;
  source: string | null;
  date_verified: string;
  pipeline_ids: string[];
  tags?: string[];
}

export interface StateWorkflowStep {
  step_number: number;
  action: string;
  documents_needed: string | null;
  state_agency: string | null;
  phone: string | null;
  complaint_portal: string | null;
  deadline: string | null;
  statute: string | null;
  notes: string | null;
  source: string | null;
}

export interface StateWorkflowOverride {
  workflow_id: string;
  state: string;
  steps: StateWorkflowStep[];
}

export interface StateOversightBody {
  oversight_body: string;
  jurisdiction: string;
  phone: string | null;
  complaint_portal: string | null;
  what_to_report: string;
  legal_threshold: string;
  response_timeline: string;
  escalation_next: string | null;
  federal_hook: boolean;
  federal_agency: string | null;
  pattern_threshold: number | null;
  source: string | null;
}

export interface StateOversightChain {
  entity_type: string;
  state: string;
  bodies: StateOversightBody[];
}

export interface StateMeta {
  state: string;
  state_name: string;
  layer: string;
  version: string;
  date_created: string;
  date_verified: string;
  source: string;
}

interface StateProgramsFile {
  meta: StateMeta;
  programs: StateProgram[];
}

interface StateWorkflowsFile {
  meta: StateMeta;
  workflow_overrides: StateWorkflowOverride[];
}

interface StateOversightFile {
  meta: StateMeta;
  oversight_chains: StateOversightChain[];
}

// ─── S1. Discover and load state files ───

const __dirname = dirname(fileURLToPath(import.meta.url));
const statesDir = join(__dirname, "config", "states");

function loadJSON<T>(filepath: string): T {
  const raw = readFileSync(filepath, "utf-8");
  return JSON.parse(raw) as T;
}

function discoverStateFiles(): string[] {
  try {
    return readdirSync(statesDir).filter(f => f.endsWith(".json"));
  } catch {
    return [];
  }
}

// ─── S2. Build in-memory indexes ───

// State code → programs
const programsByState = new Map<string, StateProgram[]>();
// State code → program_id → program
const programIndex = new Map<string, Map<string, StateProgram>>();
// State code → workflow_id → override
const workflowOverrideIndex = new Map<string, Map<string, StateWorkflowOverride>>();
// State code → entity_type → oversight chain
const oversightChainIndex = new Map<string, Map<string, StateOversightChain>>();
// Track loaded states
const loadedStates = new Set<string>();

// Load all discovered state files
for (const file of discoverStateFiles()) {
  const filepath = join(statesDir, file);

  if (file.endsWith("_programs.json")) {
    const data = loadJSON<StateProgramsFile>(filepath);
    const state = data.meta.state;
    loadedStates.add(state);
    programsByState.set(state, data.programs);
    const idx = new Map<string, StateProgram>();
    for (const p of data.programs) {
      idx.set(p.program_id, p);
    }
    programIndex.set(state, idx);
  }

  if (file.endsWith("_workflow_overrides.json")) {
    const data = loadJSON<StateWorkflowsFile>(filepath);
    const state = data.meta.state;
    loadedStates.add(state);
    const idx = new Map<string, StateWorkflowOverride>();
    for (const w of data.workflow_overrides) {
      idx.set(w.workflow_id, w);
    }
    workflowOverrideIndex.set(state, idx);
  }

  if (file.endsWith("_oversight.json")) {
    const data = loadJSON<StateOversightFile>(filepath);
    const state = data.meta.state;
    loadedStates.add(state);
    const idx = new Map<string, StateOversightChain>();
    for (const c of data.oversight_chains) {
      idx.set(c.entity_type, c);
    }
    oversightChainIndex.set(state, idx);
  }
}

// ─── S3. Pure lookup functions ───

/**
 * Get all loaded state codes.
 */
export function getLoadedStates(): string[] {
  return Array.from(loadedStates).sort();
}

/**
 * Check if a state has been loaded.
 */
export function isStateLoaded(stateCode: string): boolean {
  return loadedStates.has(stateCode.toUpperCase());
}

/**
 * Get all programs for a state.
 */
export function getStatePrograms(stateCode: string): StateProgram[] {
  return programsByState.get(stateCode.toUpperCase()) ?? [];
}

/**
 * Get a specific program by state + program_id.
 */
export function getStateProgram(stateCode: string, programId: string): StateProgram | null {
  return programIndex.get(stateCode.toUpperCase())?.get(programId) ?? null;
}

/**
 * Get state programs filtered by benefit category.
 */
export function getStateProgramsByCategory(stateCode: string, category: string): StateProgram[] {
  const programs = programsByState.get(stateCode.toUpperCase());
  if (!programs) return [];
  return programs.filter(p => p.benefit_category === category);
}

/**
 * Get state programs filtered by layer (state, county, city, tribal, nonprofit, community).
 */
export function getStateProgramsByLayer(stateCode: string, layer: StateProgram["layer"]): StateProgram[] {
  const programs = programsByState.get(stateCode.toUpperCase());
  if (!programs) return [];
  return programs.filter(p => p.layer === layer);
}

/**
 * Get state programs that match a specific pipeline_id.
 */
export function getStateProgramsByPipeline(stateCode: string, pipelineId: string): StateProgram[] {
  const programs = programsByState.get(stateCode.toUpperCase());
  if (!programs) return [];
  return programs.filter(p => p.pipeline_ids.includes(pipelineId));
}

/**
 * Get the state-specific workflow override for a given workflow.
 * Returns null if no state override exists (use the federal/generic workflow instead).
 */
export function getStateWorkflowOverride(stateCode: string, workflowId: string): StateWorkflowOverride | null {
  return workflowOverrideIndex.get(stateCode.toUpperCase())?.get(workflowId) ?? null;
}

/**
 * Get all workflow overrides for a state.
 */
export function getStateWorkflowOverrides(stateCode: string): StateWorkflowOverride[] {
  const idx = workflowOverrideIndex.get(stateCode.toUpperCase());
  if (!idx) return [];
  return Array.from(idx.values());
}

/**
 * Get the state-specific oversight chain for an entity type.
 * Returns null if no state chain exists (use the federal/generic chain instead).
 */
export function getStateOversightChain(stateCode: string, entityType: string): StateOversightChain | null {
  return oversightChainIndex.get(stateCode.toUpperCase())?.get(entityType) ?? null;
}

/**
 * Get all oversight chains for a state.
 */
export function getStateOversightChains(stateCode: string): StateOversightChain[] {
  const idx = oversightChainIndex.get(stateCode.toUpperCase());
  if (!idx) return [];
  return Array.from(idx.values());
}

/**
 * Get all oversight bodies across all entity types for a state.
 */
export function getAllStateOversightBodies(stateCode: string): StateOversightBody[] {
  const chains = getStateOversightChains(stateCode);
  return chains.flatMap(c => c.bodies);
}

/**
 * Get state oversight bodies that have federal hooks (for federal escalation).
 */
export function getStateFederalHooks(stateCode: string): StateOversightBody[] {
  return getAllStateOversightBodies(stateCode).filter(b => b.federal_hook);
}

// ─── S4. Integration helpers ───

export interface StateContext {
  state: string;
  programs: StateProgram[];
  workflowOverride: StateWorkflowOverride | null;
  oversightChain: StateOversightChain | null;
  federalHooks: StateOversightBody[];
}

/**
 * Resolve full state context for a pipeline + state combination.
 * This is the primary integration point — given a pipeline_id and state code,
 * return all state-specific programs, workflow overrides, and oversight chains.
 *
 * The entity_type parameter maps the pipeline to the correct oversight chain
 * (e.g., "insurance_denial" → "insurer", "tenant_rights" → "landlord").
 */
export function resolveStateContext(
  stateCode: string,
  pipelineId: string,
  workflowId: string,
  entityType: string
): StateContext | null {
  const state = stateCode.toUpperCase();
  if (!loadedStates.has(state)) return null;

  const programs = getStateProgramsByPipeline(state, pipelineId);
  const workflowOverride = getStateWorkflowOverride(state, workflowId);
  const oversightChain = getStateOversightChain(state, entityType);
  const federalHooks = oversightChain
    ? oversightChain.bodies.filter(b => b.federal_hook)
    : [];

  return {
    state,
    programs,
    workflowOverride,
    oversightChain,
    federalHooks,
  };
}

/**
 * Get registry statistics for a state.
 */
export function getStateRegistryStats(stateCode: string): {
  state: string;
  loaded: boolean;
  programs: number;
  workflow_overrides: number;
  oversight_chains: number;
  oversight_bodies: number;
} {
  const state = stateCode.toUpperCase();
  const programs = programsByState.get(state)?.length ?? 0;
  const workflows = workflowOverrideIndex.get(state)?.size ?? 0;
  const chains = oversightChainIndex.get(state);
  const chainCount = chains?.size ?? 0;
  const bodyCount = chains
    ? Array.from(chains.values()).reduce((sum, c) => sum + c.bodies.length, 0)
    : 0;

  return {
    state,
    loaded: loadedStates.has(state),
    programs,
    workflow_overrides: workflows,
    oversight_chains: chainCount,
    oversight_bodies: bodyCount,
  };
}

/**
 * Get global state registry statistics.
 */
export function getGlobalStateStats(): {
  states_loaded: number;
  state_codes: string[];
  total_programs: number;
  total_workflow_overrides: number;
  total_oversight_chains: number;
  total_oversight_bodies: number;
} {
  let totalPrograms = 0;
  let totalWorkflows = 0;
  let totalChains = 0;
  let totalBodies = 0;

  for (const state of Array.from(loadedStates)) {
    const stats = getStateRegistryStats(state);
    totalPrograms += stats.programs;
    totalWorkflows += stats.workflow_overrides;
    totalChains += stats.oversight_chains;
    totalBodies += stats.oversight_bodies;
  }

  return {
    states_loaded: loadedStates.size,
    state_codes: Array.from(loadedStates).sort(),
    total_programs: totalPrograms,
    total_workflow_overrides: totalWorkflows,
    total_oversight_chains: totalChains,
    total_oversight_bodies: totalBodies,
  };
}
