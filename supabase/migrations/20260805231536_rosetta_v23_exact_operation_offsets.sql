create or replace function public.rosetta_v23_amendment_operations(
  p_source_text text
)
returns table (
  operation_ordinal integer,
  operation_text text,
  target_locator text,
  operation_kind text,
  char_offset_start integer,
  char_offset_end integer
)
language plpgsql
immutable
strict
set search_path = pg_catalog, public
as $$
declare
  v_source text := p_source_text;
  v_match text[];
  v_operation text;
  v_target text;
  v_action_position integer;
  v_start integer;
  v_ordinal integer := 0;
begin
  for v_match in
    select regexp_matches(
      v_source,
      '(?i)((On page .*?)(?= On page | EFFECT:| --- END ---|$)|(Strike everything after the enacting clause and insert the following: .*?)(?= EFFECT:| --- END ---|$))',
      'g'
    )
  loop
    v_operation := v_match[1];
    v_start := strpos(p_source_text, v_operation);
    if v_start = 0 then
      raise exception using
        errcode = '22000',
        message = 'rosetta_v23_amendment_operation_offset_unresolved',
        detail = left(v_operation, 500);
    end if;

    v_action_position := regexp_instr(
      v_operation,
      '\m(strike|insert|delete|renumber)\M',
      1,
      1,
      0,
      'i'
    );
    if v_action_position = 0 then
      raise exception using
        errcode = '22000',
        message = 'rosetta_v23_amendment_operation_verb_missing',
        detail = left(v_operation, 500);
    end if;

    if v_operation ~* '^Strike everything after the enacting clause and insert the following:' then
      v_target := 'Strike everything after the enacting clause';
    else
      v_target := nullif(
        btrim(substr(v_operation, 1, v_action_position - 1)),
        ''
      );
    end if;

    v_ordinal := v_ordinal + 1;
    return query
    select
      v_ordinal,
      v_operation,
      v_target,
      case
        when v_operation ~* '\mstrike\M' and v_operation ~* '\minsert\M'
          then 'strike_and_insert'
        when v_operation ~* '\mrenumber\M' then 'renumber'
        when v_operation ~* '\mdelete\M' then 'delete'
        when v_operation ~* '\mstrike\M' then 'strike'
        when v_operation ~* '\minsert\M' then 'insert'
        else 'source_stated_operation'
      end,
      v_start - 1,
      v_start - 1 + char_length(v_operation);
  end loop;
end;
$$

comment on function public.rosetta_v23_amendment_operations(text) is
  'Returns exact source substrings and source-native offsets for governed page-locator and whole-document amendment operations. Whitespace is never rewritten inside the preserved operation.'

revoke all on function public.rosetta_v23_amendment_operations(text)
  from public, anon, authenticated
