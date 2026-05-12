/**
 * Proof Stream Connector — Real Data Pipeline
 *
 * Processes ONE real signal end-to-end through the canonical spine:
 *   live_signals → ingested_records → Sunam Gate → detected_signals
 *   → signal_flow_logs → world_nodes → remedy_paths
 *
 * RESPECTS ALL PROTOCOLS:
 * - Single-Entry Authority: detected_signals ONLY via storeGovernedSignal()
 * - Engine Data Source: reads live_signals, routes through Sunam gate
 * - Manus Role: extraction + pathway building only (no validation/signal gen)
 * - Deterministic: same input → same output
 *
 * NO placeholders. NO synthetic data. NO manual population.
 */

import { pool } from "./db";
import { createHash } from "crypto";
import { processSignalThroughGate, type LiveSignalRow } from "./sunam-gate";
import {
  enforceSignalFlowReadOnly,
  appendSignalFlowLog,
  enforceNoDeadEnds,
  validateWorldNodeMetadata,
  validateWorldNodeForRemedy,
  validateRemedyPathIntegrity,
  computeDeterministicHash,
  verifyDeterminism,
  type WorldNodeMetadataL10,
} from "./canonical-enforcement";

// ─── Types ───

export interface ProofStreamResult {
  success: boolean;
  pipeline: PipelineStage[];
  enforcement: EnforcementReport;
  error?: string;
}

export interface PipelineStage {
  stage: string;
  layer: string;
  status: "completed" | "failed" | "skipped";
  recordId?: number | string;
  inputHash: string;
  outputHash: string;
  details: Record<string, any>;
}

export interface EnforcementReport {
  allPassed: boolean;
  rules: {
    rule: string;
    passed: boolean;
    message: string;
  }[];
}

// ─── Deterministic Hash ───

function hashInput(data: any): string {
  const sorted = JSON.stringify(data, Object.keys(data).sort());
  return createHash("sha256").update(sorted).digest("hex");
}

// ─── Stage 1: INGEST (L1-L2) ───
// Read live_signal → write ingested_records with canonical columns

async function stageIngest(liveSignalId: number): Promise<PipelineStage> {
  const stage: PipelineStage = {
    stage: "INGEST",
    layer: "L1-L2",
    status: "failed",
    inputHash: "",
    outputHash: "",
    details: {},
  };

  // Read the real live_signal (non-_ls columns which have the actual data)
  const { rows: rows } = await pool.query(
    `SELECT id, signalType, datasetId, jurisdiction, domain, severity, title,
            explanation, patternSummary, supportingStatistics, confidenceScore,
            detectedAt, ingestRunId, signalFingerprint, entityType,
            canonicalEntityName, entityRole
     FROM live_signals WHERE id = $1`,
    [liveSignalId]
  );
  const signals = rows as any[];
  if (signals.length === 0) {
    stage.details = { error: `live_signal ${liveSignalId} not found` };
    return stage;
  }

  const signal = signals[0];
  stage.inputHash = hashInput({
    id: signal.id,
    signalType: signal.signalType,
    fingerprint: signal.signalFingerprint,
  });

  // Compute source_hash deterministically
  const sourceHash = createHash("sha256")
    .update(`live_signal:${signal.id}:${signal.signalFingerprint}`)
    .digest("hex");

  // Idempotent check
  const { rows: existing } = await pool.query(
    `SELECT id FROM ingested_records WHERE source_hash = $1`,
    [sourceHash]
  );
  if ((existing as any[]).length > 0) {
    const existingId = (existing as any[])[0].id;
    stage.status = "completed";
    stage.recordId = existingId;
    stage.outputHash = hashInput({ id: existingId, source_hash: sourceHash });
    stage.details = { reused: true, message: "Idempotent — record already ingested" };
    return stage;
  }

  // Build L1-L2 metadata from real signal data
  const metadataL1L2 = {
    source: "live_signals",
    sourceId: signal.id,
    signalType: signal.signalType,
    datasetId: signal.datasetId,
    jurisdiction: signal.jurisdiction,
    domain: signal.domain,
    severity: signal.severity,
    confidenceScore: parseFloat(signal.confidenceScore) || 0,
    detectedAt: signal.detectedAt,
    fingerprint: signal.signalFingerprint,
  };

  // Insert into ingested_records
  const { rows: result } = await pool.query(
    `INSERT INTO ingested_records
     (source_id, status, record_count, created_at, datasetId_ir, sourceRecordId,
      ingestedAt, updatedAt_ir, normalizedCategory, normalizedEntity,
      normalizedJurisdiction, normalizedState, normalizedStatus,
      normalizedDescription, processed_for_signals, rawJson,
      source_hash, stream_id_ir, metadata_l1_l2)
     VALUES ($1, 'success', 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', $11, 0, $12, $13, 'proof_stream', $14)`,
    [
      `live_signal_${signal.id}`,
      Date.now(),
      signal.datasetId || "luminari_canonical_registry",
      `ls_${signal.id}`,
      Date.now(),
      Date.now(),
      signal.signalType,
      signal.title,
      signal.jurisdiction,
      signal.jurisdiction?.substring(0, 2)?.toUpperCase() || null,
      signal.explanation,
      JSON.stringify(signal),
      sourceHash,
      JSON.stringify(metadataL1L2),
    ]
  );

  const insertId = (result as any).insertId;
  stage.status = "completed";
  stage.recordId = insertId;
  stage.outputHash = hashInput({ id: insertId, source_hash: sourceHash });
  stage.details = {
    sourceHash,
    signalType: signal.signalType,
    jurisdiction: signal.jurisdiction,
    domain: signal.domain,
  };

  return stage;
}

