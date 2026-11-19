do $$
declare
  v_insert_exists boolean;
  v_update_exists boolean;
  v_update_guard text;
  v_legacy_exists boolean;
begin
  select exists (
    select 1
    from pg_trigger trigger_row
    join pg_class relation on relation.oid = trigger_row.tgrelid
    join pg_namespace schema_row on schema_row.oid = relation.relnamespace
    where schema_row.nspname = 'public'
      and relation.relname = 'civic_genome_bill'
      and trigger_row.tgname = 'civic_genome_legislative_version_spine_registration_insert'
      and not trigger_row.tgisinternal
      and (trigger_row.tgtype & 4) <> 0
      and (trigger_row.tgtype & 16) = 0
  ) into v_insert_exists;

  select exists (
    select 1
    from pg_trigger trigger_row
    join pg_class relation on relation.oid = trigger_row.tgrelid
    join pg_namespace schema_row on schema_row.oid = relation.relnamespace
    where schema_row.nspname = 'public'
      and relation.relname = 'civic_genome_bill'
      and trigger_row.tgname = 'civic_genome_legislative_version_spine_registration_update'
      and not trigger_row.tgisinternal
      and (trigger_row.tgtype & 16) <> 0
      and (trigger_row.tgtype & 4) = 0
      and trigger_row.tgqual is not null
  ) into v_update_exists;

  select pg_get_expr(trigger_row.tgqual, trigger_row.tgrelid)
    into v_update_guard
  from pg_trigger trigger_row
  join pg_class relation on relation.oid = trigger_row.tgrelid
  join pg_namespace schema_row on schema_row.oid = relation.relnamespace
  where schema_row.nspname = 'public'
    and relation.relname = 'civic_genome_bill'
    and trigger_row.tgname = 'civic_genome_legislative_version_spine_registration_update'
    and not trigger_row.tgisinternal;

  select exists (
    select 1
    from pg_trigger trigger_row
    join pg_class relation on relation.oid = trigger_row.tgrelid
    join pg_namespace schema_row on schema_row.oid = relation.relnamespace
    where schema_row.nspname = 'public'
      and relation.relname = 'civic_genome_bill'
      and trigger_row.tgname = 'civic_genome_legislative_version_spine_registration'
      and not trigger_row.tgisinternal
  ) into v_legacy_exists;

  if not v_insert_exists then
    raise exception 'missing insert registration trigger';
  end if;
  if not v_update_exists then
    raise exception 'missing guarded update registration trigger';
  end if;
  if v_update_guard !~* 'old[.]structural_dna_json IS DISTINCT FROM new[.]structural_dna_json' then
    raise exception 'update trigger does not guard against unchanged structural_dna_json: %', v_update_guard;
  end if;
  if v_legacy_exists then
    raise exception 'legacy combined registration trigger still exists';
  end if;
end;
$$;
