begin;
alter table public.substrate_candidate_disposition drop constraint if exists substrate_candidate_disposition_candidate_kind_check;
alter table public.substrate_candidate_disposition add constraint substrate_candidate_disposition_candidate_kind_check check (candidate_kind = any (array['exploded_field'::text,'normalized_resource'::text,'normalized_program'::text,'normalized_statute'::text,'normalized_case_law'::text,'normalized_contact'::text,'normalized_location'::text,'state_directory_entry'::text,'workflow'::text,'deadline'::text,'signal'::text,'other'::text]));
commit;