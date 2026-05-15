/**
 * Pipeline Resolver — maps legacy, aliased, and canonical pipeline type identifiers
 * to their canonical form.
 *
 * Architecture:
 *   T1. Load pipeline_types.json → build canonical ID set.
 *   T2. Load pipeline_aliases.json → build alias map + legacy map + preserved set.
 *   T3. Cache both in memory (loaded once at startup, invalidated on reload).
 *   T4. resolveCanonical(input) → canonical ID | original (if preserved legacy) | original (if unknown).
 *   T5. isCanonical(input) → boolean.
 *   T6. isPreservedLegacy(input) → boolean.
 *   T7. getCanonicalMetadata(canonicalId) → { id, label, description, category } | null.
 *   T8. getAllCanonicalIds() → string[].
 *   T9. getAllCategories() → { id, label, pipelines }[].
 *
 * Integration with Lens Engine:
 *   The lens engine's CaseContext.primaryDomain should receive the output of
 *   resolveCanonical(). This ensures domain lens activation rules match canonical IDs.
 *
 * Zero coupling to analysis pipeline. Pure functions over cached config data.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface PipelineTypeEntry {
  id: string;
  label: string;
  description: string;
}

export interface PipelineCategory {
  id: string;
  label: string;
  pipelines: PipelineTypeEntry[];
}

export interface PipelineTypesConfig {
  version: string;
  description: string;
  categories: Record<string, { label: string; pipelines: PipelineTypeEntry[] }>;
  all_canonical_ids: string[];
}

export interface PipelineAliasesConfig {
  version: string;
  description: string;
  aliases: Record<string, string>;
  legacy_mappings: Record<string, string>;
  preserved_legacy_types: string[];
}

export interface ResolvedPipeline {
  /** The canonical pipeline ID (or original if preserved/unknown). */
  canonical_id: string;
  /** Whether this is a recognized canonical pipeline type. */
  is_canonical: boolean;
  /** Whether this is a preserved legacy type (no canonical equivalent yet). */
  is_preserved_legacy: boolean;
  /** The original input value before resolution. */
  original_input: string;
  /** How the resolution was performed. */
  resolution_method: "exact_canonical" | "alias" | "legacy_mapping" | "preserved_legacy" | "passthrough";
}

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════════════════════════════════════════

interface PipelineRegistryCache {
  canonicalIds: Set<string>;
  canonicalEntries: Map<string, PipelineTypeEntry & { category: string }>;
  aliasMap: Map<string, string>;       // normalized alias → canonical ID
  legacyMap: Map<string, string>;      // legacy key → canonical ID
  preservedLegacy: Set<string>;        // legacy types with no canonical equivalent
  categories: PipelineCategory[];
  typesVersion: string;
  aliasesVersion: string;
  registryHash: string;
}

let cache: PipelineRegistryCache | null = null;

// ═══════════════════════════════════════════════════════════════════════════════
// LOADING & VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * T1-T3: Load both config files, validate, and build the cache.
 * @param configDir — directory containing pipeline_types.json and pipeline_aliases.json.
 *                     Defaults to server/config/.
 */
