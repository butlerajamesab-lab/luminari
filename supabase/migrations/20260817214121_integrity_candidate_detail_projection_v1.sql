-- Service-only review projection for the governed integrity substrate.
-- This exposes evidence and lifecycle receipts to the authenticated server
-- without making the private schema reachable from browser roles.

create or replace function public.integrity_candidate_detail_v1(p_candidate_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'private', 'public'
as $$
  select jsonb_build_object(
    'candidate', jsonb_build_object(
      'candidate_id', c.candidate_id,
      'case_id', c.case_id,
      'signal_id', c.signal_id,
      'candidate_type', c.candidate_type,
      'subject_scope', c.subject_scope,
      'jurisdiction_id', c.jurisdiction_id,
      'summary', c.summary,
      'status', coalesce(
        (
          select t.to_status
          from private.integrity_candidate_transition t
          where t.candidate_id = c.candidate_id
          order by t.transition_order desc
          limit 1
        ),
        c.status
      ),
      'rule_id', c.rule_id,
      'rule_version', c.rule_version,
      'input_hash', c.input_hash,
      'candidate_hash', c.candidate_hash,
      'observed_at', c.observed_at,
      'created_at', c.created_at
    ),
    'evidence', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'evidence_link_id', e.evidence_link_id,
            'source_class', e.source_class,
            'source_relation', e.source_relation,
            'source_record_key', e.source_record_key,
            'source_uri', e.source_uri,
            'quote_text', e.quote_text,
            'pinpoint', e.pinpoint,
            'source_content_hash', e.source_content_hash,
            'supports_or_contradicts', e.supports_or_contradicts,
            'evidence_hash', e.evidence_hash,
            'observed_at', e.observed_at,
            'created_at', e.created_at
          ) order by e.created_at, e.evidence_link_id
        )
        from private.integrity_evidence_link e
        where e.candidate_id = c.candidate_id
      ),
      '[]'::jsonb
    ),
    'assessments', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'assessment_id', a.assessment_id,
            'assessment_order', a.assessment_order,
            'assessment_state', a.assessment_state,
            'independent_source_count', a.independent_source_count,
            'contradiction_count', a.contradiction_count,
            'source_class_count', a.source_class_count,
            'rationale', a.rationale,
            'evidence_link_ids', a.evidence_link_ids,
            'rule_id', a.rule_id,
            'rule_version', a.rule_version,
            'assessment_hash', a.assessment_hash,
            'assessed_at', a.assessed_at
          ) order by a.assessment_order
        )
        from private.integrity_corroboration_assessment a
        where a.candidate_id = c.candidate_id
      ),
      '[]'::jsonb
    ),
    'transitions', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'transition_id', t.transition_id,
            'transition_order', t.transition_order,
            'from_status', t.from_status,
            'to_status', t.to_status,
            'reason', t.reason,
            'actor_type', t.actor_type,
            'actor_id', t.actor_id,
            'assessment_id', t.assessment_id,
            'transition_hash', t.transition_hash,
            'created_at', t.created_at
          ) order by t.transition_order
        )
        from private.integrity_candidate_transition t
        where t.candidate_id = c.candidate_id
      ),
      '[]'::jsonb
    ),
    'routing_snapshots', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'routing_snapshot_id', r.routing_snapshot_id,
            'assessment_id', r.assessment_id,
            'jurisdiction_id', r.jurisdiction_id,
            'agency_name', r.agency_name,
            'department_name', r.department_name,
            'channel_type', r.channel_type,
            'destination_uri', r.destination_uri,
            'authority_basis', r.authority_basis,
            'routing_constraints', r.routing_constraints,
            'source_as_of', r.source_as_of,
            'routing_hash', r.routing_hash,
            'created_at', r.created_at
          ) order by r.created_at, r.routing_snapshot_id
        )
        from private.integrity_routing_snapshot r
        where r.candidate_id = c.candidate_id
      ),
      '[]'::jsonb
    ),
    'packets', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'packet_id', p.packet_id,
            'assessment_id', p.assessment_id,
            'routing_snapshot_id', p.routing_snapshot_id,
            'packet_state', p.packet_state,
            'allegation_disclaimer', p.allegation_disclaimer,
            'evidence_link_ids', p.evidence_link_ids,
            'packet_payload', p.packet_payload,
            'packet_hash', p.packet_hash,
            'created_by_type', p.created_by_type,
            'created_by_id', p.created_by_id,
            'created_at', p.created_at,
            'transmitted_at', p.transmitted_at,
            'external_receipt', p.external_receipt
          ) order by p.created_at, p.packet_id
        )
        from private.integrity_escalation_packet p
        where p.candidate_id = c.candidate_id
      ),
      '[]'::jsonb
    ),
    'disclaimer', 'Integrity candidates are evidence-bound review objects. They do not determine corruption, criminal liability, intent, or wrongdoing.'
  )
  from private.integrity_pattern_candidate c
  where c.candidate_id = p_candidate_id and c.is_current;
$$;

revoke all on function public.integrity_candidate_detail_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.integrity_candidate_detail_v1(uuid)
  to service_role;

comment on function public.integrity_candidate_detail_v1(uuid) is
  'Service-only evidence, corroboration, transition, routing, and draft-packet projection for an integrity review candidate.';
