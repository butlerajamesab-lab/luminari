
-- ============================================================
-- MIGRATION 016: Seed Drift / Integrity Warnings
-- These must be fixed before dependent features are built
-- ============================================================

INSERT INTO engine_drift_warnings (
  warning_code, severity, description, fix,
  affected_engines, resolved, created_at
) VALUES

('WARNING-01', 'critical',
  'engines-v3-router.ts, engines-v4-router.ts, session-router.ts, session76-router.ts — 96 TypeScript compile errors from Zod v4 breaking change. Non-compiling files.',
  'Change every z.record(z.unknown()) to z.record(z.string(), z.unknown()) across all four files.',
  ARRAY['Session / V3-V4 Routers'],
  FALSE, 0),

('WARNING-02', 'high',
  'Three enqueueDocument() calls in routers.ts (analyzeNewUploads ~line 180, analyzeAllNew ~line 201, reanalyzeAll ~line 267) do not pass snapshotId. Audit trail shows snapshotId=null for these enqueue events.',
  'Gate 1.5 fix: 3-line change — pass snapshotId to each of the three enqueueDocument() calls.',
  ARRAY['Analysis Pipeline (Document Worker)'],
  FALSE, 0),

('WARNING-03', 'medium',
  'export-streaming.ts uses getLatestSnapshot() fallback when no snapshotId passed. Risk: wrong snapshot exported if new snapshot created between page load and export click.',
  'Enforce explicit snapshotId in export route. SpineViewer already does this correctly — apply same pattern.',
  ARRAY['Export System'],
  FALSE, 0),

('WARNING-04', 'medium',
  'Provenance drill-down resolves snapshot via listSnapshots[0] — implicit binding. If multiple sealed snapshots exist post-rebuild, could assert gate against wrong snapshot.',
  'Add explicit snapshotId field to findings table. Bind provenance queries to specific snapshot.',
  ARRAY['Snapshot Management (Gate System)'],
  FALSE, 0),

('WARNING-05', 'low',
  'retryFailedOnly resolves snapshot twice — once for gate assertion, once for operation. Snapshots should be identical in practice but code smell and potential race condition.',
  'Collapse to single snapshot resolution. Reuse resolved snapshot across both gate assertion and operation.',
  ARRAY['Snapshot Management (Gate System)'],
  FALSE, 0),

('WARNING-06', 'high',
  '26 of 31 background engines in DIAGNOSTIC-ENGINES.md have unknown router wiring, unknown table usage, and unconfirmed engineRegistry registration and withEngineTracking() wrapping. Must be audited before any dependent feature build.',
  'Full audit of each unknown engine: confirm file exists, confirm table usage, confirm withEngineTracking() wrapping, confirm engineRegistry registration.',
  ARRAY['Sunam Executor','System Copilot (Sunam)','Data Stream Manager','Admin Sovereign Control','Export Spine Engine','Restore Spine Engine','Entity Intelligence','Entity Evidence Threshold','Entity Transparency','Litigation Correlation Service','Problem Interpreter Service','Evidence Dossier','Investigative Query Engine','Systemic Intelligence Map','Institutional Accountability','Regulatory Capture','Crisis Prediction','Harm Index Service','Harm Map Service','Risk Forecast Service','Systemic Risk Forecast','Systemic Simulation','Attorney Match Service','Case Link Service','Intervention Timeline Engine','Time Travel Engine'],
  FALSE, 0),

('WARNING-07', 'high',
  'Interpretation Service (L7) status is scaffolded — defined in architecture but full implementation not confirmed. No code for CaseInterpretation output type or trpc.interpretation.* router procedures confirmed.',
  'Implement CaseInterpretation type, interpretationRouter procedures, and wire to appRouter. Enforce: read-only, no LLM, no writes, same snapshot = same output.',
  ARRAY['Interpretation Service'],
  FALSE, 0),

('WARNING-08', 'high',
  'AKB (Agency Knowledge Backbone) coverage is Washington State only. FOIA generation, gap detection escalation paths, and resource registry are incomplete for all other 49 states + DC + territories + tribal nations.',
  'Expand AKB coverage state by state using the state registry files already built. Priority: states already seeded in programs table.',
  ARRAY['Gap Detection Engine','FOIA Generator'],
  FALSE, 0);