export function loadPipelineRegistry(configDir?: string): PipelineRegistryCache {
  const dir = configDir || join(import.meta.dirname, "config");

  const typesRaw = readFileSync(join(dir, "pipeline_types.json"), "utf-8");
  const aliasesRaw = readFileSync(join(dir, "pipeline_aliases.json"), "utf-8");

  const typesConfig: PipelineTypesConfig = JSON.parse(typesRaw);
  const aliasesConfig: PipelineAliasesConfig = JSON.parse(aliasesRaw);

  // Validate: all canonical IDs must exist in categories
  const categoryPipelineIds = new Set<string>();
  const categories: PipelineCategory[] = [];
  const canonicalEntries = new Map<string, PipelineTypeEntry & { category: string }>();

  for (const [catId, catData] of Object.entries(typesConfig.categories)) {
    const cat: PipelineCategory = {
      id: catId,
      label: catData.label,
      pipelines: catData.pipelines,
    };
    categories.push(cat);
    for (const p of catData.pipelines) {
      categoryPipelineIds.add(p.id);
      canonicalEntries.set(p.id, { ...p, category: catId });
    }
  }

  const canonicalIds = new Set(typesConfig.all_canonical_ids);

  // Validate: all_canonical_ids must match category pipelines
  for (const id of Array.from(canonicalIds)) {
    if (!categoryPipelineIds.has(id)) {
      throw new Error(
        `Pipeline type "${id}" is in all_canonical_ids but not in any category.`
      );
    }
  }
  for (const id of Array.from(categoryPipelineIds)) {
    if (!canonicalIds.has(id)) {
      throw new Error(
        `Pipeline type "${id}" is in a category but not in all_canonical_ids.`
      );
    }
  }

  // Validate: all alias targets must be canonical IDs
  const aliasMap = new Map<string, string>();
  for (const [alias, target] of Object.entries(aliasesConfig.aliases)) {
    if (!canonicalIds.has(target)) {
      throw new Error(
        `Alias "${alias}" targets "${target}" which is not a canonical pipeline ID.`
      );
    }
    aliasMap.set(alias.toLowerCase().trim(), target);
  }

  // Validate: all legacy mapping targets must be canonical IDs
  const legacyMap = new Map<string, string>();
  for (const [legacy, target] of Object.entries(aliasesConfig.legacy_mappings)) {
    if (!canonicalIds.has(target)) {
      throw new Error(
        `Legacy mapping "${legacy}" targets "${target}" which is not a canonical pipeline ID.`
      );
    }
    legacyMap.set(legacy.toLowerCase().trim(), target);
  }

  // Preserved legacy types should NOT overlap with canonical IDs
  const preservedLegacy = new Set<string>();
  for (const legacyType of aliasesConfig.preserved_legacy_types) {
    const normalized = legacyType.toLowerCase().trim();
    if (canonicalIds.has(normalized)) {
      throw new Error(
        `Preserved legacy type "${legacyType}" conflicts with canonical ID "${normalized}".`
      );
    }
    preservedLegacy.add(normalized);
  }

  // Compute registry hash (SHA-256 of both config files concatenated)
  const hashInput = typesRaw + "\n---\n" + aliasesRaw;
  const registryHash = createHash("sha256").update(hashInput).digest("hex");

  cache = {
    canonicalIds,
    canonicalEntries,
    aliasMap,
    legacyMap,
    preservedLegacy,
    categories,
    typesVersion: typesConfig.version,
    aliasesVersion: aliasesConfig.version,
    registryHash,
  };

  return cache;
}

/**
 * Get the cached registry. Returns null if not loaded.
 */
export function getCachedPipelineRegistry(): PipelineRegistryCache | null {
  return cache;
}

/**
 * Clear the cache (for testing).
 */
