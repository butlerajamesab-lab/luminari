/**
 * World Index Service
 * Single projection layer that unifies all existing data into one coherent model.
 * 
 * NO new tables. NO new pipelines. Organization only.
 * Reads from existing tables, normalizes into WorldObject nodes + WorldRelationship edges.
 */

import { pool } from "../db";

// ─── STEP 1: Interfaces ───────────────────────────────────────────────

export interface WorldObject {
  id: string;
  type: 'agency' | 'program' | 'jurisdiction' | 'signal' | 'workflow';
  jurisdiction: string;
  domain: string;
  source_table: string;
  source_id: string;
  metadata: any;
}

export interface WorldRelationship {
  id: string;
  from: string;
  to: string;
  type: 'escalation' | 'oversight' | 'signal_link' | 'program_access';
  metadata: any;
}

export interface WorldIndex {
  nodes: WorldObject[];
  edges: WorldRelationship[];
}

// ─── STEP 2 + 3: Normalize existing tables → WorldObject ──────────────

async function loadJurisdictions(): Promise<WorldObject[]> {
  const [rows] = await pool.query(
    `SELECT id, name, abbreviation, fips, type_rj, population_rj, 
            medicaid_status, minimum_wage, ui_max, wage_sol, civil_rights_sol
     FROM registry_jurisdictions`
  ) as any;
  return rows.map((r: any) => ({
    id: `registry_jurisdictions_${r.id}`,
    type: 'jurisdiction' as const,
    jurisdiction: r.abbreviation || r.name || r.id,
    domain: 'general',
    source_table: 'registry_jurisdictions',
    source_id: String(r.id),
    metadata: {
      name: r.name,
      abbreviation: r.abbreviation,
      fips: r.fips,
      jurisdiction_type: r.type_rj,
      population: r.population_rj,
      medicaid_status: r.medicaid_status,
      minimum_wage: r.minimum_wage,
      ui_max: r.ui_max,
      wage_sol: r.wage_sol,
      civil_rights_sol: r.civil_rights_sol,
    },
  }));
}

async function loadPrograms(): Promise<WorldObject[]> {
  const [rows] = await pool.query(
    `SELECT p.id, p.jurisdiction_id_rp, p.category_rp, p.name_rp, p.agency_rp,
            p.eligibility_rp, p.contact_rp, p.website_rp, p.apply_notes_rp,
            j.abbreviation as j_abbr, j.name as j_name
     FROM registry_programs p
     LEFT JOIN registry_jurisdictions j ON p.jurisdiction_id_rp = j.id`
  ) as any;
  return rows.map((r: any) => ({
    id: `registry_programs_${r.id}`,
    type: 'program' as const,
    jurisdiction: r.j_abbr || r.j_name || r.jurisdiction_id_rp || 'unknown',
    domain: r.category_rp || 'general',
    source_table: 'registry_programs',
    source_id: String(r.id),
    metadata: {
      name: r.name_rp,
      agency: r.agency_rp,
      category: r.category_rp,
      eligibility: r.eligibility_rp,
      contact: r.contact_rp,
      website: r.website_rp,
      apply_notes: r.apply_notes_rp,
      jurisdiction_id: r.jurisdiction_id_rp,
    },
  }));
}

async function loadAgencies(): Promise<WorldObject[]> {
  // agencies_registry is empty (id only), use registry_oversight_bodies instead
  const [rows] = await pool.query(
    `SELECT ob.id, ob.jurisdiction_id_rob, ob.agency_name_rob, ob.function_rob,
            ob.statute_of_limitations_rob, ob.contact_rob, ob.pathway_rob, ob.escalation_rob,
            j.abbreviation as j_abbr, j.name as j_name
     FROM registry_oversight_bodies ob
     LEFT JOIN registry_jurisdictions j ON ob.jurisdiction_id_rob = j.id`
  ) as any;
  return rows.map((r: any) => ({
    id: `registry_oversight_bodies_${r.id}`,
    type: 'agency' as const,
    jurisdiction: r.j_abbr || r.j_name || r.jurisdiction_id_rob || 'unknown',
    domain: r.function_rob || 'general',
    source_table: 'registry_oversight_bodies',
    source_id: String(r.id),
    metadata: {
      name: r.agency_name_rob,
      function: r.function_rob,
      statute_of_limitations: r.statute_of_limitations_rob,
      contact: r.contact_rob,
      pathway: r.pathway_rob,
      escalation: r.escalation_rob,
      jurisdiction_id: r.jurisdiction_id_rob,
    },
  }));
}

