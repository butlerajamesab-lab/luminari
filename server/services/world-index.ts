/**
 * World Index Service
 * Single projection layer that unifies all existing data into one coherent model.
 * 
 * NO new tables. NO new pipelines. Organization only.
 * Reads from CURRENT Lighthouse tables, normalizes into WorldObject nodes + WorldRelationship edges.
 * 
 * Source map (Lighthouse populated tables):
 *   Jurisdictions → derived from normalized_civic_resource + national_resources geography
 *   Programs/Resources → normalized_civic_resource, national_resources, atlas_lighthouse_resource_bridge_v1
 *   Agencies → agencies_registry, forms_registry, escalation_registry
 *   Signals → detected_signals, atlas_lighthouse_signal_bridge_v1, atlas_lighthouse_judicial_signal_bridge_v1, signal_events
 *   Workflows → workflow_steps, remedy_templates
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

// ─── STEP 2: Load from current Lighthouse tables ──────────────────────

async function loadJurisdictions(): Promise<WorldObject[]> {
  // Derive jurisdictions from distinct state/city in normalized_civic_resource + national_resources
  const [rows] = await pool.query(`
    SELECT DISTINCT state, city FROM (
      SELECT state, city FROM normalized_civic_resource WHERE state IS NOT NULL
      UNION
      SELECT state, NULL as city FROM national_resources WHERE state IS NOT NULL
    ) combined
    ORDER BY state, city
  `) as any;

  const stateSet = new Map<string, { cities: string[] }>();
  for (const r of rows) {
    const state = r.state || 'unknown';
    if (!stateSet.has(state)) stateSet.set(state, { cities: [] });
    if (r.city) stateSet.get(state)!.cities.push(r.city);
  }

  const nodes: WorldObject[] = [];
  let idx = 0;
  for (const [state, data] of stateSet) {
    idx++;
    nodes.push({
      id: `jurisdiction_state_${state}`,
      type: 'jurisdiction',
      jurisdiction: state,
      domain: 'general',
      source_table: 'normalized_civic_resource',
      source_id: String(idx),
      metadata: {
        name: state,
        abbreviation: state,
        jurisdiction_type: 'state',
        cities: data.cities.slice(0, 20),
        city_count: data.cities.length,
      },
    });
  }
  return nodes;
}

async function loadPrograms(): Promise<WorldObject[]> {
  const nodes: WorldObject[] = [];

  // normalized_civic_resource (62 rows)
  const [civicRows] = await pool.query(`
    SELECT id, name, resource_type, category, state, city, 
           address, phone, url, description, eligibility,
           latitude, longitude
    FROM normalized_civic_resource
  `) as any;

  for (const r of civicRows) {
    nodes.push({
      id: `civic_resource_${r.id}`,
      type: 'program',
      jurisdiction: r.state || 'unknown',
      domain: r.category || r.resource_type || 'general',
      source_table: 'normalized_civic_resource',
      source_id: String(r.id),
      metadata: {
        name: r.name,
        resource_type: r.resource_type,
        category: r.category,
        city: r.city,
        state: r.state,
        address: r.address,
        phone: r.phone,
        url: r.url,
        description: r.description,
        eligibility: r.eligibility,
        latitude: r.latitude,
        longitude: r.longitude,
      },
    });
  }

  // national_resources (119 rows)
  const [natRows] = await pool.query(`
    SELECT id, name, resource_type, category, state, 
           url, description, eligibility, phone
    FROM national_resources
  `) as any;

  for (const r of natRows) {
    nodes.push({
      id: `national_resource_${r.id}`,
      type: 'program',
      jurisdiction: r.state || 'us_federal',
      domain: r.category || r.resource_type || 'general',
      source_table: 'national_resources',
      source_id: String(r.id),
      metadata: {
        name: r.name,
        resource_type: r.resource_type,
        category: r.category,
        state: r.state,
        url: r.url,
        description: r.description,
        eligibility: r.eligibility,
        phone: r.phone,
        scope: 'national',
      },
    });
  }

  // atlas_lighthouse_resource_bridge_v1 (268 rows)
  const [bridgeRows] = await pool.query(`
    SELECT id, resource_name, resource_type, category, state, city,
           source_system, atlas_source_id, latitude, longitude
    FROM atlas_lighthouse_resource_bridge_v1
    LIMIT 500
  `) as any;

  for (const r of bridgeRows) {
    const nodeId = `bridge_resource_${r.id}`;
    nodes.push({
      id: nodeId,
      type: 'program',
      jurisdiction: r.state || 'unknown',
      domain: r.category || r.resource_type || 'general',
      source_table: 'atlas_lighthouse_resource_bridge_v1',
      source_id: String(r.id),
      metadata: {
        name: r.resource_name,
        resource_type: r.resource_type,
        category: r.category,
        city: r.city,
        state: r.state,
        source_system: r.source_system,
        atlas_source_id: r.atlas_source_id,
        latitude: r.latitude,
        longitude: r.longitude,
      },
    });
  }

  return nodes;
}

async function loadAgencies(): Promise<WorldObject[]> {
  const nodes: WorldObject[] = [];

  // agencies_registry (160 rows)
  const [agencyRows] = await pool.query(`
    SELECT id, agency_name, jurisdiction, function_area, 
           contact_info, website, statute_of_limitations,
           filing_method, oversight_scope
    FROM agencies_registry
  `) as any;

  for (const r of agencyRows) {
    nodes.push({
      id: `agency_${r.id}`,
      type: 'agency',
      jurisdiction: r.jurisdiction || 'unknown',
      domain: r.function_area || 'general',
      source_table: 'agencies_registry',
      source_id: String(r.id),
      metadata: {
        name: r.agency_name,
        function: r.function_area,
        jurisdiction_id: r.jurisdiction,
        contact: r.contact_info,
        website: r.website,
        statute_of_limitations: r.statute_of_limitations,
        filing_method: r.filing_method,
        oversight_scope: r.oversight_scope,
      },
    });
  }

  // forms_registry (12 rows)
  const [formRows] = await pool.query(`
    SELECT id, form_name, agency_id, jurisdiction, 
           form_type, url, description
    FROM forms_registry
  `) as any;

  for (const r of formRows) {
    nodes.push({
      id: `form_${r.id}`,
      type: 'agency',
      jurisdiction: r.jurisdiction || 'unknown',
      domain: 'filing',
      source_table: 'forms_registry',
      source_id: String(r.id),
      metadata: {
        name: r.form_name,
        form_type: r.form_type,
        agency_id: r.agency_id,
        url: r.url,
        description: r.description,
        jurisdiction_id: r.jurisdiction,
      },
    });
  }

  // escalation_registry (13 rows)
  const [escRows] = await pool.query(`
    SELECT id, escalation_name, agency_id, jurisdiction,
           trigger_condition, escalation_path, deadline_days
    FROM escalation_registry
  `) as any;

  for (const r of escRows) {
    nodes.push({
      id: `escalation_${r.id}`,
      type: 'agency',
      jurisdiction: r.jurisdiction || 'unknown',
      domain: 'escalation',
      source_table: 'escalation_registry',
      source_id: String(r.id),
      metadata: {
        name: r.escalation_name,
        agency_id: r.agency_id,
        trigger_condition: r.trigger_condition,
        escalation_path: r.escalation_path,
        deadline_days: r.deadline_days,
        jurisdiction_id: r.jurisdiction,
      },
    });
  }

  return nodes;
}

async function loadWorkflows(): Promise<WorldObject[]> {
  const nodes: WorldObject[] = [];

  // workflow_steps (18 rows)
  const [stepRows] = await pool.query(`
    SELECT id, workflow_name, step_number, step_name, 
           jurisdiction, description, deadline_days,
           required_documents, next_step_id
    FROM workflow_steps
  `) as any;

  for (const r of stepRows) {
    nodes.push({
      id: `workflow_step_${r.id}`,
      type: 'workflow',
      jurisdiction: r.jurisdiction || 'unknown',
      domain: r.workflow_name || 'general',
      source_table: 'workflow_steps',
      source_id: String(r.id),
      metadata: {
        workflow_name: r.workflow_name,
        workflow_type: r.workflow_name,
        step_number: r.step_number,
        step_name: r.step_name,
        description: r.description,
        deadline_days: r.deadline_days,
        required_documents: r.required_documents,
        next_step_id: r.next_step_id,
        jurisdiction_id: r.jurisdiction,
      },
    });
  }

  // remedy_templates (24 rows)
  const [remedyRows] = await pool.query(`
    SELECT id, remedy_name, case_type, jurisdiction,
           description, filing_steps, expected_timeline
    FROM remedy_templates
  `) as any;

  for (const r of remedyRows) {
    nodes.push({
      id: `remedy_${r.id}`,
      type: 'workflow',
      jurisdiction: r.jurisdiction || 'unknown',
      domain: r.case_type || 'general',
      source_table: 'remedy_templates',
      source_id: String(r.id),
      metadata: {
        workflow_type: 'remedy',
        name: r.remedy_name,
        case_type: r.case_type,
        description: r.description,
        filing_steps: r.filing_steps,
        expected_timeline: r.expected_timeline,
        jurisdiction_id: r.jurisdiction,
      },
    });
  }

  return nodes;
}

// ─── STEP 3: Signal Origin Classification ─────────────────────────────

async function loadSignals(): Promise<WorldObject[]> {
  const nodes: WorldObject[] = [];
  const seen = new Set<string>();

  // detected_signals (111 rows) — primary signal table
  const [detectedRows] = await pool.query(`
    SELECT id, signal_type, jurisdiction, domain, severity, title,
           description, confidence_score, status, source_system,
           case_id, detected_at
    FROM detected_signals
  `) as any;

  for (const r of detectedRows) {
    const nodeId = `detected_signal_${r.id}`;
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);
    nodes.push({
      id: nodeId,
      type: 'signal',
      jurisdiction: r.jurisdiction || 'unknown',
      domain: r.domain || 'general',
      source_table: 'detected_signals',
      source_id: String(r.id),
      metadata: {
        origin: 'detection',
        signal_type: r.signal_type,
        severity: r.severity,
        title: r.title,
        description: r.description,
        confidence_score: r.confidence_score,
        status: r.status,
        source_system: r.source_system,
        case_id: r.case_id,
        detected_at: r.detected_at,
      },
    });
  }

  // atlas_lighthouse_signal_bridge_v1 (63 rows)
  const [signalBridgeRows] = await pool.query(`
    SELECT id, signal_type, jurisdiction, severity, title,
           source_system, atlas_signal_id, confidence_score,
           bridged_at
    FROM atlas_lighthouse_signal_bridge_v1
  `) as any;

  for (const r of signalBridgeRows) {
    const nodeId = `bridge_signal_${r.id}`;
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);
    nodes.push({
      id: nodeId,
      type: 'signal',
      jurisdiction: r.jurisdiction || 'unknown',
      domain: 'general',
      source_table: 'atlas_lighthouse_signal_bridge_v1',
      source_id: String(r.id),
      metadata: {
        origin: 'atlas_bridge',
        signal_type: r.signal_type,
        severity: r.severity,
        title: r.title,
        source_system: r.source_system,
        atlas_signal_id: r.atlas_signal_id,
        confidence_score: r.confidence_score,
        bridged_at: r.bridged_at,
      },
    });
  }

  // atlas_lighthouse_judicial_signal_bridge_v1 (60 rows)
  const [judicialRows] = await pool.query(`
    SELECT id, signal_type, jurisdiction, severity, title,
           court, case_name, source_system, atlas_signal_id,
           bridged_at
    FROM atlas_lighthouse_judicial_signal_bridge_v1
  `) as any;

  for (const r of judicialRows) {
    const nodeId = `judicial_signal_${r.id}`;
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);
    nodes.push({
      id: nodeId,
      type: 'signal',
      jurisdiction: r.jurisdiction || 'unknown',
      domain: 'judicial',
      source_table: 'atlas_lighthouse_judicial_signal_bridge_v1',
      source_id: String(r.id),
      metadata: {
        origin: 'judicial_bridge',
        signal_type: r.signal_type,
        severity: r.severity,
        title: r.title,
        court: r.court,
        case_name: r.case_name,
        source_system: r.source_system,
        atlas_signal_id: r.atlas_signal_id,
        bridged_at: r.bridged_at,
      },
    });
  }

  // signal_events (6 rows) — streaming spine
  const [streamRows] = await pool.query(`
    SELECT id, stream_id, signal_type, jurisdiction_id,
           payload, confidence, ingested_at
    FROM signal_events
  `) as any;

  for (const r of streamRows) {
    const nodeId = `stream_signal_${r.id}`;
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);
    nodes.push({
      id: nodeId,
      type: 'signal',
      jurisdiction: r.jurisdiction_id || 'unknown',
      domain: 'stream',
      source_table: 'signal_events',
      source_id: String(r.id),
      metadata: {
        origin: 'stream',
        signal_type: r.signal_type,
        stream_id: r.stream_id,
        confidence: r.confidence,
        ingested_at: r.ingested_at,
        payload: r.payload,
      },
    });
  }

  return nodes;
}

// ─── STEP 4: Build Relationships ──────────────────────────────────────

async function buildRelationships(nodes: WorldObject[]): Promise<WorldRelationship[]> {
  const edges: WorldRelationship[] = [];
  let edgeCounter = 0;

  const jurisdictionNodes = nodes.filter(n => n.type === 'jurisdiction');
  const agencyNodes = nodes.filter(n => n.type === 'agency');

  // Helper: find jurisdiction node by state string
  function findJurisdiction(state: string | null): WorldObject | undefined {
    if (!state) return undefined;
    return jurisdictionNodes.find(j =>
      j.metadata.abbreviation === state ||
      j.metadata.name === state ||
      j.jurisdiction === state
    );
  }

  // 1. Agencies → jurisdiction (oversight relationship)
  for (const n of agencyNodes) {
    if (n.source_table === 'agencies_registry') {
      const jNode = findJurisdiction(n.metadata.jurisdiction_id);
      if (jNode) {
        edges.push({
          id: `edge_${++edgeCounter}`,
          from: n.id,
          to: jNode.id,
          type: 'oversight',
          metadata: {
            agency_name: n.metadata.name,
            function: n.metadata.function,
          },
        });
      }
    }
  }

  // 2. Escalations → agency (escalation relationship)
  for (const n of nodes) {
    if (n.source_table === 'escalation_registry' && n.metadata.agency_id) {
      const agencyNode = agencyNodes.find(a =>
        a.source_table === 'agencies_registry' && a.source_id === String(n.metadata.agency_id)
      );
      if (agencyNode) {
        edges.push({
          id: `edge_${++edgeCounter}`,
          from: n.id,
          to: agencyNode.id,
          type: 'escalation',
          metadata: {
            trigger: n.metadata.trigger_condition,
            deadline_days: n.metadata.deadline_days,
          },
        });
      }
    }
  }

  // 3. Programs/resources → jurisdiction (program_access relationship)
  for (const n of nodes) {
    if (n.type === 'program') {
      const jNode = findJurisdiction(n.jurisdiction);
      if (jNode) {
        edges.push({
          id: `edge_${++edgeCounter}`,
          from: n.id,
          to: jNode.id,
          type: 'program_access',
          metadata: {
            program_name: n.metadata.name,
            category: n.metadata.category || n.domain,
          },
        });
      }
    }
  }

  // 4. Signals → jurisdiction (signal_link relationship)
  for (const n of nodes) {
    if (n.type === 'signal') {
      const jNode = findJurisdiction(n.jurisdiction);
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

  // 5. Workflows → jurisdiction (program_access relationship)
  for (const n of nodes) {
    if (n.type === 'workflow') {
      const jNode = findJurisdiction(n.metadata.jurisdiction_id || n.jurisdiction);
      if (jNode) {
        edges.push({
          id: `edge_${++edgeCounter}`,
          from: n.id,
          to: jNode.id,
          type: 'program_access',
          metadata: {
            workflow_type: n.metadata.workflow_type,
            name: n.metadata.workflow_name || n.metadata.name,
          },
        });
      }
    }
  }

  // 6. Forms → agency (oversight relationship)
  for (const n of nodes) {
    if (n.source_table === 'forms_registry' && n.metadata.agency_id) {
      const agencyNode = agencyNodes.find(a =>
        a.source_table === 'agencies_registry' && a.source_id === String(n.metadata.agency_id)
      );
      if (agencyNode) {
        edges.push({
          id: `edge_${++edgeCounter}`,
          from: n.id,
          to: agencyNode.id,
          type: 'oversight',
          metadata: {
            form_name: n.metadata.name,
            form_type: n.metadata.form_type,
          },
        });
      }
    }
  }

  return edges;
}

// ─── STEP 5: Main getIndex function ───────────────────────────────────

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
