/**
 * Luminari — Lens Activation Engine
 * 
 * ARCHITECTURE: Option C (Parallel Overlay)
 * 
 * T1. Case loaded → read pipelineType as primaryDomain
 * T2. Load lens registry from JSON config (cached after first load)
 * T2b. Load category defaults from lens_category_defaults.json (cached)
 * T2c. Load intake pre-lens map from intake_pre_lens_map.json (cached)
 * T3. Activate structural lenses (always-on)
 * T4. Activate domain lens matching primaryDomain
 * T4b. Resolve pipeline category from canonical ID → activate category default lenses
 * T4c. Activate intake pre-lenses from intake situation (if provided)
 * T5. Extract evidence signals from Pass 2 signal_flags via signal mapping layer
 * T6. Activate interpretive lenses based on domain match + evidence signals + manual overrides
 * T7. Resolve dependencies (transitive, topological sort, cycle detection)
 * T8. Resolve conflicts (priority-based, deterministic alphabetical tiebreak)
 * T9. Sort active lenses deterministically (category order → priority desc → lens_id asc)
 * T10. Build LensContext with registry_version, registry_hash, active_lenses, metadata_fields, analysis_hooks
 * 
 * CONSTRAINT: This module MUST NOT import from analysis-pipeline.ts.
 * It reads case data and signal flags from db.ts only.
 * It does NOT modify Pass 1/2/3 prompts or extraction behavior.
 */

import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type LensCategory = "structural" | "domain" | "interpretive";

/** Activation rules determine when a lens becomes active. */
export interface ActivationRules {
  /** If true, lens activates unconditionally (structural lenses). */
  always?: boolean;
  /** List of domain (pipelineType) values that trigger this lens. */
  domains?: string[];
  /** List of evidence signals that trigger this lens. Any match activates. */
  evidence_signals?: string[];
}

/** A single lens definition as stored in the registry. */
export interface LensDefinition {
  lens_id: string;
  label: string;
  category: LensCategory;
  description: string;
  priority: number;
  dependencies?: string[];
  conflicts_with?: string[];
  activation_rules: ActivationRules;
  metadata_fields?: string[];
  analysis_hooks?: string[];
  ui_surfaces?: string[];
  // ── Future-proofing fields (optional, ignored safely if absent) ──
  /** Lens IDs that this lens reinforces (enables lens hierarchy). */
  supports?: string[];
  /** Minimum number of matching signals required for activation (default: 1). */
  signal_threshold?: number;
  /** Per-signal confidence weights for weighted activation scoring. */
  confidence_weights?: Record<string, number>;
}

/** Mutual exclusion group — at most one lens from the group can be active. */
export interface MutualExclusionGroup {
  group: string;
  lenses: string[];
  resolution: "highest_priority" | "first_activated";
}

/** The full lens registry as loaded from JSON. */
export interface LensRegistry {
  version: string;
  structural_lenses: LensDefinition[];
  domain_lenses: LensDefinition[];
  interpretive_lenses: LensDefinition[];
  signals: string[];
  mutual_exclusion_groups?: MutualExclusionGroup[];
}

/** Case context passed into the activation engine. */
export interface CaseContext {
  caseId: number;
  primaryDomain: string | null;
  /** Optional manual lens selections by the user. */
  manualLensIds?: string[];
  /** Optional intake situation key (maps to intake_pre_lens_map.json). */
  intakeSituation?: string;
  /** Optional pipeline category (e.g., 'safety_abuse', 'financial_consumer'). */
  pipelineCategory?: string;
}

/** Evidence signal extracted from Pass 2 signal_flags via the mapping layer. */
export type EvidenceSignal = string;

/** An activated lens with its source of activation. */
export interface ActivatedLens {
  lens_id: string;
  label: string;
  category: LensCategory;
  priority: number;
  activation_source: "structural" | "domain_match" | "signal_match" | "manual" | "dependency" | "category_default" | "intake_pre_lens";
  metadata_fields: string[];
  analysis_hooks: string[];
  ui_surfaces: string[];
  // ── Future-proofing fields ──
  /** Confidence score (0.0-1.0) based on signal match strength. Null if not computed. */
  confidence: number | null;
  /** Signals that triggered this lens activation. Empty for structural/manual/dependency. */
  activation_signals: string[];
}

/** Pipeline resolution metadata stamped into LensContext. */
export interface PipelineResolution {
  original_input: string;
  canonical_id: string;
  resolution_method: "exact_canonical" | "alias" | "legacy_mapping" | "preserved_legacy" | "passthrough";
  is_canonical: boolean;
  is_preserved_legacy: boolean;
}

/** A single conflict resolution event for the activation trace. */
export interface ConflictResolutionEvent {
  /** The lens that was eliminated. */
  eliminated_lens_id: string;
  /** The lens that won the conflict. */
  winner_lens_id: string;
  /** The reason for elimination. */
  reason: "pairwise_conflict" | "mutual_exclusion";
  /** The group name (for mutual exclusion) or null (for pairwise). */
  group: string | null;
  /** Priority of the eliminated lens. */
  eliminated_priority: number;
  /** Priority of the winning lens. */
  winner_priority: number;
}

/** A single activation source entry for the trace. */
export interface ActivationSourceEntry {
  lens_id: string;
  source: ActivatedLens["activation_source"];
  /** The raw activation step (before dedup, deps, conflicts). */
  step: "structural" | "domain" | "category_default" | "intake_pre_lens" | "interpretive_domain" | "interpretive_signal" | "interpretive_always" | "manual" | "dependency";
}

