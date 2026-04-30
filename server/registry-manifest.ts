/**
 * Registry Manifest System — Session 28
 *
 * Provides validation, discovery, and dynamic loading for state registries.
 * Each state registry includes a manifest.json that declares which datasets,
 * pipelines, oversight entities, and policy flags the state supports.
 *
 * Architecture:
 * M1. Load and parse manifest files from /config/states/{state}_manifest.json
 * M2. Validate manifest schema and cross-reference integrity
 * M3. Validate that declared datasets exist as actual JSON files
 * M4. Provide dynamic loading: loadRegistry(state) reads manifest, validates, returns typed context
 * M5. Provide registry statistics and comparison across states
 *
 * This module does NOT modify existing engines. It is a validation and discovery
 * layer that prevents incomplete or incompatible registries from loading.
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ─── Types ───

export interface RegistryManifest {
  state: string;
  state_name: string;
  version: string;
  schema: string;
  date_created: string;
  date_verified: string;
  source: string;
  datasets: string[];
  pipelines_supported: string[];
  oversight_entities: string[];
  policy_flags: string[];
  statistics: {
    programs: {
      total_programs: number;
      categories: Record<string, number>;
      layers: string[];
    };
    workflows: {
      total_workflows: number;
      total_steps: number;
    };
    oversight: {
      total_entity_types: number;
      total_oversight_bodies: number;
      pattern_threshold_coverage: string;
    };
  };
}

export interface ValidationError {
  code: string;
  severity: "error" | "warning";
  message: string;
  field?: string;
}

export interface ValidationResult {
  state: string;
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export interface LoadedRegistry {
  manifest: RegistryManifest;
  validation: ValidationResult;
  datasets_loaded: string[];
}

export interface RegistryComparison {
  states: string[];
  shared_pipelines: string[];
  shared_oversight_entities: string[];
  shared_datasets: string[];
  coverage_matrix: Record<string, {
    pipelines: string[];
    oversight_entities: string[];
    datasets: string[];
    total_programs: number;
    total_oversight_bodies: number;
  }>;
}

// ─── Constants ───

const CURRENT_SCHEMA = "luminari-registry-v1";
const REQUIRED_DATASETS = ["programs", "workflows", "oversight"];
const REQUIRED_MANIFEST_FIELDS = [
  "state", "state_name", "version", "schema",
  "datasets", "pipelines_supported", "oversight_entities"
];

// Dataset name → file suffix mapping
const DATASET_FILE_MAP: Record<string, string> = {
  programs: "_programs.json",
  workflows: "_workflow_overrides.json",
  oversight: "_oversight.json",
};

// ─── M1. Load manifest files ───

const __dirname = dirname(fileURLToPath(import.meta.url));
const statesDir = join(__dirname, "config", "states");

function loadJSON<T>(filepath: string): T {
  const raw = readFileSync(filepath, "utf-8");
  return JSON.parse(raw) as T;
}

function discoverManifests(): Map<string, RegistryManifest> {
  const manifests = new Map<string, RegistryManifest>();
  try {
    const files = readdirSync(statesDir).filter(f => f.endsWith("_manifest.json"));
    for (const file of files) {
      const filepath = join(statesDir, file);
      const manifest = loadJSON<RegistryManifest>(filepath);
      manifests.set(manifest.state, manifest);
    }
  } catch {
    // States directory may not exist in test environments
  }
  return manifests;
}

// Load all manifests at module init
const manifestIndex = discoverManifests();

// ─── M2. Validate manifest schema ───

function validateManifestSchema(manifest: RegistryManifest): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check required fields
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    const value = (manifest as unknown as Record<string, unknown>)[field];
    if (value === undefined || value === null) {
      errors.push({
        code: "MISSING_REQUIRED_FIELD",
        severity: "error",
        message: `Missing required field: ${field}`,
        field,
      });
    }
  }

  // Check schema version
  if (manifest.schema && manifest.schema !== CURRENT_SCHEMA) {
    errors.push({
      code: "SCHEMA_VERSION_MISMATCH",
      severity: "warning",
      message: `Schema version '${manifest.schema}' does not match current '${CURRENT_SCHEMA}'`,
      field: "schema",
    });
  }

  // Check state code format (2 uppercase letters)
  if (manifest.state && !/^[A-Z]{2}$/.test(manifest.state)) {
    errors.push({
      code: "INVALID_STATE_CODE",
      severity: "error",
      message: `State code '${manifest.state}' must be exactly 2 uppercase letters`,
      field: "state",
    });
  }

  // Check version format (semver-like)
  if (manifest.version && !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    errors.push({
      code: "INVALID_VERSION_FORMAT",
      severity: "warning",
      message: `Version '${manifest.version}' should follow semver format (e.g., 1.0.0)`,
      field: "version",
    });
  }

  // Check arrays are non-empty
  if (manifest.datasets && manifest.datasets.length === 0) {
    errors.push({
      code: "EMPTY_DATASETS",
      severity: "error",
      message: "Datasets array must not be empty",
      field: "datasets",
    });
  }

  if (manifest.pipelines_supported && manifest.pipelines_supported.length === 0) {
    errors.push({
      code: "EMPTY_PIPELINES",
      severity: "warning",
      message: "No pipelines declared — state registry may have limited utility",
      field: "pipelines_supported",
    });
  }

  return errors;
}

// ─── M3. Validate dataset files exist ───

function validateDatasetFiles(manifest: RegistryManifest): ValidationError[] {
  const errors: ValidationError[] = [];
  const statePrefix = manifest.state.toLowerCase();

  // Check required datasets
  const datasets = manifest.datasets || [];
  for (const required of REQUIRED_DATASETS) {
    if (!datasets.includes(required)) {
      errors.push({
        code: "MISSING_REQUIRED_DATASET",
        severity: "error",
        message: `Required dataset '${required}' not declared in manifest`,
        field: "datasets",
      });
    }
  }

  // Check declared datasets have corresponding files
  for (const dataset of datasets) {
    const suffix = DATASET_FILE_MAP[dataset];
    if (!suffix) {
      errors.push({
        code: "UNKNOWN_DATASET_TYPE",
        severity: "warning",
        message: `Unknown dataset type '${dataset}' — no file mapping defined`,
        field: "datasets",
      });
      continue;
    }

    const filepath = join(statesDir, `${statePrefix}${suffix}`);
    if (!existsSync(filepath)) {
      errors.push({
        code: "DATASET_FILE_MISSING",
        severity: "error",
        message: `Dataset '${dataset}' declared but file '${statePrefix}${suffix}' not found`,
        field: "datasets",
      });
    }
  }

  return errors;
}

// ─── M4. Validate cross-references ───

function validateCrossReferences(manifest: RegistryManifest): ValidationError[] {
  const errors: ValidationError[] = [];
  const statePrefix = manifest.state.toLowerCase();

  // If oversight dataset exists, check that oversight_entities match actual chains
  if ((manifest.datasets || []).includes("oversight")) {
    const oversightPath = join(statesDir, `${statePrefix}_oversight.json`);
    if (existsSync(oversightPath)) {
      try {
        const data = loadJSON<{ oversight_chains: Array<{ entity_type: string }> }>(oversightPath);
        const actualEntities = data.oversight_chains.map(c => c.entity_type);

        for (const declared of (manifest.oversight_entities || [])) {
          if (!actualEntities.includes(declared)) {
            errors.push({
              code: "OVERSIGHT_ENTITY_MISMATCH",
              severity: "warning",
              message: `Oversight entity '${declared}' declared in manifest but not found in oversight file`,
              field: "oversight_entities",
            });
          }
        }

        for (const actual of actualEntities) {
          if (!(manifest.oversight_entities || []).includes(actual)) {
            errors.push({
              code: "UNDECLARED_OVERSIGHT_ENTITY",
              severity: "warning",
              message: `Oversight entity '${actual}' found in file but not declared in manifest`,
              field: "oversight_entities",
            });
          }
        }
      } catch {
        errors.push({
          code: "OVERSIGHT_FILE_PARSE_ERROR",
          severity: "error",
          message: `Failed to parse oversight file for cross-reference validation`,
        });
      }
    }
  }

  // If workflows dataset exists, check that pipelines_supported match actual workflows
  if ((manifest.datasets || []).includes("workflows")) {
    const workflowPath = join(statesDir, `${statePrefix}_workflow_overrides.json`);
    if (existsSync(workflowPath)) {
      try {
        const data = loadJSON<{ workflow_overrides: Array<{ workflow_id: string }> }>(workflowPath);
        const actualWorkflows = data.workflow_overrides.map(w => w.workflow_id);

        // Map workflow_id to pipeline_id for comparison
        const workflowToPipeline: Record<string, string> = {
          tenant_rights_workflow: "housing_violation",
          wage_theft_workflow: "wage_theft",
          benefits_denial_workflow: "benefits_denial",
          insurance_claim_denial_workflow: "insurance_claim_denial",
          elder_abuse_workflow: "elder_abuse",
          workplace_discrimination_workflow: "workplace_discrimination",
        };

        const actualPipelines = actualWorkflows.map(w => workflowToPipeline[w] || w.replace("_workflow", ""));

        for (const declared of (manifest.pipelines_supported || [])) {
          if (!actualPipelines.includes(declared)) {
            errors.push({
              code: "PIPELINE_WORKFLOW_MISMATCH",
              severity: "warning",
              message: `Pipeline '${declared}' declared but no matching workflow found`,
              field: "pipelines_supported",
            });
          }
        }
      } catch {
        errors.push({
          code: "WORKFLOW_FILE_PARSE_ERROR",
          severity: "error",
          message: `Failed to parse workflow file for cross-reference validation`,
        });
      }
    }
  }

  // Validate statistics match actual data
  if (manifest.statistics?.programs?.total_programs !== undefined) {
    const programsPath = join(statesDir, `${statePrefix}_programs.json`);
    if (existsSync(programsPath)) {
      try {
        const data = loadJSON<{ programs: unknown[] }>(programsPath);
        const actualCount = data.programs.length;
        const declaredCount = manifest.statistics.programs.total_programs;
        if (actualCount !== declaredCount) {
          errors.push({
            code: "STATISTICS_MISMATCH",
            severity: "warning",
            message: `Manifest declares ${declaredCount} programs but file contains ${actualCount}`,
            field: "statistics.programs.total_programs",
          });
        }
      } catch {
        // Skip if file can't be parsed
      }
    }
  }

  return errors;
}

// ─── Public API ───

/**
 * Validate a state registry against its manifest.
 * T1. Load manifest for the given state code.
 * T2. Run schema validation on manifest fields.
 * T3. Run dataset file existence checks.
 * T4. Run cross-reference validation against actual data files.
 * T5. Return ValidationResult with errors and warnings separated.
 */
