/**
 * Registry Activation Engine
 *
 * Validates, activates, and resolves state registries for runtime use.
 *
 * Architecture:
 *   T1. validateExtractedRegistry(stateCode) → full validation of all datasets
 *   T2. activateRegistry(stateCode) → flip manifest to "active" status
 *   T3. resolveRegistryLayers(stateCode, context) → deterministic runtime resolution
 *   T4. smokeTest(stateCode, scenario) → run scenario through resolution engine
 *   T5. getActivationStats() → global statistics for all active registries
 */

import { readFileSync, existsSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ValidationError {
  dataset: string;
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  state: string;
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  datasets_checked: string[];
  summary: {
    total_checks: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}

export interface RegistryContext {
  pipeline_id: string;
  region?: string;
  county?: string;
  demographics?: {
    tribal_affiliation?: boolean;
    immigration_status?: string;
    age_group?: string;
  };
  situation?: string;
}

export interface ResolvedLayer {
  layer_name: string;
  applied: boolean;
  data: Record<string, unknown>;
}

export interface RegistryResolution {
  state: string;
  pipeline_id: string;
  resolution_order: readonly string[];
  layers: ResolvedLayer[];
  programs: Array<{
    program_id: string;
    program_name: string;
    layer: string;
    region: string;
  }>;
  workflow: {
    workflow_id: string | null;
    steps: Array<{ step_number: number; action: string; deadline_days?: number | null }>;
    escalation_rules: Array<{ step_index: number; escalation_type: string; description: string }>;
  } | null;
  oversight_chains: Array<{
    entity_type: string;
    bodies: Array<{ body_id: string; body_name: string }>;
  }>;
  layer0_flags: Array<{
    flag_id: string;
    label: string;
    severity: string;
  }>;
  layer1_cards: Array<{
    card_id: string;
    program_name: string;
    cluster: string;
    urgency: string;
  }>;
  foia_restrictions: string[];
  county_overrides: Record<string, unknown> | null;
  tribal_overrides: {
    icwa_activated: boolean;
    tribal_entities: Array<{ entity_id: string; entity_name: string }>;
  } | null;
  lens_activations: Array<{
    lens_id: string;
    state_parameters: Record<string, unknown>;
    priority_boost: number;
  }>;
  federal_baseline: {
    statutes: Array<{ statute_id: string; title: string }>;
    deadlines: Array<{ pipeline_id: string; deadline_days: number; description: string }>;
    escalation_hooks: Array<{ hook_id: string; description: string }>;
  };
  deterministic: boolean;
}

export interface SmokeTestResult {
  scenario_name: string;
  pipeline_id: string;
  region?: string;
  passed: boolean;
  expectations: Array<{
    description: string;
    expected: boolean;
    actual: boolean;
  }>;
  resolution: RegistryResolution;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILE LOADING
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG_DIR = join(__dirname, "config", "states");

function loadStateJSON<T>(stateCode: string, suffix: string): T | null {
  const filePath = join(CONFIG_DIR, `${stateCode.toLowerCase()}_${suffix}.json`);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

// ═══════════════════════════════════════════════════════════════════════════════
// T1. VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

export function validateExtractedRegistry(stateCode: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const datasetsChecked: string[] = [];
  let totalChecks = 0;
  let passed = 0;

  const sc = stateCode.toLowerCase();

  // Load canonical pipeline IDs
  const pipelineTypesPath = join(__dirname, "config", "pipeline_types.json");
  const pipelineTypes = JSON.parse(readFileSync(pipelineTypesPath, "utf-8"));
  const canonicalPipelines = new Set<string>(pipelineTypes.all_canonical_ids);

  // Load canonical lens IDs
  const lensRegistryPath = join(__dirname, "config", "lens_registry.json");
  const lensRegistry = JSON.parse(readFileSync(lensRegistryPath, "utf-8"));
  const canonicalLenses = new Set<string>();
  for (const cat of ["structural_lenses", "domain_lenses", "interpretive_lenses"]) {
    for (const lens of lensRegistry[cat] || []) {
      canonicalLenses.add(lens.lens_id);
    }
  }

  // ─── 1. Programs ───────────────────────────────────────────────────────────
  const programs = loadStateJSON<any>(sc, "programs");
  if (programs) {
    datasetsChecked.push("programs");
    const programIds = new Set<string>();
    for (const p of programs.programs) {
      totalChecks++;
      if (programIds.has(p.program_id)) {
        errors.push({ dataset: "programs", field: "program_id", message: `Duplicate program_id: ${p.program_id}`, severity: "error" });
      } else {
        programIds.add(p.program_id);
        passed++;
      }

      // Validate pipeline_ids reference canonical
      for (const pid of p.pipeline_ids || []) {
        totalChecks++;
        if (canonicalPipelines.has(pid)) {
          passed++;
        } else {
          errors.push({ dataset: "programs", field: "pipeline_ids", message: `Program ${p.program_id} references non-canonical pipeline: ${pid}`, severity: "error" });
        }
      }

      // Validate required fields
      totalChecks++;
      if (p.program_name && p.layer && p.region) {
        passed++;
      } else {
        errors.push({ dataset: "programs", field: "required_fields", message: `Program ${p.program_id} missing required fields`, severity: "error" });
      }
    }
  } else {
    errors.push({ dataset: "programs", field: "file", message: "Programs file not found", severity: "error" });
  }

  // ─── 2. Workflow Overrides ─────────────────────────────────────────────────
  const workflows = loadStateJSON<any>(sc, "workflow_overrides");
  if (workflows) {
    datasetsChecked.push("workflow_overrides");
    const workflowIds = new Set<string>();
    for (const w of workflows.workflow_overrides) {
      totalChecks++;
      if (workflowIds.has(w.workflow_id)) {
        errors.push({ dataset: "workflow_overrides", field: "workflow_id", message: `Duplicate workflow_id: ${w.workflow_id}`, severity: "error" });
      } else {
        workflowIds.add(w.workflow_id);
        passed++;
      }

      // Validate steps
      totalChecks++;
      if (w.steps && w.steps.length > 0) {
        passed++;
      } else {
        errors.push({ dataset: "workflow_overrides", field: "steps", message: `Workflow ${w.workflow_id} has no steps`, severity: "error" });
      }

      // Validate workflow_id format
      totalChecks++;
      if (w.workflow_id.endsWith("_workflow")) {
        passed++;
      } else {
        warnings.push({ dataset: "workflow_overrides", field: "workflow_id", message: `Workflow ${w.workflow_id} does not follow _workflow naming convention`, severity: "warning" });
      }
    }
  } else {
    errors.push({ dataset: "workflow_overrides", field: "file", message: "Workflow overrides file not found", severity: "error" });
  }

  // ─── 3. Oversight ─────────────────────────────────────────────────────────
  const oversight = loadStateJSON<any>(sc, "oversight");
  if (oversight) {
    datasetsChecked.push("oversight");
    const bodyIds = new Set<string>();
    for (const chain of (oversight.oversight_chains || [])) {
      totalChecks++;
      if (chain.entity_type && chain.bodies && chain.bodies.length > 0) {
        passed++;
      } else {
        errors.push({ dataset: "oversight", field: "entity_type", message: `Oversight chain missing entity_type or bodies`, severity: "error" });
      }

      for (const body of (chain.bodies || [])) {
        totalChecks++;
        const bodyKey = body.body_id || body.oversight_body;
        // Bodies can appear in multiple entity_type chains (e.g., AG Consumer Protection serves both insurer and landlord chains)
        const compositeKey = `${chain.entity_type}::${bodyKey}`;
        if (bodyIds.has(compositeKey)) {
          errors.push({ dataset: "oversight", field: "body_id", message: `Duplicate oversight body: ${bodyKey} in ${chain.entity_type}`, severity: "error" });
        } else {
          bodyIds.add(compositeKey);
          passed++;
        }

        // Validate pattern_threshold
        totalChecks++;
        if (body.pattern_threshold !== undefined && body.pattern_threshold !== null) {
          passed++;
        } else {
          warnings.push({ dataset: "oversight", field: "pattern_threshold", message: `Body ${body.body_id} missing pattern_threshold`, severity: "warning" });
        }
      }
    }
  } else {
    errors.push({ dataset: "oversight", field: "file", message: "Oversight file not found", severity: "error" });
  }

  // ─── 4. Layer 0 Flags ─────────────────────────────────────────────────────
  const layer0 = loadStateJSON<any>(sc, "layer0_flags");
  if (layer0) {
    datasetsChecked.push("layer0_flags");
    const flagIds = new Set<string>();
    for (const flag of layer0.flags) {
      totalChecks++;
      if (flagIds.has(flag.flag_id)) {
        errors.push({ dataset: "layer0_flags", field: "flag_id", message: `Duplicate flag_id: ${flag.flag_id}`, severity: "error" });
      } else {
        flagIds.add(flag.flag_id);
        passed++;
      }

      totalChecks++;
      if (["info", "warning", "alert", "high"].includes(flag.severity)) {
        passed++;
      } else {
        errors.push({ dataset: "layer0_flags", field: "severity", message: `Flag ${flag.flag_id} has invalid severity: ${flag.severity}`, severity: "error" });
      }
    }
  } else {
    errors.push({ dataset: "layer0_flags", field: "file", message: "Layer 0 flags file not found", severity: "error" });
  }

  // ─── 5. Layer 1 Cards ─────────────────────────────────────────────────────
  const layer1 = loadStateJSON<any>(sc, "layer1_cards");
  if (layer1) {
    datasetsChecked.push("layer1_cards");
    const cardIds = new Set<string>();
    for (const cluster of layer1.clusters) {
      totalChecks++;
      if (cluster.cluster_id && cluster.cards && cluster.cards.length > 0) {
        passed++;
      } else {
        errors.push({ dataset: "layer1_cards", field: "cluster", message: `Cluster missing cluster_id or cards`, severity: "error" });
      }

      for (const card of cluster.cards) {
        totalChecks++;
        if (cardIds.has(card.card_id)) {
          errors.push({ dataset: "layer1_cards", field: "card_id", message: `Duplicate card_id: ${card.card_id}`, severity: "error" });
        } else {
          cardIds.add(card.card_id);
          passed++;
        }
      }
    }
  } else {
    errors.push({ dataset: "layer1_cards", field: "file", message: "Layer 1 cards file not found", severity: "error" });
  }

  // ─── 6. FOIA ──────────────────────────────────────────────────────────────
  const foia = loadStateJSON<any>(sc, "foia");
  if (foia) {
    datasetsChecked.push("foia");
    totalChecks++;
    if (foia.statute && foia.statute.name) {
      passed++;
    } else {
      errors.push({ dataset: "foia", field: "statute", message: "FOIA missing statute information", severity: "error" });
    }

    // Validate agencies
    const agencyIds = new Set<string>();
    for (const agency of foia.agencies || []) {
      totalChecks++;
      if (agencyIds.has(agency.agency_id)) {
        errors.push({ dataset: "foia", field: "agency_id", message: `Duplicate FOIA agency_id: ${agency.agency_id}`, severity: "error" });
      } else {
        agencyIds.add(agency.agency_id);
        passed++;
      }
    }

    // Validate structured rules
    for (const rule of foia.structured_rules || []) {
      totalChecks++;
      if (rule.rule_id && rule.domain) {
        passed++;
      } else {
        errors.push({ dataset: "foia", field: "structured_rules", message: "FOIA rule missing rule_id or domain", severity: "error" });
      }
    }
  } else {
    errors.push({ dataset: "foia", field: "file", message: "FOIA file not found", severity: "error" });
  }

  // ─── 7. County Overrides ──────────────────────────────────────────────────
  const counties = loadStateJSON<any>(sc, "county_overrides");
  if (counties) {
    datasetsChecked.push("county_overrides");
    for (const county of counties.county_overrides || []) {
      totalChecks++;
      if (county.county_id && county.county_name && county.region) {
        passed++;
      } else {
        errors.push({ dataset: "county_overrides", field: "county", message: `County override missing required fields`, severity: "error" });
      }
    }
  } else {
    errors.push({ dataset: "county_overrides", field: "file", message: "County overrides file not found", severity: "error" });
  }

  // ─── 8. Tribal Overrides ──────────────────────────────────────────────────
  const tribal = loadStateJSON<any>(sc, "tribal_overrides");
  if (tribal) {
    datasetsChecked.push("tribal_overrides");

    // Validate ICWA activation rules
    for (const rule of tribal.icwa_activation_rules || []) {
      totalChecks++;
      if (rule.rule_id && rule.trigger_pipeline) {
        passed++;
        // Validate trigger_pipeline is canonical
        totalChecks++;
        if (canonicalPipelines.has(rule.trigger_pipeline)) {
          passed++;
        } else {
          warnings.push({ dataset: "tribal_overrides", field: "trigger_pipeline", message: `ICWA rule ${rule.rule_id} references non-canonical pipeline: ${rule.trigger_pipeline}`, severity: "warning" });
        }
      } else {
        errors.push({ dataset: "tribal_overrides", field: "icwa_activation_rules", message: "ICWA rule missing rule_id or trigger_pipeline", severity: "error" });
      }
    }

    // Validate tribal entities
    const tribalEntityIds = new Set<string>();
    for (const entity of tribal.tribal_entities || []) {
      totalChecks++;
      const eid = entity.entity_id || entity.tribal_entity_id;
      if (tribalEntityIds.has(eid)) {
        errors.push({ dataset: "tribal_overrides", field: "entity_id", message: `Duplicate tribal entity_id: ${eid}`, severity: "error" });
      } else {
        tribalEntityIds.add(eid);
        passed++;
      }
    }
  } else {
    errors.push({ dataset: "tribal_overrides", field: "file", message: "Tribal overrides file not found", severity: "error" });
  }

  // ─── 9. Pipeline Mappings ─────────────────────────────────────────────────
  const pipelineMappings = loadStateJSON<any>(sc, "pipeline_mappings");
  if (pipelineMappings) {
    datasetsChecked.push("pipeline_mappings");
    for (const mapping of pipelineMappings.pipeline_mappings || []) {
      totalChecks++;
      if (canonicalPipelines.has(mapping.pipeline_id)) {
        passed++;
      } else {
        errors.push({ dataset: "pipeline_mappings", field: "pipeline_id", message: `Pipeline mapping references non-canonical pipeline: ${mapping.pipeline_id}`, severity: "error" });
      }

      // Validate oversight entity types reference existing chains
      if (oversight) {
        const entityTypes = new Set((oversight.oversight_chains || []).map((c: any) => c.entity_type));
        for (const et of mapping.oversight_entity_types || []) {
          totalChecks++;
          if (entityTypes.has(et)) {
            passed++;
          } else {
            errors.push({ dataset: "pipeline_mappings", field: "oversight_entity_types", message: `Pipeline ${mapping.pipeline_id} references non-existent entity type: ${et}`, severity: "error" });
          }
        }
      }
    }
  } else {
    errors.push({ dataset: "pipeline_mappings", field: "file", message: "Pipeline mappings file not found", severity: "error" });
  }

  // ─── 10. Lens Mappings ────────────────────────────────────────────────────
  const lensMappings = loadStateJSON<any>(sc, "lens_mappings");
  if (lensMappings) {
    datasetsChecked.push("lens_mappings");
    for (const mapping of lensMappings.lens_mappings || []) {
      totalChecks++;
      if (canonicalLenses.has(mapping.lens_id)) {
        passed++;
      } else {
        errors.push({ dataset: "lens_mappings", field: "lens_id", message: `Lens mapping references non-canonical lens: ${mapping.lens_id}`, severity: "error" });
      }

      // Validate activation pipelines
      for (const pid of mapping.activation_pipelines || []) {
        totalChecks++;
        if (canonicalPipelines.has(pid)) {
          passed++;
        } else {
          errors.push({ dataset: "lens_mappings", field: "activation_pipelines", message: `Lens ${mapping.lens_id} references non-canonical pipeline: ${pid}`, severity: "error" });
        }
      }
    }
  } else {
    errors.push({ dataset: "lens_mappings", field: "file", message: "Lens mappings file not found", severity: "error" });
  }

  // ─── 11. Workflow Mappings ────────────────────────────────────────────────
  const workflowMappings = loadStateJSON<any>(sc, "workflow_mappings");
  if (workflowMappings) {
    datasetsChecked.push("workflow_mappings");

    // Validate workflow IDs reference existing workflow overrides
    const workflowOverrideIds = new Set(
      (workflows?.workflow_overrides || []).map((w: any) => w.workflow_id)
    );

    for (const mapping of workflowMappings.workflow_mappings || []) {
      // Validate trigger pipelines
      for (const pid of mapping.trigger_pipelines || []) {
        totalChecks++;
        if (canonicalPipelines.has(pid)) {
          passed++;
        } else {
          errors.push({ dataset: "workflow_mappings", field: "trigger_pipelines", message: `Workflow mapping ${mapping.workflow_id} references non-canonical pipeline: ${pid}`, severity: "error" });
        }
      }

      // Validate workflow_id references existing override (or is a new mapping-only workflow)
      totalChecks++;
      if (workflowOverrideIds.has(mapping.workflow_id) || mapping.workflow_id.includes("icwa") || mapping.workflow_id.includes("utility")) {
        passed++;
      } else {
        warnings.push({ dataset: "workflow_mappings", field: "workflow_id", message: `Workflow mapping ${mapping.workflow_id} has no matching workflow override`, severity: "warning" });
      }
    }

    // Validate resolution order
    totalChecks++;
    if (workflowMappings.resolution_order && workflowMappings.resolution_order.length >= 4) {
      passed++;
    } else {
      errors.push({ dataset: "workflow_mappings", field: "resolution_order", message: "Workflow mappings missing resolution_order or too few layers", severity: "error" });
    }
  } else {
    errors.push({ dataset: "workflow_mappings", field: "file", message: "Workflow mappings file not found", severity: "error" });
  }

  // ─── 12. Manifest ─────────────────────────────────────────────────────────
  const manifest = loadStateJSON<any>(sc, "manifest");
  if (manifest) {
    datasetsChecked.push("manifest");
    totalChecks++;
    if (manifest.state === stateCode.toUpperCase()) {
      passed++;
    } else {
      errors.push({ dataset: "manifest", field: "state", message: `Manifest state mismatch: expected ${stateCode.toUpperCase()}, got ${manifest.state}`, severity: "error" });
    }
  } else {
    errors.push({ dataset: "manifest", field: "file", message: "Manifest file not found", severity: "error" });
  }

  const failed = totalChecks - passed;

  return {
    state: stateCode.toUpperCase(),
    valid: errors.length === 0,
    errors,
    warnings,
    datasets_checked: datasetsChecked,
    summary: {
      total_checks: totalChecks,
      passed,
      failed,
      warnings: warnings.length,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// T2. ACTIVATION
// ═══════════════════════════════════════════════════════════════════════════════

export function activateRegistry(stateCode: string): {
  success: boolean;
  previous_status: string;
  new_status: string;
  message: string;
} {
  const sc = stateCode.toLowerCase();
  const manifestPath = join(CONFIG_DIR, `${sc}_manifest.json`);

  if (!existsSync(manifestPath)) {
    return { success: false, previous_status: "unknown", new_status: "unknown", message: "Manifest file not found" };
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const previousStatus = manifest.status;

  // Validate before activating
  const validation = validateExtractedRegistry(stateCode);
  if (!validation.valid) {
    return {
      success: false,
      previous_status: previousStatus,
      new_status: previousStatus,
      message: `Validation failed with ${validation.errors.length} errors. Cannot activate.`,
    };
  }

  // Update manifest
  manifest.status = "active";
  manifest.validation_status = "complete";
  manifest.pending_domains = [];
  manifest.missing_sections = [];
  manifest.completed_domains = [
    ...new Set([
      ...(manifest.completed_domains || []),
      "pipeline_mappings",
      "lens_mappings",
      "workflow_mappings",
    ]),
  ];
  manifest.date_activated = new Date().toISOString().split("T")[0];

  // Update datasets list
  const allDatasets = new Set(manifest.datasets || []);
  allDatasets.add("pipeline_mappings");
  allDatasets.add("lens_mappings");
  allDatasets.add("workflow_mappings");
  manifest.datasets = Array.from(allDatasets);

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  return {
    success: true,
    previous_status: previousStatus,
    new_status: "active",
    message: `Registry ${stateCode.toUpperCase()} activated successfully. ${manifest.datasets.length} datasets, ${manifest.completed_domains.length} domains.`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// T3. RUNTIME RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Canonical 5-layer resolution order.
 *
 * T3.1  federal_baseline        — Federal statutes, deadlines, and escalation hooks
 * T3.2  state_registry           — State programs, Layer 0 flags, Layer 1 cards, oversight, FOIA, lenses, workflows
 * T3.3  county_override          — County-specific courts, legal aid, housing, utilities
 * T3.4  tribal_override          — ICWA/WICWA activation, tribal entities, urban Native services
 * T3.5  pipeline_rule_injection  — Pipeline-specific mappings, escalation rules, deadline overrides
 *
 * Each layer is loaded dynamically at resolution time via readFileSync.
 * No data is compiled into the build — the engine reads JSON from disk on every call.
 */
const RESOLUTION_ORDER = [
  "federal_baseline",
  "state_registry",
  "county_override",
  "tribal_override",
  "pipeline_rule_injection",
] as const;

export type ResolutionLayer = (typeof RESOLUTION_ORDER)[number];

export function resolveRegistryLayers(
  stateCode: string,
  context: RegistryContext
): RegistryResolution {
  const sc = stateCode.toLowerCase();

  // ═══════════════════════════════════════════════════════════════════════════
  // All data is loaded DYNAMICALLY at resolution time via readFileSync.
  // No data is compiled into the build. The engine reads JSON from disk on
  // every call, ensuring the registry can be updated without restarting.
  // ═══════════════════════════════════════════════════════════════════════════

  // Load all datasets dynamically
  const programs = loadStateJSON<any>(sc, "programs");
  const workflowOverrides = loadStateJSON<any>(sc, "workflow_overrides");
  const oversight = loadStateJSON<any>(sc, "oversight");
  const layer0 = loadStateJSON<any>(sc, "layer0_flags");
  const layer1 = loadStateJSON<any>(sc, "layer1_cards");
  const foia = loadStateJSON<any>(sc, "foia");
  const counties = loadStateJSON<any>(sc, "county_overrides");
  const tribal = loadStateJSON<any>(sc, "tribal_overrides");
  const pipelineMappings = loadStateJSON<any>(sc, "pipeline_mappings");
  const lensMappings = loadStateJSON<any>(sc, "lens_mappings");
  const workflowMappings = loadStateJSON<any>(sc, "workflow_mappings");

  // Load federal baseline dynamically
  const federalBaselinePath = join(__dirname, "config", "federal_baseline.json");
  const federalBaseline = existsSync(federalBaselinePath)
    ? JSON.parse(readFileSync(federalBaselinePath, "utf-8"))
    : null;

  const layers: ResolvedLayer[] = [];

  // ─── T3.1  FEDERAL BASELINE ────────────────────────────────────────────────
  // Federal statutes, deadlines, and escalation hooks that apply regardless of state.
  // This is the floor — state layers can only add to or tighten these rules.
  const federalStatutes = (federalBaseline?.federal_statutes || []).filter(
    (s: any) => (s.pipelines || []).includes(context.pipeline_id)
  );
  const federalDeadlines = (federalBaseline?.federal_deadlines || []).filter(
    (d: any) => d.pipeline_id === context.pipeline_id
  );
  const federalHooks = (federalBaseline?.federal_escalation_hooks || []).filter(
    (h: any) => (h.pipelines || []).includes(context.pipeline_id)
  );
  layers.push({
    layer_name: "federal_baseline",
    applied: federalStatutes.length > 0 || federalDeadlines.length > 0 || federalHooks.length > 0,
    data: {
      statutes: federalStatutes,
      deadlines: federalDeadlines,
      escalation_hooks: federalHooks,
    },
  });

  // ─── T3.2  STATE REGISTRY ──────────────────────────────────────────────────
  // State programs, Layer 0 flags, Layer 1 cards, oversight chains, FOIA rules,
  // lens activations, and workflow mappings. This is the primary data layer.
  const pipelineMapping = (pipelineMappings?.pipeline_mappings || []).find(
    (m: any) => m.pipeline_id === context.pipeline_id
  );
  const matchedPrograms = (programs?.programs || []).filter((p: any) => {
    const pipelineMatch = (p.pipeline_ids || []).includes(context.pipeline_id);
    const regionMatch = !context.region || p.region === "statewide" || p.region === context.region;
    return pipelineMatch && regionMatch;
  });

  // Resolve FOIA restrictions at state level
  const foiaRestrictions: string[] = [];
  if (foia && pipelineMapping) {
    for (const ruleId of pipelineMapping.foia_rule_ids || []) {
      const rule = (foia.structured_rules || []).find((r: any) => r.domain === ruleId);
      if (rule) {
        foiaRestrictions.push(rule.domain);
      }
    }
  }

  // Resolve oversight chains at state level
  const oversightChains: RegistryResolution["oversight_chains"] = [];
  if (oversight && pipelineMapping) {
    for (const entityType of pipelineMapping.oversight_entity_types || []) {
      const chain = (oversight.oversight_chains || []).find(
        (c: any) => c.entity_type === entityType
      );
      if (chain) {
        oversightChains.push({
          entity_type: chain.entity_type,
          bodies: chain.bodies.map((b: any) => ({
            body_id: b.body_id || b.oversight_body,
            body_name: b.body_name || b.oversight_body,
          })),
        });
      }
    }
  }

  // Resolve lens activations at state level
  const activatedLenses = (lensMappings?.lens_mappings || []).filter(
    (l: any) =>
      (l.activation_pipelines || []).includes(context.pipeline_id) ||
      (l.activation_pipelines || []).length === 0
  );
  const specificLenses = activatedLenses.filter(
    (l: any) => (l.activation_pipelines || []).includes(context.pipeline_id)
  );

  // Resolve workflow at state level
  let resolvedWorkflow: RegistryResolution["workflow"] = null;
  if (workflowMappings) {
    const candidateMappings = (workflowMappings.workflow_mappings || []).filter((m: any) => {
      const pipelineMatch = (m.trigger_pipelines || []).includes(context.pipeline_id);
      if (!pipelineMatch) return false;
      if (m.trigger_conditions?.demographic_filter?.tribal_affiliation) {
        return !!context.demographics?.tribal_affiliation;
      }
      if (m.trigger_conditions?.situation_filter) {
        return context.situation === m.trigger_conditions.situation_filter;
      }
      return m.trigger_conditions?.any_pipeline_match !== false;
    });
    candidateMappings.sort((a: any, b: any) => {
      const aSpecific = (a.trigger_conditions?.situation_filter ? 2 : 0) + (a.trigger_conditions?.demographic_filter?.tribal_affiliation ? 2 : 0);
      const bSpecific = (b.trigger_conditions?.situation_filter ? 2 : 0) + (b.trigger_conditions?.demographic_filter?.tribal_affiliation ? 2 : 0);
      return bSpecific - aSpecific;
    });
    const wfMapping = candidateMappings[0] || null;
    if (wfMapping) {
      const wfOverride = (workflowOverrides?.workflow_overrides || []).find(
        (w: any) => w.workflow_id === wfMapping.workflow_id
      );
      resolvedWorkflow = {
        workflow_id: wfMapping.workflow_id,
        steps: (wfOverride?.steps || []).map((s: any) => ({
          step_number: s.step_number,
          action: s.action,
          deadline_days: s.deadline_days || null,
        })),
        escalation_rules: (wfMapping.escalation_rules || []).map((r: any) => ({
          step_index: r.step_index,
          escalation_type: r.escalation_type,
          description: r.description,
        })),
      };
    }
  }

  layers.push({
    layer_name: "state_registry",
    applied: matchedPrograms.length > 0 || !!pipelineMapping,
    data: {
      programs: matchedPrograms,
      count: matchedPrograms.length,
      pipeline_mapping: pipelineMapping || null,
      foia_restrictions: foiaRestrictions,
      oversight_chains: oversightChains,
      lens_activations: specificLenses,
      workflow: resolvedWorkflow,
    },
  });

  // ─── T3.3  COUNTY OVERRIDE ─────────────────────────────────────────────────
  // County-specific courts, prosecutors, housing authorities, legal aid,
  // child welfare, law enforcement, and utilities.
  let countyOverride = null;
  if (context.county && counties) {
    countyOverride = (counties.county_overrides || []).find(
      (c: any) => c.county_id === context.county || c.county_name.toLowerCase().includes(context.county!.toLowerCase())
    );
  } else if (context.region && counties) {
    countyOverride = (counties.county_overrides || []).find(
      (c: any) => c.region === context.region
    );
  }
  layers.push({
    layer_name: "county_override",
    applied: !!countyOverride,
    data: countyOverride || {},
  });

  // ─── T3.4  TRIBAL OVERRIDE ─────────────────────────────────────────────────
  // ICWA/WICWA activation rules, tribal entities, urban Native services.
  let tribalResult: RegistryResolution["tribal_overrides"] = null;
  if (context.demographics?.tribal_affiliation && tribal) {
    const activatedRules = (tribal.icwa_activation_rules || []).filter(
      (r: any) => r.trigger_pipeline === context.pipeline_id || r.trigger_pipeline === "child_welfare"
    );
    if (activatedRules.length > 0 || tribal.tribal_entities?.length > 0) {
      tribalResult = {
        icwa_activated: activatedRules.length > 0,
        tribal_entities: (tribal.tribal_entities || []).map((e: any) => ({
          entity_id: e.entity_id || e.tribal_entity_id,
          entity_name: e.entity_name || e.tribal_entity_name || e.entity_id || e.tribal_entity_id,
        })),
      };
    }
  }
  layers.push({
    layer_name: "tribal_override",
    applied: !!tribalResult,
    data: tribalResult || {},
  });

  // ─── T3.5  PIPELINE RULE INJECTION ─────────────────────────────────────────
  // Pipeline-specific mappings, escalation rules, and deadline overrides.
  // This layer injects pipeline-specific rules that refine the resolution.
  layers.push({
    layer_name: "pipeline_rule_injection",
    applied: !!pipelineMapping,
    data: {
      pipeline_mapping: pipelineMapping || null,
      federal_deadlines: federalDeadlines,
      federal_hooks: federalHooks,
      escalation_rules: resolvedWorkflow?.escalation_rules || [],
    },
  });

  // ─── Resolve Layer 0 Flags ─────────────────────────────────────────────────
  const resolvedFlags: RegistryResolution["layer0_flags"] = [];
  if (layer0 && pipelineMapping) {
    for (const flagId of pipelineMapping.layer0_flag_ids || []) {
      const flag = (layer0.flags || []).find((f: any) => f.flag_id === flagId);
      if (flag) {
        resolvedFlags.push({
          flag_id: flag.flag_id,
          label: flag.label,
          severity: flag.severity,
        });
      }
    }
  }

  // ─── Resolve Layer 1 Cards ─────────────────────────────────────────────────
  const resolvedCards: RegistryResolution["layer1_cards"] = [];
  if (layer1 && pipelineMapping) {
    for (const clusterId of pipelineMapping.layer1_cluster_ids || []) {
      const cluster = (layer1.clusters || []).find((c: any) => c.cluster_id === clusterId);
      if (cluster) {
        for (const card of cluster.cards) {
          // Filter by region if specified
          if (!context.region || card.region === "statewide" || card.region === context.region) {
            resolvedCards.push({
              card_id: card.card_id,
              program_name: card.program_name,
              cluster: clusterId,
              urgency: card.urgency,
            });
          }
        }
      }
    }
  }

  // ─── Resolve Lens Activations ──────────────────────────────────────────────
  const resolvedLenses: RegistryResolution["lens_activations"] = specificLenses.map((l: any) => ({
    lens_id: l.lens_id,
    state_parameters: l.state_parameters || {},
    priority_boost: l.priority_boost || 0,
  }));

  return {
    state: stateCode.toUpperCase(),
    pipeline_id: context.pipeline_id,
    resolution_order: RESOLUTION_ORDER,
    layers,
    programs: matchedPrograms.map((p: any) => ({
      program_id: p.program_id,
      program_name: p.program_name,
      layer: p.layer,
      region: p.region,
    })),
    workflow: resolvedWorkflow,
    oversight_chains: oversightChains,
    layer0_flags: resolvedFlags,
    layer1_cards: resolvedCards,
    foia_restrictions: foiaRestrictions,
    county_overrides: countyOverride,
    tribal_overrides: tribalResult,
    lens_activations: resolvedLenses,
    federal_baseline: {
      statutes: federalStatutes.map((s: any) => ({ statute_id: s.statute_id, title: s.label || s.title })),
      deadlines: federalDeadlines.map((d: any) => ({ pipeline_id: d.pipeline_id, deadline_days: d.days, description: d.action })),
      escalation_hooks: federalHooks.map((h: any) => ({ hook_id: h.hook_id, description: h.trigger })),
    },
    deterministic: true,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// T4. SMOKE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

export interface SmokeTestScenario {
  name: string;
  context: RegistryContext;
  expectations: Array<{
    description: string;
    check: (resolution: RegistryResolution) => boolean;
  }>;
}

export function runSmokeTest(
  stateCode: string,
  scenario: SmokeTestScenario
): SmokeTestResult {
  const resolution = resolveRegistryLayers(stateCode, scenario.context);

  const expectations = scenario.expectations.map((exp) => {
    const actual = exp.check(resolution);
    return {
      description: exp.description,
      expected: true,
      actual,
    };
  });

  return {
    scenario_name: scenario.name,
    pipeline_id: scenario.context.pipeline_id,
    region: scenario.context.region,
    passed: expectations.every((e) => e.actual === e.expected),
    expectations,
    resolution,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// T5. ACTIVATION STATS
// ═══════════════════════════════════════════════════════════════════════════════

export function getActivationStats(): {
  total_states: number;
  active_states: string[];
  in_progress_states: string[];
  total_programs: number;
  total_oversight_bodies: number;
  total_workflows: number;
  total_layer0_flags: number;
  total_layer1_cards: number;
  total_pipeline_mappings: number;
  total_lens_mappings: number;
} {
  const statesDir = CONFIG_DIR;
  const manifestFiles = readdirSync(statesDir)
    .filter((f: string) => f.endsWith("_manifest.json"));

  const activeStates: string[] = [];
  const inProgressStates: string[] = [];
  let totalPrograms = 0;
  let totalBodies = 0;
  let totalWorkflows = 0;
  let totalFlags = 0;
  let totalCards = 0;
  let totalPipelineMappings = 0;
  let totalLensMappings = 0;

  for (const mf of manifestFiles) {
    const manifest = JSON.parse(readFileSync(join(statesDir, mf), "utf-8"));
    const sc = manifest.state.toLowerCase();

    if (manifest.status === "active") {
      activeStates.push(manifest.state);
    } else if (manifest.status === "in_progress") {
      inProgressStates.push(manifest.state);
    }

    // Count programs
    const progs = loadStateJSON<any>(sc, "programs");
    if (progs?.programs) totalPrograms += progs.programs.length;

    // Count oversight bodies
    const ov = loadStateJSON<any>(sc, "oversight");
    if (ov?.oversight_chains) {
      for (const chain of ov.oversight_chains) {
        totalBodies += (chain.bodies?.length ?? 0);
      }
    }

    // Count workflows
    const wf = loadStateJSON<any>(sc, "workflow_overrides");
    if (wf?.workflow_overrides) totalWorkflows += wf.workflow_overrides.length;

    // Count Layer 0 flags
    const l0 = loadStateJSON<any>(sc, "layer0_flags");
    if (l0?.flags) totalFlags += l0.flags.length;

    // Count Layer 1 cards
    const l1 = loadStateJSON<any>(sc, "layer1_cards");
    if (l1?.clusters) {
      for (const cluster of l1.clusters) {
        totalCards += (cluster.cards?.length ?? 0);
      }
    }

    // Count pipeline mappings
    const pm = loadStateJSON<any>(sc, "pipeline_mappings");
    if (pm?.pipeline_mappings) totalPipelineMappings += pm.pipeline_mappings.length;

    // Count lens mappings
    const lm = loadStateJSON<any>(sc, "lens_mappings");
    if (lm?.lens_mappings) totalLensMappings += lm.lens_mappings.length;
  }

  return {
    total_states: manifestFiles.length,
    active_states: activeStates.sort(),
    in_progress_states: inProgressStates.sort(),
    total_programs: totalPrograms,
    total_oversight_bodies: totalBodies,
    total_workflows: totalWorkflows,
    total_layer0_flags: totalFlags,
    total_layer1_cards: totalCards,
    total_pipeline_mappings: totalPipelineMappings,
    total_lens_mappings: totalLensMappings,
  };
}
