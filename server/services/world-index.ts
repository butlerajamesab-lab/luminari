/**
 * World Index Service
 * Single projection layer that unifies existing Lighthouse data into one coherent model.
 *
 * NO new tables. NO new pipelines. Organization only.
 * Reads from CURRENT Lighthouse tables and Atlas -> Lighthouse bridge tables.
 * FieldAtlas is not canonical here.
 */

import { pool } from "./world-index-db";

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

function safeText(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function metadataValue(metadata: any, keys: string[], fallback: unknown = null) {
  if (!metadata || typeof metadata !== 'object') return fallback;
  for (const key of keys) {
    if (metadata[key] != null && metadata[key] !== '') return metadata[key];
  }
  return fallback;
}

function firstArrayValue(value: unknown): string | null {
  if (Array.isArray(value) && value.length > 0) return safeText(value[0], null as any) || null;
  return null;
}

async function loadJurisdictions(): Promise<WorldObject[]> {
  const [rows] = await pool.query(`
    select distinct jurisdiction from (
      select e.state as jurisdiction
      from luminari_resource_entities e
      left join luminari_resource_publication_resolutions p
        on p.resource_entity_id = e.resource_entity_id
      where e.source_table = 'state_directory_logical_record'
        and coalesce(p.publication_status, 'active') = 'active'
        and e.state is not null
      union
      select jurisdiction from national_resources where jurisdiction is not null
      union
      select state as jurisdiction from atlas_lighthouse_resource_bridge_v1 where state is not null
      union
      select jurisdiction_id as jurisdiction from atlas_lighthouse_signal_bridge_v1 where jurisdiction_id is not null
      union
      select jurisdiction_id as jurisdiction from atlas_lighthouse_judicial_signal_bridge_v1 where jurisdiction_id is not null
    ) j
    where jurisdiction is not null and jurisdiction <> ''
    order by jurisdiction
  `) as any;

  return rows.map((r: any) => ({
    id: `jurisdiction_${safeText(r.jurisdiction, 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    type: 'jurisdiction' as const,
    jurisdiction: safeText(r.jurisdiction, 'unknown'),
    domain: 'general',
    source_table: 'derived_lighthouse_jurisdictions',
    source_id: safeText(r.jurisdiction, 'unknown'),
    metadata: {
      name: safeText(r.jurisdiction, 'unknown'),
      abbreviation: safeText(r.jurisdiction, 'unknown'),
      jurisdiction_type: 'derived',
    },
  }));
}

async function loadPrograms(): Promise<WorldObject[]> {
  const nodes: WorldObject[] = [];

  const [directoryRows] = await pool.query(`
    with preferred_contacts as (
      select
        cp.resource_entity_id,
        (
          array_agg(
            cp.contact_value
            order by
              cp.is_primary desc nulls last,
              cp.manually_reviewed desc,
              cp.created_at desc,
              cp.contact_point_id
          ) filter (where cp.contact_type = 'phone')
        )[1] as phone,
        (
          array_agg(
            cp.contact_value
            order by
              cp.is_primary desc nulls last,
              cp.manually_reviewed desc,
              cp.created_at desc,
              cp.contact_point_id
          ) filter (where cp.contact_type = 'email')
        )[1] as email,
        (
          array_agg(
            cp.contact_value
            order by
              case when cp.contact_type = 'website' then 0 else 1 end,
              cp.is_primary desc nulls last,
              cp.manually_reviewed desc,
              cp.created_at desc,
              cp.contact_point_id
          ) filter (where cp.contact_type in ('website', 'portal'))
        )[1] as website
      from v_luminari_resource_contact_points_current_v3_13 cp
      group by cp.resource_entity_id
    ),
    preferred_locations as (
      select distinct on (l.resource_entity_id)
        l.resource_entity_id,
        l.address_line1,
        l.address_line2,
        l.city,
        l.county,
        l.state,
        l.postal_code,
        l.country,
        l.latitude,
        l.longitude,
        l.coordinate_quality,
        l.geocode_source,
        l.manual_location_kind,
        l.manual_map_eligible,
        l.manual_source_reference
      from v_luminari_resource_locations_current_v3_13 l
      order by
        l.resource_entity_id,
        (l.manual_map_eligible is true) desc,
        (l.latitude is not null and l.longitude is not null) desc,
        (l.manual_source_reference is not null) desc,
        l.created_at desc,
        l.location_id
    )
    select
      e.resource_entity_id,
      e.canonical_id,
      coalesce(
        nullif(p.display_name_override, ''),
        e.resource_name
      ) as resource_name,
      e.resource_type,
      e.resource_category,
      e.layer,
      e.jurisdiction,
      e.jurisdiction_scope,
      e.state,
      e.county,
      e.city,
      e.description,
      e.eligibility_summary,
      e.apply_notes,
      e.service_categories,
      e.domains,
      e.verification_status,
      e.promotion_status,
      e.provenance_status,
      e.source_table,
      e.source_pk,
      e.source_hash,
      e.metadata,
      c.phone,
      c.email,
      c.website,
      l.address_line1,
      l.address_line2,
      coalesce(l.city, e.city) as location_city,
      coalesce(l.county, e.county) as location_county,
      coalesce(l.state, e.state) as location_state,
      l.postal_code,
      l.country,
      l.latitude,
      l.longitude,
      l.coordinate_quality,
      l.geocode_source,
      l.manual_location_kind,
      l.manual_map_eligible,
      l.manual_source_reference
    from luminari_resource_entities e
    left join luminari_resource_publication_resolutions p
      on p.resource_entity_id = e.resource_entity_id
    left join preferred_contacts c
      on c.resource_entity_id = e.resource_entity_id
    left join preferred_locations l
      on l.resource_entity_id = e.resource_entity_id
    where e.source_table = 'state_directory_logical_record'
      and coalesce(p.publication_status, 'active') = 'active'
  `) as any;

  for (const r of directoryRows) {
    const category = r.resource_category ||
      firstArrayValue(r.service_categories) ||
      r.resource_type ||
      'general';
    nodes.push({
      id: `directory_resource_${r.resource_entity_id}`,
      type: 'program',
      jurisdiction: safeText(r.location_state || r.state || r.jurisdiction, 'unknown'),
      domain: safeText(category, 'general'),
      source_table: 'luminari_resource_entities',
      source_id: String(r.resource_entity_id),
      metadata: {
        name: r.resource_name,
        canonical_id: r.canonical_id,
        resource_type: r.resource_type,
        category,
        service_categories: r.service_categories,
        layer: r.layer,
        jurisdiction: r.jurisdiction,
        jurisdiction_scope: r.jurisdiction_scope,
        city: r.location_city,
        county: r.location_county,
        state: r.location_state,
        address: [r.address_line1, r.address_line2].filter(Boolean).join(', '),
        postal_code: r.postal_code,
        country: r.country,
        phone: r.phone,
        email: r.email,
        website: r.website,
        contact: r.phone || r.email || r.website,
        description: r.description,
        eligibility: r.eligibility_summary,
        apply_notes: r.apply_notes,
        domains: r.domains,
        latitude: r.latitude,
        longitude: r.longitude,
        coordinate_quality: r.coordinate_quality,
        geocode_source: r.geocode_source,
        location_kind: r.manual_location_kind,
        map_eligible: r.manual_map_eligible,
        location_source_reference: r.manual_source_reference,
        verification_status: r.verification_status,
        promotion_status: r.promotion_status,
        provenance_status: r.provenance_status,
        canonical_source_table: r.source_table,
        canonical_source_pk: r.source_pk,
        source_hash: r.source_hash,
        raw_metadata: r.metadata,
      },
    });
  }

  const [nationalRows] = await pool.query(`
    select
      id,
      resource_id,
      resource_name,
      resource_type,
      jurisdiction,
      service_category,
      phone,
      website,
      metadata,
      source_url
    from national_resources
  `) as any;

  for (const r of nationalRows) {
    nodes.push({
      id: `national_resource_${r.id}`,
      type: 'program',
      jurisdiction: safeText(r.jurisdiction, 'us_federal'),
      domain: safeText(r.service_category || r.resource_type, 'general'),
      source_table: 'national_resources',
      source_id: String(r.id),
      metadata: {
        name: r.resource_name,
        resource_id: r.resource_id,
        resource_type: r.resource_type,
        category: r.service_category,
        jurisdiction: r.jurisdiction,
        phone: r.phone,
        website: r.website,
        contact: r.phone || r.website,
        source_url: r.source_url,
        scope: 'national',
        raw_metadata: r.metadata,
      },
    });
  }

  const [bridgeRows] = await pool.query(`
    select
      bridge_record_id,
      atlas_resource_id,
      name,
      resource_type,
      address,
      city,
      state,
      phone,
      url,
      lat,
      lon,
      source_table,
      source_id,
      extra_json,
      bridge_version,
      bridge_metadata,
      verification_status,
      bridged_at
    from atlas_lighthouse_resource_bridge_v1
    limit 500
  `) as any;

  for (const r of bridgeRows) {
    const category = metadataValue(r.extra_json, ['category', 'service_category', 'domain'], r.resource_type);
    nodes.push({
      id: `bridge_resource_${r.bridge_record_id}`,
      type: 'program',
      jurisdiction: safeText(r.state, 'unknown'),
      domain: safeText(category, 'general'),
      source_table: 'atlas_lighthouse_resource_bridge_v1',
      source_id: String(r.bridge_record_id),
      metadata: {
        name: r.name,
        atlas_resource_id: r.atlas_resource_id,
        resource_type: r.resource_type,
        category,
        city: r.city,
        state: r.state,
        address: r.address,
        phone: r.phone,
        website: r.url,
        contact: r.phone || r.url,
        latitude: r.lat,
        longitude: r.lon,
        source_table: r.source_table,
        atlas_source_id: r.source_id,
        extra_json: r.extra_json,
        bridge_version: r.bridge_version,
        bridge_metadata: r.bridge_metadata,
        verification_status: r.verification_status,
        bridged_at: r.bridged_at,
      },
    });
  }

  // --- registry_programs (3,405 rows) ---
  const [regProgRows] = await pool.query(`
    select id, jurisdiction_id_rp, category_rp, name_rp, agency_rp, eligibility_rp, contact_rp, website_rp, apply_notes_rp
    from registry_programs
  `) as any;
  for (const r of regProgRows) {
    nodes.push({
      id: `reg_program_${r.id}`,
      type: 'program',
      jurisdiction: safeText(r.jurisdiction_id_rp, 'unknown'),
      domain: safeText(r.category_rp, 'general'),
      source_table: 'registry_programs',
      source_id: String(r.id),
      metadata: {
        name: r.name_rp,
        category: r.category_rp,
        agency_name: r.agency_rp,
        eligibility: r.eligibility_rp,
        contact: r.contact_rp,
        website: r.website_rp,
        apply_notes: r.apply_notes_rp,
        phone: r.contact_rp,
      },
    });
  }

  // --- nonprofit_registry (2,561 rows) ---
  const [nonprofitRows] = await pool.query(`
    select uuid, entity_type, full_entity_name, jurisdiction, contact, domains, eligibility_requirements, application_methods
    from nonprofit_registry
  `) as any;
  for (const r of nonprofitRows) {
    const contactObj = typeof r.contact === 'object' && r.contact ? r.contact : {};
    nodes.push({
      id: `nonprofit_${r.uuid}`,
      type: 'program',
      jurisdiction: safeText(r.jurisdiction, 'unknown'),
      domain: safeText(r.entity_type, 'nonprofit'),
      source_table: 'nonprofit_registry',
      source_id: String(r.uuid),
      metadata: {
        name: r.full_entity_name,
        category: r.entity_type,
        domains: r.domains,
        phone: contactObj.phone || null,
        email: contactObj.email || null,
        website: contactObj.website || null,
        contact: contactObj.phone || contactObj.email || contactObj.website || null,
        eligibility: r.eligibility_requirements,
        application_methods: r.application_methods,
      },
    });
  }

  // --- government_benefits_registry (516 rows) ---
  const [govBenRows] = await pool.query(`
    select uuid, entity_type, full_entity_name, jurisdiction, administering_agency, website, contact_phone, eligibility_requirements, benefit_categories
    from government_benefits_registry
  `) as any;
  for (const r of govBenRows) {
    nodes.push({
      id: `gov_benefit_${r.uuid}`,
      type: 'program',
      jurisdiction: safeText(r.jurisdiction, 'unknown'),
      domain: safeText(r.entity_type || 'government_benefits', 'government_benefits'),
      source_table: 'government_benefits_registry',
      source_id: String(r.uuid),
      metadata: {
        name: r.full_entity_name,
        category: r.entity_type,
        agency_name: r.administering_agency,
        website: r.website,
        phone: r.contact_phone,
        contact: r.contact_phone || r.website,
        eligibility: r.eligibility_requirements,
        benefit_categories: r.benefit_categories,
      },
    });
  }

  // --- legal_aid_organizations (60 rows) ---
  const [legalAidRows] = await pool.query(`
    select id, organization, jurisdiction_code, phone, email, website, claim_types, notes
    from legal_aid_organizations
  `) as any;
  for (const r of legalAidRows) {
    nodes.push({
      id: `legal_aid_${r.id}`,
      type: 'program',
      jurisdiction: safeText(r.jurisdiction_code, 'unknown'),
      domain: 'legal_aid',
      source_table: 'legal_aid_organizations',
      source_id: String(r.id),
      metadata: {
        name: r.organization,
        category: 'legal_aid',
        domains: r.claim_types,
        phone: r.phone || null,
        email: r.email || null,
        website: r.website || null,
        contact: r.phone || r.email || r.website || null,
        eligibility: r.notes,
      },
    });
  }

  // --- legal_enforcement_records (245 rows) ---
  const [enfRows] = await pool.query(`
    select id, jurisdiction, agency_name, complaint_type, domains, statutory_requirement, statute_citation
    from legal_enforcement_records
  `) as any;
  for (const r of enfRows) {
    nodes.push({
      id: `enforcement_${r.id}`,
      type: 'agency',
      jurisdiction: safeText(r.jurisdiction, 'unknown'),
      domain: 'enforcement',
      source_table: 'legal_enforcement_records',
      source_id: String(r.id),
      metadata: {
        name: r.agency_name,
        agency_name: r.agency_name,
        complaint_type: r.complaint_type,
        domains: r.domains,
        statutory_requirement: r.statutory_requirement,
        statute_citation: r.statute_citation,
      },
    });
  }

  // --- registry_oversight_bodies (222 rows) ---
  const [oversightRows] = await pool.query(`
    select id, jurisdiction_id_rob, agency_name_rob, function_rob, contact_rob, pathway_rob
    from registry_oversight_bodies
  `) as any;
  for (const r of oversightRows) {
    nodes.push({
      id: `oversight_${r.id}`,
      type: 'agency',
      jurisdiction: safeText(r.jurisdiction_id_rob, 'unknown'),
      domain: safeText(r.function_rob, 'oversight'),
      source_table: 'registry_oversight_bodies',
      source_id: String(r.id),
      metadata: {
        name: r.agency_name_rob,
        agency_name: r.agency_name_rob,
        function: r.function_rob,
        contact: r.contact_rob,
        website: null,
        scope: r.pathway_rob,
      },
    });
  }

  return nodes;
}

async function loadAgencies(): Promise<WorldObject[]> {
  const nodes: WorldObject[] = [];

  const [agencyRows] = await pool.query(`
    select id, agency_name, jurisdiction, metadata, created_at
    from agencies_registry
  `) as any;

  for (const r of agencyRows) {
    const domain = metadataValue(r.metadata, ['function_area', 'function', 'domain', 'service_category'], 'general');
    nodes.push({
      id: `agency_${r.id}`,
      type: 'agency',
      jurisdiction: safeText(r.jurisdiction, 'unknown'),
      domain: safeText(domain, 'general'),
      source_table: 'agencies_registry',
      source_id: String(r.id),
      metadata: {
        name: r.agency_name,
        function: domain,
        jurisdiction_id: r.jurisdiction,
        contact: metadataValue(r.metadata, ['contact', 'contact_info', 'phone', 'email', 'website'], null),
        website: metadataValue(r.metadata, ['website', 'website_url', 'url'], null),
        raw_metadata: r.metadata,
        created_at: r.created_at,
      },
    });
  }

  const [formRows] = await pool.query(`
    select id, form_name, issuing_agency, jurisdiction, metadata, created_at
    from forms_registry
  `) as any;

  for (const r of formRows) {
    const formType = metadataValue(r.metadata, ['form_type', 'type', 'category'], 'filing');
    nodes.push({
      id: `form_${r.id}`,
      type: 'agency',
      jurisdiction: safeText(r.jurisdiction, 'unknown'),
      domain: 'filing',
      source_table: 'forms_registry',
      source_id: String(r.id),
      metadata: {
        name: r.form_name,
        issuing_agency: r.issuing_agency,
        form_type: formType,
        agency_name: r.issuing_agency,
        url: metadataValue(r.metadata, ['url', 'source_url', 'form_url', 'website'], null),
        description: metadataValue(r.metadata, ['description', 'summary'], null),
        jurisdiction_id: r.jurisdiction,
        raw_metadata: r.metadata,
        created_at: r.created_at,
      },
    });
  }

  const [escRows] = await pool.query(`
    select id, escalation_name, jurisdiction, metadata, created_at
    from escalation_registry
  `) as any;

  for (const r of escRows) {
    const domain = metadataValue(r.metadata, ['domain', 'case_type', 'category'], 'escalation');
    nodes.push({
      id: `escalation_${r.id}`,
      type: 'agency',
      jurisdiction: safeText(r.jurisdiction, 'unknown'),
      domain: safeText(domain, 'escalation'),
      source_table: 'escalation_registry',
      source_id: String(r.id),
      metadata: {
        name: r.escalation_name,
        trigger_condition: metadataValue(r.metadata, ['trigger_condition', 'trigger', 'condition'], null),
        escalation_path: metadataValue(r.metadata, ['escalation_path', 'pathway', 'path'], null),
        deadline_days: metadataValue(r.metadata, ['deadline_days', 'deadline'], null),
        agency_name: metadataValue(r.metadata, ['agency_name', 'agency', 'issuing_agency'], null),
        jurisdiction_id: r.jurisdiction,
        raw_metadata: r.metadata,
        created_at: r.created_at,
      },
    });
  }

  return nodes;
}

async function loadWorkflows(): Promise<WorldObject[]> {
  const nodes: WorldObject[] = [];

  const [stepRows] = await pool.query(`
    select id, workflow_id, step_order, title, step_type, decision_logic, metadata, source_url, created_at
    from workflow_steps
  `) as any;

  for (const r of stepRows) {
    const jurisdiction = metadataValue(r.metadata, ['jurisdiction', 'state'], 'unknown');
    const domain = metadataValue(r.metadata, ['domain', 'case_type', 'category'], r.workflow_id || 'general');
    nodes.push({
      id: `workflow_step_${r.id}`,
      type: 'workflow',
      jurisdiction: safeText(jurisdiction, 'unknown'),
      domain: safeText(domain, 'general'),
      source_table: 'workflow_steps',
      source_id: String(r.id),
      metadata: {
        workflow_id: r.workflow_id,
        workflow_type: r.workflow_id,
        step_order: r.step_order,
        title: r.title,
        step_name: r.title,
        step_type: r.step_type,
        decision_logic: r.decision_logic,
        source_url: r.source_url,
        jurisdiction_id: jurisdiction,
        raw_metadata: r.metadata,
        created_at: r.created_at,
      },
    });
  }

  const [remedyRows] = await pool.query(`
    select id, template_id, template_name, template_type, claim_type, jurisdiction, template_text, metadata, source_url, created_at
    from remedy_templates
  `) as any;

  for (const r of remedyRows) {
    nodes.push({
      id: `remedy_${r.id}`,
      type: 'workflow',
      jurisdiction: safeText(r.jurisdiction, 'unknown'),
      domain: safeText(r.claim_type || r.template_type, 'general'),
      source_table: 'remedy_templates',
      source_id: String(r.id),
      metadata: {
        workflow_type: 'remedy',
        template_id: r.template_id,
        name: r.template_name,
        template_type: r.template_type,
        claim_type: r.claim_type,
        template_text: r.template_text,
        source_url: r.source_url,
        jurisdiction_id: r.jurisdiction,
        raw_metadata: r.metadata,
        created_at: r.created_at,
      },
    });
  }

  return nodes;
}

async function loadSignals(): Promise<WorldObject[]> {
  const nodes: WorldObject[] = [];
  const seen = new Set<string>();

  const [detectedRows] = await pool.query(`
    select id, case_id, finding_id, snapshot_id, pipeline_run_id, signal_type, signal_description, severity, confidence_score, created_at
    from detected_signals
  `) as any;

  for (const r of detectedRows) {
    const nodeId = `detected_signal_${r.id}`;
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);
    nodes.push({
      id: nodeId,
      type: 'signal',
      jurisdiction: 'case_scoped',
      domain: 'case_signal',
      source_table: 'detected_signals',
      source_id: String(r.id),
      metadata: {
        origin: 'detection',
        signal_type: r.signal_type,
        severity: r.severity,
        title: r.signal_type,
        description: r.signal_description,
        confidence_score: r.confidence_score,
        case_id: r.case_id,
        finding_id: r.finding_id,
        snapshot_id: r.snapshot_id,
        pipeline_run_id: r.pipeline_run_id,
        detected_at: r.created_at,
      },
    });
  }

  const [signalBridgeRows] = await pool.query(`
    select bridge_record_id, atlas_signal_id, signal_type, source_system, jurisdiction_raw_value, jurisdiction_id, source_url,
           detected_at, bridged_at, confidence_score, severity, signal_status, rule_id, rule_version,
           evidence_payload, provenance_metadata, atlas_metadata_json, bridge_metadata
    from atlas_lighthouse_signal_bridge_v1
  `) as any;

  for (const r of signalBridgeRows) {
    const nodeId = `bridge_signal_${r.bridge_record_id}`;
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);
    nodes.push({
      id: nodeId,
      type: 'signal',
      jurisdiction: safeText(r.jurisdiction_id || r.jurisdiction_raw_value, 'unknown'),
      domain: safeText(metadataValue(r.atlas_metadata_json, ['domain', 'category'], 'general'), 'general'),
      source_table: 'atlas_lighthouse_signal_bridge_v1',
      source_id: String(r.bridge_record_id),
      metadata: {
        origin: 'atlas_bridge',
        signal_type: r.signal_type,
        severity: r.severity,
        title: metadataValue(r.evidence_payload, ['title', 'name', 'summary'], r.signal_type),
        description: metadataValue(r.evidence_payload, ['description', 'summary', 'text'], null),
        source_system: r.source_system,
        atlas_signal_id: r.atlas_signal_id,
        confidence_score: r.confidence_score,
        signal_status: r.signal_status,
        rule_id: r.rule_id,
        rule_version: r.rule_version,
        source_url: r.source_url,
        detected_at: r.detected_at,
        bridged_at: r.bridged_at,
        evidence_payload: r.evidence_payload,
        provenance_metadata: r.provenance_metadata,
        atlas_metadata_json: r.atlas_metadata_json,
        bridge_metadata: r.bridge_metadata,
      },
    });
  }

  const [judicialRows] = await pool.query(`
    select bridge_record_id, atlas_signal_id, signal_type, source_system, jurisdiction_raw_value, jurisdiction_id, source_url,
           detected_at, bridged_at, confidence_score, severity, signal_status, rule_id, rule_version,
           evidence_payload, provenance_metadata, atlas_metadata_json, bridge_metadata
    from atlas_lighthouse_judicial_signal_bridge_v1
  `) as any;

  for (const r of judicialRows) {
    const nodeId = `judicial_signal_${r.bridge_record_id}`;
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);
    nodes.push({
      id: nodeId,
      type: 'signal',
      jurisdiction: safeText(r.jurisdiction_id || r.jurisdiction_raw_value, 'unknown'),
      domain: 'judicial',
      source_table: 'atlas_lighthouse_judicial_signal_bridge_v1',
      source_id: String(r.bridge_record_id),
      metadata: {
        origin: 'judicial_bridge',
        signal_type: r.signal_type,
        severity: r.severity,
        title: metadataValue(r.evidence_payload, ['title', 'case_name', 'name'], r.signal_type),
        description: metadataValue(r.evidence_payload, ['description', 'summary', 'text'], null),
        source_system: r.source_system,
        atlas_signal_id: r.atlas_signal_id,
        confidence_score: r.confidence_score,
        signal_status: r.signal_status,
        rule_id: r.rule_id,
        rule_version: r.rule_version,
        source_url: r.source_url,
        detected_at: r.detected_at,
        bridged_at: r.bridged_at,
        evidence_payload: r.evidence_payload,
        provenance_metadata: r.provenance_metadata,
        atlas_metadata_json: r.atlas_metadata_json,
        bridge_metadata: r.bridge_metadata,
      },
    });
  }

  const [streamRows] = await pool.query(`
    select stream_id, "offset", timestamp, signal_type, spacetime, provenance, payload, source_id, jurisdiction_id, module_hint, ingested_at
    from signal_events
  `) as any;

  for (const r of streamRows) {
    const nodeId = `stream_signal_${r.stream_id}_${r.offset}`;
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);
    nodes.push({
      id: nodeId,
      type: 'signal',
      jurisdiction: safeText(r.jurisdiction_id || metadataValue(r.spacetime, ['region'], null), 'unknown'),
      domain: safeText(r.module_hint, 'stream'),
      source_table: 'signal_events',
      source_id: `${r.stream_id}:${r.offset}`,
      metadata: {
        origin: 'stream',
        signal_type: r.signal_type,
        stream_id: r.stream_id,
        offset: r.offset,
        timestamp: r.timestamp,
        source_id: r.source_id,
        module_hint: r.module_hint,
        ingested_at: r.ingested_at,
        spacetime: r.spacetime,
        provenance: r.provenance,
        payload: r.payload,
        confidence: metadataValue(r.provenance, ['confidence'], null),
      },
    });
  }

  return nodes;
}

async function buildRelationships(nodes: WorldObject[]): Promise<WorldRelationship[]> {
  const edges: WorldRelationship[] = [];
  let edgeCounter = 0;
  const jurisdictionNodes = nodes.filter(n => n.type === 'jurisdiction');
  const agencyNodes = nodes.filter(n => n.type === 'agency');

  function findJurisdiction(value: string | null | undefined): WorldObject | undefined {
    if (!value) return undefined;
    return jurisdictionNodes.find(j =>
      j.jurisdiction === value ||
      j.metadata.abbreviation === value ||
      j.metadata.name === value
    );
  }

  for (const n of nodes) {
    if (n.type === 'program') {
      const jNode = findJurisdiction(n.jurisdiction);
      if (jNode) {
        edges.push({
          id: `edge_${++edgeCounter}`,
          from: n.id,
          to: jNode.id,
          type: 'program_access',
          metadata: { program_name: n.metadata.name, category: n.metadata.category || n.domain },
        });
      }
    }

    if (n.type === 'signal') {
      const jNode = findJurisdiction(n.jurisdiction);
      if (jNode) {
        edges.push({
          id: `edge_${++edgeCounter}`,
          from: n.id,
          to: jNode.id,
          type: 'signal_link',
          metadata: { signal_type: n.metadata.signal_type, severity: n.metadata.severity, origin: n.metadata.origin },
        });
      }
    }

    if (n.type === 'workflow') {
      const jNode = findJurisdiction(n.jurisdiction);
      if (jNode) {
        edges.push({
          id: `edge_${++edgeCounter}`,
          from: n.id,
          to: jNode.id,
          type: 'program_access',
          metadata: { workflow_type: n.metadata.workflow_type, name: n.metadata.name || n.metadata.title },
        });
      }
    }
  }

  for (const agency of agencyNodes) {
    const jNode = findJurisdiction(agency.jurisdiction);
    if (jNode) {
      edges.push({
        id: `edge_${++edgeCounter}`,
        from: agency.id,
        to: jNode.id,
        type: 'oversight',
        metadata: { agency_name: agency.metadata.name, function: agency.metadata.function || agency.domain },
      });
    }
  }

  const agencyByName = new Map<string, WorldObject>();
  for (const agency of agencyNodes) {
    const name = safeText(agency.metadata.name || agency.metadata.agency_name, '').toLowerCase();
    if (name) agencyByName.set(name, agency);
  }

  for (const node of nodes) {
    const agencyName = safeText(node.metadata.issuing_agency || node.metadata.agency_name, '').toLowerCase();
    if (!agencyName) continue;
    const agency = agencyByName.get(agencyName);
    if (!agency || agency.id === node.id) continue;
    edges.push({
      id: `edge_${++edgeCounter}`,
      from: node.id,
      to: agency.id,
      type: node.source_table === 'escalation_registry' ? 'escalation' : 'oversight',
      metadata: { agency_name: agency.metadata.name, source_table: node.source_table },
    });
  }

  return edges;
}

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
