-- Strip raw WordprocessingML markup from corpus candidate display fields.
--
-- Context: 213 rows in public.luminari_corpus_candidate_v1 carry unparsed
-- DOCX envelope markup (<w:p>, <w:r>, table-grid XML) in description and
-- apply_notes — 192 from the Colorado registry ingest plus 21 unresolved —
-- and the markup is visible on public Resource Directory cards. Measured
-- 2026-09-04 against production.
--
-- Discipline:
--   * Old values are preserved verbatim (with content hashes) in
--     private.corpus_candidate_markup_strip_backup_20260904 BEFORE any write.
--   * Writes are guarded: only rows still carrying '<w:' markup are touched,
--     per-field. A row cleaned by an earlier partial run is never rewritten.
--   * Fail-closed: the migration raises (and rolls back) if any markup
--     remains afterward or if the backup is incomplete.

begin;

-- 1. Preserve every value about to change, with hashes, before touching it.
create table if not exists private.corpus_candidate_markup_strip_backup_20260904 (
  candidate_id uuid not null,
  field_name text not null check (field_name in ('description', 'apply_notes')),
  old_value text not null,
  old_sha256 text not null,
  backed_up_at timestamptz not null default now(),
  primary key (candidate_id, field_name)
);

insert into private.corpus_candidate_markup_strip_backup_20260904
  (candidate_id, field_name, old_value, old_sha256)
select c.candidate_id, 'description', c.description, encode(digest(c.description, 'sha256'), 'hex')
from public.luminari_corpus_candidate_v1 c
where c.description ilike '%<w:%'
on conflict (candidate_id, field_name) do nothing;

insert into private.corpus_candidate_markup_strip_backup_20260904
  (candidate_id, field_name, old_value, old_sha256)
select c.candidate_id, 'apply_notes', c.apply_notes, encode(digest(c.apply_notes, 'sha256'), 'hex')
from public.luminari_corpus_candidate_v1 c
where c.apply_notes ilike '%<w:%'
on conflict (candidate_id, field_name) do nothing;

-- Fail closed if the backup did not capture every row still carrying markup.
do $$
declare
  unbacked integer;
begin
  select count(*) into unbacked
  from public.luminari_corpus_candidate_v1 c
  where (c.description ilike '%<w:%' and not exists (
      select 1 from private.corpus_candidate_markup_strip_backup_20260904 b
      where b.candidate_id = c.candidate_id and b.field_name = 'description'))
     or (c.apply_notes ilike '%<w:%' and not exists (
      select 1 from private.corpus_candidate_markup_strip_backup_20260904 b
      where b.candidate_id = c.candidate_id and b.field_name = 'apply_notes'));
  if unbacked > 0 then
    raise exception 'markup strip aborted: % rows lack a preserved backup value', unbacked;
  end if;
end $$;

-- 2. Strip the markup. Pattern: remove <w:...> and </w:...> tags, collapse
--    the whitespace they leave behind, trim, and store NULL when nothing
--    human-readable survives (the read views already coalesce NULLs).
update public.luminari_corpus_candidate_v1
set description = nullif(
  trim(both from regexp_replace(
    regexp_replace(description, '</?w:[^>]*>', ' ', 'g'),
    '\s+', ' ', 'g')),
  '')
where description ilike '%<w:%';

update public.luminari_corpus_candidate_v1
set apply_notes = nullif(
  trim(both from regexp_replace(
    regexp_replace(apply_notes, '</?w:[^>]*>', ' ', 'g'),
    '\s+', ' ', 'g')),
  '')
where apply_notes ilike '%<w:%';

-- 3. Fail closed if any markup survived.
do $$
declare
  remaining integer;
begin
  select count(*) into remaining
  from public.luminari_corpus_candidate_v1
  where description ilike '%<w:%' or apply_notes ilike '%<w:%';
  if remaining > 0 then
    raise exception 'markup strip incomplete: % rows still carry DOCX markup', remaining;
  end if;
end $$;

commit;