export function validateRegistry(stateCode: string): ValidationResult {
  const manifest = manifestIndex.get(stateCode);

  if (!manifest) {
    return {
      state: stateCode,
      valid: false,
      errors: [{
        code: "MANIFEST_NOT_FOUND",
        severity: "error",
        message: `No manifest found for state '${stateCode}'`,
      }],
      warnings: [],
    };
  }

  const allIssues = [
    ...validateManifestSchema(manifest),
    ...validateDatasetFiles(manifest),
    ...validateCrossReferences(manifest),
  ];

  const errors = allIssues.filter(e => e.severity === "error");
  const warnings = allIssues.filter(e => e.severity === "warning");

  return {
    state: stateCode,
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Load a state registry dynamically using its manifest.
 * T1. Read manifest.json for the state.
 * T2. Validate the manifest.
 * T3. If validation passes, confirm datasets are loadable.
 * T4. Return LoadedRegistry with manifest, validation result, and loaded dataset list.
 */
export function loadRegistry(stateCode: string): LoadedRegistry {
  const validation = validateRegistry(stateCode);
  const manifest = manifestIndex.get(stateCode);

  if (!manifest || !validation.valid) {
    return {
      manifest: manifest || {} as RegistryManifest,
      validation,
      datasets_loaded: [],
    };
  }

  // Confirm which datasets are actually loadable
  const statePrefix = stateCode.toLowerCase();
  const loaded: string[] = [];

  for (const dataset of (manifest.datasets || [])) {
    const suffix = DATASET_FILE_MAP[dataset];
    if (suffix) {
      const filepath = join(statesDir, `${statePrefix}${suffix}`);
      if (existsSync(filepath)) {
        loaded.push(dataset);
      }
    }
  }

  return {
    manifest,
    validation,
    datasets_loaded: loaded,
  };
}

/**
 * Get the manifest for a specific state.
 * Returns undefined if no manifest exists.
 */
export function getManifest(stateCode: string): RegistryManifest | undefined {
  return manifestIndex.get(stateCode);
}

/**
 * Get all loaded state codes that have manifests.
 */
export function getRegisteredStates(): string[] {
  return Array.from(manifestIndex.keys()).sort();
}

/**
 * Check if a state supports a specific pipeline.
 */
export function stateSupportssPipeline(stateCode: string, pipelineId: string): boolean {
  const manifest = manifestIndex.get(stateCode);
  if (!manifest) return false;
  return (manifest.pipelines_supported || []).includes(pipelineId);
}

/**
 * Check if a state has a specific dataset.
 */
export function stateHasDataset(stateCode: string, dataset: string): boolean {
  const manifest = manifestIndex.get(stateCode);
  if (!manifest) return false;
  return (manifest.datasets || []).includes(dataset);
}

/**
 * Check if a state has a specific policy flag active.
 */
export function statePolicyActive(stateCode: string, policyFlag: string): boolean {
  const manifest = manifestIndex.get(stateCode);
  if (!manifest) return false;
  return (manifest.policy_flags || []).includes(policyFlag);
}

/**
 * Get all states that support a given pipeline.
 */
export function getStatesForPipeline(pipelineId: string): string[] {
  const states: string[] = [];
  for (const state of Array.from(manifestIndex.keys())) {
    const m = manifestIndex.get(state)!;
    if ((m.pipelines_supported || []).includes(pipelineId)) {
      states.push(state);
    }
  }
  return states.sort();
}

/**
 * Get all states that have a specific oversight entity type.
 */
export function getStatesWithOversight(entityType: string): string[] {
  const states: string[] = [];
  for (const state of Array.from(manifestIndex.keys())) {
    const m = manifestIndex.get(state)!;
    if ((m.oversight_entities || []).includes(entityType)) {
      states.push(state);
    }
  }
  return states.sort();
}

/**
 * Compare registries across all loaded states.
 * T1. Collect all manifests.
 * T2. Compute intersection of pipelines, oversight entities, datasets.
 * T3. Build coverage matrix showing what each state provides.
 */
export function compareRegistries(): RegistryComparison {
  const states = getRegisteredStates();

  if (states.length === 0) {
    return {
      states: [],
      shared_pipelines: [],
      shared_oversight_entities: [],
      shared_datasets: [],
      coverage_matrix: {},
    };
  }

  // Collect all values
  const allPipelines = states.map(s => new Set(manifestIndex.get(s)!.pipelines_supported || []));
  const allEntities = states.map(s => new Set(manifestIndex.get(s)!.oversight_entities || []));
  const allDatasets = states.map(s => new Set(manifestIndex.get(s)!.datasets || []));

  // Compute intersections
  const intersect = <T>(sets: Set<T>[]): T[] => {
    if (sets.length === 0) return [];
    let result = new Set(sets[0]);
    for (let i = 1; i < sets.length; i++) {
      result = new Set(Array.from(result).filter(x => sets[i].has(x)));
    }
    return Array.from(result).sort() as T[];
  };

  const shared_pipelines = intersect(allPipelines);
  const shared_oversight_entities = intersect(allEntities);
  const shared_datasets = intersect(allDatasets);

  // Build coverage matrix
  const coverage_matrix: RegistryComparison["coverage_matrix"] = {};
  for (const state of states) {
    const m = manifestIndex.get(state)!;
    coverage_matrix[state] = {
      pipelines: m.pipelines_supported || [],
      oversight_entities: m.oversight_entities || [],
      datasets: m.datasets || [],
      total_programs: m.statistics?.programs?.total_programs || 0,
      total_oversight_bodies: m.statistics?.oversight?.total_oversight_bodies || 0,
    };
  }

  return {
    states,
    shared_pipelines,
    shared_oversight_entities,
    shared_datasets,
    coverage_matrix,
  };
}

/**
 * Get aggregate statistics across all registered states.
 */
export function getManifestStats(): {
  total_states: number;
  total_programs: number;
  total_oversight_bodies: number;
  total_workflows: number;
  total_policy_flags: number;
  states: Array<{
    state: string;
    state_name: string;
    version: string;
    programs: number;
    workflows: number;
    oversight_bodies: number;
    pipelines: number;
    policy_flags: number;
  }>;
} {
  const states = getRegisteredStates();
  let totalPrograms = 0;
  let totalBodies = 0;
  let totalWorkflows = 0;
  let totalFlags = 0;

  const stateDetails = states.map(s => {
    const m = manifestIndex.get(s)!;
    const programs = m.statistics?.programs?.total_programs || 0;
    const workflows = m.statistics?.workflows?.total_workflows || 0;
    const bodies = m.statistics?.oversight?.total_oversight_bodies || 0;
    const flags = m.policy_flags?.length || 0;

    totalPrograms += programs;
    totalBodies += bodies;
    totalWorkflows += workflows;
    totalFlags += flags;

    return {
      state: m.state,
      state_name: m.state_name,
      version: m.version,
      programs,
      workflows,
      oversight_bodies: bodies,
      pipelines: m.pipelines_supported?.length || 0,
      policy_flags: flags,
    };
  });

  return {
    total_states: states.length,
    total_programs: totalPrograms,
    total_oversight_bodies: totalBodies,
    total_workflows: totalWorkflows,
    total_policy_flags: totalFlags,
    states: stateDetails,
  };
}
