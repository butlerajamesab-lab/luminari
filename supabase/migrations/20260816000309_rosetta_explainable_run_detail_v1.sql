create or replace function rosetta_private.rosetta_run_detail_v1(
  p_capability_token text,
  p_run_id integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_run jsonb;
  v_law_view jsonb;
  v_validations jsonb := '[]'::jsonb;
  v_manifest jsonb;
  v_rule_manifest jsonb;
  v_document jsonb;
  v_source_receipt jsonb;
  v_source_document_id integer;
  v_source_content_id uuid;
  v_rule_manifest_hash text;
begin
  perform public.rosetta_assert_backend_capability_v1(p_capability_token, 'standalone_backend');

  if p_run_id is null or p_run_id <= 0 then
    raise exception using errcode = '22023', message = 'invalid_run_id';
  end if;

  select to_jsonb(run), run.source_document_id, run.source_content_id, run.rule_manifest_hash
    into v_run, v_source_document_id, v_source_content_id, v_rule_manifest_hash
  from public.extraction_run run
  where run.id = p_run_id;

  if v_run is null then
    return jsonb_build_object(
      'law_view', null,
      'run', null,
      'validation_results', '[]'::jsonb,
      'extraction_manifest', null,
      'source_document', null,
      'source_receipt', null
    );
  end if;

  select to_jsonb(law)
    into v_law_view
  from public.v_rosetta_operator_law_view_v1 law
  where law.extraction_run_id = p_run_id;

  select coalesce(jsonb_agg(to_jsonb(validation) order by validation.test_name), '[]'::jsonb)
    into v_validations
  from public.validation_result validation
  where validation.extraction_run_id = p_run_id;

  select to_jsonb(manifest)
    into v_manifest
  from public.extraction_manifest manifest
  where manifest.extraction_run_id = p_run_id;

  if v_rule_manifest_hash is not null then
    select to_jsonb(rule_manifest)
      into v_rule_manifest
    from public.extraction_rule_manifest rule_manifest
    where rule_manifest.manifest_hash = v_rule_manifest_hash
    limit 1;
  end if;

  if v_manifest is not null then
    v_manifest := v_manifest || jsonb_build_object('rule_manifest', v_rule_manifest);
  elsif v_rule_manifest is not null then
    v_manifest := jsonb_build_object('rule_manifest', v_rule_manifest);
  end if;

  select to_jsonb(document)
    into v_document
  from public.source_document document
  where document.id = v_source_document_id;

  if v_source_content_id is not null then
    select to_jsonb(receipt)
      into v_source_receipt
    from public.source_document_content receipt
    where receipt.source_content_id = v_source_content_id;
  end if;

  return jsonb_build_object(
    'law_view', v_law_view,
    'run', v_run,
    'validation_results', v_validations,
    'extraction_manifest', v_manifest,
    'source_document', v_document,
    'source_receipt', v_source_receipt
  );
end;
$$

comment on function rosetta_private.rosetta_run_detail_v1(text, integer) is
  'Capability-gated one-run operator read. Returns source text, validation receipts, extraction manifest, and the exact rule-manifest payload associated with the recorded rule_manifest_hash for evidence-first inspection.'
