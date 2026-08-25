CREATE OR REPLACE FUNCTION public.rosetta_v25_normative_clauses(p_source_text text)
 RETURNS TABLE(section_ordinal integer, section_number text, clause_ordinal integer, clause_text text, actor text, modal text)
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_section record; v_match text[]; v_projection text; v_clause text; v_actor text; v_modal text; v_ordinal integer:=0;
begin
  for v_section in select * from public.rosetta_v25_section_spans(p_source_text) order by section_ordinal loop
    v_projection := public.rosetta_v25_layout_projection(v_section.section_text);
    for v_match in select regexp_matches(public.rosetta_v2_normalize_text(v_projection),'(?i)([^.]*\m(shall not|must not|may not|shall|must|may)\M[^.]*[.])','g') loop
      v_clause := public.rosetta_v25_unprotect_text(public.rosetta_v2_normalize_text(v_match[1]));
      select inferred.modal,inferred.actor into v_modal,v_actor from public.rosetta_v25_modal_and_actor(v_clause) inferred;
      if v_modal is null or v_actor is null then continue; end if;
      if public.rosetta_v2_is_legislative_finding(v_clause,v_modal) then continue; end if;
      if not public.rosetta_v25_clause_structurally_sound(v_clause,v_actor,v_modal) then continue; end if;
      v_ordinal:=v_ordinal+1;
      return query select v_section.section_ordinal,v_section.section_number,v_ordinal,v_clause,v_actor,v_modal;
    end loop;
  end loop;
end;
$function$
