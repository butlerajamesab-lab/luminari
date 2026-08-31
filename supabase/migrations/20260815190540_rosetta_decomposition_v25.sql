begin

create or replace function public.rosetta_v25_projected_contains(p_source_text text,p_needle text)
returns boolean language sql immutable strict set search_path=pg_catalog,public as $$
 select strpos(lower(public.rosetta_v2_normalize_text(public.rosetta_v25_unprotect_text(public.rosetta_v25_layout_projection(p_source_text)))),lower(public.rosetta_v2_normalize_text(p_needle)))>0;
$$

create or replace function public.rosetta_v25_exact_definition_text(p_source_text text,p_definition_text text)
returns text language plpgsql immutable strict set search_path=pg_catalog,public as $$
declare v_source text:=public.rosetta_v2_normalize_text(public.rosetta_v25_unprotect_text(public.rosetta_v25_layout_projection(p_source_text))); v_definition text:=public.rosetta_v2_normalize_text(p_definition_text); v_position integer;
begin v_position:=strpos(lower(v_source),lower(v_definition)); if v_position>0 then return substr(v_source,v_position,char_length(v_definition)); end if; return v_definition; end;$$

do $migration$
declare v_definition text; v_old text; v_new text;
begin
  select pg_get_functiondef('public.rosetta_v2_validate_extraction(integer,text)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'FUNCTION public.rosetta_v2_validate_extraction(','FUNCTION public.rosetta_v25_validate_extraction(');
  v_definition:=replace(v_definition,'public.rosetta_v2_normative_clauses','public.rosetta_v25_normative_clauses');
  v_definition:=replace(v_definition,'rosetta-structural-correctness-v2','rosetta-structural-self-check-v25');
  execute v_definition;

  select pg_get_functiondef('public.rosetta_v24_canonical_output(integer)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'FUNCTION public.rosetta_v24_canonical_output(','FUNCTION public.rosetta_v25_canonical_output(');
  v_definition:=replace(v_definition,'rosetta-canonical-law-view-v24','rosetta-canonical-law-view-v25');
  execute v_definition;

  select pg_get_functiondef('public.run_rosetta_v3_extraction_v24_base(integer,text,text,text,text,text,text,text,date,text,jsonb)'::regprocedure) into v_definition;
  if v_definition not like '%rosetta-v3-deterministic-sql-2.4.0%' then raise exception 'rosetta_v25_expected_v24_base_missing'; end if;
  v_definition:=replace(v_definition,'FUNCTION public.run_rosetta_v3_extraction_v24_base(','FUNCTION public.run_rosetta_v3_extraction_v25_base(');
  v_definition:=replace(v_definition,'rosetta-v3-deterministic-sql-2.4.0','rosetta-v3-deterministic-sql-2.5.0');
  v_definition:=replace(v_definition,'rosetta-five-layer-structural-correctness-2.4.0','rosetta-five-layer-structural-correctness-2.5.0');
  v_definition:=replace(v_definition,'-v24-','-v25-');
  v_definition:=replace(v_definition,$old$'normalization_version', 'rosetta-normalize-whitespace-v2',$old$,$new$'normalization_version', 'rosetta-normalize-whitespace-v2',
    'parsing_projection_version', 'rosetta-layout-projection-v25',$new$);
  v_definition:=replace(v_definition,'public.rosetta_v2_section_spans(p_source_text)','public.rosetta_v25_section_spans(p_source_text)');
  v_definition:=replace(v_definition,'v_section_flat := public.rosetta_v2_normalize_text(v_section.section_text);','v_section_flat := public.rosetta_v2_normalize_text(public.rosetta_v25_layout_projection(v_section.section_text));');
  v_definition:=replace(v_definition,'from public.rosetta_v2_normative_clauses(v_section.section_text)','from public.rosetta_v25_normative_clauses(v_section.section_text)');
  v_definition:=replace(v_definition,'public.rosetta_v2_validate_extraction(v_run_id, p_source_text)','public.rosetta_v25_validate_extraction(v_run_id, p_source_text)');
  v_definition:=replace(v_definition,'lower(v_actor),','v_actor,');
  v_definition:=replace(v_definition,$old$btrim(v_match[2] || ' ' || v_match[3]),$old$,$new$public.rosetta_v25_unprotect_text(btrim(v_match[2] || ' ' || v_match[3])),$new$);
  v_definition:=replace(v_definition,'v_clause := public.rosetta_v2_normalize_text(v_match[1]);','v_clause := public.rosetta_v25_unprotect_text(public.rosetta_v2_normalize_text(v_match[1]));');
  v_definition:=replace(v_definition,$old$select regexp_matches(v_section_flat, '([^.;]+[.;])', 'g')$old$,$new$select regexp_matches(v_section_flat, '([^.]+[.])', 'g')$new$);

  v_old:=$old$      if v_clause ~*
        '\m(unless|however|except|notwithstanding)\M|\mmay not\M|\mshall not\M|\mmust not\M|\msubject to\M'
      then$old$;
  v_new:=$new$      if v_clause ~*
        '\m(unless|however|except|notwithstanding)\M|\msubject to\M|\mdoes not apply\M|\mdo not apply\M|^\s*(?:\([a-z0-9]+\)\s*)?Nothing\s+in\s+.+\s+shall\s+prevent\M'
         and v_clause !~* '["“][^"”]{1,160}["”]\s+(includes(?:,\s*but is not limited to)?|means|does not include|has the same meaning as)\M'
      then$new$;
  if position(v_old in v_definition)=0 then raise exception 'rosetta_v25_override_gate_anchor_missing'; end if;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old:=$old$          case
            when v_clause ~* '\m(unless|except|however)\M'
              then 'source_stated_exception'
            when v_clause ~* '\m(may not|shall not|must not)\M'
              then 'source_stated_limitation'
            else 'source_stated_condition'
          end,$old$;
  v_new:=$new$          case
            when v_clause ~* '\m(unless|except|however|does not apply|do not apply)\M'
              then 'source_stated_exception'
            else 'source_stated_condition'
          end,$new$;
  if position(v_old in v_definition)=0 then raise exception 'rosetta_v25_override_type_anchor_missing'; end if;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old:=$old$      if v_clause ~* '(forfeitur|penalt|violat|offense|enforc|appeal|review)' then$old$;
  v_new:=$new$      if (
        v_clause ~* '\m(?:must|shall|may)\M\s+(?:not\s+)?(?:immediately\s+)?(?:report|notify|transmit|investigat|suspend|revoke|refuse|affirm|reverse|petition|take)\M'
        or v_clause ~* '\m(?:must|shall|may)\M\s+consider\s+(?:suspend|revok)'
        or v_clause ~* '\m(?:felony|sentenced|penalty|forfeiture|guilty)\M'
      )
      and v_clause !~* '^\s*(?:\([a-z0-9]+\)\s*)?Nothing\s+in\M'
      and lower(btrim(coalesce(v_actor, ''))) not in ('the report', 'a report')
      then$new$;
  if position(v_old in v_definition)=0 then raise exception 'rosetta_v25_accountability_gate_anchor_missing'; end if;
  v_definition:=replace(v_definition,v_old,v_new);
  if v_definition not like '%rosetta-layout-projection-v25%' or v_definition not like '%rosetta_v25_section_spans%' or v_definition not like '%rosetta_v25_normative_clauses%' then raise exception 'rosetta_v25_base_rewrite_incomplete'; end if;
  execute v_definition;

  select pg_get_functiondef('public.rosetta_v24_finalize_extraction(integer,text,jsonb,jsonb)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'FUNCTION public.rosetta_v24_finalize_extraction(','FUNCTION public.rosetta_v25_finalize_extraction(');
  v_definition:=replace(v_definition,'rosetta-v3-deterministic-sql-2.4.0','rosetta-v3-deterministic-sql-2.5.0');
  v_definition:=replace(v_definition,'rosetta-five-layer-structural-correctness-2.4.0','rosetta-five-layer-structural-correctness-2.5.0');
  v_definition:=replace(v_definition,'-v24-','-v25-');
  v_definition:=replace(v_definition,'public.rosetta_v24_exact_definition_text','public.rosetta_v25_exact_definition_text');
  v_definition:=replace(v_definition,'public.rosetta_v24_canonical_output','public.rosetta_v25_canonical_output');
  v_definition:=replace(v_definition,'rosetta-structural-correctness-v24','rosetta-structural-correctness-v25');
  v_definition:=replace(v_definition,'exact_source_structure_v24','exact_source_structure_v25');
  v_definition:=replace(v_definition,'rosetta_v24_canonical_output_unavailable','rosetta_v25_canonical_output_unavailable');
  v_old:=$old$and strpos(
      lower(public.rosetta_v2_normalize_text(p_source_text)),
      lower(public.rosetta_v2_normalize_text(definition.definition_text))
    ) = 0$old$;
  v_new:=$new$and not public.rosetta_v25_projected_contains(p_source_text, definition.definition_text)$new$;
  if position(v_old in v_definition)=0 then raise exception 'rosetta_v25_definition_validation_anchor_missing'; end if;
  v_definition:=replace(v_definition,v_old,v_new);
  execute v_definition;
end;
$migration$

with canonical_manifest as (
 select jsonb_build_object(
  'contract','S -> {HELP, WORKFLOW, ACCOUNTABILITY, OVERRIDES, DEFINITIONS}',
  'engine_version','rosetta-v3-deterministic-sql-2.5.0',
  'rule_set_version','rosetta-five-layer-structural-correctness-2.5.0',
  'inherits',jsonb_build_object('engine_version','rosetta-v3-deterministic-sql-2.4.0','rule_set_version','rosetta-five-layer-structural-correctness-2.4.0'),
  'source_projection',jsonb_build_object('version','rosetta-layout-projection-v25','rule','Immutable source text and hashes never change. Parsing uses a same-character-length projection that masks repeated layout furniture and protects internal legal-citation punctuation.','offset_policy','All canonical source offsets remain raw-source offsets.'),
  'section_binding',jsonb_build_object('recognizes',jsonb_build_array('Section N.','Sec. N.'),'page_furniture','masked before section-boundary detection','duplicate_page_section_fragments','prohibited by independent validation'),
  'workflow',jsonb_build_object('sentence_boundary','unprotected terminal period','internal_citations','protected during parsing and restored in normalized output','actor_length_cap','none','source_span','exact raw-source span receipt per workflow step'),
  'overrides',jsonb_build_object('negative_modal_alone','not an override','required_cues',jsonb_build_array('unless','except','however','notwithstanding','subject to','does not apply','nothing in ... shall prevent'),'definition_exception','not duplicated into override layer'),
  'validation',jsonb_build_object('self_check','generation-specific structural completeness checksum','independent_check','stored-object audit of raw hashes, exact spans, contamination, section fragmentation, override classification, accountability actors, and workflow coverage','fail_policy','rejected and unpublished on any independent structural failure'),
  'provenance','Rosetta 2.5 is a new immutable generation. Rosetta 2.4 receipts remain preserved and are never rewritten.'
 ) manifest_json
), receipt as (select manifest_json,encode(digest(convert_to(manifest_json::text,'UTF8'),'sha256'),'hex') manifest_hash from canonical_manifest)
insert into public.extraction_rule_manifest(engine_version,rule_set_version,manifest_hash,manifest_json,is_active)
select 'rosetta-v3-deterministic-sql-2.5.0','rosetta-five-layer-structural-correctness-2.5.0',manifest_hash,manifest_json,true from receipt
on conflict(engine_version,rule_set_version) do update set manifest_hash=excluded.manifest_hash,manifest_json=excluded.manifest_json,is_active=true

create or replace function public.run_rosetta_v3_extraction(
 p_source_document_id integer,p_source_text text,p_expected_source_content_hash text,p_source_url text,p_source_version text,p_media_type text default 'text/plain',p_source_byte_hash text default null,p_source_provider_hash text default null,p_reference_date date default null,p_text_extractor_version text default 'plain-text-1',p_source_metadata jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set statement_timeout='120s' set search_path=pg_catalog,public,extensions
as $$
declare v_receipt jsonb; v_run_id integer; v_reconciliation jsonb; v_span_receipt jsonb; v_span_repairs jsonb; v_validation jsonb; v_output jsonb; v_output_hash text; v_pass boolean; v_run_status text; v_admissibility text; v_failure_code text;
begin
 v_receipt:=public.run_rosetta_v3_extraction_v25_base(p_source_document_id,p_source_text,p_expected_source_content_hash,p_source_url,p_source_version,p_media_type,p_source_byte_hash,p_source_provider_hash,p_reference_date,p_text_extractor_version,p_source_metadata);
 if coalesce(v_receipt->>'run_status','')<>'completed' or coalesce(v_receipt->>'admissibility_state','')<>'admissible' then return v_receipt; end if;
 v_run_id:=nullif(v_receipt->>'extraction_run_id','')::integer; if v_run_id is null then return v_receipt; end if;
 v_receipt:=public.rosetta_v25_finalize_extraction(v_run_id,p_source_text,coalesce(p_source_metadata,'{}'::jsonb),v_receipt);
 v_reconciliation:=public.rosetta_v25_reconcile_structural_correctness(v_run_id);
 v_span_receipt:=public.rosetta_v25_refresh_object_source_spans(v_run_id,p_source_text);
 v_span_repairs:=public.rosetta_v25_register_span_repairs(v_run_id);
 v_validation:=public.rosetta_v25_validate_independent_structure(v_run_id,p_source_text);
 v_pass:=coalesce(v_validation->>'status','fail')='pass';
 insert into public.validation_result(id,extraction_run_id,test_name,test_result,failure_count,details)
 values('vr-v25-'||(select source_identity_hash from public.extraction_run where id=v_run_id)||'-'||(select configuration_hash from public.extraction_run where id=v_run_id)||'-independent-structure',v_run_id,'independent_structure_v25',case when v_pass then 'pass' else 'fail' end,case when v_pass then 0 else 1 end,v_validation)
 on conflict(extraction_run_id,test_name) do update set test_result=excluded.test_result,failure_count=excluded.failure_count,details=excluded.details,executed_at=now();
 v_run_status:=case when v_pass then 'completed' else 'failed' end; v_admissibility:=case when v_pass then 'admissible' else 'rejected' end; v_failure_code:=case when v_pass then null else 'rosetta_v25_independent_structural_validation_failed' end;
 update public.extraction_run set run_status=v_run_status,admissibility_state=v_admissibility,failure_code=v_failure_code,completed_at=coalesce(completed_at,clock_timestamp()) where id=v_run_id;
 update public.extraction_manifest set status=case when v_pass then 'clean' else 'failed' end,admissibility_state=v_admissibility,validation_results=coalesce(validation_results,'{}'::jsonb)||jsonb_build_object('structural_reconciliation_v25',v_reconciliation,'object_source_spans_v25',v_span_receipt,'span_repair_registration_v25',v_span_repairs,'independent_structure_v25',v_validation) where extraction_run_id=v_run_id;
 v_output:=public.rosetta_v25_canonical_output(v_run_id); if v_output is null then raise exception 'rosetta_v25_canonical_output_unavailable_after_validation'; end if;
 v_output_hash:=encode(digest(convert_to(v_output::text,'UTF8'),'sha256'),'hex');
 update public.extraction_run set output_content_hash=v_output_hash where id=v_run_id;
 update public.extraction_manifest set output_hash=v_output_hash where extraction_run_id=v_run_id;
 update public.validation_result set test_result='pass',failure_count=0,details=jsonb_build_object('output_content_hash',v_output_hash),executed_at=now() where extraction_run_id=v_run_id and test_name='output_hash_verified';
 return v_receipt||jsonb_build_object('engine_version','rosetta-v3-deterministic-sql-2.5.0','rule_set_version','rosetta-five-layer-structural-correctness-2.5.0','run_status',v_run_status,'admissibility_state',v_admissibility,'failure_code',v_failure_code,'output_content_hash',v_output_hash,'structural_reconciliation',v_reconciliation,'object_source_spans',v_span_receipt,'independent_structure_v25',v_validation);
end;$$

create or replace view public.v_civic_genome_law_view_v1 with (security_invoker=true) as
select law.extraction_run_id,law.source_document_id,law.corpus_id,law.document_name,law.document_type,law.document_identifier,law.run_version,law.run_status,law.confidence_threshold,law.created_at,law.completed_at,
case when law.admissibility_state<>'admissible' or public.rosetta_blocking_structural_repair_count(law.extraction_run_id)>0 then '[]'::jsonb else public.rosetta_v25_enrich_objects_with_spans(law.extraction_run_id,law.objects) end as objects,
law.coverage,
case when law.admissibility_state<>'admissible' then 'failed'::text when public.rosetta_blocking_structural_repair_count(law.extraction_run_id)>0 then 'partial'::text else law.provenance_state end as provenance_state,
law.engine_version,law.rule_set_version,law.rule_manifest_hash,law.configuration_hash,law.source_identity_hash,law.source_content_hash,law.output_content_hash,law.admissibility_state,law.source_url,law.source_version,law.media_type,law.source_byte_hash,law.source_provider_hash
from public.v_civic_genome_law_view_v1_internal law

grant select on public.v_civic_genome_law_view_v1 to anon,authenticated,service_role

revoke all on function public.rosetta_v25_projected_contains(text,text) from public,anon,authenticated

revoke all on function public.rosetta_v25_exact_definition_text(text,text) from public,anon,authenticated

revoke all on function public.rosetta_v25_validate_extraction(integer,text) from public,anon,authenticated

revoke all on function public.rosetta_v25_canonical_output(integer) from public,anon,authenticated

revoke all on function public.run_rosetta_v3_extraction_v25_base(integer,text,text,text,text,text,text,text,date,text,jsonb) from public,anon,authenticated

revoke all on function public.rosetta_v25_finalize_extraction(integer,text,jsonb,jsonb) from public,anon,authenticated

revoke all on function public.run_rosetta_v3_extraction(integer,text,text,text,text,text,text,text,date,text,jsonb) from public,anon,authenticated

grant execute on function public.run_rosetta_v3_extraction(integer,text,text,text,text,text,text,text,date,text,jsonb) to service_role

comment on function public.run_rosetta_v3_extraction(integer,text,text,text,text,text,text,text,date,text,jsonb) is 'Rosetta 2.5 canonical decomposition. Immutable raw source receipts feed an offset-preserving layout projection; stored objects must pass independent raw-hash, exact-span, contamination, classification, and structural validation before publication.'

commit