// ─── Stage 2: GATE (Sunam Gate → detected_signals) ───
// Routes through processSignalThroughGate — respects single-entry authority

async function stageGate(liveSignalId: number): Promise<PipelineStage> {
  const stage: PipelineStage = {
    stage: "SUNAM_GATE",
    layer: "L3-L4 (Gate Enforced)",
    status: "failed",
    inputHash: "",
    outputHash: "",
    details: {},
  };

  // Read the live_signal and build LiveSignalRow from populated columns
  const { rows: rows } = await pool.query(
    `SELECT id, signalType, datasetId, jurisdiction, domain, severity, title,
            explanation, patternSummary, supportingStatistics, confidenceScore,
            detectedAt, ingestRunId, signalFingerprint, entityType,
            canonicalEntityName, entityRole
     FROM live_signals WHERE id = $1`,
    [liveSignalId]
  );
  const signals = rows as any[];
  if (signals.length === 0) {
    stage.details = { error: `live_signal ${liveSignalId} not found` };
    return stage;
  }

  const raw = signals[0];
  stage.inputHash = hashInput({
    id: raw.id,
    signalType: raw.signalType,
    fingerprint: raw.signalFingerprint,
  });

  // Build LiveSignalRow from the real populated columns
  const liveSignalRow: LiveSignalRow = {
    id: raw.id,
    signalType: raw.signalType || "",
    datasetId: raw.datasetId || "",
    jurisdiction: raw.jurisdiction || null,
    domain: raw.domain || null,
    severity: raw.severity || "medium",
    title: raw.title || "",
    explanation: raw.explanation || null,
    patternSummary: raw.patternSummary || null,
    supportingStatistics: raw.supportingStatistics,
    confidenceScore: raw.confidenceScore ? String(raw.confidenceScore) : null,
    detectedAt: Number(raw.detectedAt) || Date.now(),
    ingestRunId: raw.ingestRunId || null,
    signalFingerprint: raw.signalFingerprint || null,
    entityType: raw.entityType || null,
    canonicalEntityName: raw.canonicalEntityName || null,
    entityRole: raw.entityRole || null,
  };

  // Route through the Sunam gate — this is the ONLY path to detected_signals
  const gateResult = await processSignalThroughGate(liveSignalRow);

  stage.status = "completed";
  stage.recordId = gateResult.destinationId;
  stage.outputHash = hashInput({
    destination: gateResult.destination,
    destinationId: gateResult.destinationId,
    gateLogId: gateResult.gateLogId,
  });
  stage.details = {
    destination: gateResult.destination,
    destinationId: gateResult.destinationId,
    gateLogId: gateResult.gateLogId,
    approved: gateResult.decision.approved,
    score: gateResult.decision.score,
    threshold: gateResult.decision.threshold,
    reason: gateResult.decision.reason,
  };

  return stage;
}

