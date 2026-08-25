CREATE OR REPLACE FUNCTION public.rosetta_v251_accountability_kind(p_trigger text)
 RETURNS TABLE(enforcement_type text, enforcement_direction text, clause_type text)
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
 select
 case when p_trigger ~* '\m(?:guilty|felony|sentenc(?:e|ed|ing)?|penalt(?:y|ies)|forfeitur(?:e|es))\M' then 'source_stated_penalty_rule'
      when p_trigger ~* '\m(?:report|notify|transmit)\M' then 'source_stated_reporting_requirement'
      when p_trigger ~* '\m(?:refuse\s+to\s+(?:issue|renew)|suspend(?:ing|ed|s)?|revok(?:e|ed|ing|es|ation)|licens(?:e|ed|ing|ure)|disciplin(?:e|ed|ary|ing))\M' then 'source_stated_licensing_enforcement_rule'
      when p_trigger ~* '\minvestigat(?:e|ed|es|ing|ion)\M' then 'source_stated_investigation_rule'
      else 'source_stated_enforcement_rule' end,
 case when p_trigger ~* '\m(?:guilty|felony|sentenc(?:e|ed|ing)?|penalt(?:y|ies)|forfeitur(?:e|es))\M' then 'individual_penalty'
      when p_trigger ~* '\m(?:report|notify|transmit)\M' then 'reporting_requirement'
      when p_trigger ~* '\m(?:refuse\s+to\s+(?:issue|renew)|suspend(?:ing|ed|s)?|revok(?:e|ed|ing|es|ation)|licens(?:e|ed|ing|ure)|disciplin(?:e|ed|ary|ing))\M' then 'agency_mandate'
      when p_trigger ~* '\minvestigat(?:e|ed|es|ing|ion)\M' then 'agency_mandate'
      when p_trigger ~* '\mshall\s+take\s+appropriate\s+action\M' then 'agency_mandate'
      else 'procedure' end,
 case when p_trigger ~* '\m(?:guilty|felony|sentenc(?:e|ed|ing)?|penalt(?:y|ies)|forfeitur(?:e|es))\M' then 'procedure'
      when p_trigger ~* '\m(?:report|notify|transmit|refuse|suspend|revok|licens|disciplin|investigat)' then 'agency_mandate'
      else 'procedure' end;
$function$
