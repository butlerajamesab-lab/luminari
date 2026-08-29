
-- ============================================================
-- MIGRATION 038: SKILL.md Canonical Architecture Reference
-- 54-engine family breakdown, 33 services, 18 workers,
-- 11 tRPC routers, protected engines, Drizzle schema files
-- Source: ARTIFACT JSON from this session
-- ============================================================

-- Engine families (54-engine canonical breakdown)
CREATE TABLE engine_families_canonical (
  id            BIGSERIAL PRIMARY KEY,
  family_id     VARCHAR(4) NOT NULL UNIQUE,  -- A, B, C ... J
  family_name   VARCHAR(128) NOT NULL,
  engine_count  INT NOT NULL,
  engines       TEXT[] NOT NULL,
  source        TEXT DEFAULT 'conversation 18f2dc0e — Alexander canonical count, fully audited',
  created_at    BIGINT NOT NULL DEFAULT 0
);

INSERT INTO engine_families_canonical (family_id, family_name, engine_count, engines) VALUES
('A','Cognitive Engines',8,ARRAY['Intake Engine','Evidence Ontology Engine','Pipeline Engine','Contradiction Engine','Obligation Mapping Engine','Gap Detection Engine','Narrative Stabilization Engine','Evidence Unit Normalization Engine']),
('B','Worker Engines',14,ARRAY['Canon Lock Engine (canonlockv1)','Canon Path Engine (canonpathv1)','Consent Engine (revocation)','Consent Scope Engine','Routing Engine','Validation Engine','Normalization Engine','Classification Engine','Mapping Engine','Tally Engine','Aggregation Engine','Drift Detection Engine','Reintegration Engine','Format Checking Engine']),
('C','Registry Engines',7,ARRAY['Program Engine','Workflow Engine','Step Engine','Route Engine','Benefit Engine','Appeal Engine','Enforcement Engine']),
('D','Provenance Engines',4,ARRAY['Source Document Engine','Extraction Run Engine','Hash-Anchoring Engine','Lineage Reconstruction Engine']),
('E','Error & Governance Engines',7,ARRAY['ErrorEvent Engine','Error Clustering Engine','Proposal Engine','GateRules Engine','ReintegrationEvent Engine','Replay Engine','Undo Engine']),
('F','World-Model Engines',6,ARRAY['Region Engine','Cluster Engine','Node Engine','Pattern Engine','Stream Engine','Topology Engine']),
('G','Safety Engines',4,ARRAY['Neutralization Engine','Harm-Scan Engine','Deduplication Engine','Language Safety Engine']),
('H','Operator Engines',4,ARRAY['Operator Protocol Engine','Intent Gate Engine','Drift Guard Engine','Communication Discipline Engine']),
('I','Deployment Engines',4,ARRAY['Prompt Engine','Stack Engine','Metadata Loader Engine','Stack Registry Engine']),
('J','Legal/Systemic Engines',4,ARRAY['Case Context Engine','Contradiction Map Engine','Motion Outline Engine','Systemic Failure Engine']);

-- Protected engines (load-bearing — break = system loses structural integrity)
CREATE TABLE protected_engines (
  id              BIGSERIAL PRIMARY KEY,
  engine_id       VARCHAR(128) NOT NULL UNIQUE,
  engine_name     VARCHAR(256) NOT NULL,
  layer           VARCHAR(8) NOT NULL,
  protection_reason TEXT NOT NULL,
  note            TEXT,
  created_at      BIGINT NOT NULL DEFAULT 0
);

INSERT INTO protected_engines (engine_id, engine_name, layer, protection_reason, note) VALUES
('interpretation_engine','Interpretation Engine','L7','Trust boundary between recorded reality and accountable action. Projection-only, no side effects, complete traceability. One instance ONLY — ever.','If this breaks, the system loses forensic integrity. No tables at L7. No side effects. No mutations.'),
('sunam_execution_engine','Sunam Execution Engine','L11','Sovereign control plane. Unauthorized actions could bypass governance.','All Sunam actions must be governed and hash-chained.'),
('service_dispatcher_engine','Service Dispatcher Engine','L11','Control-plane service routing.','Routes all engine invocations through governance layer.'),
('constitutional_guard_engine','Constitutional Guard Engine','L10','Governance enforcement. Blocking layer.','Cannot be bypassed. Runs on every mutation. Hash chain verified.');

