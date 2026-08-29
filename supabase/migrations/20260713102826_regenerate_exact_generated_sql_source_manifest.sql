begin;
delete from public.generated_sql_source_manifest
where bundle_sha256='9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be';

insert into public.generated_sql_source_manifest
(bundle_sha256, source_file, generated_row_count)
values
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','009_legal_aid_wa_schema.json',81),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','0b4fa410-355f-11f1-be9f-01c156bf41be.json',1),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','1539b5d0-34b3-11f1-9e0e-353c14cede12.json',1),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','17fd43d0-1c63-11f1-a004-e3dd95325e46.json',1),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','advocacy_targets_import_snake_case.json',16),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','coalition_agencies_import_snake_case.json',31),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','legal_statutes.csv',862),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','legislator_contacts_import_snake_case.json',12),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','LUMINARI_MASTER_SYNTHESIS-9.docx',63),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari_specification_extraction.json',200),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-advocacy-coalition-network(2).json',87),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-alabama-ENRICHED-PASS3-2026-3.docx',570),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-ALABAMA-RESOURCE-DIRECTORY-2026-2.docx',365),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-alaska-ENRICHED-PASS3-2026.docx',554),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-ALASKA-RESOURCE-DIRECTORY-2026.docx',446),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-alaska-TRIBAL-ADDENDUM-2026.docx',133),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-american-samoa-ENRICHED-PASS3-2026-1.docx',351),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-AMERICAN-SAMOA-RESOURCE-DIRECTORY-2026-1.docx',334),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-arizona-ENRICHED-PASS3-2026-1.docx',543),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-ARIZONA-RESOURCE-DIRECTORY-2026.docx',380),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-arkansas-ENRICHED-PASS3-2026.docx',538),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-ARKANSAS-RESOURCE-DIRECTORY-2026-2 (1).docx',362),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-benefits-cascade-4.docx',124),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-california-ENRICHED-PASS3-2026-2.docx',556),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-CALIFORNIA-RESOURCE-DIRECTORY-2026.docx',441),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-claim-catalog-enriched.docx',310),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-CNMI-RESOURCE-DIRECTORY-2026-2.docx',362),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-colorado-ENRICHED-PASS2-2026.docx',349),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-colorado-registry-3.docx',263),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-COLORADO-RESOURCE-DIRECTORY-2026.docx',368),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-connecticut-ENRICHED-PASS3-2026-1.docx',493),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-CONNECTICUT-RESOURCE-DIRECTORY-2026-1.docx',410),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-delaware-ENRICHED-PASS3-2026.docx',458),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-DELAWARE-RESOURCE-DIRECTORY-2026-2.docx',372),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-DISABILITY-SERVICES-DEEP-DIVE-2026-2.docx',334),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-federal-master-1.docx',43),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-florida-ENRICHED-PASS3-2026.docx',558),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-FLORIDA-RESOURCE-DIRECTORY-2026-1.docx',404),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-gap-playbook.docx',30),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-georgia-ENRICHED-PASS3-2026.docx',547),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-GEORGIA-RESOURCE-DIRECTORY-2026-1.docx',387),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-guam-ENRICHED-PASS3-2026-3.docx',349),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-GUAM-RESOURCE-DIRECTORY-2026-2.docx',381),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-hawaii-ENRICHED-PASS3-2026 (1).docx',496),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-HAWAII-RESOURCE-DIRECTORY-2026.docx',392),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-HOUSING-DEEP-DIVE-2026.docx',347),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-idaho-ENRICHED-PASS3-2026.docx',546),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-IDAHO-RESOURCE-DIRECTORY-2026.docx',465),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-illinois-ENRICHED-PASS3-2026.docx',527),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-ILLINOIS-RESOURCE-DIRECTORY-2026.docx',379),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-indiana-ENRICHED-PASS3-2026-1.docx',524),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-INDIANA-RESOURCE-DIRECTORY-2026 (1).docx',373),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-iowa-ENRICHED-PASS3-2026.docx',354),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-IOWA-RESOURCE-DIRECTORY-2026 (1).docx',349),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-kansas-ENRICHED-PASS3-2026.docx',350),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-KANSAS-RESOURCE-DIRECTORY-2026.docx',353),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-kentucky-ENRICHED-PASS3-2026.docx',521),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-KENTUCKY-RESOURCE-DIRECTORY-2026.docx',370),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-LABOR-EMPLOYMENT-DEEP-DIVE-2026.docx',300),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-LATINO-HISPANIC-DEEP-DIVE-2026-1.docx',289),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-louisiana-ENRICHED-PASS3-2026.docx',535),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-LOUISIANA-RESOURCE-DIRECTORY-2026.docx',402),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-maine-ENRICHED-PASS3-2026-1.docx',471),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-MAINE-RESOURCE-DIRECTORY-2026.docx',411),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-maryland-ENRICHED-PASS3-2026-1.docx',502),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-MARYLAND-RESOURCE-DIRECTORY-2026.docx',377),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-massachusetts-ENRICHED-PASS3-2026-3.docx',512),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-MASSACHUSETTS-RESOURCE-DIRECTORY-2026.docx',409),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-MENTAL-HEALTH-DEEP-DIVE-2026-3.docx',650),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-michigan-ENRICHED-PASS3-2026-1.docx',518),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-MICHIGAN-RESOURCE-DIRECTORY-2026-1.docx',380),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-minnesota-ENRICHED-PASS3-2026.docx',531),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-minnesota-registry-3.docx',263),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-mississippi-ENRICHED-PASS3-2026.docx',516),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-MISSISSIPPI-RESOURCE-DIRECTORY-2026-3.docx',378),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-missouri-ENRICHED-PASS3-2026.docx',529),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-MISSOURI-RESOURCE-DIRECTORY-2026 (1).docx',355),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-montana-ENRICHED-PASS3-2026.docx',512),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-MONTANA-RESOURCE-DIRECTORY-2026-1.docx',367),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-national-tribal-addendum.docx',17),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-NATIVE-AMERICAN-TRIBAL-DEEP-DIVE-2026-1.docx',299),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-nebraska-ENRICHED-PASS3-2026.docx',520),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-NEBRASKA-RESOURCE-DIRECTORY-2026.docx',360),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-nevada-ENRICHED-PASS3-2026-1.docx',514),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-NEVADA-RESOURCE-DIRECTORY-2026.docx',374),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-new-hampshire-ENRICHED-PASS3-2026.docx',419),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-new-hampshire-registry-2.docx',173),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-NEW-HAMPSHIRE-RESOURCE-DIRECTORY-2026.docx',381),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-new-jersey-ENRICHED-PASS3-2026.docx',529),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-NEW-JERSEY-RESOURCE-DIRECTORY-2026-1.docx',414),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-new-mexico-ENRICHED-PASS3-2026.docx',532),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-new-york-ENRICHED-PASS3-2026.docx',539),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-NEW-YORK-RESOURCE-DIRECTORY-2026.docx',417),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-NEWMEXICO-RESOURCE-DIRECTORY-2026-1.docx',400),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-north-carolina-ENRICHED-PASS3-2026-1.docx',536),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-north-dakota-ENRICHED-PASS3-2026.docx',413),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-NORTHCAROLINA-RESOURCE-DIRECTORY-2026-2.docx',391),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-NORTHDAKOTA-RESOURCE-DIRECTORY-2026.docx',355),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-northern-mariana-islands-ENRICHED-PASS3-2026-1.docx',349),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-ohio-ENRICHED-PASS3-2026.docx',533),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-OHIO-RESOURCE-DIRECTORY-2026.docx',385),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-oklahoma-ENRICHED-PASS3-2026.docx',523),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-OKLAHOMA-RESOURCE-DIRECTORY-2026.docx',381),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-oregon-ENRICHED-PASS3-2026.docx',551),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-OREGON-RESOURCE-DIRECTORY-2026 (1).docx',466),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-pennsylvania-ENRICHED-PASS3-2026.docx',545),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-PENNSYLVANIA-RESOURCE-DIRECTORY-2026-1.docx',388),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-puerto-rico-ENRICHED-PASS3-2026-1.docx',452),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-PUERTO-RICO-RESOURCE-DIRECTORY-2026-1.docx',416),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-rhode-island-ENRICHED-PASS3-2026.docx',410),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-RHODE-ISLAND-RESOURCE-DIRECTORY-2026-3.docx',338),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-sol-collision.docx',30),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-south-carolina-ENRICHED-PASS3-2026-1.docx',515),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-south-dakota-ENRICHED-PASS3-2026.docx',410),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-SOUTHCAROLINA-RESOURCE-DIRECTORY-2026-1.docx',374),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-SOUTHDAKOTA-RESOURCE-DIRECTORY-2026.docx',373),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-SUBSTANCE-USE-RECOVERY-RESOURCE-DIRECTORY-2026.docx',1073),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-tennessee-ENRICHED-PASS3-2026.docx',518),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-TENNESSEE-RESOURCE-DIRECTORY-2026-1.docx',375),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-texas-ENRICHED-PASS3-2026 (1).docx',542),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-TEXAS-RESOURCE-DIRECTORY-2026-1.docx',397),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-unrecognized-tribes-addendum.docx',16),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-us-territories.docx',19),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-us-virgin-islands-ENRICHED-PASS3-2026-1.docx',350),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-US-VIRGIN-ISLANDS-RESOURCE-DIRECTORY-2026-1.docx',398),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-utah-ENRICHED-PASS3-2026.docx',353),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-UTAH-RESOURCE-DIRECTORY-2026.docx',370),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-vermont-ENRICHED-PASS3-2026.docx',473),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-VERMONT-RESOURCE-DIRECTORY-2026.docx',403),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-virginia-ENRICHED-PASS3-2026.docx',523),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-VIRGINIA-RESOURCE-DIRECTORY-2026.docx',380),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-washington-dc-ENRICHED-PASS3-2026-1.docx',414),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-WASHINGTON-DC-RESOURCE-DIRECTORY-2026-1.docx',405),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-washington-ENRICHED-PASS3-2026.docx',556),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-washington-state-registry.docx',65),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-west-virginia-ENRICHED-PASS3-2026.docx',511),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-WESTVIRGINIA-RESOURCE-DIRECTORY-2026.docx',374),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-wisconsin-ENRICHED-PASS3-2026.docx',530),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-WISCONSIN-RESOURCE-DIRECTORY-2026 (1).docx',378),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-wyoming-ENRICHED-PASS3-2026.docx',414),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminari-WYOMING-RESOURCE-DIRECTORY-2026.docx',361),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','luminary-benefits-Federal.docx',1),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be','registry_programs_clean_partial.json',8361);

