
-- ============================================================
-- MIGRATION 040: New knowledge documents from this upload
-- Registry audit, gap analysis, legal library brief,
-- knowledge backbone worker prompt, pipeline code recovery
-- ============================================================

INSERT INTO knowledge_documents (
  filename, file_type, category, summary, tags,
  source_thread, is_active, created_at, updated_at
) VALUES

('LUMINARI_REGISTRY_TABLE_MAPPING_INTEGRITY_AUDIT.md','md','architecture',
  'Registry integrity audit dated 2026-04-02. TiDB DB AXzmPhCfhqjYYjh6uJijzm had ONLY 4 tables (all empty): detected_signals, ingested_records, live_signals, sunam_gate_log. Schema defines 343 tables — 339 MISSING. 80+ tRPC routers reference missing tables causing query failures. 7 unused React components (38KB bloat): AIChatBox, DomainAgenciesPanel, DomainEscalationsPanel, DomainFormsPanel, EscalationPath, ManusDialog, SessionPanel. 6 routers wired to 3 UI pages (MissionControl, SignalRegistry, StructuralDiagnosticsLens). All data tables empty at time of audit. This is a MANUS TiDB database state — not this Supabase project.',
  ARRAY['registry_audit','manus_state','tidb','schema_mismatch','343_tables','4_actual'],
  'luminari-rebuild-apr-2026', TRUE, 0, 0),

('Luminari_Registry_Gap_Analysis_1.md','md','architecture',
  'Gap analysis dated 2026-03-06 across 9 state registries. 3 tiers: Active (MO, PA, WA), Partial (AZ, CA, OR), Not Ingested (FL, NY, TX). Key gaps: navigation contacts not in engine for MO; PA missing 3 clusters (DV, utilities, immigration); WA has full coverage but navigation contacts gap. FL, NY, TX: zero engine presence, full ingestion required. Research is ahead of engine across all states. 16 pipeline categories tracked across: Family & Custody (15 pipelines), Justice & Accountability (15), Financial & Consumer (12), Housing & Tenant Rights (12), Insurance & Healthcare (12), Employment & Workplace (11), Elder Care (11), Market & Corporate (11), Public Safety (11), Tribal & Indigenous (10), Environment (9), LGBTQ+ (8), Government Benefits (8).',
  ARRAY['registry_gap','state_coverage','9_states','pipeline_categories','knowledge_backbone'],
  'luminari-rebuild-apr-2026', TRUE, 0, 0),

('Legal_Library_Enrichment_Brief.md','md','knowledge',
  'Legal Library state as of 2026-03-10. 5 tables seeded from Unified Pipeline Registry (UPR): Statutes & Regulations (347 entries — missing real statute citations), Case Law (0 entries — ENTIRE TABLE EMPTY, highest priority), Enforcement Records (255 entries — missing complaint types, response times, outcomes), Weak Joints (536 entries — missing real-world evidence sources, severity validation), Contradictions (30 entries — missing doctrine citations, reform status). 16 pipeline categories covered. 1,168 total entries. Research team enrichment task: add real statute citations, fill case law from scratch, validate weak joint severity.',
  ARRAY['legal_library','case_law_empty','1168_entries','enrichment_target','weak_joints'],
  'luminari-rebuild-apr-2026', TRUE, 0, 0),

('Knowledge_Backbone_Population_Worker_Prompt.md','md','knowledge',
  'Worker prompt for filling 13 empty or critically sparse knowledge backbone tables. Priority order: (1) Remedy Feasibility Rules (5 → 40+ target, schema: remedyType, claimType, jurisdiction, feasibilityScore, requiredElements, disqualifyingFactors, typicalTimelineMonths, successRatePct, notes); (2) Weak Joint Registry (0 → 30+ target, schema: claimType, weakJointLabel, description, attackVector, mitigationStrategy, severity, affectedPipelineStage); (3+) additional tables. Coverage: fair housing, employment discrimination, wage theft, consumer fraud, civil rights (42 USC 1983). Jurisdictions: federal + Washington State + Seattle. System state at time: 223 jurisdictions, 3,395 programs, 1,362 agencies, 879 enforcement records, 53 procedural paths, 31 deadline rules, 29 escalation routes.',
  ARRAY['worker_prompt','knowledge_backbone','remedy_feasibility','weak_joints','13_empty_tables'],
  'luminari-rebuild-apr-2026', TRUE, 0, 0),

('LUMINARI_UI_PACK_METADATA.md','md','architecture',
  'UI design system specification v1.0.0. Theme: Clinical Dark (Judicial Grade). Stack: React 19 + Tailwind CSS 4 + shadcn/ui. Color space: OKLCH (perceptually uniform). Accessibility: WCAG 2.1 AA. Design token schema: token_id, category, name, value, cssVariable, description, usage[], wcag_contrast_ratio, semantic_role, fallback, dark_mode, light_mode, responsive_variants[], animation_compatible, deprecated, version_introduced. All tokens follow metadata-driven architecture.',
  ARRAY['ui_design_system','design_tokens','OKLCH','clinical_dark','WCAG_AA'],
  'luminari-rebuild-apr-2026', TRUE, 0, 0),

('luminari-cross-correlation-verification.md','md','research',
  'Cross-correlation verification toolkit for bidirectional team analysis. Tests if teams starting from opposite directions (micro→macro vs macro→micro) find the same collision points. Applied to: DV (Team A vs Team C) and Economic (Team B vs Team D) domains. Verification pattern: denial at micro level should trace to same macro-level gap regardless of traversal direction. If match → system coherent. If no match → architectural blind spot. Template includes: Denial comparison, Escalation comparison, GAP comparison, Collision point comparison, Contradiction comparison sections.',
  ARRAY['verification','bidirectional','cross_correlation','collision_points','system_coherence'],
  'luminari-rebuild-apr-2026', TRUE, 0, 0),

('ARTIFACT_3_CODE_MANIFEST_recovery.js','js','engine',
  'luminari_full_pipeline.js partial recovery. 5-stage SQLite pipeline confirmed: (1) bootstrapMetadataTables() — creates 8 pipeline tables, (2) legalCaseLoader(db) — loads cases from CASELAW_PATH JSON, (3) claimEngine(db) — detects claim patterns, (4) signalEngine(db) — generates signals from claims, (5) interpretationEngine(db) — projection-only, no writes, (6) escalationEngine(db) — routes to escalation targets. DB: 19b4009b (3).db. Case law source: 17fd43d0-1c63-11f1-a004-e3dd95325e46.json. Architecture constraints: no new tables after bootstrap, single runner, deterministic queries, full auditability via ruleSourceTrace. Full source in Manus conversation 12971568.',
  ARRAY['pipeline','sqlite','5_stages','luminari_full_pipeline','recovery','partial_source'],
  'luminari-rebuild-apr-2026', TRUE, 0, 0),

('luminari-uploader.html','html','architecture',
  'Luminari knowledge upload tool — standalone HTML file. Stack: vanilla JS, Space Mono + Syne fonts. Design: Clinical dark theme (--bg: #060810, --accent: #00e5ff, --accent2: #7c3aed). Purpose: upload knowledge files to Luminari knowledge backbone from browser. Used to push documents to the platform without Manus terminal access.',
  ARRAY['uploader','html_tool','knowledge_upload','clinical_dark'],
  'luminari-rebuild-apr-2026', TRUE, 0, 0);