-- Services registry (33 canonical services from SKILL.md)
CREATE TABLE services_registry (
  id              BIGSERIAL PRIMARY KEY,
  service_name    VARCHAR(256) NOT NULL UNIQUE,
  file_path       VARCHAR(512) NOT NULL,
  layer           VARCHAR(8),
  description     TEXT,
  created_at      BIGINT NOT NULL DEFAULT 0
);

INSERT INTO services_registry (service_name, file_path, layer) VALUES
('intake-service','server/services/intake-service.ts','L0'),
('source-registry-service','server/services/source-registry-service.ts','L0'),
('provenance-service','server/services/provenance-service.ts','L1'),
('document-parser-service','server/services/document-parser-service.ts','L2'),
('quote-extraction-service','server/services/quote-extraction-service.ts','L2'),
('entity-extraction-service','server/services/entity-extraction-service.ts','L2'),
('timeline-extraction-service','server/services/timeline-extraction-service.ts','L2'),
('field-extraction-service','server/services/field-extraction-service.ts','L2'),
('normalization-service','server/services/normalization-service.ts','L4'),
('claim-validation-service','server/services/claim-validation-service.ts','L4'),
('canonical-key-service','server/services/canonical-key-service.ts','L4'),
('statute-registry-service','server/services/statute-registry-service.ts','L3'),
('doctrine-service','server/services/doctrine-service.ts','L3'),
('forms-service','server/services/forms-service.ts','L3'),
('agency-service','server/services/agency-service.ts','L3'),
('resource-registry-service','server/services/resource-registry-service.ts','L3'),
('workflow-registry-service','server/services/workflow-registry-service.ts','L3'),
('pattern-detection-service','server/services/pattern-detection-service.ts','L6'),
('signal-builder-service','server/services/signal-builder-service.ts','L6'),
('actor-fingerprint-service','server/services/actor-fingerprint-service.ts','L6'),
('civic-signal-service','server/services/civic-signal-service.ts','L6'),
('interpretation-service','server/services/interpretation-service.ts','L7'),
('action-router-service','server/services/action-router-service.ts','L8'),
('workflow-runner-service','server/services/workflow-runner-service.ts','L8'),
('deadline-service','server/services/deadline-service.ts','L8'),
('escalation-service','server/services/escalation-service.ts','L8'),
('resolution-service','server/services/resolution-service.ts','L8'),
('statement-of-facts-service','server/services/statement-of-facts-service.ts','L9'),
('foia-assembly-service','server/services/foia-assembly-service.ts','L9'),
('evidence-packet-service','server/services/evidence-packet-service.ts','L9'),
('export-service','server/services/export-service.ts','L9'),
('system-health-service','server/services/system-health-service.ts','L10'),
('audit-service','server/services/audit-service.ts','L10'),
('constitutional-test-service','server/services/constitutional-test-service.ts','L10');

-- Workers registry (18 canonical workers from SKILL.md)
CREATE TABLE workers_registry (
  id              BIGSERIAL PRIMARY KEY,
  worker_name     VARCHAR(256) NOT NULL UNIQUE,
  file_path       VARCHAR(512) NOT NULL,
  layer           VARCHAR(8),
  description     TEXT,
  created_at      BIGINT NOT NULL DEFAULT 0
);

