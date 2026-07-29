-- Atlas stream identity constraints required by the Lighthouse mirror.
--
-- The bridge uses PostgreSQL ON CONFLICT against these exact identities:
--   streams(stream_id)
--   signal_events(stream_id, offset)
--   cursors(stream_id, name)
--
-- The production database already carries these indexes. CREATE UNIQUE INDEX
-- IF NOT EXISTS makes the migration replay-safe for production and recovery
-- databases without deleting or rewriting source rows.

create unique index if not exists streams_pkey
  on public.streams (stream_id);

create unique index if not exists signal_events_pkey
  on public.signal_events (stream_id, "offset");

create unique index if not exists cursors_stream_id_name_key
  on public.cursors (stream_id, name);

-- Fail closed if a conflicting same-named non-unique index prevented the
-- identity contract from being installed.
do $$
declare
  missing_contracts text[] := array[]::text[];
begin
  if not exists (
    select 1
      from pg_index i
      join pg_class index_class on index_class.oid = i.indexrelid
      join pg_class table_class on table_class.oid = i.indrelid
      join pg_namespace namespace on namespace.oid = table_class.relnamespace
     where namespace.nspname = 'public'
       and table_class.relname = 'streams'
       and index_class.relname = 'streams_pkey'
       and i.indisunique
  ) then
    missing_contracts := array_append(missing_contracts, 'streams(stream_id)');
  end if;

  if not exists (
    select 1
      from pg_index i
      join pg_class index_class on index_class.oid = i.indexrelid
      join pg_class table_class on table_class.oid = i.indrelid
      join pg_namespace namespace on namespace.oid = table_class.relnamespace
     where namespace.nspname = 'public'
       and table_class.relname = 'signal_events'
       and index_class.relname = 'signal_events_pkey'
       and i.indisunique
  ) then
    missing_contracts := array_append(missing_contracts, 'signal_events(stream_id, offset)');
  end if;

  if not exists (
    select 1
      from pg_index i
      join pg_class index_class on index_class.oid = i.indexrelid
      join pg_class table_class on table_class.oid = i.indrelid
      join pg_namespace namespace on namespace.oid = table_class.relnamespace
     where namespace.nspname = 'public'
       and table_class.relname = 'cursors'
       and index_class.relname = 'cursors_stream_id_name_key'
       and i.indisunique
  ) then
    missing_contracts := array_append(missing_contracts, 'cursors(stream_id, name)');
  end if;

  if cardinality(missing_contracts) > 0 then
    raise exception 'Atlas stream identity contract missing: %', array_to_string(missing_contracts, ', ');
  end if;
end
$$;
