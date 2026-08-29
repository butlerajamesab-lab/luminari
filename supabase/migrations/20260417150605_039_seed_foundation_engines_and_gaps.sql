
-- Foundation engines into engine_registry_v3 (correct columns)
INSERT INTO engine_registry_v3 (
  engine_name, file_path, layer, family, status, notes
) VALUES
('Constants Enforcement Engine','server/engines/constants-enforcement.ts','L10','foundation','fully_implemented','Guards constitutional truth. FOUNDATION engine. canonical_locked.'),
('Schema Integrity Engine','server/engines/schema-integrity.ts','L10','foundation','fully_implemented','Prevents schema drift. FOUNDATION engine. canonical_locked.'),
('Seed Integrity Engine','server/engines/seed-integrity.ts','L10','foundation','fully_implemented','Validates idempotent seed behavior. FOUNDATION engine.'),
('Startup Integrity Check Engine','server/engines/startup-integrity.ts','L10','foundation','fully_implemented','Blocks startup when live help cannot be truthfully supported. FOUNDATION engine.'),
('Intake Staging Engine','server/engines/intake-staging.ts','L0','foundation','fully_implemented','Entry point for deterministic intake handling. FOUNDATION engine.'),
('Problem Normalization Engine','server/engines/problem-normalization.ts','L1','foundation','fully_implemented','Converts raw intake into normalized problem structures. FOUNDATION engine.'),
('Dedup Current-State Engine','server/engines/dedup-current-state.ts','L4','foundation','fully_implemented','Enforces supersession, current-state truth. FOUNDATION engine.'),
('Audit History Engine','server/engines/audit-history.ts','L10','foundation','fully_implemented','Cross-cutting audit spine for all meaningful actions. FOUNDATION engine.')
ON CONFLICT DO NOTHING;

-- Architecture gaps log
CREATE TABLE architecture_gaps_log (
  id              BIGSERIAL PRIMARY KEY,
  gap_id          VARCHAR(64) NOT NULL UNIQUE,
  gap_type        TEXT NOT NULL CHECK (gap_type IN ('code','schema','data','wiring','config')),
  description     TEXT NOT NULL,
  source          TEXT,
  resolution_status TEXT NOT NULL DEFAULT 'open' CHECK (resolution_status IN ('open','in_progress','resolved','wont_fix')),
  created_at      BIGINT NOT NULL DEFAULT 0
);

INSERT INTO architecture_gaps_log (gap_id, gap_type, description, source) VALUES
('GAP_ENGINE_TRACKING_WRAPPER','code','withEngineTracking() wrapper — referenced as required for all engines but no complete source found. All engines must register in engineRegistry and wrap with withEngineTracking().','ARTIFACT JSON gaps_not_found'),
('GAP_ENGINE_REGISTRY_POPULATION','data','Complete engineRegistry population incomplete. Target: 359 entries. Current: ~69. Full INSERT block is in Manus conversation 12971568.','ARTIFACT JSON gaps_not_found'),
('GAP_APP_ROUTER_FULL','code','appRouter full registration file not found in searchable conversations.','ARTIFACT JSON gaps_not_found'),
('GAP_DOMAIN_PACK_MENTAL_HEALTH','data','Full domain pack SQL for mental health pipeline — designed, not seeded.','ARTIFACT JSON gaps_not_found'),
('GAP_DOMAIN_PACK_ELDER_CARE','data','Full domain pack SQL for elder care pipeline — designed, not seeded.','ARTIFACT JSON gaps_not_found'),
('GAP_DOMAIN_PACK_CIVIL_RIGHTS','data','Full domain pack SQL for civil rights pipeline — designed, not seeded.','ARTIFACT JSON gaps_not_found'),
('GAP_DOMAIN_PACK_FAMILY_CUSTODY','data','Full domain pack SQL for family/custody pipeline — designed, not seeded.','ARTIFACT JSON gaps_not_found'),
('GAP_DOMAIN_PACK_TRIBAL_SOVEREIGNTY','data','Full domain pack SQL for tribal sovereignty pipeline — designed, not seeded.','ARTIFACT JSON gaps_not_found'),
('GAP_DRIZZLE_SCHEMA_TS','code','Complete Drizzle schema TypeScript column-level definitions not recovered. Canonical source: /home/ubuntu/forensic-engine/drizzle/schema.ts','ARTIFACT JSON gaps_not_found'),
('GAP_PIPELINE_JS_FULL_SOURCE','code','luminari_full_pipeline.js complete source — partial seen in conversation 12971568, rest cut off.','ARTIFACT JSON gaps_not_found'),
('GAP_STRATEGY_ENGINE_NOT_RUN','data','strategy_claim_candidates: 0 rows. strategy_viability_assessment: 0 rows. Strategy engine never run against real cases.','Session analysis'),
('GAP_CLAIM_DETECTION_NOT_RUN','data','claim_detection_results: 0 rows. claim_viability: 0 rows. Viability engine has never run end-to-end.','Session analysis'),
('GAP_AKB_COVERAGE_WA_ONLY','data','AKB coverage = Washington State only. 45 of 51 pipeline types have no domain rules. All non-WA FOIA lookup paths return no-match.','V3 diagnostic audit — WARNING-07'),
('GAP_GATE_2_5_SNAPSHOTID','wiring','Gate 2.5 missing — three enqueueDocument() calls in routers.ts do not propagate snapshotId. 3-line fix. Audit trail shows snapshotId=0.','V3 risk zones — WARNING-02'),
('GAP_PATTERN_FEEDBACK_LOOP_EMPTY','data','patternFeedbackLoop table has NEVER been written to. Core loop PAT-557 spec defined but not implemented. When wired: system becomes a navigation engine instead of analysis platform.','Core feedback loop spec');
