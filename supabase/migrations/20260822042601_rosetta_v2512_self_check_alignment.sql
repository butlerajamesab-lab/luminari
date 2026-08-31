begin

-- Candidate-only correction discovered by bounded live acceptance. The initial
-- 2.5.12 candidate correctly versioned extraction helpers but its inherited
-- structural self-check still computed expected workflow clauses through the
-- v25 parser. No 2.5.12 run was persisted before this correction.

do $core$
declare
  v_definition text;
  v_patched text;
begin
  select pg_get_functiondef(
    'public.rosetta_v25_validate_extraction(integer,text)'::regprocedure
  ) into v_definition;
  v_patched := replace(
    v_definition,
    'public.rosetta_v25_validate_extraction',
    'public.rosetta_v2512_validate_extraction_core'
  );
  v_patched := replace(
    v_patched,
    'public.rosetta_v25_normative_clauses',
    'public.rosetta_v2512_normative_clauses'
  );
  v_patched := replace(
    v_patched,
    'rosetta-structural-self-check-v25',
    'rosetta-structural-self-check-v2512-core'
  );
  if v_patched = v_definition then
    raise exception 'rosetta_v2512_self_check_core_patch_anchor_missing';
  end if;
  execute v_patched;
end;
$core$

do $wrapper$
declare
  v_definition text;
  v_patched text;
begin
  select pg_get_functiondef(
    'public.rosetta_v2512_validate_extraction(integer,text)'::regprocedure
  ) into v_definition;
  if strpos(v_definition, 'public.rosetta_v25_validate_extraction') = 0 then
    raise exception 'rosetta_v2512_self_check_wrapper_patch_anchor_missing';
  end if;
  v_patched := replace(
    v_definition,
    'public.rosetta_v25_validate_extraction',
    'public.rosetta_v2512_validate_extraction_core'
  );
  if v_patched = v_definition
     or strpos(v_patched, 'public.rosetta_v25_validate_extraction') > 0 then
    raise exception 'rosetta_v2512_self_check_wrapper_patch_incomplete';
  end if;
  execute v_patched;
end;
$wrapper$

do $base$
declare
  v_definition text;
  v_patched text;
begin
  select pg_get_functiondef(
    'public.run_rosetta_v3_extraction_v2512_base(integer,text,text,text,text,text,text,text,date,text,jsonb)'::regprocedure
  ) into v_definition;
  if strpos(v_definition, 'public.rosetta_v25_validate_extraction') = 0 then
    raise exception 'rosetta_v2512_base_self_check_patch_anchor_missing';
  end if;
  v_patched := replace(
    v_definition,
    'public.rosetta_v25_validate_extraction',
    'public.rosetta_v2512_validate_extraction'
  );
  if v_patched = v_definition
     or strpos(v_patched, 'public.rosetta_v25_validate_extraction') > 0 then
    raise exception 'rosetta_v2512_base_self_check_patch_incomplete';
  end if;
  execute v_patched;
end;
$base$

do $manifest$
declare
  v_manifest jsonb;
  v_hash text;
begin
  select manifest_json into v_manifest
  from public.extraction_rule_manifest
  where engine_version='rosetta-v3-deterministic-sql-2.5.12'
    and rule_set_version='rosetta-five-layer-structural-correctness-2.5.12';
  if v_manifest is null then
    raise exception 'rosetta_v2512_candidate_manifest_missing';
  end if;
  if exists (
    select 1 from public.extraction_run
    where engine_version='rosetta-v3-deterministic-sql-2.5.12'
  ) then
    raise exception 'rosetta_v2512_self_check_alignment_requires_zero_candidate_runs';
  end if;
  v_manifest := v_manifest || jsonb_build_object(
    'candidate_correction',
    coalesce(v_manifest->'candidate_correction','{}'::jsonb) || jsonb_build_object(
      'self_check_alignment_v1',
      'Expected workflow clauses are computed through the same v2512 subsection-aware section and layout projection used by candidate extraction. All strict v25 mismatch criteria remain unchanged.'
    )
  );
  v_hash := encode(digest(convert_to(v_manifest::text,'UTF8'),'sha256'),'hex');
  update public.extraction_rule_manifest
     set manifest_json=v_manifest,
         manifest_hash=v_hash,
         is_active=true
   where engine_version='rosetta-v3-deterministic-sql-2.5.12'
     and rule_set_version='rosetta-five-layer-structural-correctness-2.5.12';
end;
$manifest$

revoke all on function public.rosetta_v2512_validate_extraction_core(integer,text) from public,anon,authenticated

commit
