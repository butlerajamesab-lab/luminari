-- Restore registration-time amendment base linking in the spine door.
--
-- Migration 20260918172503 retired the door's URL/source-stem base inference,
-- replacing it with "amendment base identity is intentionally unresolved at
-- registration time." That was a machinery change outside the owner's reset
-- directive (outputs and engine bases only). On the owner's order
-- (2026-11-15), the original inference is restored verbatim, with one guard:
-- a base key already proved from source-stated evidence is never overwritten
-- by the stem pass (the 2026-09-18 text-evidence resolver writes keys through
-- civic-genome amendment attachment persistence).
--
-- Replay semantics: if the retirement comment is present, it is replaced.
-- If the stem inference is already installed, this migration is a no-op.
-- If neither is found, it raises rather than guessing at the door's shape.

do $migration$
declare
  v_sql text;
  v_old text := $old$
  -- Amendment base identity is intentionally unresolved at registration time.
  -- URL/source_stem similarity is not legislative attachment evidence.
$old$;
  v_new text := $new$
  update public.docket_bill_source_document document
     set base_source_document_key = (
       select base.source_document_key
       from public.docket_bill_source_document base
       where base.source_bill_id = document.source_bill_id
         and base.document_family = 'text'
         and base.source_stem = document.source_stem
       order by base.provider_sequence desc, base.provider_document_id desc
       limit 1
     ), updated_at = now()
   where document.source_bill_id = p_source_bill_id
     and document.document_family = 'amendment'
     and document.base_source_document_key is null;
$new$;
begin
  select pg_get_functiondef(
    'public.register_docket_legislative_version_spine(integer,boolean)'::regprocedure
  ) into v_sql;

  if position(v_old in v_sql) <> 0 then
    v_sql := replace(v_sql, v_old, v_new);
    execute v_sql;
  elsif position('base.source_stem = document.source_stem' in v_sql) <> 0 then
    raise notice 'stem base inference already installed; nothing to restore';
  else
    raise exception 'neither the retirement comment nor the stem inference was found in the spine door';
  end if;
end;
$migration$;

comment on function public.register_docket_legislative_version_spine(integer,boolean) is
  'Registers provider-declared bill text and amendment artifacts and preserves observations. Text predecessor lineage remains deterministic. Amendment base identity is linked at registration time from the provider URL/source stem within the same bill (restored 2026-11-15 on Alexander''s order, reverting migration 20260918172503); a base key already proved from source-stated evidence is never overwritten by the stem pass.';