INSERT INTO workers_registry (worker_name, file_path, layer) VALUES
('documentIngestionWorker','workers/documentIngestionWorker.ts','L1'),
('provenanceWorker','workers/provenanceWorker.ts','L1'),
('documentParseWorker','workers/documentParseWorker.ts','L2'),
('quoteExtractionWorker','workers/quoteExtractionWorker.ts','L2'),
('entityExtractionWorker','workers/entityExtractionWorker.ts','L2'),
('timelineExtractionWorker','workers/timelineExtractionWorker.ts','L2'),
('normalizationWorker','workers/normalizationWorker.ts','L4'),
('validationWorker','workers/validationWorker.ts','L4'),
('patternWorker','workers/patternWorker.ts','L6'),
('signalWorker','workers/signalWorker.ts','L6'),
('alertsWorker','workers/alertsWorker.ts','L6'),
('registryIngestionWorker','workers/registryIngestionWorker.ts','L3'),
('resourceCoverageWorker','workers/resourceCoverageWorker.ts','L3'),
('deadlineWorker','workers/deadlineWorker.ts','L8'),
('escalationWorker','workers/escalationWorker.ts','L8'),
('resolutionWorker','workers/resolutionWorker.ts','L8'),
('constitutionalGuardWorker','workers/constitutionalGuardWorker.ts','L10'),
('determinismCheckWorker','workers/determinismCheckWorker.ts','L10');

-- tRPC routers map (11 canonical routers from SKILL.md)
CREATE TABLE trpc_routers_registry (
  id              BIGSERIAL PRIMARY KEY,
  router_prefix   VARCHAR(128) NOT NULL UNIQUE,
  procedures      TEXT[] NOT NULL,
  layer_note      TEXT,
  critical_note   TEXT,
  created_at      BIGINT NOT NULL DEFAULT 0
);

INSERT INTO trpc_routers_registry (router_prefix, procedures, layer_note, critical_note) VALUES
('trpc.intake.*',ARRAY['uploadDocument','createCase','attachDocumentToCase','getIntakeStatus'],'L0',NULL),
('trpc.provenance.*',ARRAY['getDocumentTrail','getSnapshot','getQuoteSources'],'L1',NULL),
('trpc.extraction.*',ARRAY['getEntities','getEvents','getQuotes','getDocumentStructure'],'L2',NULL),
('trpc.registry.*',ARRAY['getStatutes','getDoctrine','getForms','getAgencies','getEscalations','getResources','getWorkflows'],'L3',NULL),
('trpc.validation.*',ARRAY['getClaimRules','getValidationFailures','getCanonicalMappings'],'L4',NULL),
('trpc.case.*',ARRAY['getClaims','getFindings','getMissingRecords','getTimeline','getEntities'],'L5',NULL),
('trpc.signal.*',ARRAY['getCaseSignals','getSystemSignals','getGeographySignals','getPatternOccurrences'],'L6',NULL),
('trpc.interpretation.*',ARRAY['getCaseInterpretation','getComparisonMatrix','getEvidenceGaps','getAvailableActions'],'L7','ALL procedures are wrappers over interpretation-service.ts ONLY. No other service may be called from this router.'),
('trpc.action.*',ARRAY['getWorkflowOptions','getCaseActions','createActionInstance','getDeadlines','getEscalationPaths'],'L8',NULL),
('trpc.export.*',ARRAY['getStatementOfFacts','buildFoiaPacket','buildEvidencePacket','exportCaseBundle'],'L9',NULL),
('trpc.admin.*',ARRAY['getMissionControlMetrics','getSovereignControlState','getSystemHealth','getConstitutionalTestStatus'],'L10',NULL);

-- Drizzle schema files registry
CREATE TABLE drizzle_schema_files (
  id              BIGSERIAL PRIMARY KEY,
  file_name       VARCHAR(256) NOT NULL UNIQUE,
  file_path       VARCHAR(512) NOT NULL,
  layer_group     VARCHAR(64),
  tables_covered  TEXT[],
  created_at      BIGINT NOT NULL DEFAULT 0
);