export function clearPipelineRegistryCache(): void {
  cache = null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * T4: Resolve an input pipeline type to its canonical form.
 *
 * Resolution order:
 *   1. Exact match against canonical IDs → return as-is.
 *   2. Alias match (case-insensitive) → return canonical target.
 *   3. Legacy mapping match (case-insensitive) → return canonical target.
 *   4. Preserved legacy type → return original (recognized but no canonical equivalent).
 *   5. Unknown → return original as passthrough.
 */
export function resolveCanonical(input: string): ResolvedPipeline {
  const reg = cache;
  if (!reg) {
    throw new Error("Pipeline registry not loaded. Call loadPipelineRegistry() first.");
  }

  const normalized = input.toLowerCase().trim();

  // 1. Exact canonical match
  if (reg.canonicalIds.has(normalized)) {
    return {
      canonical_id: normalized,
      is_canonical: true,
      is_preserved_legacy: false,
      original_input: input,
      resolution_method: "exact_canonical",
    };
  }

  // 2. Alias match
  const aliasTarget = reg.aliasMap.get(normalized);
  if (aliasTarget) {
    return {
      canonical_id: aliasTarget,
      is_canonical: true,
      is_preserved_legacy: false,
      original_input: input,
      resolution_method: "alias",
    };
  }

  // 3. Legacy mapping match
  const legacyTarget = reg.legacyMap.get(normalized);
  if (legacyTarget) {
    return {
      canonical_id: legacyTarget,
      is_canonical: true,
      is_preserved_legacy: false,
      original_input: input,
      resolution_method: "legacy_mapping",
    };
  }

  // 4. Preserved legacy type
  if (reg.preservedLegacy.has(normalized)) {
    return {
      canonical_id: normalized,
      is_canonical: false,
      is_preserved_legacy: true,
      original_input: input,
      resolution_method: "preserved_legacy",
    };
  }

  // 5. Unknown — passthrough
  return {
    canonical_id: normalized,
    is_canonical: false,
    is_preserved_legacy: false,
    original_input: input,
    resolution_method: "passthrough",
  };
}

/**
 * Convenience: resolve and return just the canonical ID string.
 * This is the primary function downstream systems should call.
 */
export function resolveToCanonicalId(input: string): string {
  return resolveCanonical(input).canonical_id;
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * T5: Check if an input is a recognized canonical pipeline ID.
 */
export function isCanonical(input: string): boolean {
  if (!cache) throw new Error("Pipeline registry not loaded.");
  return cache.canonicalIds.has(input.toLowerCase().trim());
}

/**
 * T6: Check if an input is a preserved legacy type.
 */
export function isPreservedLegacy(input: string): boolean {
  if (!cache) throw new Error("Pipeline registry not loaded.");
  return cache.preservedLegacy.has(input.toLowerCase().trim());
}

/**
 * T7: Get metadata for a canonical pipeline type.
 * Returns null if the ID is not canonical.
 */
export function getCanonicalMetadata(
  canonicalId: string
): (PipelineTypeEntry & { category: string }) | null {
  if (!cache) throw new Error("Pipeline registry not loaded.");
  return cache.canonicalEntries.get(canonicalId.toLowerCase().trim()) || null;
}

/**
 * T8: Get all canonical pipeline IDs.
 */
export function getAllCanonicalIds(): string[] {
  if (!cache) throw new Error("Pipeline registry not loaded.");
  return Array.from(cache.canonicalIds);
}

/**
 * T9: Get all categories with their pipeline entries.
 */
export function getAllCategories(): PipelineCategory[] {
  if (!cache) throw new Error("Pipeline registry not loaded.");
  return cache.categories;
}

/**
 * Get all preserved legacy types.
 */
export function getAllPreservedLegacyTypes(): string[] {
  if (!cache) throw new Error("Pipeline registry not loaded.");
  return Array.from(cache.preservedLegacy);
}

/**
 * Get the registry version strings and hash.
 */
export function getPipelineRegistryVersion(): {
  types_version: string;
  aliases_version: string;
  registry_hash: string;
} {
  if (!cache) throw new Error("Pipeline registry not loaded.");
  return {
    types_version: cache.typesVersion,
    aliases_version: cache.aliasesVersion,
    registry_hash: cache.registryHash,
  };
}

/**
 * Get a human-readable label for any pipeline type (canonical, legacy, or alias).
 * Falls back to the input string with underscores replaced by spaces and title-cased.
 */
export function getPipelineLabel(input: string): string {
  if (!cache) throw new Error("Pipeline registry not loaded.");

  const resolved = resolveCanonical(input);
  if (resolved.is_canonical) {
    const meta = cache.canonicalEntries.get(resolved.canonical_id);
    if (meta) return meta.label;
  }

  // Fallback: title-case the input
  return input
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Batch resolve: resolve multiple pipeline types at once.
 * Returns a Map from original input → ResolvedPipeline.
 */
export function batchResolve(inputs: string[]): Map<string, ResolvedPipeline> {
  const results = new Map<string, ResolvedPipeline>();
  for (const input of inputs) {
    results.set(input, resolveCanonical(input));
  }
  return results;
}
