create or replace function public.normalize_state_code(p_value text)
returns text
language sql
immutable
set search_path to 'public','pg_catalog'
as $function$
with raw as (
  select upper(trim(coalesce(p_value,''))) as v
), cleaned as (
  select trim(
    regexp_replace(
      regexp_replace(
        regexp_replace(v, '^J[_ -]+', '', 'i'),
        '[_-]+', ' ', 'g'
      ),
      '\s+STATE$', '', 'i'
    )
  ) as v
  from raw
)
select case v
  when 'ALABAMA' then 'AL' when 'AL' then 'AL'
  when 'ALASKA' then 'AK' when 'AK' then 'AK'
  when 'ARIZONA' then 'AZ' when 'AZ' then 'AZ'
  when 'ARKANSAS' then 'AR' when 'AR' then 'AR'
  when 'CALIFORNIA' then 'CA' when 'CA' then 'CA'
  when 'COLORADO' then 'CO' when 'CO' then 'CO'
  when 'CONNECTICUT' then 'CT' when 'CT' then 'CT'
  when 'DELAWARE' then 'DE' when 'DE' then 'DE'
  when 'FLORIDA' then 'FL' when 'FL' then 'FL'
  when 'GEORGIA' then 'GA' when 'GA' then 'GA'
  when 'HAWAII' then 'HI' when 'HI' then 'HI'
  when 'IDAHO' then 'ID' when 'ID' then 'ID'
  when 'ILLINOIS' then 'IL' when 'IL' then 'IL'
  when 'INDIANA' then 'IN' when 'IN' then 'IN'
  when 'IOWA' then 'IA' when 'IA' then 'IA'
  when 'KANSAS' then 'KS' when 'KS' then 'KS'
  when 'KENTUCKY' then 'KY' when 'KY' then 'KY'
  when 'LOUISIANA' then 'LA' when 'LA' then 'LA'
  when 'MAINE' then 'ME' when 'ME' then 'ME'
  when 'MARYLAND' then 'MD' when 'MD' then 'MD'
  when 'MASSACHUSETTS' then 'MA' when 'MA' then 'MA'
  when 'MICHIGAN' then 'MI' when 'MI' then 'MI'
  when 'MINNESOTA' then 'MN' when 'MN' then 'MN'
  when 'MISSISSIPPI' then 'MS' when 'MS' then 'MS'
  when 'MISSOURI' then 'MO' when 'MO' then 'MO'
  when 'MONTANA' then 'MT' when 'MT' then 'MT'
  when 'NEBRASKA' then 'NE' when 'NE' then 'NE'
  when 'NEVADA' then 'NV' when 'NV' then 'NV'
  when 'NEW HAMPSHIRE' then 'NH' when 'NH' then 'NH'
  when 'NEW JERSEY' then 'NJ' when 'NJ' then 'NJ'
  when 'NEW MEXICO' then 'NM' when 'NM' then 'NM'
  when 'NEW YORK' then 'NY' when 'NY' then 'NY'
  when 'NORTH CAROLINA' then 'NC' when 'NC' then 'NC'
  when 'NORTH DAKOTA' then 'ND' when 'ND' then 'ND'
  when 'OHIO' then 'OH' when 'OH' then 'OH'
  when 'OKLAHOMA' then 'OK' when 'OK' then 'OK'
  when 'OREGON' then 'OR' when 'OR' then 'OR'
  when 'PENNSYLVANIA' then 'PA' when 'PA' then 'PA'
  when 'RHODE ISLAND' then 'RI' when 'RI' then 'RI'
  when 'SOUTH CAROLINA' then 'SC' when 'SC' then 'SC'
  when 'SOUTH DAKOTA' then 'SD' when 'SD' then 'SD'
  when 'TENNESSEE' then 'TN' when 'TN' then 'TN'
  when 'TEXAS' then 'TX' when 'TX' then 'TX'
  when 'UTAH' then 'UT' when 'UT' then 'UT'
  when 'VERMONT' then 'VT' when 'VT' then 'VT'
  when 'VIRGINIA' then 'VA' when 'VA' then 'VA'
  when 'WASHINGTON' then 'WA' when 'WA' then 'WA'
  when 'WEST VIRGINIA' then 'WV' when 'WV' then 'WV'
  when 'WISCONSIN' then 'WI' when 'WI' then 'WI'
  when 'WYOMING' then 'WY' when 'WY' then 'WY'
  when 'DISTRICT OF COLUMBIA' then 'DC' when 'WASHINGTON DC' then 'DC' when 'WASHINGTON D C' then 'DC' when 'DC' then 'DC'
  when 'PUERTO RICO' then 'PR' when 'PR' then 'PR'
  when 'U S VIRGIN ISLANDS' then 'VI' when 'US VIRGIN ISLANDS' then 'VI' when 'UNITED STATES VIRGIN ISLANDS' then 'VI' when 'VIRGIN ISLANDS' then 'VI' when 'VI' then 'VI'
  when 'GUAM' then 'GU' when 'GU' then 'GU'
  when 'AMERICAN SAMOA' then 'AS' when 'AS' then 'AS'
  when 'NORTHERN MARIANA ISLANDS' then 'MP' when 'COMMONWEALTH OF THE NORTHERN MARIANA ISLANDS' then 'MP' when 'CNMI' then 'MP' when 'MP' then 'MP'
  when 'FEDERAL' then 'US' when 'NATIONAL' then 'US' when 'UNITED STATES' then 'US' when 'US' then 'US' when 'USA' then 'US'
  else null
end
from cleaned;
$function$;
