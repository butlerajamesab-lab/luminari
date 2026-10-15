-- CI-only disposable PostgreSQL fixture. NEVER run against live Supabase.
CREATE ROLE service_role;
CREATE TABLE public.civic_genome_trait (id integer PRIMARY KEY);
CREATE TABLE public.civic_genome_assembly_run (id integer PRIMARY KEY, rosetta_engine_version text);
CREATE TABLE public.civic_genome_rosetta_structural_representation (id integer PRIMARY KEY);
CREATE TABLE public.civic_genome_rosetta_source_binding (id integer PRIMARY KEY);
CREATE TABLE public.civic_genome_rosetta_generation_target (id integer PRIMARY KEY, engine_version text);
CREATE TABLE public.civic_genome_rosetta_generation_activation_queue (id integer PRIMARY KEY, queue_state text NOT NULL DEFAULT 'eligible');
CREATE TABLE public.civic_genome_rosetta_generation_upgrade_queue (id integer PRIMARY KEY, queue_state text NOT NULL DEFAULT 'eligible');
CREATE TABLE public.civic_genome_bill (
  id integer PRIMARY KEY,
  structural_dna_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  structural_dna_hash text NOT NULL DEFAULT '',
  rosetta_extraction_run_id text
);
CREATE TABLE public.civic_genome_bill_version (
  id integer PRIMARY KEY,
  processing_state text NOT NULL DEFAULT 'registered',
  rosetta_extraction_run_id text,
  assembly_run_id uuid,
  receipt_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Model historical rows that predate the quarantine; they remain readable
-- and can be individually removed by a later, separately authorized purge.
INSERT INTO public.civic_genome_trait (id) VALUES (1);
INSERT INTO public.civic_genome_assembly_run (id,rosetta_engine_version) VALUES (1,NULL);
INSERT INTO public.civic_genome_rosetta_generation_target (id,engine_version) VALUES (1,'rosetta-v3-deterministic-sql-2.5.40');
INSERT INTO public.civic_genome_rosetta_generation_activation_queue (id) VALUES (1);
INSERT INTO public.civic_genome_rosetta_generation_upgrade_queue (id) VALUES (1);
INSERT INTO public.civic_genome_bill(id,structural_dna_json,structural_dna_hash,rosetta_extraction_run_id)
VALUES (2,'{"source_bill_id":200,"rosetta_assembly":{"engine":"old"},"rosetta_source_receipt":{"run":"old"}}','legacy-hash','legacy-run');
INSERT INTO public.civic_genome_bill_version(id,processing_state,rosetta_extraction_run_id,receipt_json)
VALUES (2,'verified_with_findings','legacy-run','{"provider_hash":"valid-source","rosetta_engine_version":"legacy","assembly_trait_count":7}');

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.civic_genome_trait,public.civic_genome_assembly_run,
  public.civic_genome_rosetta_structural_representation,
  public.civic_genome_rosetta_source_binding,
  public.civic_genome_rosetta_generation_target
TO service_role;
