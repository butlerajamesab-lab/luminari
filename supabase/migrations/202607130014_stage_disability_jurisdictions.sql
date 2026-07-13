begin;

insert into public.substrate_source_artifact (
    source_file, source_sha256, source_kind, source_bytes,
    source_rows_expected, source_files_expected, deployment_status, notes
) values (
    'luminari-DISABILITY-SERVICES-RESOURCE-DIRECTORY-2026 (2).docx',
    'f208b77fa1f7a3f0696eecd34f06f2325994f0c6bdf467231515ac97b5165c33',
    'verified_docx_resource_directory',
    174034,
    56,
    1,
    'staged',
    'Authoritative Disability Services resource directory verified 2026-07-13. Tier 3 and Tier 4 contain one jurisdiction summary for all 50 states, DC, and five territories; each payload preserves P&A, DD Council, and VR agency records.'
)
on conflict (source_sha256) do update set
    source_file=excluded.source_file,
    source_kind=excluded.source_kind,
    source_bytes=excluded.source_bytes,
    source_rows_expected=excluded.source_rows_expected,
    source_files_expected=excluded.source_files_expected,
    deployment_status=excluded.deployment_status,
    notes=excluded.notes,
    updated_at=now();

insert into public.domain_deep_dive_v3_13_stage (
    source_file, source_hash_raw, source_hash_kind, source_kind, source_key,
    table_idx, row_idx, source_row_key, row_shape, promotion_status, payload
)
select
    'luminari-DISABILITY-SERVICES-RESOURCE-DIRECTORY-2026 (2).docx',
    'f208b77fa1f7a3f0696eecd34f06f2325994f0c6bdf467231515ac97b5165c33',
    'sha256',
    'domain_resource_directory',
    'disability-services-jurisdiction',
    1,
    x.ordinality::integer,
    'f208b77fa1f7a3f0696eecd34f06f2325994f0c6bdf467231515ac97b5165c33:jurisdiction:' || lower(x.payload->>'state_code'),
    'state_directory_entry',
    'candidate',
    x.payload
from jsonb_array_elements(
$$[
  {"resource_category":"disability_services","subcategory":"STATE_TERRITORY_INFRASTRUCTURE","jurisdiction_level":"state","state_code":"AK","jurisdiction":"Alaska","jurisdiction_key":"alaska","agency_count":3,"agencies":[{"resource_id":"DIS-AK-PA","name":"Disability Law Center of Alaska (DLC)","verification_status":"VERIFIED","Service Type":"State Protection & Advocacy (P&A) system (DD, PAIMI, PAIR)","Address":"3330 Arctic Blvd., Suite 103, Anchorage, AK 99503","Phone":"(907) 565-1002","Email":"akpa@dlcak.org","Website":"https://www.dlcak.org/","Filing / Complaint Portal":"https://www.dlcak.org/intake","What it does for people":"Federally-mandated state Protection & Advocacy system for people with disabilities, providing legal representation, systemic advocacy, and abuse/neglect investigation.\n⚠ STATE-SPECIFIC SOL: ADA/discrimination: 300 days for administrative filing with Alaska State Commission for Human Rights per AS 18.80.110 and 6 AAC 30.230; 2 years for private civil actions per AS 09.10.070.\nIDEA due process: 12 months from the date of the school district's written notice of decision per Alaska Statute § 14.30.193(a).","Statutory Authority":"Federal: 42 U.S.C. § 15043 (PADD), 42 U.S.C. § 10801 (PAIMI), 29 U.S.C. § 794e (PAIR)"},{"resource_id":"DIS-AK-DDC","name":"Governor's Council on Disabilities and Special Education (GCDSE)","verification_status":"VERIFIED","Service Type":"State Developmental Disabilities Council","Address":"550 W 7th Ave, Suite 1220, Anchorage, AK 99501","Phone":"(907) 269-8990","Email":"gcdse@alaska.gov","Website":"https://health.alaska.gov/gcdse/","Filing / Complaint Portal":"Advisory/planning body — no complaint portal","What it does for people":"State DD Council under the DD Act — funds planning, systems change, and advocacy for people with intellectual and developmental disabilities.","Statutory Authority":"Federal: DD Act, 42 U.S.C. § 15025"},{"resource_id":"DIS-AK-VR","name":"Alaska Division of Vocational Rehabilitation (DVR)","verification_status":"VERIFIED","Service Type":"State Vocational Rehabilitation (VR) agency (Title I Rehab Act / WIOA)","Address":"1111 W. 8th St., Ste 210, Juneau, AK 99801 (Mailing: PO Box 115516, Juneau, AK 99811-5516)","Phone":"(907) 465-2814","Email":"Not published — use official site contact form","Website":"https://labor.alaska.gov/dvr/","Filing / Complaint Portal":"https://labor.alaska.gov/dvr/policies/4-appeals-request.htm","What it does for people":"State VR agency providing employment services, training, and supports for individuals with disabilities under Title I of the Rehabilitation Act, as amended by WIOA.\nSeparate blind agency: N/A — combined VR agency serves blind consumers","Statutory Authority":"Federal: Title I Rehabilitation Act, 29 U.S.C. § 720 et seq.; WIOA (Pub. L. 113-128)"}],"verification_status":"VERIFIED","last_verified":"2026-07-13","verification_notes":"Verification notes: The Disability Law Center of Alaska is the designated P&A. The Governor's Council on Disabilities and Special Education serves as the DD Council. Vocational Rehabilitation is a combined agency under the Department of Labor. Alaska has a state-specific 12-month SOL for IDEA due process and a 300-day limit for human rights complaints.","source_doc":"luminari-DISABILITY-SERVICES-RESOURCE-DIRECTORY-2026 (2).docx","source_anchor":"TIER 3/4 — AK — Alaska","revision":"2026-pass-3"}
]$$::jsonb
) with ordinality as x(payload, ordinality)
on conflict (source_row_key) do update set
    payload=excluded.payload,
    row_shape=excluded.row_shape,
    promotion_status=excluded.promotion_status,
    source_hash_raw=excluded.source_hash_raw,
    source_hash_kind=excluded.source_hash_kind,
    updated_at=now();

-- The full 56-jurisdiction payload is loaded by the production companion migration generated from the authoritative DOCX.
-- This repository migration establishes the source registration, row shape, identity doctrine, and idempotent insert pattern.

commit;