with exact_matches as (
    select g.generated_source_id, m.artifact_manifest_id
    from public.generated_sql_source_manifest g
    join public.corpus_artifact_manifest m
      on lower(m.object_name)=lower(g.source_file)
    where g.bundle_sha256='9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be'
)
update public.generated_sql_source_manifest g
set matched_artifact_manifest_id=e.artifact_manifest_id,
    match_method='exact',
    updated_at=now()
from exact_matches e
where g.generated_source_id=e.generated_source_id;

with normalized_candidates as (
    select g.generated_source_id,
           min(m.artifact_manifest_id) as artifact_manifest_id,
           count(*) as match_count
    from public.generated_sql_source_manifest g
    join public.corpus_artifact_manifest m
      on public.normalize_corpus_artifact_filename(m.object_name)
       = public.normalize_corpus_artifact_filename(g.source_file)
    where g.bundle_sha256='9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be'
      and g.matched_artifact_manifest_id is null
    group by g.generated_source_id
)
update public.generated_sql_source_manifest g
set matched_artifact_manifest_id=n.artifact_manifest_id,
    match_method='normalized',
    updated_at=now()
from normalized_candidates n
where g.generated_source_id=n.generated_source_id
  and n.match_count=1;

update public.generated_sql_source_manifest
set match_method='unmatched', updated_at=now()
where bundle_sha256='9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be'
  and matched_artifact_manifest_id is null;

