begin;

do $constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.lighthouse_suggestion_votes'::regclass
      and conname = 'lighthouse_suggestion_votes_suggestion_id_fkey'
  ) then
    alter table public.lighthouse_suggestion_votes
      add constraint lighthouse_suggestion_votes_suggestion_id_fkey
      foreign key ("suggestionId")
      references public.lighthouse_suggestions(id)
      on delete cascade;
  end if;
end
$constraint$;

comment on constraint lighthouse_suggestion_votes_suggestion_id_fkey
  on public.lighthouse_suggestion_votes is
  'Prevents orphan votes and cascades vote-ledger cleanup when a suggestion is deleted.';

commit;
