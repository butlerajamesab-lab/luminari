begin

-- Rosetta 2.5.11 is an append-only candidate generation. It does not mutate
-- the 2.5.10 current-generation registry or reinterpret prior receipts.

create or replace function public.rosetta_v2511_amendment_format(p_source_text text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, public
as $function$
  select case
    when exists (
      select 1
      from public.rosetta_v2510_amendment_operations(p_source_text)
    ) then 'operation_sheet'
    when p_source_text ~* 'the[[:space:]]+bill[[:space:]]+as[[:space:]]+proposed[[:space:]]+to[[:space:]]+be[[:space:]]+amended[[:space:]]+is[[:space:]]+reprinted[[:space:]]+as[[:space:]]+follows'
     and p_source_text ~* 'amendment[[:space:]]+instruction[[:space:]]+key'
      then 'marked_full_text_reprint'
    else 'unsupported'
  end;
$function$

do $clone$
declare
  v_definition text;
  v_signature text;
begin
  foreach v_signature in array array[
    'public.rosetta_v2510_amendment_disposition(text,jsonb)',
    'public.rosetta_v2510_clean_amendment_operation_text(text)',
    'public.rosetta_v2510_amendment_operations(text)',
    'public.rosetta_v2510_canonical_output(integer)',
    'public.rosetta_v2510_finalize_extraction(integer,text,jsonb,jsonb)',
    'public.rosetta_v2510_reclassify_amendment_structure(integer,text,jsonb)',
    'public.rosetta_v2510_reconcile_structural_correctness(integer)',
    'public.rosetta_v2510_final_coverage(integer)',
    'public.rosetta_v2510_refresh_final_coverage_receipts(integer)',
    'public.rosetta_v2510_validate_extraction(integer,text)',
    'public.rosetta_v2510_validate_independent_structure(integer,text)',
    'public.run_rosetta_v3_extraction_v2510_base(integer,text,text,text,text,text,text,text,date,text,jsonb)',
    'public.run_rosetta_v3_extraction_v2510_candidate_base(integer,text,text,text,text,text,text,text,date,text,jsonb)',
    'public.run_rosetta_v3_extraction_v2510_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb)'
  ] loop
    select pg_get_functiondef(v_signature::regprocedure) into v_definition;
    if v_definition is null then
      raise exception 'rosetta_v2511_clone_source_missing:%', v_signature;
    end if;
    v_definition := replace(v_definition, 'v2510', 'v2511');
    v_definition := replace(v_definition, '2.5.10', '2.5.11');
    execute v_definition;
  end loop;
end;
$clone$

do $patch_finalize$
declare
  v_definition text;
  v_old text := $old$
    if v_operation_count = 0 then
      raise exception using
        errcode = '22000',
        message = 'rosetta_v22_amendment_operation_not_found';
    end if;$old$;
  v_new text := $new$
    if v_operation_count = 0
       and public.rosetta_v2511_amendment_format(p_source_text) <> 'marked_full_text_reprint' then
      raise exception using
        errcode = '22000',
        message = 'rosetta_v2511_amendment_structure_not_recognized';
    end if;$new$;
  v_patched text;
begin
  select pg_get_functiondef(
    'public.rosetta_v2511_finalize_extraction(integer,text,jsonb,jsonb)'::regprocedure
  ) into v_definition;
  v_patched := replace(v_definition, v_old, v_new);
  if v_patched = v_definition then
    raise exception 'rosetta_v2511_finalize_patch_anchor_missing';
  end if;
  v_patched := replace(
    v_patched,
    $$'document_family', nullif(v_document_family, ''),$$,
    $$'document_family', nullif(v_document_family, ''),
    'amendment_format', case when v_document_family = 'amendment' then public.rosetta_v2511_amendment_format(p_source_text) else null end,$$
  );
  execute v_patched;
end;
$patch_finalize$

do $patch_reclassification$
declare
  v_definition text;
  v_old text := $$  if v_operation_count=0 then raise exception 'rosetta_v2511_amendment_operation_not_found'; end if;$$;
  v_new text := $$  if v_operation_count=0
     and public.rosetta_v2511_amendment_format(p_source_text) <> 'marked_full_text_reprint' then
    raise exception 'rosetta_v2511_amendment_structure_not_recognized';
  end if;$$;
  v_patched text;
begin
  select pg_get_functiondef(
    'public.rosetta_v2511_reclassify_amendment_structure(integer,text,jsonb)'::regprocedure
  ) into v_definition;
  v_patched := replace(v_definition, v_old, v_new);
  if v_patched = v_definition then
    raise exception 'rosetta_v2511_reclassification_patch_anchor_missing';
  end if;
  v_patched := replace(
    v_patched,
    $$'representation_count',v_operation_count,'operative_layer_projection','not_applied',$$,
    $$'representation_count',v_operation_count,'amendment_format',public.rosetta_v2511_amendment_format(p_source_text),'operative_layer_projection','not_applied',$$
  );
  execute v_patched;
end;
$patch_reclassification$

do $patch_independent$
declare
  v_definition text;
  v_patched text;
begin
  select pg_get_functiondef(
    'public.rosetta_v2511_validate_independent_structure(integer,text)'::regprocedure
  ) into v_definition;
  v_patched := replace(
    v_definition,
    $$'document_family','amendment',$$,
    $$'document_family','amendment','amendment_format',public.rosetta_v2511_amendment_format(p_source_text),$$
  );
  if v_patched = v_definition then
    raise exception 'rosetta_v2511_independent_patch_anchor_missing';
  end if;
  execute v_patched;
end;
$patch_independent$

do $manifest$
declare
  v_prior jsonb;
  v_manifest jsonb;
  v_hash text;
begin
  select manifest_json into v_prior
  from public.extraction_rule_manifest
  where engine_version = 'rosetta-v3-deterministic-sql-2.5.10'
    and rule_set_version = 'rosetta-five-layer-structural-correctness-2.5.10';
  if v_prior is null then
    raise exception 'rosetta_v2511_prior_manifest_missing';
  end if;

  v_manifest := v_prior
    || jsonb_build_object(
      'engine_version','rosetta-v3-deterministic-sql-2.5.11',
      'rule_set_version','rosetta-five-layer-structural-correctness-2.5.11',
      'inherits',jsonb_build_object(
        'engine_version','rosetta-v3-deterministic-sql-2.5.10',
        'rule_set_version','rosetta-five-layer-structural-correctness-2.5.10',
        'status','published_current_generation'
      ),
      'provenance','Rosetta 2.5.11 is an immutable candidate generation. It preserves 2.5.10 receipts and adds deterministic recognition of source-marked full-text amendment reprints whose legal text is presented with an amendment instruction key rather than a line-operation sheet.'
    )
    || jsonb_build_object(
      'change',coalesce(v_prior->'change','{}'::jsonb)||jsonb_build_object(
        'marked_full_text_amendment_reprints','A document_family=amendment source with both an explicit reprinted-as-amended marker and an amendment instruction key may have zero parsed line operations. Rosetta prunes all operative five-layer projection, records five-layer not_applicable coverage, preserves amendment structure, and continues to reject unrecognized zero-operation amendment formats.'
      )
    );

  v_hash := encode(digest(convert_to(v_manifest::text,'UTF8'),'sha256'),'hex');
  insert into public.extraction_rule_manifest(
    engine_version,rule_set_version,manifest_hash,manifest_json,is_active
  ) values (
    'rosetta-v3-deterministic-sql-2.5.11',
    'rosetta-five-layer-structural-correctness-2.5.11',
    v_hash,v_manifest,true
  )
  on conflict(engine_version,rule_set_version) do update
    set manifest_hash=excluded.manifest_hash,
        manifest_json=excluded.manifest_json,
        is_active=true;
end;
$manifest$

revoke all on function public.rosetta_v2511_amendment_format(text) from public,anon,authenticated

revoke all on function public.rosetta_v2511_amendment_disposition(text,jsonb) from public,anon,authenticated

revoke all on function public.rosetta_v2511_validate_extraction(integer,text) from public,anon,authenticated

revoke all on function public.rosetta_v2511_validate_independent_structure(integer,text) from public,anon,authenticated

revoke all on function public.rosetta_v2511_clean_amendment_operation_text(text) from public,anon,authenticated

revoke all on function public.rosetta_v2511_amendment_operations(text) from public,anon,authenticated

revoke all on function public.rosetta_v2511_canonical_output(integer) from public,anon,authenticated

revoke all on function public.rosetta_v2511_finalize_extraction(integer,text,jsonb,jsonb) from public,anon,authenticated

revoke all on function public.rosetta_v2511_reclassify_amendment_structure(integer,text,jsonb) from public,anon,authenticated

revoke all on function public.rosetta_v2511_reconcile_structural_correctness(integer) from public,anon,authenticated

revoke all on function public.rosetta_v2511_final_coverage(integer) from public,anon,authenticated

revoke all on function public.rosetta_v2511_refresh_final_coverage_receipts(integer) from public,anon,authenticated

revoke all on function public.run_rosetta_v3_extraction_v2511_base(integer,text,text,text,text,text,text,text,date,text,jsonb) from public,anon,authenticated,service_role

revoke all on function public.run_rosetta_v3_extraction_v2511_candidate_base(integer,text,text,text,text,text,text,text,date,text,jsonb) from public,anon,authenticated,service_role

revoke all on function public.run_rosetta_v3_extraction_v2511_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) from public,anon,authenticated

grant execute on function public.run_rosetta_v3_extraction_v2511_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) to service_role

comment on function public.run_rosetta_v3_extraction_v2511_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) is
  'Staged Rosetta 2.5.11 candidate. Preserves 2.5.10 current-generation truth and admits only deterministically recognized marked full-text amendment reprints as zero-operation, non-operative structural sources. Unrecognized zero-operation amendment formats remain rejected.'

commit