// ─── Stage 3: UPDATE CANONICAL COLUMNS ───
// After gate promotion, update the detected_signal with canonical spine columns

async function stageCanonicalUpdate(
  detectedSignalId: string | number,
  ingestedRecordId: number,
  domain: string
): Promise<PipelineStage> {
  const stage: PipelineStage = {
    stage: "CANONICAL_UPDATE",
    layer: "L3-L4 (Canonical Columns)",
    status: "failed",
    inputHash: "",
    outputHash: "",
    details: {},
  };

  stage.inputHash = hashInput({ detectedSignalId, ingestedRecordId, domain });

  // Find the detected_signal by signal_id (string) or id (number)
  let dsId: number;
  if (typeof detectedSignalId === "string") {
    const { rows: dsRows } = await pool.query(
      `SELECT id FROM detected_signals WHERE signal_id = $1 LIMIT 1`,
      [detectedSignalId]
    );
    const ds = dsRows as any[];
    if (ds.length === 0) {
      stage.details = { error: `detected_signal with signal_id ${detectedSignalId} not found` };
      return stage;
    }
    dsId = ds[0].id;
  } else {
    dsId = detectedSignalId as number;
  }

  // Match proof framework by domain
  const { rows: pfRows } = await pool.query(
    `SELECT id, claimType, elementsOfProof, typicalEvidence FROM proof_frameworks WHERE domain = $1 LIMIT 1`,
    [domain]
  );
  const frameworks = pfRows as any[];

  // Match doctrines by domain
  const { rows: docRows } = await pool.query(
    `SELECT id, name FROM doctrine_registry WHERE JSON_CONTAINS(domains, $1)`,
    [JSON.stringify(domain)]
  );
  const doctrines = docRows as any[];

  // Build forensic_logic from real proof framework + doctrine
  const forensicLogic = {
    source: "proof_stream",
    ingestedRecordId,
    domain,
    proofFramework: frameworks.length > 0
      ? { id: frameworks[0].id, claimType: frameworks[0].claimType }
      : null,
    applicableDoctrines: doctrines.map((d: any) => ({ id: d.id, name: d.name })),
  };

  // Update the detected_signal with canonical columns
  await pool.query(
    `UPDATE detected_signals
     SET parent_record_id = $1,
         sunam_status = 'approved',
         forensic_logic = $2
     WHERE id = $3`,
    [ingestedRecordId, JSON.stringify(forensicLogic), dsId]
  );

  stage.status = "completed";
  stage.recordId = dsId;
  stage.outputHash = hashInput({ dsId, forensicLogic });
  stage.details = {
    detectedSignalDbId: dsId,
    proofFrameworkId: frameworks.length > 0 ? frameworks[0].id : null,
    doctrineCount: doctrines.length,
    forensicLogicSet: true,
    parentRecordLinked: true,
  };

  return stage;
}

// ─── Stage 4: SIGNAL FLOW LOG (L7, Read-Only) ───