INSERT INTO drizzle_schema_files (file_name, file_path, layer_group) VALUES
('intake.ts','drizzle/schema/intake.ts','L0-L1'),
('provenance.ts','drizzle/schema/provenance.ts','L1'),
('extraction.ts','drizzle/schema/extraction.ts','L2'),
('evidence.ts','drizzle/schema/evidence.ts','L5'),
('validation.ts','drizzle/schema/validation.ts','L4'),
('registry.ts','drizzle/schema/registry.ts','L3'),
('patterns.ts','drizzle/schema/patterns.ts','L6'),
('actions.ts','drizzle/schema/actions.ts','L8'),
('outcomes.ts','drizzle/schema/outcomes.ts','L8-L9'),
('admin.ts','drizzle/schema/admin.ts','L10');

-- Enum constraints reference (from SKILL.md)
CREATE TABLE enum_constraints_ref (
  id            BIGSERIAL PRIMARY KEY,
  table_name    VARCHAR(128) NOT NULL,
  column_name   VARCHAR(128) NOT NULL,
  allowed_values TEXT[] NOT NULL,
  notes         TEXT,
  created_at    BIGINT NOT NULL DEFAULT 0
);

INSERT INTO enum_constraints_ref (table_name, column_name, allowed_values, notes) VALUES
('doctrine_graph_edges','strength',ARRAY['strong','moderate','contextual'],NULL),
('narrative_templates','nt_audience',ARRAY['investigator','advocate','legal','executive'],NULL),
('contradiction_templates','ct_severity',ARRAY['critical','high','medium','low'],NULL),
('jurisdiction_registry','jurisdictionType',ARRAY['federal','state','county','city','tribal','territory'],NULL),
('workflow_master','workflowStatus',ARRAY['draft','active','deprecated','archived'],NULL),
('engine_runs','engineRunStatus',ARRAY['pending','running','success','failed','unknown','superseded'],NULL),
('problem_instances','problem_type',ARRAY['DENIAL','ESCALATION','GAP','CONTRADICTION','SIGNAL'],NULL),
('problem_instances','scale',ARRAY['micro','meso','macro','global'],NULL),
('problem_instances','validation_status',ARRAY['PENDING','VALIDATED','FLAGGED','SUPERSEDED'],NULL);

-- Engine inclusion doctrine (categories from SKILL.md)
CREATE TABLE engine_inclusion_doctrine (
  id              BIGSERIAL PRIMARY KEY,
  category        VARCHAR(128) NOT NULL,
  engines         TEXT[] NOT NULL,
  source          TEXT DEFAULT 'SKILL.md Checkpoint Constitution section',
  created_at      BIGINT NOT NULL DEFAULT 0
);

INSERT INTO engine_inclusion_doctrine (category, engines) VALUES
('foundation',ARRAY['Constants Enforcement','Schema Integrity','Seed Integrity','Startup Integrity Check','Intake Staging','Problem Normalization','Dedup/Current-State','Audit/History']),
('claims_evidence',ARRAY['Claim Detection','Claim Validation','Evidence Mapping','Evidence Strength','Viability']),
('signals_patterns',ARRAY['Signal Extraction','Signal Fingerprinting','Signal Registry','Pattern Detection','Trend Window','Anomaly Detection']),
('structural_analysis',ARRAY['Conflict Detection','Conflict Classification','Weak Joint Trigger','Population Impact','Vector Propagation','Collision Detection']),
('legal_grounding',ARRAY['Legal Corpus Loader','Doctrine Application','Rule Matching','Burden Shifting','Preemption','Interpretation']),
('procedural_strategy',ARRAY['Procedural Path','Jurisdiction Resolution','Deadline Calculation','Filing Generator','Remedy Feasibility','Strategy']),
('escalation_action',ARRAY['Escalation Routing','Interagency Referral','Contact Resolution','Packet Assembly','Export/LumenSend']),
('system_level',ARRAY['System Hardening','Reform','Policy Change','Coalition Intelligence','Campaign','Memory']),
('resource_knowledge_benefits',ARRAY['Knowledge Loader','Coverage Analysis','Registry Sync','Resource Intelligence','Eligibility & Avenue Engine','Benefit Lifecycle Engine','Benefit Optimization/Threshold Engine']);
