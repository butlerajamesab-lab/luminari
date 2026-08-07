begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function public.register_intake_layer_execution_v3(
  p_intake_session_id uuid,
  p_layer_name text,
  p_layer_version text,
  p_rule_version text,
  p_parser_version text,
  p_rule_manifest_hash text,
  p_execution_envelope jsonb,
  p_input_hash text,
  p_output_data jsonb,
  p_output_hash text,
  p_input_refs jsonb default '[]'::jsonb,
  p_unresolved_dependencies jsonb default '[]'::jsonb
)
returns table (
  registered_layer_run_id uuid,
  registered_receipt_hash text,
  registered_output_artifact_id uuid,
  reused_existing boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_expected_input_hash text;
  v_expected_output_hash text;
  v_verified_input_refs jsonb;
begin
  if pg_catalog.jsonb_typeof(p_execution_envelope) <> 'object' then
    raise exception using errcode = '22023', message = 'execution envelope must be a JSON object';
  end if;
  if not (p_execution_envelope ? 'canonical_input')
     or p_execution_envelope ->> 'layer_version' is distinct from p_layer_version
     or p_execution_envelope ->> 'rule_version' is distinct from p_rule_version
     or p_execution_envelope ->> 'rule_manifest_hash' is distinct from p_rule_manifest_hash
     or p_execution_envelope ->> 'parser_version' is distinct from p_parser_version
     or p_execution_envelope ->> 'canonicalization_version' is distinct from 'luminari.intake.canonical-json.v2' then
    raise exception using errcode = '23514', message = 'execution envelope mirrors do not match declared layer contract';
  end if;

  v_expected_input_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(public.luminari_canonical_json_v2(p_execution_envelope), 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  if p_input_hash is distinct from v_expected_input_hash then
    raise exception using
      errcode = '23514',
      message = 'cross-runtime execution hash mismatch against PostgreSQL canonical-json.v2';
  end if;

  v_expected_output_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(public.luminari_canonical_json_v2(coalesce(p_output_data, 'null'::jsonb)), 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  if p_output_hash is distinct from v_expected_output_hash then
    raise exception using
      errcode = '23514',
      message = 'cross-runtime output hash mismatch against PostgreSQL canonical-json.v2';
  end if;

  if pg_catalog.jsonb_typeof(coalesce(p_input_refs, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'input_refs must be a JSON array';
  end if;

  v_verified_input_refs := coalesce(p_input_refs, '[]'::jsonb) || pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'contract', 'luminari.intake.cross-runtime-canonical-proof.v1',
      'canonicalization_version', 'luminari.intake.canonical-json.v2',
      'execution_envelope_hash', v_expected_input_hash,
      'output_data_hash', v_expected_output_hash,
      'verified_by', 'postgresql'
    )
  );

  return query
  select *
    from public.register_intake_layer_execution_v2(
      p_intake_session_id,
      p_layer_name,
      p_layer_version,
      p_rule_version,
      p_parser_version,
      p_rule_manifest_hash,
      p_input_hash,
      p_output_hash,
      p_output_data,
      v_verified_input_refs,
      p_unresolved_dependencies
    );
end
$function$;

revoke all on function public.register_intake_layer_execution_v3(
  uuid, text, text, text, text, text, jsonb, text, jsonb, text, jsonb, jsonb
) from public;

do $acl$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.register_intake_layer_execution_v3(
      uuid, text, text, text, text, text, jsonb, text, jsonb, text, jsonb, jsonb
    ) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.register_intake_layer_execution_v3(
      uuid, text, text, text, text, text, jsonb, text, jsonb, text, jsonb, jsonb
    ) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on function public.register_intake_layer_execution_v2(
      uuid, text, text, text, text, text, text, text, jsonb, jsonb, jsonb
    ) from service_role;
    grant execute on function public.register_intake_layer_execution_v3(
      uuid, text, text, text, text, text, jsonb, text, jsonb, text, jsonb, jsonb
    ) to service_role;
  end if;
end
$acl$;

commit;