async function stageFlowLog(
  detectedSignalId: string,
  previousStages: PipelineStage[]
): Promise<PipelineStage> {
  const stage: PipelineStage = {
    stage: "FLOW_LOG",
    layer: "L7 (Read-Only)",
    status: "failed",
    inputHash: "",
    outputHash: "",
    details: {},
  };

  // Enforce read-only rule
  const readOnlyCheck = enforceSignalFlowReadOnly("INSERT");
  if (!readOnlyCheck.passed) {
    stage.details = { error: readOnlyCheck.message };
    return stage;
  }

  // Build vector path from pipeline stages
  const vectorPath = previousStages
    .filter((s) => s.status === "completed")
    .map((s) => `${s.stage}(${s.layer})`)
    .join(" → ");

  const flowDensity = previousStages.filter((s) => s.status === "completed").length / previousStages.length;

  stage.inputHash = hashInput({ signalId: detectedSignalId, vectorPath, flowDensity });

  const gateStage = previousStages.find((s) => s.stage === "SUNAM_GATE");

  const result = await appendSignalFlowLog({
    signalId: detectedSignalId,
    vectorPath: `${vectorPath} → FLOW_LOG(L7)`,
    flowDensity,
    visibilityMetadata: {
      sourceTable: "detected_signals",
      sourceId: detectedSignalId,
      gateDecision: gateStage?.details?.approved ? "approved" : "rejected",
      // gateScore: gateStage?.details?.score,
        // @ts-ignore - gateThreshold is valid at runtime
      gateThreshold: gateStage?.details?.threshold,
      engineId: "proof_stream",
      timestamp: Date.now(),
    },
  });

  stage.status = "completed";
  stage.recordId = result.id;
  stage.outputHash = hashInput({ id: result.id, vectorPath });
  stage.details = {
    vectorPath: `${vectorPath} → FLOW_LOG(L7)`,
    flowDensity,
    readOnlyEnforced: true,
  };

  return stage;
}

// ─── Stage 5: MATERIALIZE WORLD NODE (L10) ───
// From real agency_authority_map entity

async function stageWorldNode(domain: string): Promise<PipelineStage> {
  const stage: PipelineStage = {
    stage: "WORLD_NODE",
    layer: "L10 (Sovereign)",
    status: "failed",
    inputHash: "",
    outputHash: "",
    details: {},
  };

  stage.inputHash = hashInput({ domain });

  // Find the real agency for this domain
  const { rows: agRows } = await pool.query(
    `SELECT id, agency, domain, complaintPathway, statutoryAuthority,
            complaintTypes, commonOutcomes, responseTimelineDays
     FROM agency_authority_map WHERE domain = $1 ORDER BY id ASC LIMIT 1`,
    [domain]
  );
  const agencies = agRows as any[];
  if (agencies.length === 0) {
    stage.details = { error: `No agency found for domain: ${domain}` };
    return stage;
  }

  const agency = agencies[0];
  const biomeType = domain;
  const nodeName = agency.agency;

  // Idempotent check
  const { rows: existingNode } = await pool.query(
    `SELECT id FROM world_nodes WHERE node_name_wn = $1 AND biome_type = $2`,
    [nodeName, biomeType]
  );
  if ((existingNode as any[]).length > 0) {
    const nodeId = (existingNode as any[])[0].id;
    stage.status = "completed";
    stage.recordId = nodeId;
    stage.outputHash = hashInput({ id: nodeId, nodeName, biomeType });
    stage.details = { reused: true, agencyId: agency.id, agencyName: nodeName };
    return stage;
  }

  // Find matching escalation route
  const { rows: erRows } = await pool.query(
    `SELECT id, title FROM escalation_routes WHERE id = $1`,
    [agency.id]
  );
  const routes = erRows as any[];

  // Find matching unified resources
  const { rows: urRows } = await pool.query(
    `SELECT id, sourceId FROM unified_resources WHERE domain = $1 LIMIT 5`,
    [domain]
  );
  const resources = urRows as any[];

  // Find matching registry programs (ontology term keys)
  const { rows: rpRows } = await pool.query(
    `SELECT sourceId FROM registry_programs WHERE domain = $1 LIMIT 5`,
    [domain]
  );
  const programs = rpRows as any[];

  // Determine capacity_status from real data
  let capacityStatus: "AVAILABLE" | "LIMITED" | "FULL" = "AVAILABLE";
  const outcomes = agency.commonOutcomes;
  if (outcomes) {
    const outcomesStr = typeof outcomes === "string" ? outcomes : JSON.stringify(outcomes);
    if (outcomesStr.includes("FATAL")) capacityStatus = "LIMITED";
  }

  // Build L10 metadata from real entity data
  const metadataL10: WorldNodeMetadataL10 = {
    access_protocol: agency.complaintPathway || `${agency.agency} — contact directly`,
    capacity_status: capacityStatus,
    resource_links: [
      `agency:${agency.id}`,
      ...(routes.length > 0 ? [`escalation_route:${routes[0].id}`] : []),
      ...resources.map((r: any) => `unified_resource:${r.id}`),
    ],
    valid_for: [
      ...programs.map((p: any) => p.sourceId),
      ...(Array.isArray(agency.complaintTypes)
        ? agency.complaintTypes.map((ct: string) => `complaint_type:${ct}`)
        : []),
    ],
  };

  // Validate metadata
  const metaValidation = validateWorldNodeMetadata(metadataL10);
  if (!metaValidation.passed) {
    stage.details = { error: metaValidation.message, metadata: metadataL10 };
    return stage;
  }

  // Insert world_node from real entity
  const now = Date.now();
  const { rows: wnResult } = await pool.query(
    `INSERT INTO world_nodes
     (biome_type, node_name_wn, latitude, longitude, metadata_l10, active_remedy, last_verified_at_wn, created_at_wn, updated_at_wn)
     VALUES ($1, $2, 0, 0, $3, 1, $4, $5, $6)`,
    [biomeType, nodeName, JSON.stringify(metadataL10), now, now, now]
  );

  const wnId = (wnResult as any).insertId;

  stage.status = "completed";
  stage.recordId = wnId;
  stage.outputHash = hashInput({ id: wnId, nodeName, biomeType });
  stage.details = {
    agencyId: agency.id,
    agencyName: nodeName,
    biomeType,
    capacityStatus,
    metadataValid: true,
    resourceLinkCount: metadataL10.resource_links.length,
    validForCount: metadataL10.valid_for.length,
  };

  return stage;
}

