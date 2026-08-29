insert into public.civic_genome_node (node_key,node_type,node_label,domain_key,lifecycle_status,verification_status,source_family_key,source_table,source_pk,attributes_json,provenance_json)
values
('civic_system:luminari','civic_system','Luminari Civic Knowledge System','civic_system','active','verified','luminari','system_seed','luminari',jsonb_build_object('role','root','scope','cross_domain'),jsonb_build_object('source_system','lighthouse','creation_method','deterministic_seed')),
('corpus:systemic_abuse_intelligence','knowledge_corpus','Systemic Abuse Intelligence Series','systemic_abuse_intelligence','active','verified','systemic_abuse_intelligence','corpus_seed','systemic_abuse_intelligence',jsonb_build_object('series_type','civic_domain_corpus','integration_status','initial'),jsonb_build_object('source_system','lighthouse','creation_method','deterministic_seed')),
('domain:public_benefits_access','civic_domain','Public Benefits Access','public_benefits_access','active','verified','systemic_abuse_intelligence','document_seed','SAIS-DOC18',jsonb_build_object('document_number',18,'resource_prefix','SAIS-BA','integration_status','awaiting_canonical_resource_ingest'),jsonb_build_object('source_system','uploaded_document','source_filename','luminari-SAIS-DOC18-PUBLIC-BENEFITS-ACCESS-2026.docx','verified_at','2026-07-22')),
('domain:civil_documents_and_identity','civic_domain','Civil Documents and Identity','civil_documents_and_identity','active','verified','systemic_abuse_intelligence','document_seed','SAIS-DOC19',jsonb_build_object('document_number',19,'resource_prefix','SAIS-CV','integration_status','awaiting_canonical_resource_ingest'),jsonb_build_object('source_system','uploaded_document','source_filename','luminari-SAIS-DOC19-CIVIL-DOCUMENTS-IDENTITY-2026.docx','verified_at','2026-07-22')),
('domain:youth_and_foster_care','civic_domain','Youth and Foster Care','youth_and_foster_care','active','verified','systemic_abuse_intelligence','document_seed','SAIS-DOC20',jsonb_build_object('document_number',20,'resource_prefix','SAIS-YF','integration_status','awaiting_canonical_resource_ingest'),jsonb_build_object('source_system','uploaded_document','source_filename','luminari-SAIS-DOC20-YOUTH-FOSTER-CARE-2026.docx','verified_at','2026-07-22'))
on conflict (node_key) do update set node_label=excluded.node_label,node_type=excluded.node_type,domain_key=excluded.domain_key,lifecycle_status=excluded.lifecycle_status,verification_status=excluded.verification_status,attributes_json=excluded.attributes_json,provenance_json=excluded.provenance_json,last_seen_at=now();

insert into public.civic_genome_edge (edge_key,from_node_id,to_node_id,relationship_type,relationship_status,confidence_score,verification_status,evidence_json,provenance_json)
select 'edge:civic_system:luminari:contains:corpus:systemic_abuse_intelligence',root.node_id,corpus.node_id,'contains','asserted',1,'verified',jsonb_build_object('basis','registered family contract'),jsonb_build_object('creation_method','deterministic_seed')
from public.civic_genome_node root join public.civic_genome_node corpus on corpus.node_key='corpus:systemic_abuse_intelligence' where root.node_key='civic_system:luminari'
on conflict (edge_key) do nothing;

insert into public.civic_genome_edge (edge_key,from_node_id,to_node_id,relationship_type,relationship_status,confidence_score,verification_status,evidence_json,provenance_json)
select 'edge:corpus:systemic_abuse_intelligence:contains:' || domain.node_key,corpus.node_id,domain.node_id,'contains','asserted',1,'verified',jsonb_build_object('basis','document membership','document_number',domain.attributes_json ->> 'document_number'),jsonb_build_object('creation_method','deterministic_seed')
from public.civic_genome_node corpus join public.civic_genome_node domain on domain.node_key in ('domain:public_benefits_access','domain:civil_documents_and_identity','domain:youth_and_foster_care') where corpus.node_key='corpus:systemic_abuse_intelligence'
on conflict (edge_key) do nothing;

insert into public.civic_genome_edge (edge_key,from_node_id,to_node_id,relationship_type,relationship_status,confidence_score,verification_status,evidence_json,provenance_json)
select seed.edge_key,source.node_id,target.node_id,seed.relationship_type,'observed',1,'verified',seed.evidence_json,jsonb_build_object('source_system','uploaded_document','creation_method','manual_verified_seed')
from (values
('edge:domain:civil_documents_and_identity:enables:domain:public_benefits_access','domain:civil_documents_and_identity','domain:public_benefits_access','enables',jsonb_build_object('basis','identity documents are prerequisites for many benefit applications')),
('edge:domain:youth_and_foster_care:depends_on:domain:civil_documents_and_identity','domain:youth_and_foster_care','domain:civil_documents_and_identity','depends_on',jsonb_build_object('basis','transition-age youth require identity records for education, employment, housing, and benefits')),
('edge:domain:youth_and_foster_care:intersects:domain:public_benefits_access','domain:youth_and_foster_care','domain:public_benefits_access','intersects',jsonb_build_object('basis','foster and homeless youth pathways overlap with benefits, childcare, education, and cash assistance'))
) as seed(edge_key,from_key,to_key,relationship_type,evidence_json)
join public.civic_genome_node source on source.node_key=seed.from_key
join public.civic_genome_node target on target.node_key=seed.to_key
on conflict (edge_key) do nothing;
