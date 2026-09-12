import type { inferRouterOutputs } from "@trpc/server";
import type { dualLensRouter } from "../../../server/routers/dual-lens";

type Output = inferRouterOutputs<typeof dualLensRouter>;

// Translate the actual snake_case wire contract once at the UI boundary.
export const diagnosticsView = {
  barriers: (data: Output["getBarrierClusters"]) => ({
    ...data,
    totalBarriers: data.total_barriers,
  }),
  doctrines: (data: Output["getDoctrineClusters"]) => ({
    ...data,
    totalDoctrines: data.total_doctrines,
    doctrineEdges: data.doctrine_edges,
    doctrineEdgesAvailable: data.doctrine_edges_available,
    doctrineEdgesUnavailableReason: data.doctrine_edges_unavailable_reason,
    returnedDoctrines: data.returned_doctrines,
    nextOffset: data.next_offset,
  }),
  institutions: (data: Output["getAffectedInstitutions"]) => ({
    totalAgencies: data.total_agencies,
    institutions: data.institutions.map((i) => ({
      id: i.id,
      agency: i.agency,
      agencyShort: i.agency_short,
      domain: i.domain,
      signalCount: i.signal_count,
      barrierCount: i.barrier_count,
      issueScore: i.issue_score,
      statute: i.statute,
      attributionStatus: i.attribution_status,
    })),
  }),
  signals: (data: Output["getSignalPatterns"]) => ({
    ...data,
    totalSignals: data.total_signals,
  }),
  paths: (data: Output["getSystemicPaths"]) => ({
    ...data,
    totalBarriers: data.total_barriers,
  }),
  live: (data: Output["getLiveSignalsForDiagnostics"]) => data,
  summary: (data: Output["getLiveSignalSummary"]) => ({
    ...data,
    totalCurrent: data.total_current,
    lastDetectedAt: data.last_detected_at,
  }),
  stats: (data: Output["stats"]) => ({
    structuralDiagnostics: data.structural_diagnostics,
    graph: data.graph,
  }),
};
