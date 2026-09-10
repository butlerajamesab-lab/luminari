-- Production-only compat aliases depend on columns normalized by the runtime
-- contract. Convert each base table and restore its alias in one transaction,
-- preserving the alias definition, owner, access controls, options and comments.
set lock_timeout = '5s';
set statement_timeout = '120s';
set local search_path = pg_catalog, public;

create or replace function pg_temp.luminari_try_jsonb(value text)
returns jsonb language plpgsql immutable as $$
begin
  if value is null or btrim(value)='' then return null; end if;
  return value::jsonb;
exception when others then return jsonb_build_object('legacy_text',value);
end;
$$;

create or replace function pg_temp.luminari_normalized_timestamp(value text)
returns timestamptz language plpgsql immutable as $$
begin
  if value is null or btrim(value)='' then return null; end if;
  if btrim(value) ~ '^\d{14}$' then return to_timestamp(btrim(value),'YYYYMMDDHH24MISS'); end if;
  return value::timestamptz;
exception when others then return null;
end;
$$;

do $$
declare
  target_relation_name text;
  conversion record;
  view_receipt jsonb;
  grant_row record;
  column_receipt jsonb;
  grantee_sql text;
  original_default text;
begin
  create temporary table luminari_compat_type_targets on commit drop as
  select * from (values
    ('ingest_runs','errors_run','text','jsonb','pg_temp.luminari_try_jsonb(%s)'),
    ('ingested_records','raw_json','text','jsonb','pg_temp.luminari_try_jsonb(%s)'),
    ('ingested_records','metadata_l1_l2','text','jsonb','pg_temp.luminari_try_jsonb(%s)'),
    ('ingested_records','normalized_date','text','timestamptz','pg_temp.luminari_normalized_timestamp(%s)'),
    ('ingested_records','normalized_amount','text','numeric',
      $cast$case when coalesce(btrim(%1$s),'') ~ '^-?[0-9]+([.][0-9]+)?$' then %1$s::numeric end$cast$),
    ('ingested_records','processed_for_signals','int4','boolean','(%s <> 0)'),
    ('live_signals','supporting_statistics','text','jsonb','pg_temp.luminari_try_jsonb(%s)'),
    ('live_signals','entity_aliases_json','text','jsonb','pg_temp.luminari_try_jsonb(%s)'),
    ('live_signals','confidence_score','text','numeric(10,4)',
      $cast$case when coalesce(%1$s,'') ~ '^-?[0-9]+([.][0-9]+)?$' then %1$s::numeric end$cast$),
    ('live_signals','entity_confidence_score_ls','text','numeric(10,4)',
      $cast$case when coalesce(%1$s,'') ~ '^-?[0-9]+([.][0-9]+)?$' then %1$s::numeric end$cast$),
    ('live_signals','role_confidence','text','numeric(10,4)',
      $cast$case when coalesce(%1$s,'') ~ '^-?[0-9]+([.][0-9]+)?$' then %1$s::numeric end$cast$),
    ('remedy_paths','prerequisites','text','jsonb','pg_temp.luminari_try_jsonb(%s)'),
    ('remedy_paths','related_claim_types','text','jsonb','pg_temp.luminari_try_jsonb(%s)'),
    ('pattern_aggregation_runs','case_ids_analyzed','text','jsonb','pg_temp.luminari_try_jsonb(%s)'),
    ('pattern_aggregation_runs','completed_at','text','bigint',
      $cast$case when coalesce(%1$s,'') ~ '^\d+$' then %1$s::bigint end$cast$)
  ) as targets(relation_name,column_name,source_type,target_type,conversion_sql);

  for target_relation_name in
    select distinct t.relation_name from luminari_compat_type_targets t
    join information_schema.columns c on c.table_schema='public'
      and c.table_name=t.relation_name and c.column_name=t.column_name and c.udt_name=t.source_type
  loop
    select jsonb_build_object(
      'definition',pg_get_viewdef(c.oid,false),'owner',pg_get_userbyid(c.relowner),
      'options',c.reloptions,'comment',obj_description(c.oid,'pg_class'),
      'grants',(select jsonb_agg(to_jsonb(a)) from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a),
      'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,
        'comment',col_description(c.oid,a.attnum),
        'grants',(select jsonb_agg(to_jsonb(g)) from aclexplode(a.attacl) g)))
        from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped)
    ) into view_receipt
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='compat' and c.relname=target_relation_name and c.relkind='v';

    if view_receipt is not null then
      -- RESTRICT fails and rolls back if an unexpected dependent object exists.
      execute format('drop view compat.%I restrict',target_relation_name);
    end if;

    for conversion in select t.* from luminari_compat_type_targets t
      join information_schema.columns c on c.table_schema='public'
        and c.table_name=t.relation_name and c.column_name=t.column_name and c.udt_name=t.source_type
      where t.relation_name=target_relation_name
    loop
      execute format('alter table public.%I add column if not exists %I text',
        target_relation_name,conversion.column_name||'_legacy_text');
      execute format('update public.%I set %I=coalesce(%I,%I::text) where %I is not null',
        target_relation_name,conversion.column_name||'_legacy_text',conversion.column_name||'_legacy_text',
        conversion.column_name,conversion.column_name);
      select column_default into original_default from information_schema.columns
        where table_schema='public' and table_name=target_relation_name and column_name=conversion.column_name;
      execute format('alter table public.%I alter column %I drop default',target_relation_name,conversion.column_name);
      execute format('alter table public.%I alter column %I type %s using (%s)',
        target_relation_name,conversion.column_name,conversion.target_type,
        format(conversion.conversion_sql,quote_ident(conversion.column_name)));
      if original_default is not null then
        execute format('alter table public.%I alter column %I set default ((%s)::%s)',
          target_relation_name,conversion.column_name,original_default,conversion.target_type);
      end if;
    end loop;

    if view_receipt is not null then
      execute format('create view compat.%I as %s',target_relation_name,view_receipt->>'definition');
      if jsonb_array_length(coalesce(nullif(view_receipt->'options','null'::jsonb),'[]'::jsonb))>0 then
        execute format('alter view compat.%I set (%s)',target_relation_name,
          (select string_agg(value,',') from jsonb_array_elements_text(view_receipt->'options')));
      end if;
      execute format('alter view compat.%I owner to %I',target_relation_name,view_receipt->>'owner');
      execute format('comment on view compat.%I is %L',target_relation_name,view_receipt->>'comment');

      -- Creation can inherit broader default privileges. Remove those before
      -- restoring precisely the old table and column privilege sets.
      for grant_row in select distinct a.grantee from pg_class c
        join pg_namespace n on n.oid=c.relnamespace
        cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
        where n.nspname='compat' and c.relname=target_relation_name
      loop
        grantee_sql := case when grant_row.grantee=0 then 'public' else quote_ident(pg_get_userbyid(grant_row.grantee)) end;
        execute format('revoke all on compat.%I from %s',target_relation_name,grantee_sql);
      end loop;
      for grant_row in select * from jsonb_to_recordset(coalesce(nullif(view_receipt->'grants','null'::jsonb),'[]'::jsonb))
        as g(grantee oid,privilege_type text,is_grantable boolean)
      loop
        grantee_sql := case when grant_row.grantee=0 then 'public' else quote_ident(pg_get_userbyid(grant_row.grantee)) end;
        execute format('grant %s on compat.%I to %s%s',grant_row.privilege_type,target_relation_name,grantee_sql,
          case when grant_row.is_grantable then ' with grant option' else '' end);
      end loop;
      for column_receipt in select value from jsonb_array_elements(view_receipt->'columns') loop
        execute format('comment on column compat.%I.%I is %L',target_relation_name,
          column_receipt->>'name',column_receipt->>'comment');
        for grant_row in select * from jsonb_to_recordset(coalesce(nullif(column_receipt->'grants','null'::jsonb),'[]'::jsonb))
          as g(grantee oid,privilege_type text,is_grantable boolean)
        loop
          grantee_sql := case when grant_row.grantee=0 then 'public' else quote_ident(pg_get_userbyid(grant_row.grantee)) end;
          execute format('grant %s (%I) on compat.%I to %s%s',grant_row.privilege_type,
            column_receipt->>'name',target_relation_name,grantee_sql,
            case when grant_row.is_grantable then ' with grant option' else '' end);
        end loop;
      end loop;
    end if;
  end loop;
  drop table luminari_compat_type_targets;
end;
$$;