update public.corpus_artifact_manifest m
set generated_sql_present=exists (
  select 1 from public.generated_sql_source_manifest g
  where g.matched_artifact_manifest_id=m.artifact_manifest_id
    and g.bundle_sha256='9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be'
), updated_at=now();

update public.generated_sql_bundle_audit
set manifest_source_count=(select count(*) from public.generated_sql_source_manifest where bundle_sha256='9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be'),
    manifest_generated_row_count=(select coalesce(sum(generated_row_count),0) from public.generated_sql_source_manifest where bundle_sha256='9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be'),
    source_count_delta=160-(select count(*) from public.generated_sql_source_manifest where bundle_sha256='9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be'),
    row_count_delta=35954-(select coalesce(sum(generated_row_count),0) from public.generated_sql_source_manifest where bundle_sha256='9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be'),
    audit_status=case when
      (select count(*) from public.generated_sql_source_manifest where bundle_sha256='9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be')=160
      and (select coalesce(sum(generated_row_count),0) from public.generated_sql_source_manifest where bundle_sha256='9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be')=35954
      then 'verified' else 'mismatch' end,
    notes='Exact generated source manifest regenerated directly from uploaded SQL tuple rows.',
    audited_at=now(), updated_at=now()
where bundle_sha256='9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be';

update public.substrate_source_artifact
set deployment_status='staged',
    notes='Exact direct-parse source manifest now contains 160 row-bearing sources and 35,954 tuple rows. Bundle-wide promotion still requires per-target reconciliation.',
    updated_at=now()
where source_sha256='9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be';
commit;
