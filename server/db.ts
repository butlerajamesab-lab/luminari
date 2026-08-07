// Compatibility facade for the legacy Lighthouse helper surface.
//
// The 5k+ line helper implementation is preserved byte-for-byte in
// db-legacy.ts. Only the case/intake seams that straddle the legacy integer
// case identity and the Universal Intake Spine UUID identity are overridden
// here. Explicit exports take precedence over the export-star surface.

export * from "./db-legacy";
export {
  createCase,
  getCaseStats,
  getCaseTimelineData,
  getCaseNarrative,
  upsertCaseNarrative,
} from "./case-contract-compat";
