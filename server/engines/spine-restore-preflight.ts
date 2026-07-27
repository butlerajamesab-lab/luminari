import type { spine_bundle_type } from "./spine-bundle-contract";

export type spine_restore_type = "full" | "schema" | "config" | "deployment";

const RESTORE_CAPABILITIES: Record<spine_bundle_type, Set<spine_restore_type>> = {
  full: new Set(["full", "schema", "config", "deployment"]),
  deployment: new Set(["deployment", "schema", "config"]),
  schema: new Set(["schema"]),
  config: new Set(["config"]),
};

/**
 * Validate every requested restore section before any target schema, registry,
 * or data mutation starts. The audit run may already exist, but the recovery
 * target remains untouched until this function succeeds.
 */
export function preflight_spine_restore_request(
  bundle: any,
  requestedRestoreType: spine_restore_type,
): { manifestType: spine_bundle_type; restoreType: spine_restore_type } {
  const manifestType = bundle?._manifest?.bundleType as spine_bundle_type | undefined;
  if (!manifestType || !RESTORE_CAPABILITIES[manifestType]) {
    throw new Error(`Spine bundle has an unsupported manifest type: ${String(manifestType ?? "missing")}`);
  }

  if (!RESTORE_CAPABILITIES[manifestType].has(requestedRestoreType)) {
    throw new Error(
      `Spine ${manifestType} bundle cannot execute requested ${requestedRestoreType} restore`,
    );
  }

  const needsSchema = ["full", "schema", "deployment"].includes(requestedRestoreType);
  const needsConfig = ["full", "config", "deployment"].includes(requestedRestoreType);
  const needsData = requestedRestoreType === "full";

  if (needsSchema && !Array.isArray(bundle?.schema?.tables)) {
    throw new Error(`Restore type ${requestedRestoreType} requires a complete schema.tables section`);
  }
  if (needsConfig && !Array.isArray(bundle?.config?.registryTables)) {
    throw new Error(`Restore type ${requestedRestoreType} requires a complete config.registryTables section`);
  }
  if (needsData && !Array.isArray(bundle?.data)) {
    throw new Error("Full restore requires a complete data section");
  }

  return { manifestType, restoreType: requestedRestoreType };
}
