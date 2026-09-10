-- Normalize predecessor storage before the runtime contract migration.
-- UUID pattern identities and their references stay intact. Only timestamp
-- storage changes, with the original representation retained beside it.
set lock_timeout = '5s';
set statement_timeout = '120s';

do $$
declare
  field record;
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='patterns' and c.relkind in ('r','p')) then
    for field in
      select column_name, column_default from information_schema.columns
      where table_schema='public' and table_name='patterns'
        and column_name in ('created_at','updated_at','first_seen_at','last_seen_at')
        and data_type in ('timestamp with time zone','timestamp without time zone')
    loop
      execute format('alter table public.patterns add column if not exists %I text', 'source_' || field.column_name);
      execute format('update public.patterns set %I=coalesce(%I,%I::text) where %I is not null',
        'source_' || field.column_name, 'source_' || field.column_name, field.column_name, field.column_name);
      execute format('alter table public.patterns alter column %I drop default', field.column_name);
      execute format('alter table public.patterns alter column %I type bigint using (extract(epoch from %I)*1000)::bigint',
        field.column_name, field.column_name);
      if field.column_default is not null then
        execute format('alter table public.patterns alter column %I set default ((extract(epoch from (%s))*1000)::bigint)',
          field.column_name, field.column_default);
      end if;
    end loop;
  end if;
end;
$$;

-- Rename existing columns so their values, constraints, and index references
-- survive. Do not create empty canonical columns beside the real data.
do $$
declare
  mapping record;
begin
  for mapping in select * from (values
    ('presentations','caseId','case_id'),
    ('presentations','userId','user_id'),
    ('presentations','snapshotId','snapshot_id'),
    ('presentations','slideCount','slide_count'),
    ('presentations','createdAt','created_at'),
    ('presentations','updatedAt','updated_at'),
    ('presentation_slides','presentationId','presentation_id'),
    ('presentation_slides','orderIndex','order_index'),
    ('presentation_slides','slideType','slide_type'),
    ('presentation_slides','sourceCitations','source_citations'),
    ('entity_merge_suggestions','caseId','case_id'),
    ('entity_merge_suggestions','sourceEntityId','source_entity_id'),
    ('entity_merge_suggestions','targetEntityId','target_entity_id'),
    ('entity_merge_suggestions','mergeStatus','status'),
    ('entity_merge_suggestions','reviewedAt','reviewed_at'),
    ('entity_merge_suggestions','reviewedBy','reviewed_by'),
    ('entity_merge_suggestions','createdAt','created_at'),
    ('user_feedback','userId','user_id'),
    ('user_feedback','caseId','case_id'),
    ('user_feedback','feedbackType','feedback_type'),
    ('user_feedback','currentPage','current_page'),
    ('user_feedback','pipelineType','pipeline_type'),
    ('user_feedback','feedbackStatus','status'),
    ('user_feedback','createdAt','created_at')
  ) as mappings(relation_name, legacy_name, canonical_name)
  loop
    if exists (select 1 from information_schema.columns where table_schema='public'
      and table_name=mapping.relation_name and column_name=mapping.legacy_name) then
      if exists (select 1 from information_schema.columns where table_schema='public'
        and table_name=mapping.relation_name and column_name=mapping.canonical_name) then
        raise exception 'Ambiguous runtime columns: %.% and % both exist',
          mapping.relation_name, mapping.legacy_name, mapping.canonical_name;
      end if;
      execute format('alter table public.%I rename column %I to %I',
        mapping.relation_name, mapping.legacy_name, mapping.canonical_name);
    end if;
  end loop;
end;
$$;

-- The predecessor uses PostgreSQL enums. Text normalization in the following
-- migration must not compare those enum values with an invalid empty label.
do $$
declare
  field record;
begin
  for field in
    select c.table_name,c.column_name,c.column_default
    from information_schema.columns c
    join pg_namespace n on n.nspname=c.udt_schema
    join pg_type t on t.typnamespace=n.oid and t.typname=c.udt_name
    where c.table_schema='public' and t.typtype='e'
      and ((c.table_name='entity_merge_suggestions' and c.column_name='status')
        or (c.table_name='user_feedback' and c.column_name in ('status','feedback_type')))
  loop
    execute format('alter table public.%I alter column %I drop default',field.table_name,field.column_name);
    execute format('alter table public.%I alter column %I type text using %I::text',field.table_name,field.column_name,field.column_name);
    if field.column_default is not null then
      execute format('alter table public.%I alter column %I set default ((%s)::text)',field.table_name,field.column_name,field.column_default);
    end if;
  end loop;
end;
$$;
