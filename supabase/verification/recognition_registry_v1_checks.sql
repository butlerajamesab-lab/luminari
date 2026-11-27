-- Read-only checks for recognition_registry_v1. Each raises on failure.
do $$
declare v integer;
begin
  -- Every record and route cites at least one source.
  select count(*) into v from public.nation_recognition_record_v1 where cardinality(source_urls) = 0;
  if v > 0 then raise exception 'records without source: %', v; end if;
  select count(*) into v from public.recognition_route_v1 where cardinality(source_urls) = 0;
  if v > 0 then raise exception 'routes without source: %', v; end if;
  -- No nation is both on the federal list and recorded as unrecognized.
  select count(*) into v from public.nation_recognition_record_v1 rec
    join public.native_nation_registry_v1 r using (nation_key)
   where r.federal_status = 'federally_recognized';
  if v > 0 then raise exception 'recognized nations recorded as unrecognized: %', v; end if;
  -- Every unrecognized nation in the registry has a recognition record.
  select count(*) into v from public.native_nation_registry_v1 r
   where r.federal_status = 'not_federally_recognized'
     and not exists (select 1 from public.nation_recognition_record_v1 rec where rec.nation_key = r.nation_key);
  if v > 0 then raise exception 'unrecognized nations without a record: %', v; end if;
  -- Recognized nations appear in the matrix only through a recorded route.
  select count(*) into v from public.recognition_comparison_matrix_v1 m
   where m.federal_status = 'federally_recognized' and m.route is null;
  if v > 0 then raise exception 'recognized nations in matrix without a route: %', v; end if;
  -- Browser roles cannot read any of it.
  if has_table_privilege('anon', 'public.nation_recognition_record_v1', 'select')
     or has_table_privilege('authenticated', 'public.recognition_route_v1', 'select')
     or has_table_privilege('anon', 'public.recognition_comparison_matrix_v1', 'select') then
    raise exception 'browser role can read the recognition registry';
  end if;
end;
$$;
select 'recognition_registry_v1 checks passed' as result;
