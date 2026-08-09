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
export {
  getFindingMatchDetail,
  markFindingRerunError,
} from "./provenance-batch-finding-compat";
export { getProvenanceDriftMetrics } from "./provenance-drift-runtime-compat";
export {
  createBatchRun,
  getActiveBatchRun,
  getBatchRunById,
  updateBatchProgress,
  resumeBatchRun,
  completeBatchRun,
  abortBatchRun,
  failBatchRun,
  getLatestBatchRun,
  listBatchRuns,
  expireStaleBatchRuns,
} from "./provenance-batch-runtime-compat";
export {
  isProvenanceAlertInCooldown,
  createProvenanceAlertEvent,
  listProvenanceAlertEvents,
} from "./provenance-alert-runtime-compat";
export {
  createBenefitApplication,
  listBenefitApplications,
  getBenefitApplication,
  updateBenefitApplicationStatus,
  updateBenefitApplicationNotes,
  updateBenefitApplicationDeadline,
  markDocumentSubmitted,
  deleteBenefitApplication,
  getUpcomingBenefitDeadlines,
  getBenefitApplicationSummary,
} from "./benefit-applications-live-compat";
export {
  getActionPathsByPipeline,
  getActionPathsByPipelines,
  getActionPathById,
  listAllActionPaths,
} from "./enforcement-action-paths-live-compat";
