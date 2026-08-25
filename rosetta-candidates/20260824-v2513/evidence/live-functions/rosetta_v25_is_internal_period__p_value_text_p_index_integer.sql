CREATE OR REPLACE FUNCTION public.rosetta_v25_is_internal_period(p_value text, p_index integer)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
declare v_previous text:=substr(p_value,greatest(1,p_index-1),1); v_next text:=substr(p_value,p_index+1,1); v_left text:=substr(p_value,1,greatest(0,p_index-1)); v_after text:=ltrim(substr(p_value,p_index+1)); v_word text; v_dotted text;
begin
 if substr(p_value,p_index,1)<>'.' then return false; end if;
 if v_previous ~ '[0-9A-Za-z]' and v_next ~ '[0-9]' then return true; end if;
 if v_previous ~ '[A-Za-z]' and v_next ~ '[A-Za-z]' then return true; end if;
 v_word:=(regexp_match(v_left,'([A-Za-z]+)$'))[1];
 if v_word is not null and lower(v_word)=any(array['art','co','corp','dr','etc','inc','mr','mrs','ms','no','st','v','vs']) and v_after<>'' then return true; end if;
 if lower(coalesce(v_word,''))='e' and v_after ~ '^g[.]' then return true; end if;
 if lower(coalesce(v_word,''))='i' and v_after ~ '^e[.]' then return true; end if;
 if v_word='Pub' and v_after ~ '^L[.]\s*(?:No[.]\s*)?[0-9]' then return true; end if;
 if v_left ~ '[0-9]+\s+F$' and v_after ~ '^Supp[.]\s*[0-9]' then return true; end if;
 if v_left ~ '[0-9]+\s+F[.]\s+Supp$' and v_after ~ '^[0-9]' then return true; end if;
 if v_left ~ '[0-9]+\s+S$' and v_after ~ '^Ct[.]\s*[0-9]' then return true; end if;
 if v_left ~ '[0-9]+\s+S[.]\s+Ct$' and v_after ~ '^[0-9]' then return true; end if;
 v_dotted:=(regexp_match(v_left,'([A-Za-z]+(?:[.][A-Za-z]+)+)$'))[1];
 if v_dotted is not null and v_after<>'' and v_after !~ '^(?:A|An|Each|Every|No|That|The|This)\M' then return true; end if;
 if v_word is not null and v_word ~ '^[A-Z]$' and v_after ~ '^(?:[0-9]|No[.]\s*[0-9])' then return true; end if;
 return false;
end;$function$
