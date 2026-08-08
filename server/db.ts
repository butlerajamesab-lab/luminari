// Compatibility facade for the legacy Lighthouse helper surface.
//
// The 5k+ line helper implementation is preserved byte-for-byte in
// db-legacy.ts. Only the case/intake seams that straddle the legacy integer
// case identity and the Universal Intake Spine UUID identity, plus live
// legacy-table read contracts whose Drizzle declarations have drifted from
// production Postgres, are overridden here. Explicit exports take precedence
// over the export-star surface.

export * from "./db-legacy";
export {
  createCase,
  getCaseNarrative,
  upsertCaseNarrative,
} from "./case-contract-compat";
export { getCaseStats } from "./case-stats-intake-compat";
export { getCaseTimelineData } from "./case-timeline-intake-compat";
export {
  getSnapshot,
  getOpenSnapshot,
  getLatestSnapshot,
  getQuotesForDocument,
  getQuotesForCase,
  listClaims,
  getClaimsForDocument,
  getEntityRolesForDocument,
  listCorrelations,
  listCorrelationsEnriched,
  listFindings,
  listFindingsEnriched,
  listSignalFlags,
  listSignalFlagsEnriched,
} from "./case-runtime-read-compat";
export {
  listEntities,
  getEntity,
  verifyEntityOwnership,
  getEntityRolesForEntity,
  listRelationships,
  getRelationshipsForEntity,
  listRelationshipsEnriched,
  getRelationshipsForEntityEnriched,
} from "./case-runtime-intake-compat";
export { listEvents } from "./case-runtime-chronology-compat";
export {
  createFinding,
  listUnsupportedFindings,
  getProvenanceDrilldownMetrics,
  updateFindingClaimIds,
  updateFindingMatchMetadata,
} from "./provenance-runtime-compat";
export { getProvenanceDriftMetrics } from "./provenance-drift-runtime-compat";