/** Full activation trace — the complete audit trail of how lenses were activated. */
export interface ActivationTrace {
  /** Timestamp of trace generation. */
  generated_at: number;
  /** Case ID this trace was generated for. */
  case_id: number;
  /** The resolved canonical pipeline type. */
  resolved_pipeline_type: string | null;
  /** The pipeline category (e.g., 'safety_abuse'). */
  pipeline_category: string | null;
  /** The intake situation (if any). */
  intake_situation: string | null;
  /** Pipeline resolution metadata. */
  pipeline_resolution: PipelineResolution | null;
  /** Registry version used for this trace. */
  registry_version: string;
  /** Registry hash used for this trace. */
  registry_hash: string;
  /** Input evidence signals. */
  input_signals: string[];
  /** All activation source entries (before dedup/conflict resolution). */
  activation_sources: ActivationSourceEntry[];
  /** Lenses after deduplication (before dependency resolution). */
  after_dedup: string[];
  /** Lenses added by dependency resolution. */
  added_by_dependency: string[];
  /** Conflict resolution events. */
  conflict_resolutions: ConflictResolutionEvent[];
  /** Final active lenses (after all resolution steps). */
  final_lenses: ActivatedLens[];
  /** Total lens count at each stage. */
  stage_counts: {
    raw_activations: number;
    after_dedup: number;
    after_dependencies: number;
    after_conflicts: number;
    final: number;
  };
  /** The full LensContext (same as getActiveForCase output). */
  lens_context: LensContext;
}

