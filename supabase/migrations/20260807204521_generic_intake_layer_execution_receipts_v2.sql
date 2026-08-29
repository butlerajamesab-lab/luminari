begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.intake_layer_runs
  drop constraint if exists intake_layer_runs_v2_receipt_digest_ck;

alter table public.intake_layer_runs
  add constraint intake_layer_runs_v2_receipt_digest_ck
  check (
    not is_sealed
    or canonicalization_version <> 'luminari.intake.canonical-json.v2'
    or coalesce(
      (
        not (receipt ? 'hash_basis')
        and receipt ?& array[
          'canonicalization_version', 'hash_algorithm', 'input_hash',
          'intake_session_id', 'layer_name', 'layer_run_id',
          'layer_version', 'output_hash', 'previous_canonicalization_version',
          'previous_receipt_hash', 'receipt_hash', 'receipt_type',
          'receipt_version', 'rule_version'
        ]
        and receipt ->> 'canonicalization_version' is not distinct from canonicalization_version
        and receipt ->> 'hash_algorithm' is not distinct from hash_algorithm
        and receipt ->> 'intake_session_id' is not distinct from intake_session_id::text
        and receipt ->> 'layer_run_id' is not distinct from layer_run_id::text
        and receipt ->> 'layer_name' is not distinct from layer_name
        and receipt ->> 'layer_version' is not distinct from layer_version
        and receipt ->> 'rule_version' is not distinct from rule_version
        and receipt ->> 'input_hash' is not distinct from input_hash
        and receipt ->> 'output_hash' is not distinct from output_hash
        and receipt ->> 'previous_receipt_hash' is not distinct from previous_receipt_hash
        and receipt ->> 'receipt_hash' is not distinct from receipt_hash
        and receipt ->> 'receipt_version' = '2.0.0'
        and (
          (
            receipt ->> 'receipt_type' in ('evidence_preservation', 'document_replacement')
            and receipt ?& array[
              'artifact_id', 'artifact_key', 'byte_size', 'case_uuid', 'filename',
              'legacy_case_id', 'legacy_document_id', 'mime_type',
              'preservation_mode', 'preservation_state', 'replacement_reason',
              'replaces_legacy_document_id', 'sha256', 'snapshot_id',
              'source_receipt_hash', 'storage_bucket', 'storage_object_path',
              'transition_id', 'verification_record_id', 'verification_scope'
            ]
            and receipt ->> 'preservation_state' = 'preserved'
            and receipt ->> 'legacy_case_id' ~ '^[1-9][0-9]*$'
            and receipt ->> 'legacy_document_id' ~ '^[1-9][0-9]*$'
            and receipt ->> 'snapshot_id' ~ '^[1-9][0-9]*$'
            and receipt ->> 'byte_size' ~ '^[0-9]+$'
            and receipt ->> 'sha256' ~ '^[0-9a-f]{64}$'
            and (
              (
                receipt ->> 'preservation_mode' = 'uploaded_bytes'
                and receipt ->> 'receipt_type' = 'evidence_preservation'
                and receipt ->> 'verification_scope' = 'request_bytes_and_storage_addressability'
                and receipt -> 'source_receipt_hash' = 'null'::jsonb
              )
              or (
                receipt ->> 'preservation_mode' = 'existing_receipted_document'
                and receipt ->> 'receipt_type' = 'document_replacement'
                and receipt ->> 'verification_scope' = 'prior_receipt_and_storage_addressability'
                and receipt ->> 'source_receipt_hash' ~ '^[0-9a-f]{64}$'
                and receipt ->> 'replaces_legacy_document_id' ~ '^[1-9][0-9]*$'
              )
            )
          )
          or
          (
            receipt ->> 'receipt_type' = 'layer_execution'
            and receipt ?& array[
              'execution_contract_version', 'parser_version', 'rule_manifest_hash',
              'input_refs_hash', 'output_refs_hash', 'unresolved_dependencies_hash',
              'output_artifact_id', 'output_artifact_key'
            ]
            and receipt ->> 'execution_contract_version' = 'luminari.intake.layer-execution.v1'
            and length(coalesce(receipt ->> 'parser_version', '')) > 0
            and receipt ->> 'rule_manifest_hash' ~ '^[0-9a-f]{64}$'
            and receipt ->> 'input_refs_hash' ~ '^[0-9a-f]{64}$'
            and receipt ->> 'output_refs_hash' ~ '^[0-9a-f]{64}$'
            and receipt ->> 'unresolved_dependencies_hash' ~ '^[0-9a-f]{64}$'
            and length(coalesce(receipt ->> 'output_artifact_key', '')) > 0
          )
        )
        and receipt_hash = pg_catalog.encode(
          extensions.digest(
            pg_catalog.convert_to(
              public.luminari_canonical_json_v2(receipt - 'receipt_hash'),
              'UTF8'
            ),
            'sha256'
          ),
          'hex'
        )
      ),
      false
    )
  ) not valid;