async function loadWorkflows(): Promise<WorldObject[]> {
  const [rows] = await pool.query(
    `SELECT w.id, w.jurisdiction_id_rw, w.workflow_type_rw, w.primary_statutes_rw,
            w.steps_rw, w.deadlines_rw, w.escalation_paths_rw,
            j.abbreviation as j_abbr, j.name as j_name
     FROM registry_workflows w
     LEFT JOIN registry_jurisdictions j ON w.jurisdiction_id_rw = j.id`
  ) as any;
  return rows.map((r: any) => ({
    id: `registry_workflows_${r.id}`,
    type: 'workflow' as const,
    jurisdiction: r.j_abbr || r.j_name || r.jurisdiction_id_rw || 'unknown',
    domain: r.workflow_type_rw || 'general',
    source_table: 'registry_workflows',
    source_id: String(r.id),
    metadata: {
      workflow_type: r.workflow_type_rw,
      primary_statutes: r.primary_statutes_rw,
      steps: r.steps_rw,
      deadlines: r.deadlines_rw,
      escalation_paths: r.escalation_paths_rw,
      jurisdiction_id: r.jurisdiction_id_rw,
    },
  }));
}

// ─── STEP 3: Signal Origin Classification ─────────────────────────────

async function loadSignals(): Promise<WorldObject[]> {
  const nodes: WorldObject[] = [];
  const seen = new Set<string>();

  // live_signals → origin: 'stream' (from ingestion) or 'registry' (if from registry ingest)
  const [liveRows] = await pool.query(
    `SELECT id, signalType, jurisdiction, domain, severity, title, explanation,
            patternSummary, supportingStatistics, confidenceScore, status,
            ingestRunId, signalFingerprint, entityType, canonicalEntityName, entityRole,
            caseId, datasetId, detectedAt
     FROM live_signals`
  ) as any;

  for (const r of liveRows) {
    const nodeId = `live_signals_${r.id}`;
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);

    // Classify origin: registry signals have fingerprints starting with 'regsig_'
    const isRegistry = r.signalFingerprint?.startsWith('regsig_') || 
                       r.datasetId === 'canonical_registry';
    const origin = isRegistry ? 'registry' : 'stream';

    nodes.push({
      id: nodeId,
      type: 'signal',
      jurisdiction: r.jurisdiction || 'unknown',
      domain: r.domain || 'general',
      source_table: 'live_signals',
      source_id: String(r.id),
      metadata: {
        origin,
        signal_type: r.signalType,
        severity: r.severity,
        title: r.title,
        explanation: r.explanation,
        pattern_summary: r.patternSummary,
        supporting_statistics: r.supportingStatistics,
        confidence_score: r.confidenceScore,
        status: r.status,
        entity_type: r.entityType,
        canonical_entity_name: r.canonicalEntityName,
        entity_role: r.entityRole,
        case_id: r.caseId,
        dataset_id: r.datasetId,
        detected_at: r.detectedAt,
        signal_fingerprint: r.signalFingerprint,
      },
    });
  }

  // detected_signals → origin: 'validation' or 'pattern'
  const [detectedRows] = await pool.query(
    `SELECT id, liveSignalId, signalType, jurisdiction, domain, severity, title,
            explanation, patternSummary, supportingStatistics, confidenceScore,
            sunamScore, approvalStatus, caseId, datasetId, detectedAt
     FROM detected_signals`
  ) as any;

  for (const r of detectedRows) {
    const nodeId = `detected_signals_${r.id}`;
    if (seen.has(nodeId)) continue;
    // Deduplicate: if live_signals already has this signal via liveSignalId, skip
    if (r.liveSignalId && seen.has(`live_signals_${r.liveSignalId}`)) continue;
    seen.add(nodeId);

    const origin = r.sunamScore != null ? 'validation' : 'pattern';

    nodes.push({
      id: nodeId,
      type: 'signal',
      jurisdiction: r.jurisdiction || 'unknown',
      domain: r.domain || 'general',
      source_table: 'detected_signals',
      source_id: String(r.id),
      metadata: {
        origin,
        signal_type: r.signalType,
        severity: r.severity,
        title: r.title,
        explanation: r.explanation,
        pattern_summary: r.patternSummary,
        supporting_statistics: r.supportingStatistics,
        confidence_score: r.confidenceScore,
        sunam_score: r.sunamScore,
        approval_status: r.approvalStatus,
        case_id: r.caseId,
        dataset_id: r.datasetId,
        detected_at: r.detectedAt,
      },
    });
  }

  // registry_signals → origin: 'registry' (always)
  const [regRows] = await pool.query(
    `SELECT rs.id, rs.jurisdiction_id_rs, rs.category_rs, rs.signal_type_rs,
            rs.severity_rs, rs.source_reference_rs, rs.fingerprint_rs,
            j.abbreviation as j_abbr, j.name as j_name
     FROM registry_signals rs
     LEFT JOIN registry_jurisdictions j ON rs.jurisdiction_id_rs = j.id`
  ) as any;

  for (const r of regRows) {
    const nodeId = `registry_signals_${r.id}`;
    // Deduplicate: check if live_signals already has this via fingerprint
    const fpMatch = liveRows.find((ls: any) => ls.signalFingerprint === r.fingerprint_rs);
    if (fpMatch) continue; // already represented in live_signals
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);

    nodes.push({
      id: nodeId,
      type: 'signal',
      jurisdiction: r.j_abbr || r.j_name || r.jurisdiction_id_rs || 'unknown',
      domain: r.category_rs || 'general',
      source_table: 'registry_signals',
      source_id: String(r.id),
      metadata: {
        origin: 'registry',
        signal_type: r.signal_type_rs,
        severity: r.severity_rs,
        category: r.category_rs,
        source_reference: r.source_reference_rs,
        fingerprint: r.fingerprint_rs,
        jurisdiction_id: r.jurisdiction_id_rs,
      },
    });
  }

  return nodes;
}

