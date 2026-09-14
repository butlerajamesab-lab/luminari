-- Reviewed application packet: 24 individually checked Colorado source records.
-- No extractor, source/candidate overwrite, identity merge or gate promotion.
-- Requires 20260914213715_resource_transcription_correction_ledger.sql first.
-- This transaction either validates and appends all 24 exact receipts or aborts.
-- Exact replay is permitted only while every receipt remains current/applicable.
begin isolation level serializable;
set local role service_role;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
select pg_advisory_xact_lock(hashtextextended('colorado_resource_transcription_20260914',0));
do $apply_transcription$
declare
  v_receipts jsonb := $resource_transcription_receipts_20260914$[
  {
    "civic_object_uid": "corpus:abd611213bb84ef8ae7a04f7d262b4713acc422f98695600c6481fb06db21fd0",
    "object_ref": "abd611213bb84ef8ae7a04f7d262b4713acc422f98695600c6481fb06db21fd0",
    "run_id": "3e8da646-0fa0-4991-9cf1-df3e4de1e028",
    "artifact_key": "State Enriched Registry bucket/luminari-colorado-ENRICHED-PASS2-2026.docx",
    "source_content_sha256": "8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d",
    "source_candidate_hash": "df6ddecccf6c09664d367b93d27d401be24c1954075f2f5fe5ebc2096374745e",
    "source_locator": "lines:52-56",
    "operation": "correct",
    "supersedes_revision_id": null,
    "resource_entity_id": "0f09d5ac-6bd6-c7a1-1619-7cd2f9a822a2",
    "before_fields": {
      "address": null,
      "phone": null,
      "apply_notes": "Apply at peak.colorado.gov (online — functional). ABAWD work requirements active. Each of Colorado's 64 counties administers locally. Denver SNAP: 720-944-3666. El Paso County: 719-444-5445. Food Bank of the Rockies (Denver/Metro) 10700 E 45th Ave, Denver, CO 80239",
      "description": "Apply at peak.colorado.gov (online — functional). ABAWD work requirements active. Each of Colorado's 64 counties administers locally. Denver SNAP: 720-944-3666. El Paso County: 719-444-5445. Food Bank of the Rockies (Denver/Metro) 10700 E 45th Ave, Denver, CO 80239",
      "name": "📞 303-866-5700 · peak.colorado.gov",
      "organization_name": "📞 303-866-5700 · peak.colorado.gov"
    },
    "after_fields": {
      "address": "1575 Sherman St, Denver, CO 80203",
      "phone": "303-866-5700",
      "apply_notes": "Apply at peak.colorado.gov (online — functional). ABAWD work requirements active. Each of Colorado's 64 counties administers locally. Denver SNAP: 720-944-3666. El Paso County: 719-444-5445.",
      "description": "Apply at peak.colorado.gov (online — functional). ABAWD work requirements active. Each of Colorado's 64 counties administers locally. Denver SNAP: 720-944-3666. El Paso County: 719-444-5445.",
      "name": "Colorado SNAP / Food Assistance (CDHS)",
      "organization_name": "Colorado SNAP / Food Assistance (CDHS)"
    },
    "source_span": {
      "part": "word/document.xml",
      "paragraph_start": 67,
      "paragraph_end": 71,
      "xpath_start": "/w:document/w:body/w:tbl[11]/w:tr/w:tc/w:p[1]",
      "xpath_end": "/w:document/w:body/w:tbl[11]/w:tr/w:tc/w:p[5]"
    },
    "source_text": "Colorado SNAP / Food Assistance (CDHS)\n1575 Sherman St, Denver, CO 80203\n📞 303-866-5700  ·  peak.colorado.gov\nEligibility: Income < 130% FPL. Administered by Colorado Dept of Human Services (CDHS) through county Departments of Social/Human Services.\nApply / Notes: Apply at peak.colorado.gov (online — functional). ABAWD work requirements active. Each of Colorado's 64 counties administers locally. Denver SNAP: 720-944-3666. El Paso County: 719-444-5445.",
    "review_ledger_sha256": "3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa",
    "reviewed_by": "codex_individual_source_review_20260914",
    "review_method": "individual_source_transcription",
    "review_scope": "source_assertion_only",
    "review_note": "Individually reviewed source transcription only. Agency identity, contact validity, eligibility, legal assertions and service suitability are not independently verified. Classification remains separately proposed.",
    "revision_id": "f225f057-cc7a-9e9f-45b7-99481d03f0f6"
  },
  {
    "civic_object_uid": "corpus:54cd7af7466722508c84663ab9011aadc03d62ba8d22ac68e8897900b636571b",
    "object_ref": "54cd7af7466722508c84663ab9011aadc03d62ba8d22ac68e8897900b636571b",
    "run_id": "3e8da646-0fa0-4991-9cf1-df3e4de1e028",
    "artifact_key": "State Enriched Registry bucket/luminari-colorado-ENRICHED-PASS2-2026.docx",
    "source_content_sha256": "8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d",
    "source_candidate_hash": "c89ef47f225cca26867761450b92e4b5915c8586bd82a53838450d5683e6e11a",
    "source_locator": "lines:58-62",
    "operation": "correct",
    "supersedes_revision_id": null,
    "resource_entity_id": "5e760a0e-4300-c000-958a-df72f756d4c9",
    "before_fields": {
      "address": null,
      "phone": null,
      "apply_notes": "foodbankrockies.org — largest food bank in Colorado. Drives multiple SNAP enrollment assistance events. Care and Share Food Bank (Colorado Springs / Southern CO) 2605 Preamble Pt, Colorado Springs, CO 80915",
      "description": "foodbankrockies.org — largest food bank in Colorado. Drives multiple SNAP enrollment assistance events. Care and Share Food Bank (Colorado Springs / Southern CO) 2605 Preamble Pt, Colorado Springs, CO 80915",
      "name": "📞 303-371-9250 · foodbankrockies.org",
      "organization_name": "📞 303-371-9250 · foodbankrockies.org"
    },
    "after_fields": {
      "address": "10700 E 45th Ave, Denver, CO 80239",
      "phone": "303-371-9250",
      "apply_notes": "foodbankrockies.org — largest food bank in Colorado. Drives multiple SNAP enrollment assistance events.",
      "description": "foodbankrockies.org — largest food bank in Colorado. Drives multiple SNAP enrollment assistance events.",
      "name": "Food Bank of the Rockies (Denver/Metro)",
      "organization_name": "Food Bank of the Rockies (Denver/Metro)"
    },
    "source_span": {
      "part": "word/document.xml",
      "paragraph_start": 73,
      "paragraph_end": 77,
      "xpath_start": "/w:document/w:body/w:tbl[12]/w:tr/w:tc/w:p[1]",
      "xpath_end": "/w:document/w:body/w:tbl[12]/w:tr/w:tc/w:p[5]"
    },
    "source_text": "Food Bank of the Rockies (Denver/Metro)\n10700 E 45th Ave, Denver, CO 80239\n📞 303-371-9250  ·  foodbankrockies.org\nEligibility: Metro Denver, northern Colorado, and Wyoming — 31-county service area, 800+ partner agencies.\nApply / Notes: foodbankrockies.org — largest food bank in Colorado. Drives multiple SNAP enrollment assistance events.",
    "review_ledger_sha256": "3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa",
    "reviewed_by": "codex_individual_source_review_20260914",
    "review_method": "individual_source_transcription",
    "review_scope": "source_assertion_only",
    "review_note": "Individually reviewed source transcription only. Agency identity, contact validity, eligibility, legal assertions and service suitability are not independently verified. Classification remains separately proposed.",
    "revision_id": "abd3b529-5276-f621-5b8a-f7791715442f"
  },
  {
    "civic_object_uid": "corpus:a355e33e849887947415a041e23078d225248ea5a8e376f5ae0e201c994b0f4a",
    "object_ref": "a355e33e849887947415a041e23078d225248ea5a8e376f5ae0e201c994b0f4a",
    "run_id": "3e8da646-0fa0-4991-9cf1-df3e4de1e028",
    "artifact_key": "State Enriched Registry bucket/luminari-colorado-ENRICHED-PASS2-2026.docx",
    "source_content_sha256": "8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d",
    "source_candidate_hash": "1cc1c53f579a7af80d2967ee35a316bf17ea077e4bb0d1e98cdbfa9063b3dd5e",
    "source_locator": "lines:64-68",
    "operation": "correct",
    "supersedes_revision_id": null,
    "resource_entity_id": "c67024c3-b5cc-cc49-9369-dac0ef93cd70",
    "before_fields": {
      "address": null,
      "phone": null,
      "apply_notes": "careandshare.org — primary food bank for southern Colorado. Also routes to Western Colorado Community Foundation for rural western slope food access. WIC Colorado 303-692-2300, cdphe.colorado.gov/wic, Pregnant, postpartum women, infants, children under 5 — income < 185% FPL. cdphe.colorado.gov/wic — find local WIC site. Bilingual (Spanish) services at most Front Range clinics.",
      "description": "careandshare.org — primary food bank for southern Colorado. Also routes to Western Colorado Community Foundation for rural western slope food access. WIC Colorado 303-692-2300, cdphe.colorado.gov/wic, Pregnant, postpartum women, infants, children under 5 — income < 185% FPL. cdphe.colorado.gov/wic — find local WIC site. Bilingual (Spanish) services at most Front Range clinics.",
      "name": "📞 719-528-1247 · careandshare.org",
      "organization_name": "📞 719-528-1247 · careandshare.org"
    },
    "after_fields": {
      "address": "2605 Preamble Pt, Colorado Springs, CO 80915",
      "phone": "719-528-1247",
      "apply_notes": "careandshare.org — primary food bank for southern Colorado. Also routes to Western Colorado Community Foundation for rural western slope food access.",
      "description": "careandshare.org — primary food bank for southern Colorado. Also routes to Western Colorado Community Foundation for rural western slope food access.",
      "name": "Care and Share Food Bank (Colorado Springs / Southern CO)",
      "organization_name": "Care and Share Food Bank (Colorado Springs / Southern CO)"
    },
    "source_span": {
      "part": "word/document.xml",
      "paragraph_start": 79,
      "paragraph_end": 83,
      "xpath_start": "/w:document/w:body/w:tbl[13]/w:tr/w:tc/w:p[1]",
      "xpath_end": "/w:document/w:body/w:tbl[13]/w:tr/w:tc/w:p[5]"
    },
    "source_text": "Care and Share Food Bank (Colorado Springs / Southern CO)\n2605 Preamble Pt, Colorado Springs, CO 80915\n📞 719-528-1247  ·  careandshare.org\nEligibility: 21-county service area in southern Colorado including Pueblo, Alamosa, and El Paso County.\nApply / Notes: careandshare.org — primary food bank for southern Colorado. Also routes to Western Colorado Community Foundation for rural western slope food access.",
    "review_ledger_sha256": "3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa",
    "reviewed_by": "codex_individual_source_review_20260914",
    "review_method": "individual_source_transcription",
    "review_scope": "source_assertion_only",
    "review_note": "Individually reviewed source transcription only. Agency identity, contact validity, eligibility, legal assertions and service suitability are not independently verified. Classification remains separately proposed.",
    "revision_id": "b6d91b7d-ea35-5993-4753-f67a53beaf94"
  },
  {
    "civic_object_uid": "corpus:c463cababdd461a1e90eb8b8b7dac39f194f2488a0283c9a211a4eebfb1ab451",
    "object_ref": "c463cababdd461a1e90eb8b8b7dac39f194f2488a0283c9a211a4eebfb1ab451",
    "run_id": "3e8da646-0fa0-4991-9cf1-df3e4de1e028",
    "artifact_key": "State Enriched Registry bucket/luminari-colorado-ENRICHED-PASS2-2026.docx",
    "source_content_sha256": "8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d",
    "source_candidate_hash": "87c5f11255053414f7f10054f0a7c8048be5d0ae384bf46c0b0e012c2cdd2e82",
    "source_locator": "lines:77-81",
    "operation": "correct",
    "supersedes_revision_id": null,
    "resource_entity_id": "d67f54cf-f41b-19e2-a8f8-6fb6dabd8954",
    "before_fields": {
      "address": null,
      "phone": null,
      "apply_notes": "peak.colorado.gov — apply online. Managed care plans (RAEs): Regional Accountable Entities cover specific geographic regions. Undocumented immigrants: limited emergency Medicaid only — route to Denver Health for primary care. Denver Health (Denver Safety Net — FQHC + Hospital) 777 Bannock St, Denver, CO 80204",
      "description": "peak.colorado.gov — apply online. Managed care plans (RAEs): Regional Accountable Entities cover specific geographic regions. Undocumented immigrants: limited emergency Medicaid only — route to Denver Health for primary care. Denver Health (Denver Safety Net — FQHC + Hospital) 777 Bannock St, Denver, CO 80204",
      "name": "📞 800-221-3943 · colorado.gov/hcpf",
      "organization_name": "📞 800-221-3943 · colorado.gov/hcpf"
    },
    "after_fields": {
      "address": "1570 Grant St, Denver, CO 80203",
      "phone": "800-221-3943",
      "apply_notes": "peak.colorado.gov — apply online. Managed care plans (RAEs): Regional Accountable Entities cover specific geographic regions. Undocumented immigrants: limited emergency Medicaid only — route to Denver Health for primary care.",
      "description": "peak.colorado.gov — apply online. Managed care plans (RAEs): Regional Accountable Entities cover specific geographic regions. Undocumented immigrants: limited emergency Medicaid only — route to Denver Health for primary care.",
      "name": "Health First Colorado (Medicaid — HCPF)",
      "organization_name": "Health First Colorado (Medicaid — HCPF)"
    },
    "source_span": {
      "part": "word/document.xml",
      "paragraph_start": 93,
      "paragraph_end": 97,
      "xpath_start": "/w:document/w:body/w:tbl[15]/w:tr/w:tc/w:p[1]",
      "xpath_end": "/w:document/w:body/w:tbl[15]/w:tr/w:tc/w:p[5]"
    },
    "source_text": "Health First Colorado (Medicaid — HCPF)\n1570 Grant St, Denver, CO 80203\n📞 800-221-3943  ·  colorado.gov/hcpf\nEligibility: Adults 19–64 to 138% FPL. NO coverage gap. Expanded 2013. Comprehensive benefits including vision and dental.\nApply / Notes: peak.colorado.gov — apply online. Managed care plans (RAEs): Regional Accountable Entities cover specific geographic regions. Undocumented immigrants: limited emergency Medicaid only — route to Denver Health for primary care.",
    "review_ledger_sha256": "3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa",
    "reviewed_by": "codex_individual_source_review_20260914",
    "review_method": "individual_source_transcription",
    "review_scope": "source_assertion_only",
    "review_note": "Individually reviewed source transcription only. Agency identity, contact validity, eligibility, legal assertions and service suitability are not independently verified. Classification remains separately proposed.",
    "revision_id": "5a62b4cb-4c5b-c3e1-6a8d-17968506a6ad"
  },
  {
    "civic_object_uid": "corpus:2efedc7ab4c238911662690ecbdab4d235654191b241c8fcac94e3a7ca73a7f0",
    "object_ref": "2efedc7ab4c238911662690ecbdab4d235654191b241c8fcac94e3a7ca73a7f0",
    "run_id": "3e8da646-0fa0-4991-9cf1-df3e4de1e028",
    "artifact_key": "State Enriched Registry bucket/luminari-colorado-ENRICHED-PASS2-2026.docx",
    "source_content_sha256": "8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d",
    "source_candidate_hash": "93c556f1f6a69ecc992a6a0ef043afdfea59d89545f3ee8334b5d1642bb718bf",
    "source_locator": "lines:83-87",
    "operation": "correct",
    "supersedes_revision_id": null,
    "resource_entity_id": "7d90045f-b310-95b3-af12-dd243b7570e5",
    "before_fields": {
      "address": null,
      "phone": null,
      "apply_notes": "denverhealth.org — Level 1 trauma center + comprehensive FQHC network. Primary safety net for uninsured/underinsured Denver. Financial assistance covers income < 250% FPL at reduced cost. All language services available. UC Health / University of Colorado Hospital 12605 E 16th Ave, Aurora, CO 80045",
      "description": "denverhealth.org — Level 1 trauma center + comprehensive FQHC network. Primary safety net for uninsured/underinsured Denver. Financial assistance covers income < 250% FPL at reduced cost. All language services available. UC Health / University of Colorado Hospital 12605 E 16th Ave, Aurora, CO 80045",
      "name": "📞 303-436-6000 · denverhealth.org",
      "organization_name": "📞 303-436-6000 · denverhealth.org"
    },
    "after_fields": {
      "address": "777 Bannock St, Denver, CO 80204",
      "phone": "303-436-6000",
      "apply_notes": "denverhealth.org — Level 1 trauma center + comprehensive FQHC network. Primary safety net for uninsured/underinsured Denver. Financial assistance covers income < 250% FPL at reduced cost. All language services available.",
      "description": "denverhealth.org — Level 1 trauma center + comprehensive FQHC network. Primary safety net for uninsured/underinsured Denver. Financial assistance covers income < 250% FPL at reduced cost. All language services available.",
      "name": "Denver Health (Denver Safety Net — FQHC + Hospital)",
      "organization_name": "Denver Health (Denver Safety Net — FQHC + Hospital)"
    },
    "source_span": {
      "part": "word/document.xml",
      "paragraph_start": 99,
      "paragraph_end": 103,
      "xpath_start": "/w:document/w:body/w:tbl[16]/w:tr/w:tc/w:p[1]",
      "xpath_end": "/w:document/w:body/w:tbl[16]/w:tr/w:tc/w:p[5]"
    },
    "source_text": "Denver Health (Denver Safety Net — FQHC + Hospital)\n777 Bannock St, Denver, CO 80204\n📞 303-436-6000  ·  denverhealth.org\nEligibility: Denver residents — public hospital + 11 FQHCs; charity care for uninsured; sliding scale.\nApply / Notes: denverhealth.org — Level 1 trauma center + comprehensive FQHC network. Primary safety net for uninsured/underinsured Denver. Financial assistance covers income < 250% FPL at reduced cost. All language services available.",
    "review_ledger_sha256": "3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa",
    "reviewed_by": "codex_individual_source_review_20260914",
    "review_method": "individual_source_transcription",
    "review_scope": "source_assertion_only",
    "review_note": "Individually reviewed source transcription only. Agency identity, contact validity, eligibility, legal assertions and service suitability are not independently verified. Classification remains separately proposed.",
    "revision_id": "17680f94-b446-0ea9-c83d-f451282a8dd2"
  },
  {
    "civic_object_uid": "corpus:1fde66e2f4f8077f0da18c1bb5c4cb800a53805910e0d085e2ab1879639f70eb",
    "object_ref": "1fde66e2f4f8077f0da18c1bb5c4cb800a53805910e0d085e2ab1879639f70eb",
    "run_id": "3e8da646-0fa0-4991-9cf1-df3e4de1e028",
    "artifact_key": "State Enriched Registry bucket/luminari-colorado-ENRICHED-PASS2-2026.docx",
    "source_content_sha256": "8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d",
    "source_candidate_hash": "5de2bd88599546b57132db9740703f44357b9c07a05c0b71aa72a6c95a5c1d5e",
    "source_locator": "lines:89-93",
    "operation": "correct",
    "supersedes_revision_id": null,
    "resource_entity_id": "50dc8a17-e09c-84e9-8509-8e3a95fd3c74",
    "before_fields": {
      "address": null,
      "phone": null,
      "apply_notes": "uchealth.org — financial assistance for income < 250% FPL. Also Children's Hospital Colorado (720-777-1234) for pediatric care. Colorado Community Health Network (FQHCs Statewide) 1580 Logan St Ste 510, Denver, CO 80203",
      "description": "uchealth.org — financial assistance for income < 250% FPL. Also Children's Hospital Colorado (720-777-1234) for pediatric care. Colorado Community Health Network (FQHCs Statewide) 1580 Logan St Ste 510, Denver, CO 80203",
      "name": "📞 720-848-0000 · uchealth.org",
      "organization_name": "📞 720-848-0000 · uchealth.org"
    },
    "after_fields": {
      "address": "12605 E 16th Ave, Aurora, CO 80045",
      "phone": "720-848-0000",
      "apply_notes": "uchealth.org — financial assistance for income < 250% FPL. Also Children's Hospital Colorado (720-777-1234) for pediatric care.",
      "description": "uchealth.org — financial assistance for income < 250% FPL. Also Children's Hospital Colorado (720-777-1234) for pediatric care.",
      "name": "UC Health / University of Colorado Hospital",
      "organization_name": "UC Health / University of Colorado Hospital"
    },
    "source_span": {
      "part": "word/document.xml",
      "paragraph_start": 105,
      "paragraph_end": 109,
      "xpath_start": "/w:document/w:body/w:tbl[17]/w:tr/w:tc/w:p[1]",
      "xpath_end": "/w:document/w:body/w:tbl[17]/w:tr/w:tc/w:p[5]"
    },
    "source_text": "UC Health / University of Colorado Hospital\n12605 E 16th Ave, Aurora, CO 80045\n📞 720-848-0000  ·  uchealth.org\nEligibility: Aurora/metro Denver — academic medical center + financial assistance program for uninsured.\nApply / Notes: uchealth.org — financial assistance for income < 250% FPL. Also Children's Hospital Colorado (720-777-1234) for pediatric care.",
    "review_ledger_sha256": "3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa",
    "reviewed_by": "codex_individual_source_review_20260914",
    "review_method": "individual_source_transcription",
    "review_scope": "source_assertion_only",
    "review_note": "Individually reviewed source transcription only. Agency identity, contact validity, eligibility, legal assertions and service suitability are not independently verified. Classification remains separately proposed.",
    "revision_id": "c36311e9-598c-6959-7b1d-a5d27de8eab9"
  },
  {
    "civic_object_uid": "corpus:45602b8f38fa68973f8bb7d1648b1196964bd51fd9c5b76ab72e047201e97230",
    "object_ref": "45602b8f38fa68973f8bb7d1648b1196964bd51fd9c5b76ab72e047201e97230",
    "run_id": "3e8da646-0fa0-4991-9cf1-df3e4de1e028",
    "artifact_key": "State Enriched Registry bucket/luminari-colorado-ENRICHED-PASS2-2026.docx",
    "source_content_sha256": "8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d",
    "source_candidate_hash": "bc1247d02de41f51b4112f92b163fa5246a689b06e392f33bdb845140779b9f3",
    "source_locator": "lines:95-100",
    "operation": "correct",
    "supersedes_revision_id": null,
    "resource_entity_id": "d3ae4c03-912d-34f5-6c4b-8d0c6d04c88e",
    "before_fields": {
      "address": null,
      "phone": null,
      "apply_notes": "cchn.org — find nearest FQHC: findahealthcenter.hrsa.gov. Key: Mountain Family Health Centers (western slope: 970-945-2840), Salud Family Health (northern CO: 970-352-6911), Clinica Tepeyac (Denver Latino: 303-296-0771). Housing & Rent Assistance Colorado Division of Housing (DOH) / CDHS 1313 Sherman St, Denver, CO 80203",
      "description": "cchn.org — find nearest FQHC: findahealthcenter.hrsa.gov. Key: Mountain Family Health Centers (western slope: 970-945-2840), Salud Family Health (northern CO: 970-352-6911), Clinica Tepeyac (Denver Latino: 303-296-0771). Housing & Rent Assistance Colorado Division of Housing (DOH) / CDHS 1313 Sherman St, Denver, CO 80203",
      "name": "📞 303-861-5165 · cchn.org",
      "organization_name": "📞 303-861-5165 · cchn.org"
    },
    "after_fields": {
      "address": "1580 Logan St Ste 510, Denver, CO 80203",
      "phone": "303-861-5165",
      "apply_notes": "cchn.org — find nearest FQHC: findahealthcenter.hrsa.gov. Key: Mountain Family Health Centers (western slope: 970-945-2840), Salud Family Health (northern CO: 970-352-6911), Clinica Tepeyac (Denver Latino: 303-296-0771).",
      "description": "cchn.org — find nearest FQHC: findahealthcenter.hrsa.gov. Key: Mountain Family Health Centers (western slope: 970-945-2840), Salud Family Health (northern CO: 970-352-6911), Clinica Tepeyac (Denver Latino: 303-296-0771).",
      "name": "Colorado Community Health Network (FQHCs Statewide)",
      "organization_name": "Colorado Community Health Network (FQHCs Statewide)"
    },
    "source_span": {
      "part": "word/document.xml",
      "paragraph_start": 111,
      "paragraph_end": 115,
      "xpath_start": "/w:document/w:body/w:tbl[18]/w:tr/w:tc/w:p[1]",
      "xpath_end": "/w:document/w:body/w:tbl[18]/w:tr/w:tc/w:p[5]"
    },
    "source_text": "Colorado Community Health Network (FQHCs Statewide)\n1580 Logan St Ste 510, Denver, CO 80203\n📞 303-861-5165  ·  cchn.org\nEligibility: Anyone regardless of insurance — 20+ FQHCs, 180+ sites statewide; sliding scale.\nApply / Notes: cchn.org — find nearest FQHC: findahealthcenter.hrsa.gov. Key: Mountain Family Health Centers (western slope: 970-945-2840), Salud Family Health (northern CO: 970-352-6911), Clinica Tepeyac (Denver Latino: 303-296-0771).",
    "review_ledger_sha256": "3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa",
    "reviewed_by": "codex_individual_source_review_20260914",
    "review_method": "individual_source_transcription",
    "review_scope": "source_assertion_only",
    "review_note": "Individually reviewed source transcription only. Agency identity, contact validity, eligibility, legal assertions and service suitability are not independently verified. Classification remains separately proposed.",
    "revision_id": "c4ed2491-c577-a61f-e855-93aeb1541f90"
  },
  {
    "civic_object_uid": "corpus:492fb8e6a38516b5310040d7f2fe946884ed126cf992e36e43b0fe7ac30a0940",
    "object_ref": "492fb8e6a38516b5310040d7f2fe946884ed126cf992e36e43b0fe7ac30a0940",
    "run_id": "3e8da646-0fa0-4991-9cf1-df3e4de1e028",
    "artifact_key": "State Enriched Registry bucket/luminari-colorado-ENRICHED-PASS2-2026.docx",
    "source_content_sha256": "8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d",
    "source_candidate_hash": "7b2de1f700079f3482063c441113d38cb79cf9602f04c48f684e85b36442e673",
    "source_locator": "lines:102-106",
    "operation": "correct",
    "supersedes_revision_id": null,
    "resource_entity_id": "cb72cc25-099b-e632-6667-4069496ba145",
    "before_fields": {
      "address": null,
      "phone": null,
      "apply_notes": "cdola.colorado.gov/housing — state-level coordination. Denver Office of Housing Stability (HOST): 720-913-1600. Colorado Springs Housing Authority: 719-323-6550. Colorado Coalition for the Homeless (CCH) 2111 Champa St, Denver, CO 80205",
      "description": "cdola.colorado.gov/housing — state-level coordination. Denver Office of Housing Stability (HOST): 720-913-1600. Colorado Springs Housing Authority: 719-323-6550. Colorado Coalition for the Homeless (CCH) 2111 Champa St, Denver, CO 80205",
      "name": "📞 303-864-7810 · cdola.colorado.gov/housing",
      "organization_name": "📞 303-864-7810 · cdola.colorado.gov/housing"
    },
    "after_fields": {
      "address": "1313 Sherman St, Denver, CO 80203",
      "phone": "303-864-7810",
      "apply_notes": "cdola.colorado.gov/housing — state-level coordination. Denver Office of Housing Stability (HOST): 720-913-1600. Colorado Springs Housing Authority: 719-323-6550.",
      "description": "cdola.colorado.gov/housing — state-level coordination. Denver Office of Housing Stability (HOST): 720-913-1600. Colorado Springs Housing Authority: 719-323-6550.",
      "name": "Colorado Division of Housing (DOH) / CDHS",
      "organization_name": "Colorado Division of Housing (DOH) / CDHS"
    },
    "source_span": {
      "part": "word/document.xml",
      "paragraph_start": 119,
      "paragraph_end": 123,
      "xpath_start": "/w:document/w:body/w:tbl[19]/w:tr/w:tc/w:p[1]",
      "xpath_end": "/w:document/w:body/w:tbl[19]/w:tr/w:tc/w:p[5]"
    },
    "source_text": "Colorado Division of Housing (DOH) / CDHS\n1313 Sherman St, Denver, CO 80203\n📞 303-864-7810  ·  cdola.colorado.gov/housing\nEligibility: Low-income Colorado renters — emergency rental assistance, HOME program, state-funded emergency housing.\nApply / Notes: cdola.colorado.gov/housing — state-level coordination. Denver Office of Housing Stability (HOST): 720-913-1600. Colorado Springs Housing Authority: 719-323-6550.",
    "review_ledger_sha256": "3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa",
    "reviewed_by": "codex_individual_source_review_20260914",
    "review_method": "individual_source_transcription",
    "review_scope": "source_assertion_only",
    "review_note": "Individually reviewed source transcription only. Agency identity, contact validity, eligibility, legal assertions and service suitability are not independently verified. Classification remains separately proposed.",
    "revision_id": "90ea56d9-d1bc-4087-bf34-47028d54ea0d"
  },
  {
    "civic_object_uid": "corpus:eec4c218908a05c496bb3b0a0bfce9294722eea4f840af0d97894b219bc3e4bd",
    "object_ref": "eec4c218908a05c496bb3b0a0bfce9294722eea4f840af0d97894b219bc3e4bd",
    "run_id": "3e8da646-0fa0-4991-9cf1-df3e4de1e028",
    "artifact_key": "State Enriched Registry bucket/luminari-colorado-ENRICHED-PASS2-2026.docx",
    "source_content_sha256": "8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d",
    "source_candidate_hash": "3a57b8dc1bafbbff1bcd63a2fa794ee5a20823e429f7b772a75e709fb660b881",
    "source_locator": "lines:108-112",
    "operation": "correct",
    "supersedes_revision_id": null,
    "resource_entity_id": "aac4dead-77dd-3411-f6b5-b4cecb3dab59",
    "before_fields": {
      "address": null,
      "phone": null,
      "apply_notes": "coloradocoalition.org — largest homeless services provider in Colorado. FQHC services embedded. Legal clinic on-site. Key entry point for Denver's unhoused population. Colorado Legal Services (CLS) 1905 Sherman St Ste 400, Denver, CO 80203",
      "description": "coloradocoalition.org — largest homeless services provider in Colorado. FQHC services embedded. Legal clinic on-site. Key entry point for Denver's unhoused population. Colorado Legal Services (CLS) 1905 Sherman St Ste 400, Denver, CO 80203",
      "name": "📞 303-595-9561 · coloradocoalition.org",
      "organization_name": "📞 303-595-9561 · coloradocoalition.org"
    },
    "after_fields": {
      "address": "2111 Champa St, Denver, CO 80205",
      "phone": "303-595-9561",
      "apply_notes": "coloradocoalition.org — largest homeless services provider in Colorado. FQHC services embedded. Legal clinic on-site. Key entry point for Denver's unhoused population.",
      "description": "coloradocoalition.org — largest homeless services provider in Colorado. FQHC services embedded. Legal clinic on-site. Key entry point for Denver's unhoused population.",
      "name": "Colorado Coalition for the Homeless (CCH)",
      "organization_name": "Colorado Coalition for the Homeless (CCH)"
    },
    "source_span": {
      "part": "word/document.xml",
      "paragraph_start": 125,
      "paragraph_end": 129,
      "xpath_start": "/w:document/w:body/w:tbl[20]/w:tr/w:tc/w:p[1]",
      "xpath_end": "/w:document/w:body/w:tbl[20]/w:tr/w:tc/w:p[5]"
    },
    "source_text": "Colorado Coalition for the Homeless (CCH)\n2111 Champa St, Denver, CO 80205\n📞 303-595-9561  ·  coloradocoalition.org\nEligibility: Metro Denver unhoused and at-risk individuals — shelter, transitional housing, permanent supportive housing, health care (FQHC), legal services.\nApply / Notes: coloradocoalition.org — largest homeless services provider in Colorado. FQHC services embedded. Legal clinic on-site. Key entry point for Denver's unhoused population.",
    "review_ledger_sha256": "3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa",
    "reviewed_by": "codex_individual_source_review_20260914",
    "review_method": "individual_source_transcription",
    "review_scope": "source_assertion_only",
    "review_note": "Individually reviewed source transcription only. Agency identity, contact validity, eligibility, legal assertions and service suitability are not independently verified. Classification remains separately proposed.",
    "revision_id": "a743bd07-0e70-41e1-7f26-127e9f336c8d"
  },
  {
    "civic_object_uid": "corpus:293dcdb82a759a9c7f6f10aa8cd96300d03fbc2dfefadfa1175d70210231d2d0",
    "object_ref": "293dcdb82a759a9c7f6f10aa8cd96300d03fbc2dfefadfa1175d70210231d2d0",
    "run_id": "3e8da646-0fa0-4991-9cf1-df3e4de1e028",
    "artifact_key": "State Enriched Registry bucket/luminari-colorado-ENRICHED-PASS2-2026.docx",
    "source_content_sha256": "8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d",
    "source_candidate_hash": "51ccf98e1dfc657636d7d66446787a16b532f4582ad99e74eba88ea922a819ec",
    "source_locator": "lines:114-118",
    "operation": "correct",
    "supersedes_revision_id": null,
    "resource_entity_id": "0843bdf8-015f-ae3a-7c84-638d2d810a9c",
    "before_fields": {
      "address": null,
      "phone": null,
      "apply_notes": "coloradolegalservices.org — statewide legal aid with offices in Denver, Pueblo, Grand Junction, Colorado Springs, Fort Collins, Alamosa. Western slope: Grand Junction office (970-242-6121). Denver Rescue Mission 6100 Smith Rd, Denver, CO 80216",
      "description": "coloradolegalservices.org — statewide legal aid with offices in Denver, Pueblo, Grand Junction, Colorado Springs, Fort Collins, Alamosa. Western slope: Grand Junction office (970-242-6121). Denver Rescue Mission 6100 Smith Rd, Denver, CO 80216",
      "name": "📞 303-837-1313 · coloradolegalservices.org",
      "organization_name": "📞 303-837-1313 · coloradolegalservices.org"
    },
    "after_fields": {
      "address": "1905 Sherman St Ste 400, Denver, CO 80203",
      "phone": "303-837-1313",
      "apply_notes": "coloradolegalservices.org — statewide legal aid with offices in Denver, Pueblo, Grand Junction, Colorado Springs, Fort Collins, Alamosa. Western slope: Grand Junction office (970-242-6121).",
      "description": "coloradolegalservices.org — statewide legal aid with offices in Denver, Pueblo, Grand Junction, Colorado Springs, Fort Collins, Alamosa. Western slope: Grand Junction office (970-242-6121).",
      "name": "Colorado Legal Services (CLS)",
      "organization_name": "Colorado Legal Services (CLS)"
    },
    "source_span": {
      "part": "word/document.xml",
      "paragraph_start": 131,
      "paragraph_end": 135,
      "xpath_start": "/w:document/w:body/w:tbl[21]/w:tr/w:tc/w:p[1]",
      "xpath_end": "/w:document/w:body/w:tbl[21]/w:tr/w:tc/w:p[5]"
    },
    "source_text": "Colorado Legal Services (CLS)\n1905 Sherman St Ste 400, Denver, CO 80203\n📞 303-837-1313  ·  coloradolegalservices.org\nEligibility: Statewide income-qualified — housing, family, benefits, DV, consumer, immigration; rural outreach.\nApply / Notes: coloradolegalservices.org — statewide legal aid with offices in Denver, Pueblo, Grand Junction, Colorado Springs, Fort Collins, Alamosa. Western slope: Grand Junction office (970-242-6121).",
    "review_ledger_sha256": "3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa",
    "reviewed_by": "codex_individual_source_review_20260914",
    "review_method": "individual_source_transcription",
    "review_scope": "source_assertion_only",
    "review_note": "Individually reviewed source transcription only. Agency identity, contact validity, eligibility, legal assertions and service suitability are not independently verified. Classification remains separately proposed.",
    "revision_id": "cc911494-456a-4d0e-f0af-08582d90ed17"
  },
  {
    "civic_object_uid": "corpus:d84ce4dc423d0191b01880984d5043412713f45f017a93fe9291c7187265aef4",
    "object_ref": "d84ce4dc423d0191b01880984d5043412713f45f017a93fe9291c7187265aef4",
    "run_id": "3e8da646-0fa0-4991-9cf1-df3e4de1e028",
    "artifact_key": "State Enriched Registry bucket/luminari-colorado-ENRICHED-PASS2-2026.docx",
    "source_content_sha256": "8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d",
    "source_candidate_hash": "10f8bb6b7d75e2932849e4a7146cd8623f58c217092253adef358a663d2a6283",
    "source_locator": "lines:120-125",
    "operation": "correct",
    "supersedes_revision_id": null,
    "resource_entity_id": "c54c0888-b532-2c51-2045-67cad336b0ef",
    "before_fields": {
      "address": null,
      "phone": null,
      "apply_notes": "denverrescuemission.org — largest emergency shelter in Denver. Routes to HOST and Colorado Coalition for longer-term housing resources. Domestic Violence & Safety Colorado DV Hotline / CCADV 1330 S Federal Blvd, Denver, CO 80219",
      "description": "denverrescuemission.org — largest emergency shelter in Denver. Routes to HOST and Colorado Coalition for longer-term housing resources. Domestic Violence & Safety Colorado DV Hotline / CCADV 1330 S Federal Blvd, Denver, CO 80219",
      "name": "📞 303-297-1815 · denverrescuemission.org",
      "organization_name": "📞 303-297-1815 · denverrescuemission.org"
    },
    "after_fields": {
      "address": "6100 Smith Rd, Denver, CO 80216",
      "phone": "303-297-1815",
      "apply_notes": "denverrescuemission.org — largest emergency shelter in Denver. Routes to HOST and Colorado Coalition for longer-term housing resources.",
      "description": "denverrescuemission.org — largest emergency shelter in Denver. Routes to HOST and Colorado Coalition for longer-term housing resources.",
      "name": "Denver Rescue Mission",
      "organization_name": "Denver Rescue Mission"
    },
    "source_span": {
      "part": "word/document.xml",
      "paragraph_start": 137,
      "paragraph_end": 141,
      "xpath_start": "/w:document/w:body/w:tbl[22]/w:tr/w:tc/w:p[1]",
      "xpath_end": "/w:document/w:body/w:tbl[22]/w:tr/w:tc/w:p[5]"
    },
    "source_text": "Denver Rescue Mission\n6100 Smith Rd, Denver, CO 80216\n📞 303-297-1815  ·  denverrescuemission.org\nEligibility: Metro Denver unhoused adults — emergency shelter, meals, recovery, case management.\nApply / Notes: denverrescuemission.org — largest emergency shelter in Denver. Routes to HOST and Colorado Coalition for longer-term housing resources.",
    "review_ledger_sha256": "3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa",
    "reviewed_by": "codex_individual_source_review_20260914",
    "review_method": "individual_source_transcription",
    "review_scope": "source_assertion_only",
    "review_note": "Individually reviewed source transcription only. Agency identity, contact validity, eligibility, legal assertions and service suitability are not independently verified. Classification remains separately proposed.",
    "revision_id": "ceb45af5-e9a6-4c3c-f768-55c7ff044361"
  },
  {
    "civic_object_uid": "corpus:5842c90893e24e5b42702848b7066f14a53eaa29cb7e09a8f32ef14f0c6a85c4",
    "object_ref": "5842c90893e24e5b42702848b7066f14a53eaa29cb7e09a8f32ef14f0c6a85c4",
    "run_id": "3e8da646-0fa0-4991-9cf1-df3e4de1e028",
    "artifact_key": "State Enriched Registry bucket/luminari-colorado-ENRICHED-PASS2-2026.docx",
    "source_content_sha256": "8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d",
    "source_candidate_hash": "86b1f83f5966bd1e5380f3ad88f391b90cda5956d63b1af5ea99a7d921d653f1",
    "source_locator": "lines:127-131",
    "operation": "correct",
    "supersedes_revision_id": null,
    "resource_entity_id": "e1a97b29-abb4-a0bb-c14f-a64837e622c4",
    "before_fields": {
      "address": null,
      "phone": null,
      "apply_notes": "ccadv.org — Colorado Coalition Against Domestic Violence coordinates 50+ local programs. Also SAVA Center (Denver sexual assault: 303-322-7273). Spanish-language line available. SafeHouse Denver 1649 Downing St, Denver, CO 80218",
      "description": "ccadv.org — Colorado Coalition Against Domestic Violence coordinates 50+ local programs. Also SAVA Center (Denver sexual assault: 303-322-7273). Spanish-language line available. SafeHouse Denver 1649 Downing St, Denver, CO 80218",
      "name": "📞 303-831-9959 · ccadv.org",
      "organization_name": "📞 303-831-9959 · ccadv.org"
    },
    "after_fields": {
      "address": "1330 S Federal Blvd, Denver, CO 80219",
      "phone": "303-831-9959",
      "apply_notes": "ccadv.org — Colorado Coalition Against Domestic Violence coordinates 50+ local programs. Also SAVA Center (Denver sexual assault: 303-322-7273). Spanish-language line available.",
      "description": "ccadv.org — Colorado Coalition Against Domestic Violence coordinates 50+ local programs. Also SAVA Center (Denver sexual assault: 303-322-7273). Spanish-language line available.",
      "name": "Colorado DV Hotline / CCADV",
      "organization_name": "Colorado DV Hotline / CCADV"
    },
    "source_span": {
      "part": "word/document.xml",
      "paragraph_start": 145,
      "paragraph_end": 149,
      "xpath_start": "/w:document/w:body/w:tbl[23]/w:tr/w:tc/w:p[1]",
      "xpath_end": "/w:document/w:body/w:tbl[23]/w:tr/w:tc/w:p[5]"
    },
    "source_text": "Colorado DV Hotline / CCADV\n1330 S Federal Blvd, Denver, CO 80219\n📞 303-831-9959  ·  ccadv.org\nEligibility: 24/7 statewide — crisis, shelter referral, safety planning; multilingual.\nApply / Notes: ccadv.org — Colorado Coalition Against Domestic Violence coordinates 50+ local programs. Also SAVA Center (Denver sexual assault: 303-322-7273). Spanish-language line available.",
    "review_ledger_sha256": "3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa",
    "reviewed_by": "codex_individual_source_review_20260914",
    "review_method": "individual_source_transcription",
    "review_scope": "source_assertion_only",
    "review_note": "Individually reviewed source transcription only. Agency identity, contact validity, eligibility, legal assertions and service suitability are not independently verified. Classification remains separately proposed.",
    "revision_id": "0a32ec75-ea72-d857-5f05-ba6854dcfb29"
  },
  {
    "civic_object_uid": "corpus:e4516767ddc533a03d48849c56b7a902c0c491cdeb9913a48b73bda0bec6ce54",
    "object_ref": "e4516767ddc533a03d48849c56b7a902c0c491cdeb9913a48b73bda0bec6ce54",
    "run_id": "3e8da646-0fa0-4991-9cf1-df3e4de1e028",
    "artifact_key": "State Enriched Registry bucket/luminari-colorado-ENRICHED-PASS2-2026.docx",
    "source_content_sha256": "8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d",
    "source_candidate_hash": "44beecef20aabeb29411889ad1c248ada864d6d5b9352020e72663a62561692a",
    "source_locator": "lines:133-138",
    "operation": "correct",
    "supersedes_revision_id": null,
    "resource_entity_id": "31020d7c-665b-8339-a04a-f5d215ee6539",
    "before_fields": {
      "address": null,
      "phone": null,
      "apply_notes": "safehousedenver.org — primary Denver DV shelter. Routes to Colorado Legal Services for protection orders. Legal Aid Colorado Legal Services (CLS) — Denver 1905 Sherman St Ste 400, Denver, CO 80203",
      "description": "safehousedenver.org — primary Denver DV shelter. Routes to Colorado Legal Services for protection orders. Legal Aid Colorado Legal Services (CLS) — Denver 1905 Sherman St Ste 400, Denver, CO 80203",
      "name": "📞 303-318-9989 · safehousedenver.org",
      "organization_name": "📞 303-318-9989 · safehousedenver.org"
    },
    "after_fields": {
      "address": "1649 Downing St, Denver, CO 80218",
      "phone": "303-318-9989",
      "apply_notes": "safehousedenver.org — primary Denver DV shelter. Routes to Colorado Legal Services for protection orders.",
      "description": "safehousedenver.org — primary Denver DV shelter. Routes to Colorado Legal Services for protection orders.",
      "name": "SafeHouse Denver",
      "organization_name": "SafeHouse Denver"
    },
    "source_span": {
      "part": "word/document.xml",
      "paragraph_start": 151,
      "paragraph_end": 155,
      "xpath_start": "/w:document/w:body/w:tbl[24]/w:tr/w:tc/w:p[1]",
      "xpath_end": "/w:document/w:body/w:tbl[24]/w:tr/w:tc/w:p[5]"
    },
    "source_text": "SafeHouse Denver\n1649 Downing St, Denver, CO 80218\n📞 303-318-9989  ·  safehousedenver.org\nEligibility: Denver area DV survivors — emergency shelter, counseling, legal advocacy, transitional housing.\nApply / Notes: safehousedenver.org — primary Denver DV shelter. Routes to Colorado Legal Services for protection orders.",
    "review_ledger_sha256": "3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa",
    "reviewed_by": "codex_individual_source_review_20260914",
    "review_method": "individual_source_transcription",
    "review_scope": "source_assertion_only",
    "review_note": "Individually reviewed source transcription only. Agency identity, contact validity, eligibility, legal assertions and service suitability are not independently verified. Classification remains separately proposed.",
    "revision_id": "8dc38890-d39b-4aca-b450-b2e8236d4f8d"
  },
  {
    "civic_object_uid": "corpus:8e4cf4d47edbd68f5751813c64645673736cd164c72e8186cb41c8f352029901",
    "object_ref": "8e4cf4d47edbd68f5751813c64645673736cd164c72e8186cb41c8f352029901",
    "run_id": "3e8da646-0fa0-4991-9cf1-df3e4de1e028",
    "artifact_key": "State Enriched Registry bucket/luminari-colorado-ENRICHED-PASS2-2026.docx",
    "source_content_sha256": "8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d",
    "source_candidate_hash": "25185967883d26b52b2b9e77971b8350075007406f05d7d42e3307f5bd3a91ef",
    "source_locator": "lines:140-144",
    "operation": "correct",
    "supersedes_revision_id": null,
    "resource_entity_id": "c7231e67-1b96-3755-409b-fc090cadcf4f",
    "before_fields": {
      "address": null,
      "phone": null,
      "apply_notes": "coloradolegalservices.org — primary statewide legal aid. Emergency triage for eviction. Colorado Lawyer's Committee / Metro Volunteer Lawyers 789 Sherman St Ste 300, Denver, CO 80203",
      "description": "coloradolegalservices.org — primary statewide legal aid. Emergency triage for eviction. Colorado Lawyer's Committee / Metro Volunteer Lawyers 789 Sherman St Ste 300, Denver, CO 80203",
      "name": "📞 303-837-1313 · coloradolegalservices.org",
      "organization_name": "📞 303-837-1313 · coloradolegalservices.org"
    },
    "after_fields": {
      "address": "1905 Sherman St Ste 400, Denver, CO 80203",
      "phone": "303-837-1313",
      "apply_notes": "coloradolegalservices.org — primary statewide legal aid. Emergency triage for eviction.",
      "description": "coloradolegalservices.org — primary statewide legal aid. Emergency triage for eviction.",
      "name": "Colorado Legal Services (CLS) — Denver",
      "organization_name": "Colorado Legal Services (CLS) — Denver"
    },
    "source_span": {
      "part": "word/document.xml",
      "paragraph_start": 159,
      "paragraph_end": 163,
      "xpath_start": "/w:document/w:body/w:tbl[25]/w:tr/w:tc/w:p[1]",
      "xpath_end": "/w:document/w:body/w:tbl[25]/w:tr/w:tc/w:p[5]"
    },
    "source_text": "Colorado Legal Services (CLS) — Denver\n1905 Sherman St Ste 400, Denver, CO 80203\n📞 303-837-1313  ·  coloradolegalservices.org\nEligibility: Denver / metro and statewide — housing (eviction), family, benefits, DV, consumer, immigration, farmworker.\nApply / Notes: coloradolegalservices.org — primary statewide legal aid. Emergency triage for eviction.",
    "review_ledger_sha256": "3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa",
    "reviewed_by": "codex_individual_source_review_20260914",
    "review_method": "individual_source_transcription",
    "review_scope": "source_assertion_only",
    "review_note": "Individually reviewed source transcription only. Agency identity, contact validity, eligibility, legal assertions and service suitability are not independently verified. Classification remains separately proposed.",
    "revision_id": "a1cb5dde-cfbb-eab4-c91e-54ae8f8ccd92"
  },
  {
    "civic_object_uid": "corpus:dade90b946c61ef89b624131968680950137350e56c38c5a30f07361764acabd",
    "object_ref": "dade90b946c61ef89b624131968680950137350e56c38c5a30f07361764acabd",
    "run_id": "3e8da646-0fa0-4991-9cf1-df3e4de1e028",
    "artifact_key": "State Enriched Registry bucket/luminari-colorado-ENRICHED-PASS2-2026.docx",
    "source_content_sha256": "8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d",
    "source_candidate_hash": "c29ab551632d15a8ff9f8c7abb52b43f4ad6a53184d9488b79a23283d4dc731c",
    "source_locator": "lines:146-150",
    "operation": "correct",
    "supersedes_revision_id": null,
    "resource_entity_id": "c4fd1435-c67e-e3be-af2d-ee7e483b91f6",
    "before_fields": {
      "address": null,
      "phone": null,
      "apply_notes": "coloradolawyerscommittee.org — also Colorado Lawyer's Committee Civil Rights Project. CAIR Coalition Colorado / Rocky Mountain Immigrant Advocacy Network (RMIAN) 12600 W Colfax Ave Ste B-400, Lakewood, CO 80215",
      "description": "coloradolawyerscommittee.org — also Colorado Lawyer's Committee Civil Rights Project. CAIR Coalition Colorado / Rocky Mountain Immigrant Advocacy Network (RMIAN) 12600 W Colfax Ave Ste B-400, Lakewood, CO 80215",
      "name": "📞 303-825-1097 · coloradolawyerscommittee.org",
      "organization_name": "📞 303-825-1097 · coloradolawyerscommittee.org"
    },
    "after_fields": {
      "address": "789 Sherman St Ste 300, Denver, CO 80203",
      "phone": "303-825-1097",
      "apply_notes": "coloradolawyerscommittee.org — also Colorado Lawyer's Committee Civil Rights Project.",
      "description": "coloradolawyerscommittee.org — also Colorado Lawyer's Committee Civil Rights Project.",
      "name": "Colorado Lawyer's Committee / Metro Volunteer Lawyers",
      "organization_name": "Colorado Lawyer's Committee / Metro Volunteer Lawyers"
    },
    "source_span": {
      "part": "word/document.xml",
      "paragraph_start": 165,
      "paragraph_end": 169,
      "xpath_start": "/w:document/w:body/w:tbl[26]/w:tr/w:tc/w:p[1]",
      "xpath_end": "/w:document/w:body/w:tbl[26]/w:tr/w:tc/w:p[5]"
    },
    "source_text": "Colorado Lawyer's Committee / Metro Volunteer Lawyers\n789 Sherman St Ste 300, Denver, CO 80203\n📞 303-825-1097  ·  coloradolawyerscommittee.org\nEligibility: Metro Denver — civil rights, discrimination, housing, immigration pro bono.\nApply / Notes: coloradolawyerscommittee.org — also Colorado Lawyer's Committee Civil Rights Project.",
    "review_ledger_sha256": "3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa",
    "reviewed_by": "codex_individual_source_review_20260914",
    "review_method": "individual_source_transcription",
    "review_scope": "source_assertion_only",
    "review_note": "Individually reviewed source transcription only. Agency identity, contact validity, eligibility, legal assertions and service suitability are not independently verified. Classification remains separately proposed.",
    "revision_id": "3d627cfb-daf2-c443-886f-bd6a22e3c9b3"
  },
  {
    "civic_object_uid": "corpus:9d9800d28995d9c983f52d38881a9b20384470b97a9533b5e18a7c15cf6e43d9",
    "object_ref": "9d9800d28995d9c983f52d38881a9b20384470b97a9533b5e18a7c15cf6e43d9",
    "run_id": "3e8da646-0fa0-4991-9cf1-df3e4de1e028",
    "artifact_key": "State Enriched Registry bucket/luminari-colorado-ENRICHED-PASS2-2026.docx",
    "source_content_sha256": "8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d",
    "source_candidate_hash": "4d6947958cbce1ff3932f1132f9c311489bd50c116d89057c0e61680767c498c",
    "source_locator": "lines:152-157",
    "operation": "correct",
    "supersedes_revision_id": null,
    "resource_entity_id": "7424640e-04de-b5cb-b20f-924e0aea9b09",
    "before_fields": {
      "address": null,
      "phone": null,
      "apply_notes": "rmian.org — primary immigration legal services in Colorado. Also Colorado Immigrant Rights Coalition (CIRC): 303-592-8899. Cash Assistance & Income Colorado Works (TANF — CDHS) 1575 Sherman St, Denver, CO 80203",
      "description": "rmian.org — primary immigration legal services in Colorado. Also Colorado Immigrant Rights Coalition (CIRC): 303-592-8899. Cash Assistance & Income Colorado Works (TANF — CDHS) 1575 Sherman St, Denver, CO 80203",
      "name": "📞 303-433-2812 · rmian.org",
      "organization_name": "📞 303-433-2812 · rmian.org"
    },
    "after_fields": {
      "address": "12600 W Colfax Ave Ste B-400, Lakewood, CO 80215",
      "phone": "303-433-2812",
      "apply_notes": "rmian.org — primary immigration legal services in Colorado. Also Colorado Immigrant Rights Coalition (CIRC): 303-592-8899.",
      "description": "rmian.org — primary immigration legal services in Colorado. Also Colorado Immigrant Rights Coalition (CIRC): 303-592-8899.",
      "name": "CAIR Coalition Colorado / Rocky Mountain Immigrant Advocacy Network (RMIAN)",
      "organization_name": "CAIR Coalition Colorado / Rocky Mountain Immigrant Advocacy Network (RMIAN)"
    },
    "source_span": {
      "part": "word/document.xml",
      "paragraph_start": 171,
      "paragraph_end": 175,
      "xpath_start": "/w:document/w:body/w:tbl[27]/w:tr/w:tc/w:p[1]",
      "xpath_end": "/w:document/w:body/w:tbl[27]/w:tr/w:tc/w:p[5]"
    },
    "source_text": "CAIR Coalition Colorado / Rocky Mountain Immigrant Advocacy Network (RMIAN)\n12600 W Colfax Ave Ste B-400, Lakewood, CO 80215\n📞 303-433-2812  ·  rmian.org\nEligibility: Immigrants and detained individuals — immigration legal services, detention representation, DACA.\nApply / Notes: rmian.org — primary immigration legal services in Colorado. Also Colorado Immigrant Rights Coalition (CIRC): 303-592-8899.",
    "review_ledger_sha256": "3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa",
    "reviewed_by": "codex_individual_source_review_20260914",
    "review_method": "individual_source_transcription",
    "review_scope": "source_assertion_only",
    "review_note": "Individually reviewed source transcription only. Agency identity, contact validity, eligibility, legal assertions and service suitability are not independently verified. Classification remains separately proposed.",
    "revision_id": "66b2c28e-3418-b590-5c78-a88f1baf6a7c"
  },
  {
    "civic_object_uid": "corpus:e9d59359dda39e69dc8a75e1ad7817e27018be83033ad02e8a189a92ad9ecc66",
    "object_ref": "e9d59359dda39e69dc8a75e1ad7817e27018be83033ad02e8a189a92ad9ecc66",
    "run_id": "3e8da646-0fa0-4991-9cf1-df3e4de1e028",
    "artifact_key": "State Enriched Registry bucket/luminari-colorado-ENRICHED-PASS2-2026.docx",
    "source_content_sha256": "8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d",
    "source_candidate_hash": "fbfe7628b196d1131847e94bfee9af82c393645649ff88a6bc6264205b31611a",
    "source_locator": "lines:159-163",
    "operation": "correct",
    "supersedes_revision_id": null,
    "resource_entity_id": "ccd67478-086c-5209-60e4-38d5d1ad9284",
    "before_fields": {
      "address": null,
      "phone": null,
      "apply_notes": "peak.colorado.gov or county Dept of Social/Human Services. Work requirement 20–35 hrs/week. Pair with SNAP, Health First Colorado, CCAP, LEAP, emergency rental assistance. Colorado UI (CDLE — Dept of Labor & Employment) 633 17th St Ste 201, Denver, CO 80202",
      "description": "peak.colorado.gov or county Dept of Social/Human Services. Work requirement 20–35 hrs/week. Pair with SNAP, Health First Colorado, CCAP, LEAP, emergency rental assistance. Colorado UI (CDLE — Dept of Labor & Employment) 633 17th St Ste 201, Denver, CO 80202",
      "name": "📞 303-866-5700 · colorado.gov/cdhs",
      "organization_name": "📞 303-866-5700 · colorado.gov/cdhs"
    },
    "after_fields": {
      "address": "1575 Sherman St, Denver, CO 80203",
      "phone": "303-866-5700",
      "apply_notes": "peak.colorado.gov or county Dept of Social/Human Services. Work requirement 20–35 hrs/week. Pair with SNAP, Health First Colorado, CCAP, LEAP, emergency rental assistance.",
      "description": "peak.colorado.gov or county Dept of Social/Human Services. Work requirement 20–35 hrs/week. Pair with SNAP, Health First Colorado, CCAP, LEAP, emergency rental assistance.",
      "name": "Colorado Works (TANF — CDHS)",
      "organization_name": "Colorado Works (TANF — CDHS)"
    },
    "source_span": {
      "part": "word/document.xml",
      "paragraph_start": 179,
      "paragraph_end": 183,
      "xpath_start": "/w:document/w:body/w:tbl[28]/w:tr/w:tc/w:p[1]",
      "xpath_end": "/w:document/w:body/w:tbl[28]/w:tr/w:tc/w:p[5]"
    },
    "source_text": "Colorado Works (TANF — CDHS)\n1575 Sherman St, Denver, CO 80203\n📞 303-866-5700  ·  colorado.gov/cdhs\nEligibility: Families with children — up to $508/month for family of 3. Federal 60-month limit.\nApply / Notes: peak.colorado.gov or county Dept of Social/Human Services. Work requirement 20–35 hrs/week. Pair with SNAP, Health First Colorado, CCAP, LEAP, emergency rental assistance.",
    "review_ledger_sha256": "3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa",
    "reviewed_by": "codex_individual_source_review_20260914",
    "review_method": "individual_source_transcription",
    "review_scope": "source_assertion_only",
    "review_note": "Individually reviewed source transcription only. Agency identity, contact validity, eligibility, legal assertions and service suitability are not independently verified. Classification remains separately proposed.",
    "revision_id": "fcb5c719-e9b4-798f-1b9b-8e1993c5bad9"
  },
  {
    "civic_object_uid": "corpus:1a133aa2f70050b43204063200162008362827a01d7e0fae846ba17351ddd4da",
    "object_ref": "1a133aa2f70050b43204063200162008362827a01d7e0fae846ba17351ddd4da",
    "run_id": "3e8da646-0fa0-4991-9cf1-df3e4de1e028",
    "artifact_key": "State Enriched Registry bucket/luminari-colorado-ENRICHED-PASS2-2026.docx",
    "source_content_sha256": "8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d",
    "source_candidate_hash": "b2db652f7249417dcdb48de7478e9daecec2948aaacdd88dfcd4870e0df7fdae",
    "source_locator": "lines:165-170",
    "operation": "correct",
    "supersedes_revision_id": null,
    "resource_entity_id": "b3555839-f5e5-11a6-1c94-f795f01546b5",
    "before_fields": {
      "address": null,
      "phone": null,
      "apply_notes": "myui.colorado.gov — file online. 20-day appeal deadline from determination mailing. Colorado UI has improved system reliability in recent years. Utilities Colorado LEAP (Low-Income Energy Assistance Program) 1575 Sherman St, Denver, CO 80203",
      "description": "myui.colorado.gov — file online. 20-day appeal deadline from determination mailing. Colorado UI has improved system reliability in recent years. Utilities Colorado LEAP (Low-Income Energy Assistance Program) 1575 Sherman St, Denver, CO 80203",
      "name": "📞 303-318-9000 · myui.colorado.gov",
      "organization_name": "📞 303-318-9000 · myui.colorado.gov"
    },
    "after_fields": {
      "address": "633 17th St Ste 201, Denver, CO 80202",
      "phone": "303-318-9000",
      "apply_notes": "myui.colorado.gov — file online. 20-day appeal deadline from determination mailing. Colorado UI has improved system reliability in recent years.",
      "description": "myui.colorado.gov — file online. 20-day appeal deadline from determination mailing. Colorado UI has improved system reliability in recent years.",
      "name": "Colorado UI (CDLE — Dept of Labor & Employment)",
      "organization_name": "Colorado UI (CDLE — Dept of Labor & Employment)"
    },
    "source_span": {
      "part": "word/document.xml",
      "paragraph_start": 185,
      "paragraph_end": 189,
      "xpath_start": "/w:document/w:body/w:tbl[29]/w:tr/w:tc/w:p[1]",
      "xpath_end": "/w:document/w:body/w:tbl[29]/w:tr/w:tc/w:p[5]"
    },
    "source_text": "Colorado UI (CDLE — Dept of Labor & Employment)\n633 17th St Ste 201, Denver, CO 80202\n📞 303-318-9000  ·  myui.colorado.gov\nEligibility: Workers who lost job through no fault — up to $781/week, 26 weeks maximum.\nApply / Notes: myui.colorado.gov — file online. 20-day appeal deadline from determination mailing. Colorado UI has improved system reliability in recent years.",
    "review_ledger_sha256": "3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa",
    "reviewed_by": "codex_individual_source_review_20260914",
    "review_method": "individual_source_transcription",
    "review_scope": "source_assertion_only",
    "review_note": "Individually reviewed source transcription only. Agency identity, contact validity, eligibility, legal assertions and service suitability are not independently verified. Classification remains separately proposed.",
    "revision_id": "055234be-bf99-a4e3-6a52-b191c8fa9ee3"
  },
  {
    "civic_object_uid": "corpus:ea46881e083aa0539329aa4fe410f3958b4e4d725b9d55d9b89e52dbd4558180",
    "object_ref": "ea46881e083aa0539329aa4fe410f3958b4e4d725b9d55d9b89e52dbd4558180",
    "run_id": "3e8da646-0fa0-4991-9cf1-df3e4de1e028",
    "artifact_key": "State Enriched Registry bucket/luminari-colorado-ENRICHED-PASS2-2026.docx",
    "source_content_sha256": "8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d",
    "source_candidate_hash": "672a45b5bf1cb29fa733a7cf6f34471403b9ae175a078d7441b99a207367a833",
    "source_locator": "lines:172-176",
    "operation": "correct",
    "supersedes_revision_id": null,
    "resource_entity_id": "138c3d37-73bc-2357-ce2d-cba65019d8f7",
    "before_fields": {
      "address": null,
      "phone": null,
      "apply_notes": "cdhs.colorado.gov/leap — apply through local community-based organizations. Opens November 1. Crisis component year-round. Xcel Energy Renewable Energy Assistance Program (REAP) and Black Hills Energy both have low-income discount programs. Colorado PUC (Public Utilities Commission) 1560 Broadway Ste 250, Denver, CO 80202",
      "description": "cdhs.colorado.gov/leap — apply through local community-based organizations. Opens November 1. Crisis component year-round. Xcel Energy Renewable Energy Assistance Program (REAP) and Black Hills Energy both have low-income discount programs. Colorado PUC (Public Utilities Commission) 1560 Broadway Ste 250, Denver, CO 80202",
      "name": "📞 866-432-8435 · cdhs.colorado.gov/leap",
      "organization_name": "📞 866-432-8435 · cdhs.colorado.gov/leap"
    },
    "after_fields": {
      "address": "1575 Sherman St, Denver, CO 80203",
      "phone": "866-432-8435",
      "apply_notes": "cdhs.colorado.gov/leap — apply through local community-based organizations. Opens November 1. Crisis component year-round. Xcel Energy Renewable Energy Assistance Program (REAP) and Black Hills Energy both have low-income discount programs.",
      "description": "cdhs.colorado.gov/leap — apply through local community-based organizations. Opens November 1. Crisis component year-round. Xcel Energy Renewable Energy Assistance Program (REAP) and Black Hills Energy both have low-income discount programs.",
      "name": "Colorado LEAP (Low-Income Energy Assistance Program)",
      "organization_name": "Colorado LEAP (Low-Income Energy Assistance Program)"
    },
    "source_span": {
      "part": "word/document.xml",
      "paragraph_start": 193,
      "paragraph_end": 197,
      "xpath_start": "/w:document/w:body/w:tbl[30]/w:tr/w:tc/w:p[1]",
      "xpath_end": "/w:document/w:body/w:tbl[30]/w:tr/w:tc/w:p[5]"
    },
    "source_text": "Colorado LEAP (Low-Income Energy Assistance Program)\n1575 Sherman St, Denver, CO 80203\n📞 866-432-8435  ·  cdhs.colorado.gov/leap\nEligibility: Income < 60% state median income — heating, cooling, crisis shutoff prevention, weatherization.\nApply / Notes: cdhs.colorado.gov/leap — apply through local community-based organizations. Opens November 1. Crisis component year-round. Xcel Energy Renewable Energy Assistance Program (REAP) and Black Hills Energy both have low-income discount programs.",
    "review_ledger_sha256": "3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa",
    "reviewed_by": "codex_individual_source_review_20260914",
    "review_method": "individual_source_transcription",
    "review_scope": "source_assertion_only",
    "review_note": "Individually reviewed source transcription only. Agency identity, contact validity, eligibility, legal assertions and service suitability are not independently verified. Classification remains separately proposed.",
    "revision_id": "a91a7f41-c498-9736-55e4-4948dad88105"
  },
  {
    "civic_object_uid": "corpus:3a98d6d6cfc708af7c9179b20ec291f03d90c2e0c7c45ca2013b2603f03d963f",
    "object_ref": "3a98d6d6cfc708af7c9179b20ec291f03d90c2e0c7c45ca2013b2603f03d963f",
    "run_id": "3e8da646-0fa0-4991-9cf1-df3e4de1e028",
    "artifact_key": "State Enriched Registry bucket/luminari-colorado-ENRICHED-PASS2-2026.docx",
    "source_content_sha256": "8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d",
    "source_candidate_hash": "f7bb16bb7a42b68f032018d8c45ef6852213330563e52988aa164b3d60dd7acf",
    "source_locator": "lines:178-197",
    "operation": "correct",
    "supersedes_revision_id": null,
    "resource_entity_id": "44fa74da-8c6c-9fd1-9b79-8430a0f33672",
    "before_fields": {
      "address": null,
      "phone": null,
      "apply_notes": "puc.colorado.gov — file complaint online or by phone; winter shutoff moratorium is meaningful given Colorado temperatures; medical certification halts shutoff year-round. Denver — City-Specific Programs Denver is a consolidated city-county. Denver Office of Housing Stability (HOST) is the primary city housing resource. Denver minimum wage ($18.81/hr) is higher than state ($14.81/hr) — always apply Denver wage floor for work performed in Denver city/county. Denver Health is both the public hospital and the FQHC network. Denver 311 (city services / code enforcement): 311 / 720-913-1311 Denver Office of Housing Stability (HOST): 720-913-1600 / denvergov.org/host Denver Human Services (SNAP/benefits): 720-944-3666 / denvergov.org/humanservices Denver Health (safety net hospital + FQHCs): 303-436-6000 / denverhealth.org Colorado Coalition for the Homeless: 303-595-9561 / coloradocoalition.org Denver Shelter Hotline: 311 or 720-913-1311 Colorado Legal Services — Denver: 303-837-1313 / coloradolegalservices.org Denver Office of Civil Rights / CCRD Denver intake: 720-913-8470 Clinica Tepeyac (Latino/immigrant FQHC): 303-296-0771 / clinicatepeyac.org Colorado Immigrant Rights Coalition (CIRC): 303-592-8899 / coloradoimmigrant.org African Community Center (Denver/Aurora): 303-751-1015 / accboston.org/denver Tribal Nations — Southern Ute and Ute Mountain Ute Colorado has two federally recognized tribes: the Southern Ute Indian Tribe (Ignacio, CO) and the Ute Mountain Ute Tribe (Towaoc, CO), both in the southwestern corner of the state (La Plata and Montezuma counties). Both tribes have significant trust land, tribal governments, casinos, and comprehensive social service programs. The Ute people have lived in the Colorado/Utah/New Mexico region for thousands of years — these are not relocated tribes but continuing land holders. Tribal social services are well-funded relative to state TANF and housing programs. Southern Ute Indian Tribe — Social Services 116 Mouache Dr, Ignacio, CO 81137",
      "description": "puc.colorado.gov — file complaint online or by phone; winter shutoff moratorium is meaningful given Colorado temperatures; medical certification halts shutoff year-round. Denver — City-Specific Programs Denver is a consolidated city-county. Denver Office of Housing Stability (HOST) is the primary city housing resource. Denver minimum wage ($18.81/hr) is higher than state ($14.81/hr) — always apply Denver wage floor for work performed in Denver city/county. Denver Health is both the public hospital and the FQHC network. Denver 311 (city services / code enforcement): 311 / 720-913-1311 Denver Office of Housing Stability (HOST): 720-913-1600 / denvergov.org/host Denver Human Services (SNAP/benefits): 720-944-3666 / denvergov.org/humanservices Denver Health (safety net hospital + FQHCs): 303-436-6000 / denverhealth.org Colorado Coalition for the Homeless: 303-595-9561 / coloradocoalition.org Denver Shelter Hotline: 311 or 720-913-1311 Colorado Legal Services — Denver: 303-837-1313 / coloradolegalservices.org Denver Office of Civil Rights / CCRD Denver intake: 720-913-8470 Clinica Tepeyac (Latino/immigrant FQHC): 303-296-0771 / clinicatepeyac.org Colorado Immigrant Rights Coalition (CIRC): 303-592-8899 / coloradoimmigrant.org African Community Center (Denver/Aurora): 303-751-1015 / accboston.org/denver Tribal Nations — Southern Ute and Ute Mountain Ute Colorado has two federally recognized tribes: the Southern Ute Indian Tribe (Ignacio, CO) and the Ute Mountain Ute Tribe (Towaoc, CO), both in the southwestern corner of the state (La Plata and Montezuma counties). Both tribes have significant trust land, tribal governments, casinos, and comprehensive social service programs. The Ute people have lived in the Colorado/Utah/New Mexico region for thousands of years — these are not relocated tribes but continuing land holders. Tribal social services are well-funded relative to state TANF and housing programs. Southern Ute Indian Tribe — Social Services 116 Mouache Dr, Ignacio, CO 81137",
      "name": "📞 303-894-2000 · puc.colorado.gov",
      "organization_name": "📞 303-894-2000 · puc.colorado.gov"
    },
    "after_fields": {
      "address": "1560 Broadway Ste 250, Denver, CO 80202",
      "phone": "303-894-2000",
      "apply_notes": "puc.colorado.gov — file complaint online or by phone; winter shutoff moratorium is meaningful given Colorado temperatures; medical certification halts shutoff year-round.",
      "description": "puc.colorado.gov — file complaint online or by phone; winter shutoff moratorium is meaningful given Colorado temperatures; medical certification halts shutoff year-round.",
      "name": "Colorado PUC (Public Utilities Commission)",
      "organization_name": "Colorado PUC (Public Utilities Commission)"
    },
    "source_span": {
      "part": "word/document.xml",
      "paragraph_start": 199,
      "paragraph_end": 203,
      "xpath_start": "/w:document/w:body/w:tbl[31]/w:tr/w:tc/w:p[1]",
      "xpath_end": "/w:document/w:body/w:tbl[31]/w:tr/w:tc/w:p[5]"
    },
    "source_text": "Colorado PUC (Public Utilities Commission)\n1560 Broadway Ste 250, Denver, CO 80202\n📞 303-894-2000  ·  puc.colorado.gov\nEligibility: Utility shutoff complaints — winter shutoff protection November 1–April 15 for gas and electric regulated utilities.\nApply / Notes: puc.colorado.gov — file complaint online or by phone; winter shutoff moratorium is meaningful given Colorado temperatures; medical certification halts shutoff year-round.",
    "review_ledger_sha256": "3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa",
    "reviewed_by": "codex_individual_source_review_20260914",
    "review_method": "individual_source_transcription",
    "review_scope": "source_assertion_only",
    "review_note": "Individually reviewed source transcription only. Agency identity, contact validity, eligibility, legal assertions and service suitability are not independently verified. Classification remains separately proposed.",
    "revision_id": "ad2cae4e-66be-293e-0b88-edd7945f45ca"
  },
  {
    "civic_object_uid": "corpus:5bc9757b30ebc96d6eeb3e32bac49f13dd7a2435cd4416f213d1e13907e873ff",
    "object_ref": "5bc9757b30ebc96d6eeb3e32bac49f13dd7a2435cd4416f213d1e13907e873ff",
    "run_id": "3e8da646-0fa0-4991-9cf1-df3e4de1e028",
    "artifact_key": "State Enriched Registry bucket/luminari-colorado-ENRICHED-PASS2-2026.docx",
    "source_content_sha256": "8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d",
    "source_candidate_hash": "a451465afa2b07f6977da95eed8b4e0b9496da914b34fdbb396956070af1d42b",
    "source_locator": "lines:201-205",
    "operation": "correct",
    "supersedes_revision_id": null,
    "resource_entity_id": "47e843d4-bd40-dbe1-c234-1d27aaf1a4ea",
    "before_fields": {
      "address": null,
      "phone": null,
      "apply_notes": "southernute-nsn.gov — comprehensive tribal social services. Southern Ute Indian Health Service: 970-563-4581. Durango satellite office for tribal members in Durango area. Ute Mountain Ute Tribe — Social Services Town of Towaoc, Towaoc, CO 81334",
      "description": "southernute-nsn.gov — comprehensive tribal social services. Southern Ute Indian Health Service: 970-563-4581. Durango satellite office for tribal members in Durango area. Ute Mountain Ute Tribe — Social Services Town of Towaoc, Towaoc, CO 81334",
      "name": "📞 970-563-0100 · southernute-nsn.gov",
      "organization_name": "📞 970-563-0100 · southernute-nsn.gov"
    },
    "after_fields": {
      "address": "116 Mouache Dr, Ignacio, CO 81137",
      "phone": "970-563-0100",
      "apply_notes": "southernute-nsn.gov — comprehensive tribal social services. Southern Ute Indian Health Service: 970-563-4581. Durango satellite office for tribal members in Durango area.",
      "description": "southernute-nsn.gov — comprehensive tribal social services. Southern Ute Indian Health Service: 970-563-4581. Durango satellite office for tribal members in Durango area.",
      "name": "Southern Ute Indian Tribe — Social Services",
      "organization_name": "Southern Ute Indian Tribe — Social Services"
    },
    "source_span": {
      "part": "word/document.xml",
      "paragraph_start": 227,
      "paragraph_end": 231,
      "xpath_start": "/w:document/w:body/w:tbl[33]/w:tr/w:tc/w:p[1]",
      "xpath_end": "/w:document/w:body/w:tbl[33]/w:tr/w:tc/w:p[5]"
    },
    "source_text": "Southern Ute Indian Tribe — Social Services\n116 Mouache Dr, Ignacio, CO 81137\n📞 970-563-0100  ·  southernute-nsn.gov\nEligibility: Enrolled Southern Ute members — tribal TANF, housing, health (Ute Indian Health), elder, youth, child welfare (ICWA).\nApply / Notes: southernute-nsn.gov — comprehensive tribal social services. Southern Ute Indian Health Service: 970-563-4581. Durango satellite office for tribal members in Durango area.",
    "review_ledger_sha256": "3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa",
    "reviewed_by": "codex_individual_source_review_20260914",
    "review_method": "individual_source_transcription",
    "review_scope": "source_assertion_only",
    "review_note": "Individually reviewed source transcription only. Agency identity, contact validity, eligibility, legal assertions and service suitability are not independently verified. Classification remains separately proposed.",
    "revision_id": "605eecc3-a36f-ec8f-8cee-9abc7069ea6a"
  },
  {
    "civic_object_uid": "corpus:79ee378087374a94a6c8cfcd7f3b2c35476be1ab0f83270790dae440a40df75b",
    "object_ref": "79ee378087374a94a6c8cfcd7f3b2c35476be1ab0f83270790dae440a40df75b",
    "run_id": "3e8da646-0fa0-4991-9cf1-df3e4de1e028",
    "artifact_key": "State Enriched Registry bucket/luminari-colorado-ENRICHED-PASS2-2026.docx",
    "source_content_sha256": "8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d",
    "source_candidate_hash": "3c371bf04767f716c88c576b61f33aa4c567ed26a3d73dca6230f11628e9f3d6",
    "source_locator": "lines:207-211",
    "operation": "correct",
    "supersedes_revision_id": null,
    "resource_entity_id": "cc245ce5-ab78-6372-5573-bd9fc0c4e622",
    "before_fields": {
      "address": null,
      "phone": null,
      "apply_notes": "utemountain.org — tribal headquarters in Towaoc. Ute Mountain Health Center: 970-565-4441. Tribal lands extend into Utah and New Mexico. IHS Phoenix Area Office (covers CO tribes) 40 N Central Ave Ste 600, Phoenix, AZ 85004",
      "description": "utemountain.org — tribal headquarters in Towaoc. Ute Mountain Health Center: 970-565-4441. Tribal lands extend into Utah and New Mexico. IHS Phoenix Area Office (covers CO tribes) 40 N Central Ave Ste 600, Phoenix, AZ 85004",
      "name": "📞 970-565-3751 · utemountain.org",
      "organization_name": "📞 970-565-3751 · utemountain.org"
    },
    "after_fields": {
      "address": "Town of Towaoc, Towaoc, CO 81334",
      "phone": "970-565-3751",
      "apply_notes": "utemountain.org — tribal headquarters in Towaoc. Ute Mountain Health Center: 970-565-4441. Tribal lands extend into Utah and New Mexico.",
      "description": "utemountain.org — tribal headquarters in Towaoc. Ute Mountain Health Center: 970-565-4441. Tribal lands extend into Utah and New Mexico.",
      "name": "Ute Mountain Ute Tribe — Social Services",
      "organization_name": "Ute Mountain Ute Tribe — Social Services"
    },
    "source_span": {
      "part": "word/document.xml",
      "paragraph_start": 233,
      "paragraph_end": 237,
      "xpath_start": "/w:document/w:body/w:tbl[34]/w:tr/w:tc/w:p[1]",
      "xpath_end": "/w:document/w:body/w:tbl[34]/w:tr/w:tc/w:p[5]"
    },
    "source_text": "Ute Mountain Ute Tribe — Social Services\nTown of Towaoc, Towaoc, CO 81334\n📞 970-565-3751  ·  utemountain.org\nEligibility: Enrolled Ute Mountain Ute members — tribal TANF, housing, health (Ute Mountain Health Center), child welfare.\nApply / Notes: utemountain.org — tribal headquarters in Towaoc. Ute Mountain Health Center: 970-565-4441. Tribal lands extend into Utah and New Mexico.",
    "review_ledger_sha256": "3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa",
    "reviewed_by": "codex_individual_source_review_20260914",
    "review_method": "individual_source_transcription",
    "review_scope": "source_assertion_only",
    "review_note": "Individually reviewed source transcription only. Agency identity, contact validity, eligibility, legal assertions and service suitability are not independently verified. Classification remains separately proposed.",
    "revision_id": "de5e0ce1-c07b-fd3c-b601-0d6e32023dfd"
  },
  {
    "civic_object_uid": "corpus:d473958389e482eb8fc7d123e151c4b061802469cbf565adb553e45b487f110f",
    "object_ref": "d473958389e482eb8fc7d123e151c4b061802469cbf565adb553e45b487f110f",
    "run_id": "3e8da646-0fa0-4991-9cf1-df3e4de1e028",
    "artifact_key": "State Enriched Registry bucket/luminari-colorado-ENRICHED-PASS2-2026.docx",
    "source_content_sha256": "8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d",
    "source_candidate_hash": "2000542a9219b943d54db0f3b496aa71e7e57faeba6cc7fc8cff062ee93e7180",
    "source_locator": "lines:213-217",
    "operation": "correct",
    "supersedes_revision_id": null,
    "resource_entity_id": "093dd3ff-9fb6-ebc8-6502-f7090c4ab149",
    "before_fields": {
      "address": null,
      "phone": null,
      "apply_notes": "ihs.gov/phoenix — primary IHS contact for Colorado tribes. For urban AI/AN in Denver: Denver Indian Health and Family Services (303-953-8271 / denverindian.org). Denver Indian Health and Family Services 1633 Fillmore St Ste 200, Denver, CO 80206",
      "description": "ihs.gov/phoenix — primary IHS contact for Colorado tribes. For urban AI/AN in Denver: Denver Indian Health and Family Services (303-953-8271 / denverindian.org). Denver Indian Health and Family Services 1633 Fillmore St Ste 200, Denver, CO 80206",
      "name": "📞 602-364-5039 · ihs.gov/phoenix",
      "organization_name": "📞 602-364-5039 · ihs.gov/phoenix"
    },
    "after_fields": {
      "address": "40 N Central Ave Ste 600, Phoenix, AZ 85004",
      "phone": "602-364-5039",
      "apply_notes": "ihs.gov/phoenix — primary IHS contact for Colorado tribes. For urban AI/AN in Denver: Denver Indian Health and Family Services (303-953-8271 / denverindian.org).",
      "description": "ihs.gov/phoenix — primary IHS contact for Colorado tribes. For urban AI/AN in Denver: Denver Indian Health and Family Services (303-953-8271 / denverindian.org).",
      "name": "IHS Phoenix Area Office (covers CO tribes)",
      "organization_name": "IHS Phoenix Area Office (covers CO tribes)"
    },
    "source_span": {
      "part": "word/document.xml",
      "paragraph_start": 239,
      "paragraph_end": 243,
      "xpath_start": "/w:document/w:body/w:tbl[35]/w:tr/w:tc/w:p[1]",
      "xpath_end": "/w:document/w:body/w:tbl[35]/w:tr/w:tc/w:p[5]"
    },
    "source_text": "IHS Phoenix Area Office (covers CO tribes)\n40 N Central Ave Ste 600, Phoenix, AZ 85004\n📞 602-364-5039  ·  ihs.gov/phoenix\nEligibility: AI/AN enrolled members — IHS health services for CO tribes; Phoenix Area covers southern Rockies.\nApply / Notes: ihs.gov/phoenix — primary IHS contact for Colorado tribes. For urban AI/AN in Denver: Denver Indian Health and Family Services (303-953-8271 / denverindian.org).",
    "review_ledger_sha256": "3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa",
    "reviewed_by": "codex_individual_source_review_20260914",
    "review_method": "individual_source_transcription",
    "review_scope": "source_assertion_only",
    "review_note": "Individually reviewed source transcription only. Agency identity, contact validity, eligibility, legal assertions and service suitability are not independently verified. Classification remains separately proposed.",
    "revision_id": "6655aa8b-66b7-d7ee-2890-9b57b3dfee57"
  },
  {
    "civic_object_uid": "corpus:6ecc7f8ba56c2e771487d775b567af038a5f25569dc7e72778700ed6c1713900",
    "object_ref": "6ecc7f8ba56c2e771487d775b567af038a5f25569dc7e72778700ed6c1713900",
    "run_id": "3e8da646-0fa0-4991-9cf1-df3e4de1e028",
    "artifact_key": "State Enriched Registry bucket/luminari-colorado-ENRICHED-PASS2-2026.docx",
    "source_content_sha256": "8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d",
    "source_candidate_hash": "49e17b7070a0946388299b7185a241019947a3c2faf8e6d3bd1c307d25c314b0",
    "source_locator": "lines:219-322",
    "operation": "correct",
    "supersedes_revision_id": null,
    "resource_entity_id": "8880f952-1b91-30b4-6ebc-d5f8940344d1",
    "before_fields": {
      "address": null,
      "phone": null,
      "apply_notes": "denverindian.org — primary urban Indian resource for Denver metro AI/AN residents not affiliated with Southern Ute or Ute Mountain. Layer 2 — Resolution Workflows Four canonical workflows. Colorado-specific statutes, deadlines, and agencies at each step. Workflow A — Housing Violation Covers: repair failure, illegal lockout, retaliation, eviction defense, security deposit disputes. Primary statutes: Colorado Warranty of Habitability CRS §38-12-503 · CRS §38-12-507 (Retaliation) · CRS §38-12-102 (Security Deposit) · CRS §13-40 (Forcible Entry and Detainer / Eviction) · Denver DRMC §27 (Denver Rent Stabilization and Just Cause Eviction) Colorado enacted a comprehensive warranty of habitability in 2019 (CRS §38-12-503) — landlord must maintain safe and habitable premises. Tenant remedies include: termination, damages, rent escrow. Denver (2021): just cause eviction requirement — landlord must state a legal reason to end tenancy. No rent control in Denver but strong just cause protection. Denver tenants: always check whether reason given for eviction is a legally recognized just cause under Denver ordinance. 1 Document All Violations Photograph violations. Save all communications. Colorado 2019 Warranty of Habitability covers: adequate heat and hot water, weatherproofing, electrical/plumbing, structural safety, rodent/pest control. Note exact dates. Documents: Dated photos, communications, lease Contact: Personal records Deadline: Document immediately 2 Send Written Repair Notice CRS §38-12-505: send written notice to landlord. Landlord has reasonable time to repair: 24 hours for emergency (heat, plumbing, security); 72 hours for urgent; 7 days for serious non-emergency. After deadline: tenant may terminate, make repairs and deduct, or see",
      "description": "denverindian.org — primary urban Indian resource for Denver metro AI/AN residents not affiliated with Southern Ute or Ute Mountain. Layer 2 — Resolution Workflows Four canonical workflows. Colorado-specific statutes, deadlines, and agencies at each step. Workflow A — Housing Violation Covers: repair failure, illegal lockout, retaliation, eviction defense, security deposit disputes. Primary statutes: Colorado Warranty of Habitability CRS §38-12-503 · CRS §38-12-507 (Retaliation) · CRS §38-12-102 (Security Deposit) · CRS §13-40 (Forcible Entry and Detainer / Eviction) · Denver DRMC §27 (Denver Rent Stabilization and Just Cause Eviction) Colorado enacted a comprehensive warranty of habitability in 2019 (CRS §38-12-503) — landlord must maintain safe and habitable premises. Tenant remedies include: termination, damages, rent escrow. Denver (2021): just cause eviction requirement — landlord must state a legal reason to end tenancy. No rent control in Denver but strong just cause protection. Denver tenants: always check whether reason given for eviction is a legally recognized just cause under Denver ordinance. 1 Document All Violations Photograph violations. Save all communications. Colorado 2019 Warranty of Habitability covers: adequate heat and hot water, weatherproofing, electrical/plumbing, structural safety, rodent/pest control. Note exact dates. Documents: Dated photos, communications, lease Contact: Personal records Deadline: Document immediately 2 Send Written Repair Notice CRS §38-12-505: send written notice to landlord. Landlord has reasonable time to repair: 24 hours for emergency (heat, plumbing, security); 72 hours for urgent; 7 days for serious non-emergency. After deadline: tenant may terminate, make repairs and deduct, or see",
      "name": "📞 303-953-8271 · denverindian.org",
      "organization_name": "📞 303-953-8271 · denverindian.org"
    },
    "after_fields": {
      "address": "1633 Fillmore St Ste 200, Denver, CO 80206",
      "phone": "303-953-8271",
      "apply_notes": "denverindian.org — primary urban Indian resource for Denver metro AI/AN residents not affiliated with Southern Ute or Ute Mountain.",
      "description": "denverindian.org — primary urban Indian resource for Denver metro AI/AN residents not affiliated with Southern Ute or Ute Mountain.",
      "name": "Denver Indian Health and Family Services",
      "organization_name": "Denver Indian Health and Family Services"
    },
    "source_span": {
      "part": "word/document.xml",
      "paragraph_start": 245,
      "paragraph_end": 249,
      "xpath_start": "/w:document/w:body/w:tbl[36]/w:tr/w:tc/w:p[1]",
      "xpath_end": "/w:document/w:body/w:tbl[36]/w:tr/w:tc/w:p[5]"
    },
    "source_text": "Denver Indian Health and Family Services\n1633 Fillmore St Ste 200, Denver, CO 80206\n📞 303-953-8271  ·  denverindian.org\nEligibility: Urban AI/AN Denver area — health services, social services, cultural programs, ICWA navigation.\nApply / Notes: denverindian.org — primary urban Indian resource for Denver metro AI/AN residents not affiliated with Southern Ute or Ute Mountain.",
    "review_ledger_sha256": "3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa",
    "reviewed_by": "codex_individual_source_review_20260914",
    "review_method": "individual_source_transcription",
    "review_scope": "source_assertion_only",
    "review_note": "Individually reviewed source transcription only. Agency identity, contact validity, eligibility, legal assertions and service suitability are not independently verified. Classification remains separately proposed.",
    "revision_id": "2d35cf9d-3802-bbcb-4a7b-31855698fd5f"
  }
]
$resource_transcription_receipts_20260914$::jsonb;
  v_receipt jsonb;
  v_current jsonb;
  v_stored jsonb;
  v_count integer;
  v_existing integer := 0;
  v_inserted integer;
  v_originals jsonb := '{}'::jsonb;
