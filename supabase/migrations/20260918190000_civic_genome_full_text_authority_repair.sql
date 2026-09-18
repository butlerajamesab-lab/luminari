-- Restore the Civic Genome bill-level ownership invariant after live/current-source routing.
--
-- A bill-level Rosetta snapshot is a complete legislative state. Amendment artifacts
-- remain immutable version-scoped provenance and may never own the bill-level pointer.

create or replace function public.enforce_civic_genome_full_text_rosetta_authority_v1()
returns trigger
language plpgsql
set search_path=pg_catalog,public,pg_temp
as $$
declare
  v_source_document_id bigint;
begin
  if new.rosetta_extraction_run_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.rosetta_extraction_run_id is not distinct from old.rosetta_extraction_run_id
     and (new.structural_dna_json #>> '{rosetta_assembly,source_document_id}')
         is not distinct from (old.structural_dna_json #>> '{rosetta_assembly,source_document_id}')
  then
    return new;
  end if;

  begin
    v_source_document_id := nullif(
      new.structural_dna_json #>> '{rosetta_assembly,source_document_id}',
      ''
    )::bigint;
  exception when invalid_text_representation then
    raise exception 'civic_genome_bill_rosetta_authority_source_document_invalid';
  end;

  if v_source_document_id is null then
    raise exception 'civic_genome_bill_rosetta_authority_source_document_missing';
  end if;

  if not exists (
    select 1
      from public.civic_genome_bill_version version
     where version.genome_bill_id = new.genome_bill_id
       and version.rosetta_source_document_id = v_source_document_id
       and version.document_family = 'text'
  ) then
    raise exception 'civic_genome_bill_rosetta_authority_requires_full_text';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_civic_genome_full_text_rosetta_authority_v1()
  from public,anon,authenticated;
grant execute on function public.enforce_civic_genome_full_text_rosetta_authority_v1()
  to service_role;

drop trigger if exists enforce_civic_genome_full_text_rosetta_authority_v1
  on public.civic_genome_bill;
create trigger enforce_civic_genome_full_text_rosetta_authority_v1
before insert or update of rosetta_extraction_run_id, structural_dna_json
on public.civic_genome_bill
for each row execute function public.enforce_civic_genome_full_text_rosetta_authority_v1();

comment on function public.enforce_civic_genome_full_text_rosetta_authority_v1() is
  'Fail-closed bill-level Rosetta ownership guard. A non-null bill Rosetta pointer must identify a source document owned by a full-text Civic Genome version. Amendment delta assemblies remain version-scoped provenance.';

-- Amendment outputs remain immutable, version-scoped provenance. Their
-- non-authoritative status is derived from document_family='amendment' and
-- enforced by the bill-level trigger/selection contract; do not rewrite every
-- historical amendment receipt merely to restate that invariant.
--
-- The two pre-existing bill triggers below rebuild lifecycle and Docket spine
-- projections whenever structural_dna_json changes. This repair changes only
-- Rosetta authority metadata, so invoking those unrelated reconstructions for
-- every repaired bill would be both semantically unnecessary and operationally
-- expensive. ALTER TABLE holds the table write lock for this transaction, so no
-- concurrent bill mutation can bypass those triggers while they are disabled.
alter table public.civic_genome_bill
  disable trigger civic_genome_bill_lifecycle_event_time_v3;
alter table public.civic_genome_bill
  disable trigger civic_genome_legislative_version_spine_registration;

-- Rebind only bills whose current bill-level pointer is amendment-owned and for
-- which an already-complete, exact-bound full-text assembly exists.
with amendment_owned as (
  select bill.genome_bill_id
    from public.civic_genome_bill bill
   where exists (
     select 1
       from public.civic_genome_bill_version owner
      where owner.genome_bill_id = bill.genome_bill_id
        and owner.rosetta_extraction_run_id = bill.rosetta_extraction_run_id
        and owner.document_family = 'amendment'
   )
), ranked_text as (
  select version.genome_bill_id,
         version.bill_version_id,
         version.rosetta_source_document_id,
         version.rosetta_extraction_run_id,
         version.receipt_json,
         assembly.assembly_run_id,
         assembly.engine_version as assembly_engine_version,
         assembly.rule_version as assembly_rule_version,
         assembly.input_hash,
         assembly.output_hash,
         assembly.verification_state,
         assembly.coverage_json,
         assembly.trait_count,
         binding.source_identity_hash,
         binding.source_content_hash,
         binding.source_url,
         binding.source_version,
         binding.rosetta_engine_version,
         binding.rosetta_rule_set_version,
         binding.rosetta_rule_manifest_hash,
         binding.rosetta_configuration_hash,
         binding.rosetta_output_content_hash,
         row_number() over (
           partition by version.genome_bill_id
           order by version.stage_rank desc,
                    version.provider_sequence desc,
                    version.updated_at desc,
                    version.bill_version_id desc
         ) as rn
    from public.civic_genome_bill_version version
    join amendment_owned owner using (genome_bill_id)
    join public.civic_genome_assembly_run assembly
      on assembly.assembly_run_id = version.assembly_run_id
    join public.civic_genome_rosetta_source_binding binding
      on binding.source_document_id = version.rosetta_source_document_id
   where version.document_family = 'text'
     and version.rosetta_extraction_run_id is not null
     and assembly.run_status = 'completed'
     and assembly.verification_state = 'complete'
), authoritative_text as (
  select ranked.*,
         coalesce((
           select count(*)::integer
             from public.civic_genome_rosetta_structural_representation representation
            where representation.assembly_run_id = ranked.assembly_run_id
         ),0) as structural_representation_count
    from ranked_text ranked
   where ranked.rn = 1
)
update public.civic_genome_bill bill
   set rosetta_extraction_run_id = authoritative.rosetta_extraction_run_id,
       structural_dna_hash = authoritative.output_hash,
       structural_dna_json =
         (coalesce(bill.structural_dna_json, '{}'::jsonb)
           - 'rosetta_source_receipt'
           - 'rosetta_assembly'
           - 'rosetta_authority_state'
           - 'rosetta_authority_reason')
         || jsonb_build_object(
           'rosetta_authority_state', 'authoritative_full_text',
           'rosetta_source_receipt',
             jsonb_strip_nulls(jsonb_build_object(
               'handoff_contract_version',
                 case when authoritative.assembly_engine_version = 'rosetta-genome-assembly-v2'
                      then 'rosetta-civic-genome-handoff-v2' end,
               'engine_version', authoritative.rosetta_engine_version,
               'rule_set_version', authoritative.rosetta_rule_set_version,
               'rule_manifest_hash', authoritative.rosetta_rule_manifest_hash,
               'configuration_hash', authoritative.rosetta_configuration_hash,
               'source_identity_hash', authoritative.source_identity_hash,
               'source_content_hash', authoritative.source_content_hash,
               'source_byte_hash', authoritative.receipt_json->>'source_byte_hash',
               'source_provider_hash', authoritative.receipt_json->>'provider_hash',
               'output_content_hash', authoritative.rosetta_output_content_hash,
               'source_url', authoritative.source_url,
               'source_version', authoritative.source_version
             )),
           'rosetta_assembly',
             jsonb_strip_nulls(jsonb_build_object(
               'engine_version', authoritative.assembly_engine_version,
               'rule_version', authoritative.assembly_rule_version,
               'source_document_id', authoritative.rosetta_source_document_id,
               'extraction_run_id', authoritative.rosetta_extraction_run_id,
               'input_hash', authoritative.input_hash,
               'output_hash', authoritative.output_hash,
               'verification_state', authoritative.verification_state,
               'coverage', authoritative.coverage_json,
               'trait_count', authoritative.trait_count,
               'structural_representation_count', authoritative.structural_representation_count,
               'handoff_contract_version',
                 case when authoritative.assembly_engine_version = 'rosetta-genome-assembly-v2'
                      then 'rosetta-civic-genome-handoff-v2' end,
               'rosetta_engine_version', authoritative.rosetta_engine_version,
               'rosetta_rule_set_version', authoritative.rosetta_rule_set_version,
               'rosetta_rule_manifest_hash', authoritative.rosetta_rule_manifest_hash,
               'rosetta_configuration_hash', authoritative.rosetta_configuration_hash,
               'rosetta_source_content_hash', authoritative.source_content_hash,
               'rosetta_output_content_hash', authoritative.rosetta_output_content_hash
             ))
         ),
       updated_at = now()
  from authoritative_text authoritative
 where bill.genome_bill_id = authoritative.genome_bill_id;

-- Any amendment-owned bill without a complete exact-bound full-text assembly is
-- explicitly unavailable at bill level. Preserve the amendment/version history,
-- restore the bill projection hash to its Docket observation receipt, and remove
-- only the misleading bill-level Rosetta projection.
with still_amendment_owned as (
  select bill.genome_bill_id
    from public.civic_genome_bill bill
   where exists (
     select 1
       from public.civic_genome_bill_version owner
      where owner.genome_bill_id = bill.genome_bill_id
        and owner.rosetta_extraction_run_id = bill.rosetta_extraction_run_id
        and owner.document_family = 'amendment'
   )
)
update public.civic_genome_bill bill
   set rosetta_extraction_run_id = null,
       structural_dna_hash = bill.structural_dna_json->>'docket_observation_hash',
       structural_dna_json =
         (coalesce(bill.structural_dna_json, '{}'::jsonb)
           - 'rosetta_source_receipt'
           - 'rosetta_assembly')
         || jsonb_build_object(
           'rosetta_authority_state', 'unavailable',
           'rosetta_authority_reason', 'no_complete_full_text_assembly'
         ),
       updated_at = now()
  from still_amendment_owned unresolved
 where bill.genome_bill_id = unresolved.genome_bill_id
   and coalesce(bill.structural_dna_json->>'docket_observation_hash','') ~ '^[0-9a-f]{64}$';

alter table public.civic_genome_bill
  enable trigger civic_genome_bill_lifecycle_event_time_v3;
alter table public.civic_genome_bill
  enable trigger civic_genome_legislative_version_spine_registration;

-- Radar structural drift must compare complete bill-text states. Amendment rows
-- remain available as attachment/provenance evidence but cannot become "latest law".
create or replace view public.docket_bill_drift_delta
with (security_invoker=true) as
with version_traits as (
  select distinct bv.genome_bill_id, bv.bill_version_id, t.trait_class, t.trait_id
    from public.civic_genome_bill_version bv
    join public.civic_genome_prism_verification_binding b
      on b.assembly_run_id = bv.assembly_run_id
    join public.civic_genome_trait t on t.trait_id = b.trait_id
), class_counts as (
  select genome_bill_id, bill_version_id, trait_class, count(*) as n
    from version_traits
   group by genome_bill_id, bill_version_id, trait_class
), latest as (
  select distinct on (genome_bill_id) genome_bill_id, bill_version_id
    from public.civic_genome_bill_version
   where document_family = 'text'
   order by genome_bill_id, stage_rank desc nulls last, provider_sequence desc nulls last
), base as (
  select distinct on (genome_bill_id) genome_bill_id, base_bill_version_id
    from public.civic_genome_bill_version
   where base_bill_version_id is not null
   order by genome_bill_id, created_at
), extraction_coverage as (
  select bill_version_id, true as has_trait_coverage
    from public.civic_genome_bill_version
   where processing_state in ('verified','verified_with_findings')
     and assembly_run_id is not null
     and prism_verification_run_id is not null
), covered_classes as (
  select l.genome_bill_id,
         l.bill_version_id as latest_bill_version_id,
         b.base_bill_version_id,
         cc.trait_class
    from latest l
    left join base b on b.genome_bill_id = l.genome_bill_id
    join class_counts cc
      on cc.bill_version_id = l.bill_version_id
      or cc.bill_version_id = b.base_bill_version_id
   group by l.genome_bill_id, l.bill_version_id, b.base_bill_version_id, cc.trait_class
)
select c.genome_bill_id,
       c.trait_class,
       coalesce(cb.n,0::bigint) as base_count,
       coalesce(cl.n,0::bigint) as latest_count,
       coalesce(cl.n,0::bigint) - coalesce(cb.n,0::bigint) as delta,
       coalesce(bc.has_trait_coverage,false) as base_has_trait_coverage,
       coalesce(lc.has_trait_coverage,false) as latest_has_trait_coverage
  from covered_classes c
  left join class_counts cb
    on cb.bill_version_id = c.base_bill_version_id
   and cb.trait_class = c.trait_class
  left join class_counts cl
    on cl.bill_version_id = c.latest_bill_version_id
   and cl.trait_class = c.trait_class
  left join extraction_coverage bc on bc.bill_version_id = c.base_bill_version_id
  left join extraction_coverage lc on lc.bill_version_id = c.latest_bill_version_id;

comment on view public.docket_bill_drift_delta is
  'Per-bill trait-class structural delta over base/current-full-text class union. Amendments remain provenance and never become the latest complete law state. Both coverage flags must be true before consumers claim drift.';

do $verify$
declare
  v_amendment_owned integer;
  v_missing_authority_hash integer;
  v_disabled_bill_triggers integer;
begin
  select count(*)::integer
    into v_amendment_owned
    from public.civic_genome_bill bill
   where bill.rosetta_extraction_run_id is not null
     and exists (
       select 1
         from public.civic_genome_bill_version version
        where version.genome_bill_id = bill.genome_bill_id
          and version.rosetta_extraction_run_id = bill.rosetta_extraction_run_id
          and version.document_family = 'amendment'
     );

  if v_amendment_owned <> 0 then
    raise exception 'civic_genome_amendment_bill_authority_remains:%', v_amendment_owned;
  end if;

  select count(*)::integer
    into v_missing_authority_hash
    from public.civic_genome_bill bill
   where bill.rosetta_extraction_run_id is null
     and coalesce(bill.structural_dna_hash,'') !~ '^[0-9a-f]{64}$';

  if v_missing_authority_hash <> 0 then
    raise exception 'civic_genome_unavailable_bill_hash_invalid:%', v_missing_authority_hash;
  end if;

  select count(*)::integer
    into v_disabled_bill_triggers
    from pg_catalog.pg_trigger trigger_row
    join pg_catalog.pg_class relation on relation.oid=trigger_row.tgrelid
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
   where namespace.nspname='public'
     and relation.relname='civic_genome_bill'
     and trigger_row.tgname in (
       'civic_genome_bill_lifecycle_event_time_v3',
       'civic_genome_legislative_version_spine_registration'
     )
     and trigger_row.tgenabled <> 'O';

  if v_disabled_bill_triggers <> 0 then
    raise exception 'civic_genome_bill_projection_trigger_not_restored:%', v_disabled_bill_triggers;
  end if;
end;
$verify$;