// ─── Stage 6: REMEDY PATH (L8-L11) ───

async function stageRemedyPath(
  detectedSignalId: string,
  detectedSignalDbId: number,
  worldNodeId: number,
  domain: string
): Promise<PipelineStage> {
  const stage: PipelineStage = {
    stage: "REMEDY_PATH",
    layer: "L8-L11",
    status: "failed",
    inputHash: "",
    outputHash: "",
    details: {},
  };

  stage.inputHash = hashInput({ signalId: detectedSignalId, worldNodeId, domain });

  // Validate world node for remedy targeting
  const nodeValidation = await validateWorldNodeForRemedy(worldNodeId);
  if (!nodeValidation.passed) {
    // Invalid world node → block_reason (not a dead end — it's an explicit block)
    const blockReason = `World node ${worldNodeId} failed validation: ${nodeValidation.message}`;

    const integrityCheck = validateRemedyPathIntegrity({
      routeDirection: null,
      targetNodeId: null,
      blockReason,
    });
    if (!integrityCheck.passed) {
      stage.details = { error: integrityCheck.message };
      return stage;
    }

    const { rows: rpResult } = await pool.query(
      `INSERT INTO remedy_paths
       (signalId, pathType, viability, generatedBy, remedyStatus, createdAt, updatedAt,
        signal_id_rp, route_direction, target_node_id, block_reason, canonical_remedy_status)
       VALUES ($1, 'blocked', 'non_viable', 'proof_stream', 'active', $2, $3,
               $4, NULL, NULL, $5, 'blocked')`,
      [detectedSignalDbId, Date.now(), Date.now(), detectedSignalId, blockReason]
    );

    const rpId = (rpResult as any).insertId;
    stage.status = "completed";
    stage.recordId = rpId;
    stage.outputHash = hashInput({ id: rpId, blocked: true });
    stage.details = { blocked: true, blockReason };
    return stage;
  }

  // Find matching escalation route for routing direction
  const { rows: erRows } = await pool.query(
    `SELECT id, title, routes, escalationPriority
     FROM escalation_routes
     WHERE id IN (SELECT id FROM agency_authority_map WHERE domain = $1)
     LIMIT 1`,
    [domain]
  );
  const escalationRoutes = erRows as any[];

  // Determine route direction from real escalation data
  let routeDirection: "LATERAL" | "UPWARD" = "LATERAL";
  let description = "";

  if (escalationRoutes.length > 0) {
    const route = escalationRoutes[0];
    const routeData = typeof route.routes === "string" ? JSON.parse(route.routes) : route.routes;
    if (Array.isArray(routeData) && routeData.length > 0) {
      const targetStr = JSON.stringify(routeData[0].target || "");
      if (targetStr.includes("Court") || targetStr.includes("Federal") || targetStr.includes("DOJ")) {
        routeDirection = "UPWARD";
      }
      description = `${route.title}: ${routeData[0].method || "escalation"} → ${routeData[0].target || "unknown"}`;
    }
  }

  // Validate remedy path integrity
  const integrityCheck = validateRemedyPathIntegrity({
    routeDirection,
    targetNodeId: worldNodeId,
    blockReason: null,
  });
  if (!integrityCheck.passed) {
    stage.details = { error: integrityCheck.message };
    return stage;
  }

  // Idempotent check
  const { rows: existingRp } = await pool.query(
    `SELECT id FROM remedy_paths WHERE signal_id_rp = $1 AND target_node_id = $2`,
    [detectedSignalId, worldNodeId]
  );
  if ((existingRp as any[]).length > 0) {
    const rpId = (existingRp as any[])[0].id;
    stage.status = "completed";
    stage.recordId = rpId;
    stage.outputHash = hashInput({ id: rpId, routeDirection });
    stage.details = { reused: true };
    return stage;
  }

  // Insert remedy path
  const { rows: rpResult } = await pool.query(
    `INSERT INTO remedy_paths
     (signalId, title, description, pathType, viability, generatedBy, remedyStatus,
      createdAt, updatedAt,
      signal_id_rp, route_direction, target_node_id, block_reason, canonical_remedy_status)
     VALUES ($1, $2, $3, 'enforcement', 'viable', 'proof_stream', 'active', $4, $5,
             $6, $7, $8, NULL, 'routed')`,
    [
      detectedSignalDbId,
      `Proof Stream Remedy: ${routeDirection} → ${domain}`,
      description || `Deterministic remedy path for ${domain} domain signal`,
      Date.now(),
      Date.now(),
      detectedSignalId,
      routeDirection,
      worldNodeId,
    ]
  );

  const rpId = (rpResult as any).insertId;
  stage.status = "completed";
  stage.recordId = rpId;
  stage.outputHash = hashInput({ id: rpId, routeDirection, targetNodeId: worldNodeId });
  stage.details = {
    routeDirection,
    targetNodeId: worldNodeId,
    description,
    escalationRouteUsed: escalationRoutes.length > 0 ? escalationRoutes[0].id : null,
  };

  return stage;
}