begin
  if jsonb_typeof(v_receipts) <> 'array' or jsonb_array_length(v_receipts) <> 24
    or (select count(distinct value->>'revision_id') from jsonb_array_elements(v_receipts)) <> 24
    or (select count(distinct value->>'object_ref') from jsonb_array_elements(v_receipts)) <> 24 then
    raise exception 'colorado_transcription_expected_24_distinct_receipts';
  end if;
  for v_receipt in select value from jsonb_array_elements(v_receipts) loop
    if v_receipt->>'review_scope' <> 'source_assertion_only'
      or v_receipt->>'operation' <> 'correct'
      or v_receipt->'supersedes_revision_id' <> 'null'::jsonb
      or v_receipt->>'source_content_sha256' <> '8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d'
      or v_receipt->>'review_ledger_sha256' <> '3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa' then
      raise exception 'colorado_transcription_packet_scope_changed';
    end if;
    select count(*), (jsonb_agg(to_jsonb(v))->0) into v_count, v_current
    from public.v_lighthouse_resource_program_catalog_v2 v
    where v.civic_object_uid=v_receipt->>'civic_object_uid'
      and v.object_ref=v_receipt->>'object_ref'
      and v.run_id=(v_receipt->>'run_id')::uuid
      and v.artifact_key=v_receipt->>'artifact_key'
      and v.source_content_sha256=v_receipt->>'source_content_sha256'
      and v.source_candidate_hash=v_receipt->>'source_candidate_hash'
      and v.source_locator=v_receipt->>'source_locator'
      and v.object_class='resource' and v.person_facing_ready is true;
    if v_count <> 1 or public.luminari_stable_uuid_v1(v_receipt->>'object_ref')
      <> (v_receipt->>'resource_entity_id')::uuid then
      raise exception 'colorado_transcription_current_binding_changed: %', v_receipt->>'object_ref';
    end if;
    v_originals := v_originals || jsonb_build_object(v_receipt->>'object_ref',v_current);
    if exists (select 1 from jsonb_each(v_receipt->'before_fields') f
      where v_current->f.key is distinct from f.value) then
      raise exception 'colorado_transcription_before_values_changed: %', v_receipt->>'object_ref';
    end if;
    if exists (select 1 from public.luminari_resource_transcription_revision_v1
      where supersedes_revision_id=(v_receipt->>'revision_id')::uuid) then
      raise exception 'colorado_transcription_receipt_superseded_requires_new_review';
    end if;
    select to_jsonb(r)-'revision_sequence'-'created_at' into v_stored
    from public.luminari_resource_transcription_revision_v1 r
    where r.revision_id=(v_receipt->>'revision_id')::uuid;
    if found then
      if v_stored is distinct from v_receipt then
        raise exception 'colorado_transcription_existing_receipt_differs';
      end if;
      v_existing := v_existing + 1;
    end if;
  end loop;
  insert into public.luminari_resource_transcription_revision_v1 (civic_object_uid, object_ref, run_id, artifact_key, source_content_sha256, source_candidate_hash, source_locator, operation, supersedes_revision_id, resource_entity_id, before_fields, after_fields, source_span, source_text, review_ledger_sha256, reviewed_by, review_method, review_scope, review_note, revision_id)
  select civic_object_uid, object_ref, run_id, artifact_key, source_content_sha256, source_candidate_hash, source_locator, operation, supersedes_revision_id, resource_entity_id, before_fields, after_fields, source_span, source_text, review_ledger_sha256, reviewed_by, review_method, review_scope, review_note, revision_id
  from jsonb_populate_recordset(null::public.luminari_resource_transcription_revision_v1,v_receipts)
  on conflict (revision_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted <> 24-v_existing then
    raise exception 'colorado_transcription_unexpected_insert_count';
  end if;
  for v_receipt in select value from jsonb_array_elements(v_receipts) loop
    select count(*), (jsonb_agg(to_jsonb(v))->0) into v_count,v_current
    from public.v_lighthouse_resource_program_transcribed_v1 v
    where v.civic_object_uid=v_receipt->>'civic_object_uid'
      and v.object_ref=v_receipt->>'object_ref'
      and v.source_transcription_correction->>'revision_id'=v_receipt->>'revision_id';
    if v_count <> 1 or exists (select 1 from jsonb_each(v_receipt->'after_fields') f
      where v_current->f.key is distinct from f.value) then
      raise exception 'colorado_transcription_projection_mismatch';
    end if;
    if (v_current-'source_transcription_correction'-(array(select jsonb_object_keys(v_receipt->'after_fields'))))
      is distinct from ((v_originals->(v_receipt->>'object_ref'))-(array(select jsonb_object_keys(v_receipt->'after_fields')))) then
      raise exception 'colorado_transcription_unreviewed_projection_fields_changed';
    end if;
    select count(*),(jsonb_agg(to_jsonb(v))->0) into v_count,v_current
    from public.v_lighthouse_resource_program_catalog_v2 v
    where v.civic_object_uid=v_receipt->>'civic_object_uid' and v.object_ref=v_receipt->>'object_ref';
    if v_count <> 1 or v_current is distinct from v_originals->(v_receipt->>'object_ref') then
      raise exception 'colorado_transcription_raw_projection_changed';
    end if;
    select to_jsonb(r)-'revision_sequence'-'created_at' into v_stored
    from public.luminari_resource_transcription_revision_v1 r
    where r.revision_id=(v_receipt->>'revision_id')::uuid;
    if v_stored is distinct from v_receipt then
      raise exception 'colorado_transcription_committed_receipt_mismatch';
    end if;
  end loop;
end;
$apply_transcription$;
commit;
-- A fresh read after commit confirms current applicability, not merely storage.
select jsonb_build_object(
  'stored_receipts',(select count(*) from public.luminari_resource_transcription_revision_v1
    where review_ledger_sha256='3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa' and operation='correct'),
  'current_applicable_receipts',(select count(*) from public.v_luminari_resource_transcription_current_v1
    where review_ledger_sha256='3b1b982063abe2ffcc19dccf23b9331411ea3b612dfdfad73de3a3d77d4a51aa'),
  'review_scope','source_assertion_only',
  'source_content_sha256','8b37624175d4b9d6f31c8d207ac1ffb0a4c2648c479cfaba0c1405600e3fb24d'
) as colorado_transcription_application;
