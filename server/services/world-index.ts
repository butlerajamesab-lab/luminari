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
      select state as jurisdiction from normalized_civic_resource where state is not null
      union
      select coalesce(nullif(jurisdiction_code, ''), nullif(jurisdiction_label, '')) as jurisdiction
      from jurisdiction_assertions
      where is_active is distinct from false
        and promotion_status = 'promoted'
      union
      select jurisdiction from national_resources where jurisdiction is not null
      union
      select state as jurisdiction from atlas_lighthouse_resource_bridge_v1 where state is not null
      union
      select jurisdiction_raw_value as jurisdiction
      from v_lighthouse_verified_legal_signals_v1
      where verification_status = 'verified'
        and signal_status = 'active'
        and generation_method = 'deterministic_rule'
        and signal_type <> 'stream_health_alert'
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

  const [civicRows] = await pool.query(`
    select
      id,
      name,
      resource_type,
      description,
      organization_name,
      agency_name,
      address_line1,
      address_line2,
      city,
      county,
      state,
      postal_code,
      latitude,
      longitude,
      phone,
      email,
      website_url,
      service_categories,
      eligibility_summary,
      normalized_payload,
      normalization_confidence
    from normalized_civic_resource
  `) as any;

  for (const r of civicRows) {
    const category = firstArrayValue(r.service_categories) || r.resource_type || 'general';
    nodes.push({
      id: `civic_resource_${r.id}`,
      type: 'program',
      jurisdiction: safeText(r.state, 'unknown'),
      domain: safeText(category, 'general'),
      source_table: 'normalized_civic_resource',
      source_id: String(r.id),
      metadata: {
        name: r.name,
        resource_type: r.resource_type,
        category,
        service_categories: r.service_categories,
        city: r.city,
        county: r.county,
        state: r.state,
        address: [r.address_line1, r.address_line2].filter(Boolean).join(', '),
        postal_code: r.postal_code,
        phone: r.phone,
        email: r.email,
        website: r.website_url,
        contact: r.phone || r.email || r.website_url,
        description: r.description,
        eligibility: r.eligibility_summary,
        organization_name: r.organization_name,
        agency_name: r.agency_name,
        latitude: r.latitude,
        longitude: r.longitude,
        normalized_payload: r.normalized_payload,
        normalization_confidence: r.normalization_confidence,
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

  // Canonical resource backbone. Public World Index consumers receive only
  // records that have crossed both promotion and verification gates.
  const [canonicalResourceRows] = await pool.query(`
    select
      e.resource_entity_id,
      e.canonical_id,
      e.resource_name,
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
      e.metadata,
      e.verification_status,
      e.promotion_status,
      e.provenance_status,
      e.source_table,
      e.source_pk,
      e.source_hash,
      contacts.contacts,
      location.address_line1,
      location.address_line2,
      location.city as location_city,
      location.county as location_county,
      location.state as location_state,
      location.postal_code,
      location.country,
      location.latitude,
      location.longitude,
      location.coordinate_quality,
      location.geocode_source
    from luminari_resource_entities e
    left join lateral (
      select jsonb_object_agg(preferred.contact_type, preferred.contact_value) as contacts
      from (
        select distinct on (cp.contact_type)
          cp.contact_type,
          cp.contact_value
        from luminari_resource_contact_points cp
        where cp.resource_entity_id = e.resource_entity_id
          and nullif(btrim(cp.contact_value), '') is not null
        order by cp.contact_type, cp.is_primary desc nulls last, cp.created_at desc, cp.contact_point_id
      ) preferred
    ) contacts on true
    left join lateral (
      select
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
        l.geocode_source
      from luminari_resource_locations l
      where l.resource_entity_id = e.resource_entity_id
      order by
        (l.latitude is not null and l.longitude is not null) desc,
        l.created_at desc,
        l.location_id
      limit 1
    ) location on true
    where e.promotion_status = 'promoted'
      and e.verification_status = 'verified'
  `) as any;

  for (const r of canonicalResourceRows) {
    const contacts = r.contacts && typeof r.contacts === 'object' ? r.contacts : {};
    const state = r.location_state || r.state;
    const city = r.location_city || r.city;
    const county = r.location_county || r.county;
    const category = firstArrayValue(r.service_categories) || r.resource_category || r.resource_type || 'general';
    const website = contacts.website || contacts.portal || null;
    const phone = contacts.phone || contacts.general || null;
    const email = contacts.email || null;
    nodes.push({
      id: `canonical_resource_${r.resource_entity_id}`,
      type: 'program',
      jurisdiction: safeText(state || r.jurisdiction, 'unknown'),
      domain: safeText(category, 'general'),
      source_table: 'luminari_resource_entities',
      source_id: String(r.resource_entity_id),
      metadata: {
        name: r.resource_name,
        canonical_id: r.canonical_id,
        resource_type: r.resource_type,
        category,
        layer: r.layer,
        jurisdiction: r.jurisdiction,
        jurisdiction_scope: r.jurisdiction_scope,
        city,
        county,
        state,
        address: [r.address_line1, r.address_line2].filter(Boolean).join(', '),
        postal_code: r.postal_code,
        country: r.country,
        phone,
        email,
        website,
        contact: phone || email || website,
        contacts,
        description: r.description,
        eligibility: r.eligibility_summary,
        apply_notes: r.apply_notes,
        service_categories: r.service_categories,
        domains: r.domains,
        latitude: r.latitude,
        longitude: r.longitude,
        coordinate_quality: r.coordinate_quality,
        geocode_source: r.geocode_source,
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

  // --- registry_programs ---
  const [regProgRows] = await pool.query(`
    select
      id,
      coalesce(jurisdiction_id_rp, jurisdiction_id) as jurisdiction_id,
      category,
      name,
      agency,
      eligibility,
      contact,
      website,
      apply_notes
    from registry_programs
  `) as any;
  for (const r of regProgRows) {
    nodes.push({
      id: `reg_program_${r.id}`,
      type: 'program',
      jurisdiction: safeText(r.jurisdiction_id, 'unknown'),
      domain: safeText(r.category, 'general'),
      source_table: 'registry_programs',
      source_id: String(r.id),
      metadata: {
        name: r.name,
        category: r.category,
        agency_name: r.agency,
        eligibility: r.eligibility,
        contact: r.contact,
        website: r.website,
        apply_notes: r.apply_notes,
        phone: r.contact,
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

  const [canonicalOversightRows] = await pool.query(`
    select
      uuid,
      entity_type,
      full_entity_name,
      jurisdiction,
      verification_status,
      contact,
      website,
      contact_phone,
      physical_address,
      complaint_portals,
      public_filing_portals,
      oversight_domains,
      related_entities,
      related_statutes,
      workflow_deadlines,
      provenance,
      contact_email_norm,
      contact_phone_norm,
      contact_website_norm,
      contact_physical_address_norm,
      created_at
    from oversight_registry
    where verification_status = 'verified'
  `) as any;

  for (const r of canonicalOversightRows) {
    const contact = r.contact && typeof r.contact === 'object' ? r.contact : {};
    const phone = r.contact_phone_norm || r.contact_phone || contact.phone || null;
    const email = r.contact_email_norm || contact.email || null;
    const website = r.contact_website_norm || r.website || contact.website || null;
    nodes.push({
      id: `canonical_oversight_${r.uuid}`,
      type: 'agency',
      jurisdiction: safeText(r.jurisdiction, 'unknown'),
      domain: safeText(firstArrayValue(r.oversight_domains) || r.entity_type, 'oversight'),
      source_table: 'oversight_registry',
      source_id: String(r.uuid),
      metadata: {
        name: r.full_entity_name,
        agency_name: r.full_entity_name,
        entity_type: r.entity_type,
        function: r.oversight_domains,
        oversight_domains: r.oversight_domains,
        phone,
        email,
        website,
        contact: phone || email || website,
        physical_address: r.contact_physical_address_norm || r.physical_address,
        complaint_portals: r.complaint_portals,
        public_filing_portals: r.public_filing_portals,
        related_entities: r.related_entities,
        related_statutes: r.related_statutes,
        workflow_deadlines: r.workflow_deadlines,
        verification_status: r.verification_status,
        provenance: r.provenance,
        created_at: r.created_at,
      },
    });
  }

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
    select
      uuid as id,
      issue_type as escalation_name,
      initial_route,
      secondary_route,
      federal_escalation,
      civil_escalation,
      federal_agencies,
      related_statutes,
      verification_status,
      created_at
    from escalation_registry
    where verification_status = 'verified'
  `) as any;

  for (const r of escRows) {
    const domain = safeText(r.escalation_name, 'escalation');
    nodes.push({
      id: `escalation_${r.id}`,
      type: 'agency',
      jurisdiction: 'unknown',
      domain: safeText(domain, 'escalation'),
      source_table: 'escalation_registry',
      source_id: String(r.id),
      metadata: {
        name: r.escalation_name,
        issue_type: r.escalation_name,
        escalation_path: r.initial_route,
        secondary_route: r.secondary_route,
        federal_escalation: r.federal_escalation,
        civil_escalation: r.civil_escalation,
        federal_agencies: r.federal_agencies,
        related_statutes: r.related_statutes,
        verification_status: r.verification_status,
        created_at: r.created_at,
      },
    });
  }

  return nodes;
}

async function loadWorkflows(): Promise<WorldObject[]> {
  const nodes: WorldObject[] = [];

  const [canonicalWorkflowRows] = await pool.query(`
    select
      uuid,
      workflow_type,
      jurisdiction,
      entry_agency,
      filing_deadline,
      extended_deadline,
      filing_methods,
      required_documents,
      escalation_pathways,
      official_portal,
      related_statutes,
      verification_status,
      created_at
    from workflow_registry
    where verification_status = 'verified'
  `) as any;

  for (const r of canonicalWorkflowRows) {
    nodes.push({
      id: `canonical_workflow_${r.uuid}`,
      type: 'workflow',
      jurisdiction: safeText(r.jurisdiction, 'unknown'),
      domain: safeText(r.workflow_type, 'general'),
      source_table: 'workflow_registry',
      source_id: String(r.uuid),
      metadata: {
        name: r.workflow_type,
        workflow_type: r.workflow_type,
        entry_agency: r.entry_agency,
        agency_name: r.entry_agency,
        filing_deadline: r.filing_deadline,
        extended_deadline: r.extended_deadline,
        filing_methods: r.filing_methods,
        required_documents: r.required_documents,
        escalation_pathways: r.escalation_pathways,
        official_portal: r.official_portal,
        source_url: r.official_portal,
        related_statutes: r.related_statutes,
        verification_status: r.verification_status,
        created_at: r.created_at,
      },
    });
  }

  const [stepRows] = await pool.query(`
    select
      id,
      workflow_id,
      step_order,
      title,
      step_type,
      decision_logic,
      metadata,
      null::text as source_url,
      created_at
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
    select
      id,
      template_id,
      template_name,
      template_type,
      claim_type,
      jurisdiction,
      template_body as template_text,
      null::jsonb as metadata,
      null::text as source_url,
      created_at
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
  const [rows] = await pool.query(`
    select
      signal_family,
      bridge_record_id,
      atlas_signal_id,
      signal_type,
      source_system,
      bridge_version,
      jurisdiction_raw_value,
      source_url,
      detected_at,
      bridged_at,
      confidence_score,
      severity,
      signal_status,
      rule_id,
      rule_version,
      generation_method,
      record_origin,
      verification_status,
      evidence_payload,
      provenance_metadata,
      atlas_metadata_json,
      source_view,
      bridge_metadata
    from v_lighthouse_verified_legal_signals_v1
    where verification_status = 'verified'
      and signal_status = 'active'
      and generation_method = 'deterministic_rule'
      and signal_type <> 'stream_health_alert'
    order by detected_at desc, bridge_record_id
  `) as any;

  return rows.map((r: any) => ({
    id: `verified_legal_signal_${r.bridge_record_id}`,
    type: 'signal' as const,
    jurisdiction: safeText(r.jurisdiction_raw_value, 'unknown'),
    domain: safeText(r.signal_family, 'legal'),
    source_table: 'v_lighthouse_verified_legal_signals_v1',
    source_id: String(r.bridge_record_id),
    metadata: {
      origin: 'verified_atlas_bridge',
      signal_family: r.signal_family,
      signal_type: r.signal_type,
      severity: r.severity,
      title: metadataValue(
        r.atlas_metadata_json,
        ['title', 'case_name', 'name', 'summary'],
        metadataValue(r.evidence_payload, ['title', 'case_name', 'name', 'summary'], r.signal_type),
      ),
      description: metadataValue(
        r.atlas_metadata_json,
        ['description', 'summary', 'text'],
        metadataValue(r.evidence_payload, ['description', 'summary', 'text'], null),
      ),
      source_system: r.source_system,
      atlas_signal_id: r.atlas_signal_id,
      bridge_version: r.bridge_version,
      confidence_score: r.confidence_score,
      signal_status: r.signal_status,
      rule_id: r.rule_id,
      rule_version: r.rule_version,
      generation_method: r.generation_method,
      record_origin: r.record_origin,
      verification_status: r.verification_status,
      source_url: r.source_url,
      source_view: r.source_view,
      detected_at: r.detected_at,
      bridged_at: r.bridged_at,
      evidence_payload: r.evidence_payload,
      provenance_metadata: r.provenance_metadata,
      atlas_metadata_json: r.atlas_metadata_json,
      bridge_metadata: r.bridge_metadata,
    },
  }));
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
