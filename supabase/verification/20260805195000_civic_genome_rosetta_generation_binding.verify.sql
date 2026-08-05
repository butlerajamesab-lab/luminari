do $$
declare
  v_before integer;
  v_after integer;
  v_binding public.civic_genome_rosetta_source_binding%rowtype;
begin
  if to_regclass('public.civic_genome_rosetta_generation_binding') is null then
    raise exception 'Rosetta generation-binding table is missing';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.civic_genome_rosetta_source_binding'::regclass
      and tgname = 'civic_genome_rosetta_source_generation_guard'
      and not tgisinternal
  ) then
    raise exception 'Rosetta source-generation guard trigger is missing';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.civic_genome_rosetta_generation_binding'::regclass
      and tgname = 'civic_genome_rosetta_generation_immutable'
      and not tgisinternal
  ) then
    raise exception 'Rosetta generation immutability trigger is missing';
  end if;

  select *
    into v_binding
  from public.civic_genome_rosetta_source_binding
  where source_document_id = 28;

  if found then
    select count(*)::integer
      into v_before
    from public.civic_genome_rosetta_generation_binding
    where source_document_id = v_binding.source_document_id;

    insert into public.civic_genome_rosetta_source_binding (
      source_document_id,
      genome_bill_id,
      source_identity_hash,
      source_content_hash,
      source_url,
      source_version,
      rosetta_engine_version,
      rosetta_rule_set_version,
      rosetta_rule_manifest_hash,
      rosetta_configuration_hash,
      rosetta_output_content_hash
    ) values (
      v_binding.source_document_id,
      v_binding.genome_bill_id,
      v_binding.source_identity_hash,
      v_binding.source_content_hash,
      v_binding.source_url,
      v_binding.source_version,
      v_binding.rosetta_engine_version,
      v_binding.rosetta_rule_set_version,
      v_binding.rosetta_rule_manifest_hash,
      v_binding.rosetta_configuration_hash,
      v_binding.rosetta_output_content_hash
    )
    on conflict (source_document_id) do nothing;

    select count(*)::integer
      into v_after
    from public.civic_genome_rosetta_generation_binding
    where source_document_id = v_binding.source_document_id;

    if v_before <> v_after then
      raise exception 'Exact Rosetta generation replay duplicated history: % -> %', v_before, v_after;
    end if;

    begin
      insert into public.civic_genome_rosetta_source_binding (
        source_document_id,
        genome_bill_id,
        source_identity_hash,
        source_content_hash,
        source_url,
        source_version,
        rosetta_engine_version,
        rosetta_rule_set_version,
        rosetta_rule_manifest_hash,
        rosetta_configuration_hash,
        rosetta_output_content_hash
      ) values (
        v_binding.source_document_id,
        v_binding.genome_bill_id,
        repeat('f', 64),
        v_binding.source_content_hash,
        v_binding.source_url,
        v_binding.source_version,
        v_binding.rosetta_engine_version,
        v_binding.rosetta_rule_set_version,
        v_binding.rosetta_rule_manifest_hash,
        v_binding.rosetta_configuration_hash,
        v_binding.rosetta_output_content_hash
      )
      on conflict (source_document_id) do nothing;
      raise exception 'Rosetta source-identity drift was accepted';
    exception
      when sqlstate '22000' then null;
    end;

    begin
      update public.civic_genome_rosetta_generation_binding
         set observed_at = observed_at
       where generation_binding_id = (
         select generation_binding_id
         from public.civic_genome_rosetta_generation_binding
         where source_document_id = v_binding.source_document_id
         order by observed_at
         limit 1
       );
      raise exception 'Rosetta generation history mutation was accepted';
    exception
      when sqlstate '55000' then null;
    end;
  end if;
end;
$$;

select
  source_document_id,
  count(*)::integer as generation_count,
  count(distinct source_identity_hash)::integer as source_identity_count,
  count(distinct source_content_hash)::integer as source_content_count
from public.civic_genome_rosetta_generation_binding
group by source_document_id
order by source_document_id;
