begin

create or replace function public.rosetta_v25_is_internal_period(p_value text,p_index integer)
returns boolean language plpgsql immutable strict set search_path=pg_catalog as $$
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
end;$$

create or replace function public.rosetta_v25_clause_structurally_sound(p_clause text,p_actor text,p_modal text)
returns boolean language sql immutable strict set search_path=pg_catalog,public as $$
 select nullif(btrim(p_clause),'') is not null and nullif(btrim(p_actor),'') is not null and lower(p_modal) in ('shall','shall not','must','must not','may','may not') and p_actor !~ '^\s*[0-9]+\M' and p_clause !~* '\mREVISOR\M|--\s*[0-9]+\s+of\s+[0-9]+\s*--' and right(btrim(p_clause),1)='.';
$$

revoke all on function public.rosetta_v25_is_internal_period(text,integer) from public,anon,authenticated

revoke all on function public.rosetta_v25_clause_structurally_sound(text,text,text) from public,anon,authenticated

commit