/** The output of the activation engine — consumed by downstream systems. */
export interface LensContext {
  registry_version: string;
  registry_hash: string;
  case_id: number;
  primary_domain: string | null;
  /** The resolved canonical pipeline type (output of pipeline-resolver). */
  resolved_pipeline_type: string | null;
  /** Full pipeline resolution metadata showing how the type was resolved. */
  pipeline_resolution: PipelineResolution | null;
  activated_at: number;
  active_lenses: ActivatedLens[];
  /** Merged metadata fields from all active lenses (deduplicated). */
  all_metadata_fields: string[];
  /** Merged analysis hooks from all active lenses (deduplicated). */
  all_analysis_hooks: string[];
  /** Merged UI surfaces from all active lenses (deduplicated). */
  all_ui_surfaces: string[];
  // ── Future-proofing fields (Session 13 Addendum) ──
  /** All evidence signals that were input to the activation engine. */
  activation_signals: string[];
  /** Overall confidence score (average of per-lens confidence, or null if not computed). */
  confidence: number | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNAL MAPPING LAYER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maps existing Pass 2 signal_flags.flagType values to the lens signal namespace.
 * 
 * T5a. For each flagType in the case's signal_flags:
 *   - Look up SIGNAL_FLAG_TO_LENS_SIGNAL[flagType]
 *   - If found, add all mapped signals to the evidence signal set
 *   - If not found, the flagType is structural-only and does not trigger lens activation
 * T5b. Deduplicate the resulting signal set.
 */
export const SIGNAL_FLAG_TO_LENS_SIGNAL: Record<string, EvidenceSignal[]> = {
  // Existing Pass 2 flagType → Lens signals
  contradiction_detected: [],                          // structural — no lens signal
  procedural_violation: ["regulatory_violation"],
  rights_violation: ["regulatory_violation"],
  pattern_of_behavior: ["stalking", "harassment_language"],
  financial_irregularity: ["financial_transaction", "invoice", "payment", "billing"],
  minor_involvement: [],                               // structural — no lens signal
  trauma_reference: ["injury", "threat"],
  immunity_mention: [],                                // structural — no lens signal
};

/**
 * Convert an array of Pass 2 flagType strings into deduplicated lens signals.
 * Pure function. No I/O.
 */
export function mapSignalFlags(flagTypes: string[]): EvidenceSignal[] {
  const signalSet = new Set<EvidenceSignal>();
  for (const flagType of flagTypes) {
    const mapped = SIGNAL_FLAG_TO_LENS_SIGNAL[flagType];
    if (mapped) {
      for (const signal of mapped) {
        signalSet.add(signal);
      }
    }
    // Unknown flagTypes are silently ignored — they may be added in future versions
  }
  return Array.from(signalSet).sort();
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY LOADER
// ═══════════════════════════════════════════════════════════════════════════════

/** Cached registry instance. Null until first load. */
let cachedRegistry: LensRegistry | null = null;
let cachedRegistryHash: string | null = null;

function normalizeLensRegistry(registry: LensRegistry): LensRegistry {
  return {
    ...registry,
    structural_lenses: Array.isArray(registry?.structural_lenses) ? registry.structural_lenses : [],
    domain_lenses: Array.isArray(registry?.domain_lenses) ? registry.domain_lenses : [],
    interpretive_lenses: Array.isArray(registry?.interpretive_lenses) ? registry.interpretive_lenses : [],
    signals: Array.isArray(registry?.signals) ? registry.signals : [],
    mutual_exclusion_groups: Array.isArray(registry?.mutual_exclusion_groups)
      ? registry.mutual_exclusion_groups
      : [],
  };
}

/**
 * Compute a deterministic SHA-256 hash of the registry content.
 * Used for stamping LensContext so downstream systems can detect registry changes.
 */
export function computeRegistryHash(registry: LensRegistry): string {
  const allLenses = [
    ...registry.structural_lenses,
    ...registry.domain_lenses,
    ...registry.interpretive_lenses,
  ];
  // Deterministic: sort by lens_id, then stringify
  const sorted = allLenses
    .slice()
    .sort((a, b) => a.lens_id.localeCompare(b.lens_id));
  const payload = JSON.stringify({
    version: registry.version,
    lenses: sorted,
    signals: registry.signals.slice().sort(),
    mutual_exclusion_groups: registry.mutual_exclusion_groups || [],
  });
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Validate a registry object for structural correctness.
 * Returns an array of error messages (empty = valid).
 */
export function validateRegistry(registry: LensRegistry): string[] {
  const errors: string[] = [];

  if (!registry.version) {
    errors.push("Registry missing 'version' field.");
  }

  const allLenses = [
    ...registry.structural_lenses,
    ...registry.domain_lenses,
    ...registry.interpretive_lenses,
  ];

  // Check for duplicate lens_ids
  const idSet = new Set<string>();
  for (const lens of allLenses) {
    if (idSet.has(lens.lens_id)) {
      errors.push(`Duplicate lens_id: '${lens.lens_id}'.`);
    }
    idSet.add(lens.lens_id);
  }

  // Validate category matches section
  for (const lens of registry.structural_lenses) {
    if (lens.category !== "structural") {
      errors.push(`Lens '${lens.lens_id}' in structural_lenses has category '${lens.category}'.`);
    }
  }
  for (const lens of registry.domain_lenses) {
    if (lens.category !== "domain") {
      errors.push(`Lens '${lens.lens_id}' in domain_lenses has category '${lens.category}'.`);
    }
  }
  for (const lens of registry.interpretive_lenses) {
    if (lens.category !== "interpretive") {
      errors.push(`Lens '${lens.lens_id}' in interpretive_lenses has category '${lens.category}'.`);
    }
  }

  // Validate dependencies reference existing lenses
  for (const lens of allLenses) {
    if (lens.dependencies) {
      for (const dep of lens.dependencies) {
        if (!idSet.has(dep)) {
          errors.push(`Lens '${lens.lens_id}' depends on unknown lens '${dep}'.`);
        }
      }
    }
  }

  // Validate conflicts_with reference existing lenses
  for (const lens of allLenses) {
    if (lens.conflicts_with) {
      for (const conflict of lens.conflicts_with) {
        if (!idSet.has(conflict)) {
          errors.push(`Lens '${lens.lens_id}' conflicts with unknown lens '${conflict}'.`);
        }
      }
    }
  }

  // Validate mutual exclusion groups reference existing lenses
  if (registry.mutual_exclusion_groups) {
    for (const group of registry.mutual_exclusion_groups) {
      for (const lensId of group.lenses) {
        if (!idSet.has(lensId)) {
          errors.push(`Mutual exclusion group '${group.group}' references unknown lens '${lensId}'.`);
        }
      }
    }
  }

  // Detect circular dependencies
  const cycleErrors = detectCycles(allLenses);
  errors.push(...cycleErrors);

  return errors;
}

/**
 * Detect circular dependencies in the lens graph.
 * Uses DFS with three-color marking (white/gray/black).
 */
function detectCycles(lenses: LensDefinition[]): string[] {
  const errors: string[] = [];
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const depMap = new Map<string, string[]>();

  for (const lens of lenses) {
    color.set(lens.lens_id, WHITE);
    depMap.set(lens.lens_id, lens.dependencies || []);
  }

  function dfs(id: string, path: string[]): boolean {
    color.set(id, GRAY);
    const deps = depMap.get(id) || [];
    for (const dep of deps) {
      if (!color.has(dep)) continue; // unknown dep — caught by validateRegistry
      if (color.get(dep) === GRAY) {
        const cycleStart = path.indexOf(dep);
        const cycle = [...path.slice(cycleStart), dep];
        errors.push(`Circular dependency detected: ${cycle.join(" → ")}.`);
        return true;
      }
      if (color.get(dep) === WHITE) {
        if (dfs(dep, [...path, dep])) return true;
      }
    }
    color.set(id, BLACK);
    return false;
  }

  for (const lens of lenses) {
    if (color.get(lens.lens_id) === WHITE) {
      dfs(lens.lens_id, [lens.lens_id]);
    }
  }

  return errors;
}

/**
 * Load and validate the lens registry.
 * If no argument is provided, auto-loads from server/config/lens_registry.json.
 * Caches the result for subsequent calls.
 * 
 * T2. Parse → validate → cache → compute hash.
 */
export function loadLensRegistry(registryData?: LensRegistry): {
  registry: LensRegistry;
  hash: string;
  errors: string[];
} {
  let data = registryData;
  if (!data) {
    // Auto-load from JSON file
    const filePath = join(import.meta.dirname, "config", "lens_registry.json");
    const raw = readFileSync(filePath, "utf-8");
    data = JSON.parse(raw) as LensRegistry;
  }

  data = normalizeLensRegistry(data);

  const errors = validateRegistry(data);
  if (errors.length > 0) {
    return { registry: data, hash: "", errors };
  }

  const hash = computeRegistryHash(data);
  cachedRegistry = data;
  cachedRegistryHash = hash;

  return { registry: data, hash, errors: [] };
}

/**
 * Get the currently cached registry. Returns null if not loaded.
 */
export function getCachedRegistry(): { registry: LensRegistry; hash: string } | null {
  if (!cachedRegistry || !cachedRegistryHash) return null;
  return { registry: cachedRegistry, hash: cachedRegistryHash };
}

/**
 * Clear the cached registry (for testing).
 */
export function clearRegistryCache(): void {
  cachedRegistry = null;
  cachedRegistryHash = null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY DEFAULTS & INTAKE PRE-LENS CONFIGS (Session 14)
// ═══════════════════════════════════════════════════════════════════════════════

/** Category default lens mapping: pipeline_category → default lens IDs. */
export interface CategoryDefaultEntry {
  label: string;
  default_lenses: string[];
}

export interface CategoryDefaultsConfig {
  version: string;
  description: string;
  category_defaults: Record<string, CategoryDefaultEntry>;
}

/** Intake pre-lens mapping: intake_situation → pre-activation lens IDs. */
export interface IntakePreLensEntry {
  label: string;
  pre_lenses: string[];
  description: string;
}

export interface IntakePreLensConfig {
  version: string;
  description: string;
  intake_mappings: Record<string, IntakePreLensEntry>;
}

/** Pipeline types config for category lookup. */
interface PipelineTypesConfig {
  version: string;
  categories: Record<string, {
    label: string;
    pipelines: Array<{ id: string; label: string; description: string }>;
  }>;
  all_canonical_ids: string[];
}

/** Cached config instances. */
let cachedCategoryDefaults: CategoryDefaultsConfig | null = null;
let cachedIntakePreLensMap: IntakePreLensConfig | null = null;
let cachedPipelineTypes: PipelineTypesConfig | null = null;

/**
 * T2b. Load category defaults config.
 * If no argument is provided, auto-loads from server/config/lens_category_defaults.json.
 * Caches the result for subsequent calls.
 */
export function loadCategoryDefaults(data?: CategoryDefaultsConfig): CategoryDefaultsConfig {
  if (data) {
    cachedCategoryDefaults = data;
    return data;
  }
  if (cachedCategoryDefaults) return cachedCategoryDefaults;
  const filePath = join(import.meta.dirname, "config", "lens_category_defaults.json");
  const raw = readFileSync(filePath, "utf-8");
  cachedCategoryDefaults = JSON.parse(raw) as CategoryDefaultsConfig;
  return cachedCategoryDefaults;
}

/**
 * T2c. Load intake pre-lens map config.
 * If no argument is provided, auto-loads from server/config/intake_pre_lens_map.json.
 * Caches the result for subsequent calls.
 */
export function loadIntakePreLensMap(data?: IntakePreLensConfig): IntakePreLensConfig {
  if (data) {
    cachedIntakePreLensMap = data;
    return data;
  }
  if (cachedIntakePreLensMap) return cachedIntakePreLensMap;
  const filePath2 = join(import.meta.dirname, "config", "intake_pre_lens_map.json");
  const raw = readFileSync(filePath2, "utf-8");
  cachedIntakePreLensMap = JSON.parse(raw) as IntakePreLensConfig;
  return cachedIntakePreLensMap;
}

/**
 * Load pipeline types config for category lookup.
 * Caches the result for subsequent calls.
 */
function loadPipelineTypes(): PipelineTypesConfig {
  if (cachedPipelineTypes) return cachedPipelineTypes;
  const filePath3 = join(import.meta.dirname, "config", "pipeline_types.json");
  const raw = readFileSync(filePath3, "utf-8");
  cachedPipelineTypes = JSON.parse(raw) as PipelineTypesConfig;
  return cachedPipelineTypes;
}

/**
 * Look up the pipeline category for a given canonical pipeline ID.
 * Returns the category key (e.g., 'safety_abuse', 'financial_consumer') or null if not found.
 */
export function lookupCategory(canonicalId: string): string | null {
  const config = loadPipelineTypes();
  for (const [categoryKey, category] of Object.entries(config.categories)) {
    for (const pipeline of category.pipelines) {
      if (pipeline.id === canonicalId) return categoryKey;
    }
  }
  return null;
}

/**
 * Get cached category defaults. Returns null if not loaded.
 */
export function getCachedCategoryDefaults(): CategoryDefaultsConfig | null {
  return cachedCategoryDefaults;
}

/**
 * Get cached intake pre-lens map. Returns null if not loaded.
 */
export function getCachedIntakePreLensMap(): IntakePreLensConfig | null {
  return cachedIntakePreLensMap;
}

/**
 * Clear all cached configs (for testing).
 */
export function clearAllCaches(): void {
  cachedRegistry = null;
  cachedRegistryHash = null;
  cachedCategoryDefaults = null;
  cachedIntakePreLensMap = null;
  cachedPipelineTypes = null;
}

/**
 * Step T4b: Activate category default lenses.
 * Looks up the pipeline category for the resolved canonical ID,
 * then activates all default lenses for that category.
 */
function activateCategoryDefaults(
  lensMap: Map<string, LensDefinition>,
  category: string | null
): PendingLens[] {
  if (!category) return [];
  const config = cachedCategoryDefaults;
  if (!config) return [];
  const entry = config.category_defaults[category];
  if (!entry) return [];
  return entry.default_lenses
    .filter((id) => lensMap.has(id))
    .map((id) => ({
      definition: lensMap.get(id)!,
      source: "category_default" as const,
    }));
}

/**
 * Step T4c: Activate intake pre-lenses.
 * Looks up the intake situation and activates all pre-lenses for it.
 * These lenses activate during intake but never override pipeline resolution.
 */
function activateIntakePreLenses(
  lensMap: Map<string, LensDefinition>,
  intakeSituation: string | null | undefined
): PendingLens[] {
  if (!intakeSituation) return [];
  const config = cachedIntakePreLensMap;
  if (!config) return [];
  const entry = config.intake_mappings[intakeSituation];
  if (!entry) return [];
  return entry.pre_lenses
    .filter((id) => lensMap.has(id))
    .map((id) => ({
      definition: lensMap.get(id)!,
      source: "intake_pre_lens" as const,
    }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// LENS ACTIVATION
// ═══════════════════════════════════════════════════════════════════════════════

/** Internal intermediate: a lens with its activation source before conflict resolution. */
interface PendingLens {
  definition: LensDefinition;
  source: ActivatedLens["activation_source"];
}

/**
 * Build a lookup map from lens_id → LensDefinition for the full registry.
 */
function buildLensMap(registry: LensRegistry): Map<string, LensDefinition> {
  const map = new Map<string, LensDefinition>();
  for (const lens of [
    ...registry.structural_lenses,
    ...registry.domain_lenses,
    ...registry.interpretive_lenses,
  ]) {
    map.set(lens.lens_id, lens);
  }
  return map;
}

/**
 * Step T3: Activate structural lenses (always-on).
 */
function activateStructural(registry: LensRegistry): PendingLens[] {
  return registry.structural_lenses.map((def) => ({
    definition: def,
    source: "structural" as const,
  }));
}

/**
 * Step T4: Activate domain lens matching primaryDomain.
 * Matches against lens_id (e.g., primaryDomain "insurance" matches lens_id "insurance").
 */
function activateDomain(
  registry: LensRegistry,
  primaryDomain: string | null
): PendingLens[] {
  if (!primaryDomain) return [];
  const normalized = primaryDomain.toLowerCase().trim();
  // First try exact lens_id match, then check activation_rules.domains
  const match = registry.domain_lenses.find(
    (lens) =>
      lens.lens_id === normalized ||
      (lens.activation_rules.domains?.includes(normalized) ?? false)
  );
  if (!match) return [];
  return [{ definition: match, source: "domain_match" as const }];
}

/**
 * Step T6a: Activate interpretive lenses based on domain match.
 */
function activateInterpretiveByDomain(
  registry: LensRegistry,
  primaryDomain: string | null
): PendingLens[] {
  if (!primaryDomain) return [];
  const normalized = primaryDomain.toLowerCase().trim();
  return registry.interpretive_lenses
    .filter((lens) => {
      const rules = lens.activation_rules;
      if (rules.always) return false; // handled separately
      return rules.domains?.includes(normalized) ?? false;
    })
    .map((def) => ({ definition: def, source: "domain_match" as const }));
}

/**
 * Step T6b: Activate interpretive lenses based on evidence signals.
 */
function activateInterpretiveBySignals(
  registry: LensRegistry,
  evidenceSignals: EvidenceSignal[]
): PendingLens[] {
  if (evidenceSignals.length === 0) return [];
  const signalSet = new Set(evidenceSignals);
  return registry.interpretive_lenses
    .filter((lens) => {
      const rules = lens.activation_rules;
      if (rules.always) return false; // handled separately
      if (!rules.evidence_signals) return false;
      return rules.evidence_signals.some((s) => signalSet.has(s));
    })
    .map((def) => ({ definition: def, source: "signal_match" as const }));
}

/**
 * Step T6c: Activate interpretive lenses that are always-on.
 */
function activateInterpretiveAlwaysOn(
  registry: LensRegistry
): PendingLens[] {
  return registry.interpretive_lenses
    .filter((lens) => lens.activation_rules.always === true)
    .map((def) => ({ definition: def, source: "structural" as const }));
}

/**
 * Step T6d: Activate manually selected lenses.
 */
function activateManual(
  lensMap: Map<string, LensDefinition>,
  manualLensIds: string[]
): PendingLens[] {
  return manualLensIds
    .filter((id) => lensMap.has(id))
    .map((id) => ({
      definition: lensMap.get(id)!,
      source: "manual" as const,
    }));
}

/**
 * Deduplicate pending lenses. When a lens appears multiple times,
 * keep the one with the highest-priority activation source.
 * Source priority: manual > domain_match > signal_match > category_default > intake_pre_lens > structural > dependency
 */
const SOURCE_PRIORITY: Record<ActivatedLens["activation_source"], number> = {
  manual: 6,
  domain_match: 5,
  signal_match: 4,
  category_default: 3,
  intake_pre_lens: 2.5,
  structural: 2,
  dependency: 1,
};

function deduplicatePending(pending: PendingLens[]): PendingLens[] {
  const best = new Map<string, PendingLens>();
  for (const p of pending) {
    const existing = best.get(p.definition.lens_id);
    if (!existing || SOURCE_PRIORITY[p.source] > SOURCE_PRIORITY[existing.source]) {
      best.set(p.definition.lens_id, p);
    }
  }
  return Array.from(best.values());
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEPENDENCY RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Step T7: Resolve dependencies transitively.
 * 
 * For each active lens, walk its dependency chain and auto-activate
 * any required lenses that are not already active.
 * Uses iterative BFS to avoid stack overflow on deep chains.
 * Cycle detection is handled at registry validation time (T2).
 */
export function resolveDependencies(
  pending: PendingLens[],
  lensMap: Map<string, LensDefinition>
): PendingLens[] {
  const activeIds = new Set(pending.map((p) => p.definition.lens_id));
  const result = [...pending];
  const queue: string[] = [];

  // Seed the queue with all dependencies of currently active lenses
  for (const p of pending) {
    if (p.definition.dependencies) {
      for (const dep of p.definition.dependencies) {
        if (!activeIds.has(dep)) {
          queue.push(dep);
        }
      }
    }
  }

  // BFS: resolve transitively
  const visited = new Set<string>();
  while (queue.length > 0) {
    const depId = queue.shift()!;
    if (visited.has(depId) || activeIds.has(depId)) continue;
    visited.add(depId);

    const depDef = lensMap.get(depId);
    if (!depDef) continue; // unknown dep — validated at load time

    result.push({ definition: depDef, source: "dependency" });
    activeIds.add(depId);

    // Add transitive dependencies
    if (depDef.dependencies) {
      for (const transitiveDep of depDef.dependencies) {
        if (!activeIds.has(transitiveDep) && !visited.has(transitiveDep)) {
          queue.push(transitiveDep);
        }
      }
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFLICT RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Step T8: Resolve conflicts.
 * 
 * Two conflict mechanisms:
 * 1. Pairwise conflicts_with: if lens A conflicts with lens B, keep the one
 *    with higher priority. If priorities are equal, keep the one with
 *    lexicographically smaller lens_id (deterministic tiebreak).
 * 2. Mutual exclusion groups: within each group, keep only the lens with
 *    highest priority (same tiebreak rule).
 */
export function resolveConflicts(
  pending: PendingLens[],
  mutualExclusionGroups?: MutualExclusionGroup[]
): PendingLens[] {
  const { resolved } = resolveConflictsWithTrace(pending, mutualExclusionGroups);
  return resolved;
}

/**
 * Step T8 (traced variant): Resolve conflicts and return trace events.
 */
export function resolveConflictsWithTrace(
  pending: PendingLens[],
  mutualExclusionGroups?: MutualExclusionGroup[]
): { resolved: PendingLens[]; events: ConflictResolutionEvent[] } {
  let result = [...pending];
  const events: ConflictResolutionEvent[] = [];

  // Phase 1: Pairwise conflicts_with
  const removed = new Set<string>();
  const activeMap = new Map<string, PendingLens>();
  for (const p of result) {
    activeMap.set(p.definition.lens_id, p);
  }

  for (const p of result) {
    if (removed.has(p.definition.lens_id)) continue;
    if (!p.definition.conflicts_with) continue;

    for (const conflictId of p.definition.conflicts_with) {
      if (removed.has(conflictId)) continue;
      const conflicting = activeMap.get(conflictId);
      if (!conflicting) continue;

      const winner = pickWinner(p, conflicting);
      const loser = winner === p ? conflicting : p;
      removed.add(loser.definition.lens_id);
      events.push({
        eliminated_lens_id: loser.definition.lens_id,
        winner_lens_id: winner.definition.lens_id,
        reason: "pairwise_conflict",
        group: null,
        eliminated_priority: loser.definition.priority,
        winner_priority: winner.definition.priority,
      });
    }
  }

  result = result.filter((p) => !removed.has(p.definition.lens_id));

  // Phase 2: Mutual exclusion groups
  if (mutualExclusionGroups) {
    for (const group of mutualExclusionGroups) {
      const groupMembers = result.filter((p) =>
        group.lenses.includes(p.definition.lens_id)
      );
      if (groupMembers.length <= 1) continue;

      groupMembers.sort((a, b) => {
        if (b.definition.priority !== a.definition.priority) {
          return b.definition.priority - a.definition.priority;
        }
        return a.definition.lens_id.localeCompare(b.definition.lens_id);
      });

      const winnerId = groupMembers[0].definition.lens_id;
      const losers = groupMembers.slice(1);
      for (const loser of losers) {
        events.push({
          eliminated_lens_id: loser.definition.lens_id,
          winner_lens_id: winnerId,
          reason: "mutual_exclusion",
          group: group.group,
          eliminated_priority: loser.definition.priority,
          winner_priority: groupMembers[0].definition.priority,
        });
      }
      const loserIds = new Set(losers.map((p) => p.definition.lens_id));
      result = result.filter((p) => !loserIds.has(p.definition.lens_id));
    }
  }

  return { resolved: result, events };
}

/**
 * Pick the winner between two conflicting lenses.
 * Higher priority wins. On tie, lexicographically smaller lens_id wins.
 */
function pickWinner(a: PendingLens, b: PendingLens): PendingLens {
  if (a.definition.priority !== b.definition.priority) {
    return a.definition.priority > b.definition.priority ? a : b;
  }
  // Deterministic tiebreak: alphabetical by lens_id
  return a.definition.lens_id.localeCompare(b.definition.lens_id) <= 0 ? a : b;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SORTING
// ═══════════════════════════════════════════════════════════════════════════════

const CATEGORY_ORDER: Record<LensCategory, number> = {
  structural: 0,
  domain: 1,
  interpretive: 2,
};

/**
 * Step T9: Sort active lenses deterministically.
 * Order: category (structural → domain → interpretive) → priority desc → lens_id asc.
 */
function sortLenses(pending: PendingLens[]): PendingLens[] {
  return pending.slice().sort((a, b) => {
    const catA = CATEGORY_ORDER[a.definition.category];
    const catB = CATEGORY_ORDER[b.definition.category];
    if (catA !== catB) return catA - catB;
    if (b.definition.priority !== a.definition.priority) {
      return b.definition.priority - a.definition.priority;
    }
    return a.definition.lens_id.localeCompare(b.definition.lens_id);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Step T10: Build the final LensContext from sorted active lenses.
 */
export function buildLensContext(
  sorted: PendingLens[],
  caseContext: CaseContext,
  registryVersion: string,
  registryHash: string,
  pipelineResolution?: PipelineResolution | null,
  inputSignals?: EvidenceSignal[]
): LensContext {
  const activeLenses: ActivatedLens[] = sorted.map((p) => {
    // Compute per-lens confidence using confidence_weights if available
    let confidence: number | null = null;
    const matchedSignals: string[] = [];

    if (p.source === "signal_match" && p.definition.activation_rules.evidence_signals) {
      const ruleSignals = p.definition.activation_rules.evidence_signals;
      const inputSet = new Set(inputSignals || []);
      for (const s of ruleSignals) {
        if (inputSet.has(s)) matchedSignals.push(s);
      }
      // Confidence = weighted match ratio (or simple ratio if no weights)
      if (p.definition.confidence_weights && matchedSignals.length > 0) {
        let weightedSum = 0;
        let totalWeight = 0;
        for (const s of ruleSignals) {
          const w = p.definition.confidence_weights[s] ?? 1.0;
          totalWeight += w;
          if (matchedSignals.includes(s)) weightedSum += w;
        }
        confidence = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : null;
      } else if (matchedSignals.length > 0) {
        confidence = Math.round((matchedSignals.length / ruleSignals.length) * 100) / 100;
      }
    } else if (p.source === "domain_match") {
      confidence = 1.0; // Domain match is deterministic
      if (caseContext.primaryDomain) matchedSignals.push(`domain:${caseContext.primaryDomain}`);
    } else if (p.source === "category_default") {
      confidence = 0.9; // Category default — high confidence but not directly triggered
      if (caseContext.pipelineCategory) matchedSignals.push(`category:${caseContext.pipelineCategory}`);
    } else if (p.source === "intake_pre_lens") {
      confidence = 0.85; // Intake pre-lens — activated before pipeline resolution
      if (caseContext.intakeSituation) matchedSignals.push(`intake:${caseContext.intakeSituation}`);
    } else if (p.source === "structural") {
      confidence = 1.0; // Always-on
    } else if (p.source === "manual") {
      confidence = 1.0; // User-selected
    }
    // dependency lenses: confidence stays null (inherited, not directly triggered)

    return {
      lens_id: p.definition.lens_id,
      label: p.definition.label,
      category: p.definition.category,
      priority: p.definition.priority,
      activation_source: p.source,
      metadata_fields: p.definition.metadata_fields || [],
      analysis_hooks: p.definition.analysis_hooks || [],
      ui_surfaces: p.definition.ui_surfaces || [],
      confidence,
      activation_signals: matchedSignals,
    };
  });

  // Merge and deduplicate metadata_fields, analysis_hooks, ui_surfaces
  const allMetadata = new Set<string>();
  const allHooks = new Set<string>();
  const allSurfaces = new Set<string>();

  for (const lens of activeLenses) {
    for (const f of lens.metadata_fields) allMetadata.add(f);
    for (const h of lens.analysis_hooks) allHooks.add(h);
    for (const s of lens.ui_surfaces) allSurfaces.add(s);
  }

  // Compute overall confidence (average of non-null per-lens confidence)
  const confidenceValues = activeLenses
    .map(l => l.confidence)
    .filter((c): c is number => c !== null);
  const overallConfidence = confidenceValues.length > 0
    ? Math.round((confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length) * 100) / 100
    : null;

  return {
    registry_version: registryVersion,
    registry_hash: registryHash,
    case_id: caseContext.caseId,
    primary_domain: caseContext.primaryDomain,
    resolved_pipeline_type: pipelineResolution?.canonical_id ?? caseContext.primaryDomain,
    pipeline_resolution: pipelineResolution ?? null,
    activated_at: Date.now(),
    active_lenses: activeLenses,
    all_metadata_fields: Array.from(allMetadata).sort(),
    all_analysis_hooks: Array.from(allHooks).sort(),
    all_ui_surfaces: Array.from(allSurfaces).sort(),
    activation_signals: inputSignals ? [...inputSignals] : [],
    confidence: overallConfidence,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Full activation pipeline.
 * 
 * Input: CaseContext + EvidenceSignal[] + LensRegistry
 * Output: LensContext
 * 
 * This is the single function downstream systems call.
 * It is pure (given the same inputs, produces the same output — modulo activated_at timestamp).
 */
export function activateLenses(
  caseContext: CaseContext,
  evidenceSignals: EvidenceSignal[],
  registry: LensRegistry,
  registryHash: string,
  pipelineResolution?: PipelineResolution | null
): LensContext {
  const lensMap = buildLensMap(registry);

  // T3: Structural lenses
  const structural = activateStructural(registry);

  // T4: Domain lens
  const domain = activateDomain(registry, caseContext.primaryDomain);

  // T4b: Category default lenses (Session 14)
  const categoryDefaults = activateCategoryDefaults(lensMap, caseContext.pipelineCategory ?? null);

  // T4c: Intake pre-lenses (Session 14)
  const intakePreLenses = activateIntakePreLenses(lensMap, caseContext.intakeSituation);

  // T6a: Interpretive by domain
  const interpDomain = activateInterpretiveByDomain(registry, caseContext.primaryDomain);

  // T6b: Interpretive by signals
  const interpSignals = activateInterpretiveBySignals(registry, evidenceSignals);

  // T6c: Interpretive always-on
  const interpAlways = activateInterpretiveAlwaysOn(registry);

  // T6d: Manual overrides
  const manual = caseContext.manualLensIds
    ? activateManual(lensMap, caseContext.manualLensIds)
    : [];

  // Merge and deduplicate (order matters for source priority resolution)
  const allPending = deduplicatePending([
    ...structural,
    ...domain,
    ...categoryDefaults,
    ...intakePreLenses,
    ...interpDomain,
    ...interpSignals,
    ...interpAlways,
    ...manual,
  ]);

  // T7: Resolve dependencies
  const withDeps = resolveDependencies(allPending, lensMap);

  // T8: Resolve conflicts
  const resolved = resolveConflicts(withDeps, registry.mutual_exclusion_groups);

  // T9: Sort deterministically
  const sorted = sortLenses(resolved);

  // T10: Build context (with optional pipeline resolution metadata)
  return buildLensContext(sorted, caseContext, registry.version, registryHash, pipelineResolution, evidenceSignals);
}

/**
 * Convenience: activate lenses using the cached registry.
 * Throws if registry has not been loaded.
 */
export function activateLensesFromCache(
  caseContext: CaseContext,
  evidenceSignals: EvidenceSignal[],
  pipelineResolution?: PipelineResolution | null
): LensContext {
  const cached = getCachedRegistry();
  if (!cached) {
    throw new Error("Lens registry not loaded. Call loadLensRegistry() first.");
  }
  return activateLenses(caseContext, evidenceSignals, cached.registry, cached.hash, pipelineResolution);
}

/**
 * Convenience: activate lenses with automatic pipeline resolution.
 * Resolves the case's pipelineType through the pipeline registry before activation.
 * This is the recommended entry point for production use.
 */
export function activateLensesWithResolution(
  caseContext: CaseContext,
  evidenceSignals: EvidenceSignal[],
  resolveFn: (input: string) => PipelineResolution
): LensContext {
  const cached = getCachedRegistry();
  if (!cached) {
    throw new Error("Lens registry not loaded. Call loadLensRegistry() first.");
  }

  let pipelineResolution: PipelineResolution | null = null;
  let resolvedContext = caseContext;

  if (caseContext.primaryDomain) {
    pipelineResolution = resolveFn(caseContext.primaryDomain);
    const canonicalId = pipelineResolution.canonical_id;
    // Auto-resolve pipeline category from canonical ID if not already set
    const category = caseContext.pipelineCategory ?? lookupCategory(canonicalId);
    resolvedContext = {
      ...caseContext,
      primaryDomain: canonicalId,
      pipelineCategory: category ?? undefined,
    };
  }

  return activateLenses(
    resolvedContext,
    evidenceSignals,
    cached.registry,
    cached.hash,
    pipelineResolution
  );
}

/**
 * Full activation pipeline with activation trace.
 * Returns both the LensContext and a detailed ActivationTrace for debugging.
 * 
 * T1-T10 same as activateLenses, but captures intermediate state at each step.
 */
export function activateLensesWithTrace(
  caseContext: CaseContext,
  evidenceSignals: EvidenceSignal[],
  registry: LensRegistry,
  registryHash: string,
  pipelineResolution?: PipelineResolution | null
): ActivationTrace {
  const lensMap = buildLensMap(registry);

  // T3: Structural lenses
  const structural = activateStructural(registry);

  // T4: Domain lens
  const domain = activateDomain(registry, caseContext.primaryDomain);

  // T4b: Category default lenses
  const categoryDefaults = activateCategoryDefaults(lensMap, caseContext.pipelineCategory ?? null);

  // T4c: Intake pre-lenses
  const intakePreLenses = activateIntakePreLenses(lensMap, caseContext.intakeSituation);

  // T6a: Interpretive by domain
  const interpDomain = activateInterpretiveByDomain(registry, caseContext.primaryDomain);

  // T6b: Interpretive by signals
  const interpSignals = activateInterpretiveBySignals(registry, evidenceSignals);

  // T6c: Interpretive always-on
  const interpAlways = activateInterpretiveAlwaysOn(registry);

  // T6d: Manual overrides
  const manual = caseContext.manualLensIds
    ? activateManual(lensMap, caseContext.manualLensIds)
    : [];

  // Capture all raw activation sources
  const rawSources: ActivationSourceEntry[] = [
    ...structural.map(p => ({ lens_id: p.definition.lens_id, source: p.source, step: "structural" as const })),
    ...domain.map(p => ({ lens_id: p.definition.lens_id, source: p.source, step: "domain" as const })),
    ...categoryDefaults.map(p => ({ lens_id: p.definition.lens_id, source: p.source, step: "category_default" as const })),
    ...intakePreLenses.map(p => ({ lens_id: p.definition.lens_id, source: p.source, step: "intake_pre_lens" as const })),
    ...interpDomain.map(p => ({ lens_id: p.definition.lens_id, source: p.source, step: "interpretive_domain" as const })),
    ...interpSignals.map(p => ({ lens_id: p.definition.lens_id, source: p.source, step: "interpretive_signal" as const })),
    ...interpAlways.map(p => ({ lens_id: p.definition.lens_id, source: p.source, step: "interpretive_always" as const })),
    ...manual.map(p => ({ lens_id: p.definition.lens_id, source: p.source, step: "manual" as const })),
  ];
  const rawCount = rawSources.length;

  // Dedup
  const allPending = deduplicatePending([
    ...structural, ...domain, ...categoryDefaults, ...intakePreLenses,
    ...interpDomain, ...interpSignals, ...interpAlways, ...manual,
  ]);
  const afterDedupIds = allPending.map(p => p.definition.lens_id);

  // T7: Resolve dependencies
  const withDeps = resolveDependencies(allPending, lensMap);
  const addedByDep = withDeps
    .filter(p => !afterDedupIds.includes(p.definition.lens_id))
    .map(p => p.definition.lens_id);

  // T8: Resolve conflicts (traced)
  const { resolved, events: conflictEvents } = resolveConflictsWithTrace(withDeps, registry.mutual_exclusion_groups);

  // T9: Sort deterministically
  const sorted = sortLenses(resolved);

  // T10: Build context
  const lensContext = buildLensContext(sorted, caseContext, registry.version, registryHash, pipelineResolution, evidenceSignals);

  return {
    generated_at: Date.now(),
    case_id: caseContext.caseId,
    resolved_pipeline_type: pipelineResolution?.canonical_id ?? caseContext.primaryDomain,
    pipeline_category: caseContext.pipelineCategory ?? null,
    intake_situation: caseContext.intakeSituation ?? null,
    pipeline_resolution: pipelineResolution ?? null,
    registry_version: registry.version,
    registry_hash: registryHash,
    input_signals: [...evidenceSignals],
    activation_sources: rawSources,
    after_dedup: afterDedupIds,
    added_by_dependency: addedByDep,
    conflict_resolutions: conflictEvents,
    final_lenses: lensContext.active_lenses,
    stage_counts: {
      raw_activations: rawCount,
      after_dedup: afterDedupIds.length,
      after_dependencies: withDeps.length,
      after_conflicts: resolved.length,
      final: sorted.length,
    },
    lens_context: lensContext,
  };
}

/**
 * Convenience: activate lenses with resolution AND full activation trace.
 * This is the recommended entry point for the debug panel.
 */
export function activateLensesWithResolutionAndTrace(
  caseContext: CaseContext,
  evidenceSignals: EvidenceSignal[],
  resolveFn: (input: string) => PipelineResolution
): ActivationTrace {
  const cached = getCachedRegistry();
  if (!cached) {
    throw new Error("Lens registry not loaded. Call loadLensRegistry() first.");
  }

  let pipelineResolution: PipelineResolution | null = null;
  let resolvedContext = caseContext;

  if (caseContext.primaryDomain) {
    pipelineResolution = resolveFn(caseContext.primaryDomain);
    const canonicalId = pipelineResolution.canonical_id;
    const category = caseContext.pipelineCategory ?? lookupCategory(canonicalId);
    resolvedContext = {
      ...caseContext,
      primaryDomain: canonicalId,
      pipelineCategory: category ?? undefined,
    };
  }

  return activateLensesWithTrace(
    resolvedContext,
    evidenceSignals,
    cached.registry,
    cached.hash,
    pipelineResolution
  );
}