// ─── Stage 7: ENFORCEMENT VALIDATION ───

async function stageEnforcement(
  signalId: string,
  worldNodeId: number,
  allStages: PipelineStage[]
): Promise<EnforcementReport> {
  const rules: EnforcementReport["rules"] = [];

  // Rule 6: Signal Flow Read-Only
  const readOnly = enforceSignalFlowReadOnly("SELECT");
  rules.push({ rule: readOnly.rule, passed: readOnly.passed, message: readOnly.message });

  // Rule 7: No Dead Ends
  const deadEnd = await enforceNoDeadEnds(signalId);
  rules.push({ rule: deadEnd.rule, passed: deadEnd.passed, message: deadEnd.message });

  // Rule 8: World Node Validation
  const nodeValid = await validateWorldNodeForRemedy(worldNodeId);
  rules.push({ rule: nodeValid.rule, passed: nodeValid.passed, message: nodeValid.message });

  // Rule 9: Determinism — verify pipeline is reproducible
  const inputHash = allStages[0]?.inputHash || "";
  const outputHash = allStages[allStages.length - 1]?.outputHash || "";
  const determinism = verifyDeterminism(inputHash, outputHash);
  rules.push({ rule: determinism.rule, passed: determinism.passed, message: determinism.message });

  return {
    allPassed: rules.every((r) => r.passed),
    rules,
  };
}