// ─── STEP 4: Build Relationships ──────────────────────────────────────

async function buildRelationships(nodes: WorldObject[]): Promise<WorldRelationship[]> {
  const edges: WorldRelationship[] = [];
  let edgeCounter = 0;

  // Build lookup maps
  const jurisdictionBySourceId = new Map<string, string>();
  const agencyBySourceId = new Map<string, string>();
  const workflowBySourceId = new Map<string, string>();

  for (const n of nodes) {
    if (n.type === 'jurisdiction') jurisdictionBySourceId.set(n.source_id, n.id);
    if (n.type === 'agency') agencyBySourceId.set(n.source_id, n.id);
    if (n.type === 'workflow') workflowBySourceId.set(n.source_id, n.id);
  }

  // 1. Oversight bodies → jurisdiction (oversight relationship)
  for (const n of nodes) {
    if (n.type === 'agency' && n.metadata.jurisdiction_id) {
      const jId = jurisdictionBySourceId.get(n.metadata.jurisdiction_id);
      if (jId) {
        edges.push({
          id: `edge_${++edgeCounter}`,
          from: n.id,
          to: jId,
          type: 'oversight',
          metadata: {
            agency_name: n.metadata.name,
            function: n.metadata.function,
          },
        });
      }
    }
  }

  // 2. Workflows → jurisdiction (program_access relationship)
  for (const n of nodes) {
    if (n.type === 'workflow' && n.metadata.jurisdiction_id) {
      const jId = jurisdictionBySourceId.get(n.metadata.jurisdiction_id);
      if (jId) {
        edges.push({
          id: `edge_${++edgeCounter}`,
          from: n.id,
          to: jId,
          type: 'program_access',
          metadata: {
            workflow_type: n.metadata.workflow_type,
          },
        });
      }
    }
  }

  // 3. Programs → jurisdiction (program_access relationship)
  for (const n of nodes) {
    if (n.type === 'program' && n.metadata.jurisdiction_id) {
      const jId = jurisdictionBySourceId.get(n.metadata.jurisdiction_id);
      if (jId) {
        edges.push({
          id: `edge_${++edgeCounter}`,
          from: n.id,
          to: jId,
          type: 'program_access',
          metadata: {
            program_name: n.metadata.name,
            category: n.metadata.category,
          },
        });
      }
    }
  }

  // 4. Signals → jurisdiction (signal_link relationship)
  for (const n of nodes) {
    if (n.type === 'signal') {
      // Match signal jurisdiction to jurisdiction node
      const jNode = nodes.find(
        j => j.type === 'jurisdiction' && 
        (j.metadata.abbreviation === n.jurisdiction || 
         j.metadata.name === n.jurisdiction ||
         j.source_id === n.metadata.jurisdiction_id)
      );
      if (jNode) {
        edges.push({
          id: `edge_${++edgeCounter}`,
          from: n.id,
          to: jNode.id,
          type: 'signal_link',
          metadata: {
            signal_type: n.metadata.signal_type,
            severity: n.metadata.severity,
            origin: n.metadata.origin,
          },
        });
      }
    }
  }

  // 5. Escalation relationships from workflow escalation_paths
  for (const n of nodes) {
    if (n.type === 'workflow' && n.metadata.escalation_paths) {
      let paths = n.metadata.escalation_paths;
      if (typeof paths === 'string') {
        try { paths = JSON.parse(paths); } catch { paths = null; }
      }
      if (paths && typeof paths === 'string' && paths.length > 0) {
        // Text-based escalation path — link workflow to its jurisdiction as escalation
        const jId = jurisdictionBySourceId.get(n.metadata.jurisdiction_id);
        if (jId) {
          edges.push({
            id: `edge_${++edgeCounter}`,
            from: n.id,
            to: jId,
            type: 'escalation',
            metadata: {
              escalation_description: paths,
            },
          });
        }
      }
    }
  }

  return edges;
}

// ─── STEP 5 (partial): Main getIndex function ─────────────────────────

export async function getWorldIndex(): Promise<WorldIndex> {
  const [jurisdictions, programs, agencies, workflows, signals] = await Promise.all([
    loadJurisdictions(),
    loadPrograms(),
    loadAgencies(),
    loadWorkflows(),
    loadSignals(),
  ]);

  const nodes = [...jurisdictions, ...programs, ...agencies, ...workflows, ...signals];
  const edges = await buildRelationships(nodes);

  return { nodes, edges };
}
