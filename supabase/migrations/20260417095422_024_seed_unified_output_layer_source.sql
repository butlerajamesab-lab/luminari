
INSERT INTO unified_output_layer_source (
  file_name, file_type, line_count, status, flagged_assumptions, session_id, content, created_at
) VALUES

('unifiedNode.ts', 'typescript', 250, 'production_ready',
  ARRAY['None — pure type definitions, no schema dependencies'],
  'C8F631D2',
  '// src/types/unifiedNode.ts
// Pure type definitions. No imports from pipelines.
// UnifiedNodeType, UrgencyLevel, SourcePipeline, NodeLocation, NodeAction, UnifiedNode
// Source row types: MHResourceRow, SignalRow, DeadlineRow, FilingRow, BenefitRow, ProgramRow
// Consumer filter types: CivicMapFilter, DeadlineFilter, SignalFilter
// STATUS: COMPLETE — ~250 LOC',
  0),

('unified-output-layer.ts', 'typescript', 400, 'production_ready',
  ARRAY['None — pure transformation, no DB calls'],
  'C8F631D2',
  '// src/lib/unified-output-layer.ts
// Pure transformation layer. Receives pre-fetched rows. Zero DB calls. Zero schema changes.
// Projection functions: projectMHResources, projectSignals, projectDeadlines, projectFilings, projectBenefits, projectPrograms
// Aggregator: getUnifiedNodes (sorts by urgency desc, days_remaining asc)
// Consumer filters: filterForCivicMap, filterForDeadlineTracker, filterForEvidenceExplorer, filterByPolicyEvent
// STATUS: COMPLETE — ~400 LOC',
  0),

('unifiedOutput.router.ts', 'typescript', 500, 'production_ready',
  ARRAY['Table name: filing_templates (may differ)','Table name: programs (may differ)','Drizzle client import path (must match your setup)'],
  'C8F631D2',
  '// src/server/routers/unifiedOutput.router.ts
// tRPC router with 5 endpoints. All fetches wrapped in Promise.allSettled for fault isolation.
// Endpoints: getCivicMapNodes, getFilingNodes, getDeadlineNodes, getEvidenceNodes, getStreamMeta
// CRITICAL: Promise.allSettled pattern — dead table never blocks other data
// STATUS: COMPLETE — ~500 LOC',
  0),

('useUnifiedNodes.ts', 'typescript', 600, 'production_ready',
  ARRAY['trpc import path (must match your setup)'],
  'C8F631D2',
  '// src/hooks/useUnifiedNodes.ts
// React hooks for all consumers.
// Hooks: useCivicMapNodes, useDeadlineNodes, useFilingNodes, useEvidenceNodes, useUnifiedStreamMeta
// Utilities: groupByType, getGeoNodes, getUrgentNodes, getNodesByPolicyEvent, getOverdueDeadlines
// STATUS: COMPLETE — ~600 LOC',
  0);