alter table public.intake_layer_runs
  validate constraint intake_layer_runs_v2_receipt_digest_ck;

create or replace function public.register_intake_layer_execution_v2(
  p_intake_session_id uuid,
  p_layer_name text,
  p_layer_version text,
  p_rule_version text,
  p_parser_version text,
  p_rule_manifest_hash text,
  p_input_hash text,
  p_output_hash text,
  p_output_data jsonb,
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
  v_now timestamptz := clock_timestamp();
  v_existing public.intake_layer_runs%rowtype;
  v_tip_hash text;
  v_tip_version text;
  v_layer_run_id uuid := extensions.gen_random_uuid();
  v_output_artifact_id uuid;
  v_output_artifact_key text;
  v_output_refs jsonb;
  v_input_refs_hash text;
  v_output_refs_hash text;
  v_unresolved_hash text;
  v_receipt_without_hash jsonb;
  v_receipt jsonb;
  v_receipt_hash text;
  v_supersedes_id uuid;
begin
  if p_intake_session_id is null then
    raise exception using errcode = '22004', message = 'intake_session_id is required';
  end if;
  if coalesce(btrim(p_layer_name), '') = ''
     or coalesce(btrim(p_layer_version), '') = ''
     or coalesce(btrim(p_rule_version), '') = ''
     or coalesce(btrim(p_parser_version), '') = '' then
    raise exception using errcode = '22023', message = 'layer/rule/parser versions are required';
  end if;
  if p_rule_manifest_hash !~ '^[0-9a-f]{64}$'
     or p_input_hash !~ '^[0-9a-f]{64}$'
     or p_output_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'rule manifest, input, and output hashes must be lowercase sha256';
  end if;
  if pg_catalog.jsonb_typeof(coalesce(p_input_refs, '[]'::jsonb)) <> 'array'
     or pg_catalog.jsonb_typeof(coalesce(p_unresolved_dependencies, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'input_refs and unresolved_dependencies must be JSON arrays';
  end if;

  perform 1
    from public.intake_sessions
   where intake_session_id = p_intake_session_id
   for update;
  if not found then
    raise exception using errcode = '23503', message = 'intake session does not exist';
  end if;

  select *
    into v_existing
    from public.intake_layer_runs
   where intake_session_id = p_intake_session_id
     and layer_name = p_layer_name
     and layer_version = p_layer_version
     and input_hash = p_input_hash
     and run_status <> 'superseded'
   order by started_at desc, layer_run_id desc
   limit 1;

  if found then
    if not v_existing.is_sealed or v_existing.run_status <> 'completed' then
      raise exception using errcode = '55000', message = 'matching intake layer run exists but is not sealed/completed';
    end if;
    if v_existing.output_hash is distinct from p_output_hash then
      raise exception using errcode = '23514', message = 'deterministic replay mismatch: same execution identity produced a different output hash';
    end if;
    return query
      select
        v_existing.layer_run_id,
        v_existing.receipt_hash,
        nullif(v_existing.output_refs -> 0 ->> 'artifact_id', '')::uuid,
        true;
    return;
  end if;

  select receipt_hash, canonicalization_version
    into v_tip_hash, v_tip_version
    from public.intake_layer_runs
   where intake_session_id = p_intake_session_id
     and is_sealed
     and receipt_hash is not null
   order by sealed_at desc, layer_run_id desc
   limit 1;

  select layer_run_id
    into v_supersedes_id
    from public.intake_layer_runs
   where intake_session_id = p_intake_session_id
     and layer_name = p_layer_name
     and is_sealed
   order by sealed_at desc, layer_run_id desc
   limit 1;

  v_output_artifact_key := format(
    'layer-output:%s:%s:%s',
    p_layer_name,
    p_input_hash,
    p_output_hash
  );

  select artifact_id
    into v_output_artifact_id
    from public.intake_artifacts
   where intake_session_id = p_intake_session_id
     and artifact_key = v_output_artifact_key
   limit 1;

  if v_output_artifact_id is null then
    v_output_artifact_id := extensions.gen_random_uuid();
    insert into public.intake_artifacts (
      artifact_id,
      intake_session_id,
      artifact_key,
      source_family,
      artifact_type,
      evidence_tier,
      availability,
      privacy_classification,
      artifact_status,
      metadata,
      created_at,
      updated_at
    ) values (
      v_output_artifact_id,
      p_intake_session_id,
      v_output_artifact_key,
      'universal_intake_spine',
      'intake_layer_output',
      'derived_canonical_output',
      'lighthouse_database',
      'restricted',
      'preserved',
      pg_catalog.jsonb_build_object(
        'execution_contract_version', 'luminari.intake.layer-execution.v1',
        'layer_name', p_layer_name,
        'layer_version', p_layer_version,
        'rule_version', p_rule_version,
        'parser_version', p_parser_version,
        'rule_manifest_hash', p_rule_manifest_hash,
        'canonicalization_version', 'luminari.intake.canonical-json.v2',
        'input_hash', p_input_hash,
        'output_hash', p_output_hash,
        'data', coalesce(p_output_data, 'null'::jsonb)
      ),
      v_now,
      v_now
    );
  else
    perform 1
      from public.intake_artifacts
     where artifact_id = v_output_artifact_id
       and artifact_status = 'preserved'
       and artifact_type = 'intake_layer_output'
       and metadata ->> 'output_hash' = p_output_hash;
    if not found then
      raise exception using errcode = '23514', message = 'existing layer output artifact does not match deterministic output contract';
    end if;
  end if;

  v_output_refs := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'artifact_id', v_output_artifact_id,
      'artifact_key', v_output_artifact_key,
      'output_hash', p_output_hash
    )
  );

  v_input_refs_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(public.luminari_canonical_json_v2(coalesce(p_input_refs, '[]'::jsonb)), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_output_refs_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(public.luminari_canonical_json_v2(v_output_refs), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_unresolved_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(public.luminari_canonical_json_v2(coalesce(p_unresolved_dependencies, '[]'::jsonb)), 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  v_receipt_without_hash := pg_catalog.jsonb_build_object(
    'receipt_version', '2.0.0',
    'receipt_type', 'layer_execution',
    'execution_contract_version', 'luminari.intake.layer-execution.v1',
    'intake_session_id', p_intake_session_id,
    'layer_run_id', v_layer_run_id,
    'layer_name', p_layer_name,
    'layer_version', p_layer_version,
    'rule_version', p_rule_version,
    'parser_version', p_parser_version,
    'rule_manifest_hash', p_rule_manifest_hash,
    'canonicalization_version', 'luminari.intake.canonical-json.v2',
    'hash_algorithm', 'sha256',
    'input_hash', p_input_hash,
    'output_hash', p_output_hash,
    'previous_receipt_hash', v_tip_hash,
    'previous_canonicalization_version', v_tip_version,
    'input_refs_hash', v_input_refs_hash,
    'output_refs_hash', v_output_refs_hash,
    'unresolved_dependencies_hash', v_unresolved_hash,
    'output_artifact_id', v_output_artifact_id,
    'output_artifact_key', v_output_artifact_key
  );

  v_receipt_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(public.luminari_canonical_json_v2(v_receipt_without_hash), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_receipt := v_receipt_without_hash || pg_catalog.jsonb_build_object('receipt_hash', v_receipt_hash);

  insert into public.intake_layer_runs (
    layer_run_id,
    intake_session_id,
    layer_name,
    layer_version,
    rule_version,
    normalization_version,
    run_status,
    input_hash,
    output_hash,
    input_refs,
    output_refs,
    unresolved_dependencies,
    receipt,
    started_at,
    completed_at,
    is_sealed,
    sealed_at,
    supersedes_id,
    receipt_hash,
    previous_receipt_hash,
    hash_algorithm,
    canonicalization_version
  ) values (
    v_layer_run_id,
    p_intake_session_id,
    p_layer_name,
    p_layer_version,
    p_rule_version,
    p_parser_version,
    'completed',
    p_input_hash,
    p_output_hash,
    coalesce(p_input_refs, '[]'::jsonb),
    v_output_refs,
    coalesce(p_unresolved_dependencies, '[]'::jsonb),
    v_receipt,
    v_now,
    v_now,
    true,
    v_now,
    v_supersedes_id,
    v_receipt_hash,
    v_tip_hash,
    'sha256',
    'luminari.intake.canonical-json.v2'
  );

  return query select v_layer_run_id, v_receipt_hash, v_output_artifact_id, false;
end
$function$;

revoke all on function public.register_intake_layer_execution_v2(
  uuid, text, text, text, text, text, text, text, jsonb, jsonb, jsonb
) from public;

do $acl$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.register_intake_layer_execution_v2(
      uuid, text, text, text, text, text, text, text, jsonb, jsonb, jsonb
    ) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.register_intake_layer_execution_v2(
      uuid, text, text, text, text, text, text, text, jsonb, jsonb, jsonb
    ) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.register_intake_layer_execution_v2(
      uuid, text, text, text, text, text, text, text, jsonb, jsonb, jsonb
    ) to service_role;
  end if;
end
$acl$;

create or replace function public.luminari_reject_preserved_intake_artifact_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if old.artifact_status = 'preserved'
     and old.artifact_type in (
       'guided_intake_revision',
       'power_dynamics_registry',
       'source_document',
       'intake_layer_output'
     ) then
    raise exception using
      errcode = '55000',
      message = format(
        'preserved intake artifact %s (%s) is immutable (%s rejected)',
        old.artifact_id,
        old.artifact_type,
        tg_op
      );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

commit;
