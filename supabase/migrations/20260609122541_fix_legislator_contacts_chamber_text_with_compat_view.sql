-- The public table exists in multiple historical shapes. Widen chamber when
-- that column is present, but publish the compatibility view only when its
-- complete twenty-column contract exists.
do $compatibility$
declare
  prerequisite_count integer;
  target_kind "char";
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'legislator_contacts'
      and column_name = 'chamber'
  ) then
    execute $alter$
      alter table public.legislator_contacts
      alter column chamber type text
      using chamber::text
    $alter$;
  end if;

  select count(*)
    into prerequisite_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'legislator_contacts'
    and column_name = any(array[
      'id',
      'full_name',
      'title',
      'jurisdiction',
      'chamber',
      'party',
      'district',
      'state',
      'contact_email',
      'contact_phone',
      'office_address',
      'website',
      'committees',
      'domains',
      'term_start',
      'term_end',
      'notes',
      'added_by',
      'created_at',
      'updated_at'
    ]);

  select c.relkind
    into target_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'compat'
    and c.relname = 'legislator_contacts';

  if prerequisite_count = 20
     and (target_kind is null or target_kind = 'v') then
    drop view if exists compat.legislator_contacts;
    execute $view$
      create view compat.legislator_contacts as
      select
        id,
        full_name,
        title,
        jurisdiction,
        chamber,
        party,
        district,
        state,
        contact_email,
        contact_phone,
        office_address,
        website,
        committees,
        domains,
        term_start,
        term_end,
        notes,
        added_by,
        created_at,
        updated_at
      from public.legislator_contacts
    $view$;
  end if;
end
$compatibility$;
