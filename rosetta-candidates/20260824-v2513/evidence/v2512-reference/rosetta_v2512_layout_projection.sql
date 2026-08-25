CREATE OR REPLACE FUNCTION public.rosetta_v2512_layout_projection(p_source_text text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_result text := p_source_text;
  v_line_label_count integer;
  v_trailing_line_number_count integer;
  v_page_counter_count integer;
begin
  v_line_label_count := regexp_count(p_source_text,'(^|\n)[0-9]{1,3}[.][0-9]{1,3}[ \t]+',1,'n');
  v_trailing_line_number_count := regexp_count(p_source_text,'\t[0-9]{1,3}[ \t]*(\n|$)',1,'n');
  v_page_counter_count := regexp_count(p_source_text,'(^|\n)[ \t]*--[ \t]*[0-9]+[ \t]+of[ \t]+[0-9]+[ \t]*--[ \t]*(\n|$)',1,'n');

  if v_line_label_count >= 3 then
    v_result := public.rosetta_v25_mask_matches(v_result,'(^|\n)[0-9]{1,3}[.][0-9]{1,3}[ \t]+','n');
  end if;

  if v_trailing_line_number_count >= 12 then
    v_result := public.rosetta_v25_mask_matches(v_result,'\t[0-9]{1,3}[ \t]*(\n|$)','n');
  end if;

  if v_result ~ 'REVISOR' or v_line_label_count >= 3 then
    v_result := public.rosetta_v25_mask_matches(v_result,'(^|\n)[0-9]{1,3}[ \t]+(?:Sec[.]|Section)[ \t]+[0-9]+[A-Za-z]?[.][^\n]*(\n|$)','n');
    v_result := public.rosetta_v25_mask_matches(v_result,'(^|\n)REVISOR[^\n]*(\n|$)','n');
  end if;

  if v_page_counter_count > 0 then
    v_result := public.rosetta_v25_mask_matches(v_result,'(^|\n)[ \t]*--[ \t]*[0-9]+[ \t]+of[ \t]+[0-9]+[ \t]*--[ \t]*(\n|$)','n');
    v_result := public.rosetta_v25_mask_matches(v_result,'(^|\n)[ \t]*General[ \t]+Assembly[ \t]+Of[ \t]+[^\n]+[ \t]+Session[ \t]+[0-9]{4}[ \t]*(\n|$)','n');
    v_result := public.rosetta_v25_mask_matches(v_result,'(^|\n)[ \t]*Page[ \t]+[0-9]+[ \t]+(?:House|Senate)[ \t]+Bill[^\n]*(\n|$)','n');
    v_result := public.rosetta_v25_mask_matches(v_result,'(^|\n)[ \t]*ORIGINAL[ \t]+(?:HOUSE|SENATE)[ \t]*(\n|$)','n');
    v_result := public.rosetta_v25_mask_matches(v_result,'(^|\n)[ \t]*BILL[ \t]+NO[.][^\n]*(\n|$)','n');
    v_result := public.rosetta_v25_mask_matches(v_result,'(^|\n)[ \t]*ENROLLED[ \t]+ACT[ \t]+NO[.][^\n]*(\n|$)','n');
    v_result := public.rosetta_v25_mask_matches(v_result,'(^|\n)[ \t]*[A-Z-]+[ \t]+LEGISLATURE[ \t]+OF[ \t]+THE[ \t]+STATE[ \t]+OF[^\n]*(\n|$)','n');
    v_result := public.rosetta_v25_mask_matches(v_result,'(^|\n)[ \t]*[0-9]{4}[ \t]+(?:BUDGET|REGULAR|GENERAL|SPECIAL)[ \t]+SESSION[ \t]*(\n|$)','n');
  end if;

  return public.rosetta_v25_protect_internal_periods(v_result);
end;
$function$
