-- Existing production pattern_types has only an ID primary key. CREATE TABLE
-- IF NOT EXISTS in the runtime contract cannot add its pattern_type key.
-- Preserve all IDs, values, and references; duplicate legacy names fail closed.
do $$
begin
  if exists (
    select 1 from pg_attribute a
    where a.attrelid=to_regclass('public.pattern_types')
      and a.attname='pattern_type' and a.attnum>0 and not a.attisdropped
  ) and not exists (
    select 1 from pg_index i join pg_attribute a
      on a.attrelid=i.indrelid and a.attnum=i.indkey[0]
    where i.indrelid=to_regclass('public.pattern_types')
      and i.indisunique and i.indisvalid and i.indimmediate
      and i.indpred is null and i.indexprs is null and i.indnkeyatts=1
      and a.attname='pattern_type'
  ) then
    create unique index uq_lighthouse_pattern_type_runtime
      on public.pattern_types(pattern_type);
  end if;
end;
$$;