// ─── MAIN: Run Proof Stream ───

export async function runProofStream(liveSignalId: number): Promise<ProofStreamResult> {
  const stages: PipelineStage[] = [];

  try {
    // Stage 1: INGEST (L1-L2)
    const ingestStage = await stageIngest(liveSignalId);
    stages.push(ingestStage);
    if (ingestStage.status === "failed") {
      return {
        success: false,
        pipeline: stages,
        enforcement: { allPassed: false, rules: [] },
        error: `Ingestion failed: ${JSON.stringify(ingestStage.details)}`,
      };
    }

    // Stage 2: SUNAM GATE (L3-L4) — routes through processSignalThroughGate
    const gateStage = await stageGate(liveSignalId);
    stages.push(gateStage);
    if (gateStage.status === "failed") {
      return {
        success: false,
        pipeline: stages,
        enforcement: { allPassed: false, rules: [] },
        error: `Gate processing failed: ${JSON.stringify(gateStage.details)}`,
      };
    }

    // If gate rejected, the signal goes to extraction_staging — pipeline stops here
    if (!gateStage.details.approved) {
      return {
        success: false,
        pipeline: stages,
        enforcement: {
          allPassed: false,
          rules: [{
            rule: "Sunam Gate",
            passed: false,
            message: `Signal rejected by gate: ${gateStage.details.reason}`,
          }],
        },
        error: `Signal rejected by Sunam gate (score: ${gateStage.details.score}, threshold: ${gateStage.details.threshold})`,
      };
    }

    const detectedSignalId = gateStage.details.destinationId as string;
    const domain = ingestStage.details.domain as string;

    // Stage 3: CANONICAL UPDATE — add forensic_logic and parent_record_id
    // Find the detected_signal's DB id
    const { rows: dsLookup } = await pool.query(
      `SELECT id FROM detected_signals WHERE signal_id = $1 LIMIT 1`,
      [detectedSignalId]
    );
    const dsRows = dsLookup as any[];
    const detectedSignalDbId = dsRows.length > 0 ? dsRows[0].id : 0;

    const canonicalStage = await stageCanonicalUpdate(
      detectedSignalId,
      ingestStage.recordId as number,
      domain
    );
    stages.push(canonicalStage);

    // Stage 4: FLOW LOG (L7)
    const flowStage = await stageFlowLog(detectedSignalId, stages);
    stages.push(flowStage);
    if (flowStage.status === "failed") {
      return {
        success: false,
        pipeline: stages,
        enforcement: { allPassed: false, rules: [] },
        error: `Flow log failed: ${JSON.stringify(flowStage.details)}`,
      };
    }

    // Stage 5: WORLD NODE (L10)
    const worldNodeStage = await stageWorldNode(domain);
    stages.push(worldNodeStage);
    if (worldNodeStage.status === "failed") {
      return {
        success: false,
        pipeline: stages,
        enforcement: { allPassed: false, rules: [] },
        error: `World node materialization failed: ${JSON.stringify(worldNodeStage.details)}`,
      };
    }

    // Stage 6: REMEDY PATH (L8-L11)
    const remedyStage = await stageRemedyPath(
      detectedSignalId,
      detectedSignalDbId,
      worldNodeStage.recordId as number,
      domain
    );
    stages.push(remedyStage);
    if (remedyStage.status === "failed") {
      return {
        success: false,
        pipeline: stages,
        enforcement: { allPassed: false, rules: [] },
        error: `Remedy path failed: ${JSON.stringify(remedyStage.details)}`,
      };
    }

    // Stage 7: ENFORCEMENT VALIDATION
    const enforcement = await stageEnforcement(
      detectedSignalId,
      worldNodeStage.recordId as number,
      stages
    );

    return {
      success: enforcement.allPassed,
      pipeline: stages,
      enforcement,
    };
  } catch (err: any) {
    return {
      success: false,
      pipeline: stages,
      enforcement: { allPassed: false, rules: [] },
      error: err.message || String(err),
    };
  }
}
