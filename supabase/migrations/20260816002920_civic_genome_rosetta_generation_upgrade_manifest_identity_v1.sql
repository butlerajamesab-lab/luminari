begin;

alter table public.civic_genome_rosetta_generation_upgrade_queue
  alter column target_rule_manifest_hash set not null;

alter table public.civic_genome_rosetta_generation_upgrade_queue
  drop constraint if exists civic_genome_rosetta_generati_source_document_id_target_eng_key;

alter table public.civic_genome_rosetta_generation_upgrade_queue
  add constraint civic_genome_rosetta_generation_upgrade_queue_generation_unique
  unique (
    source_document_id,
    target_engine_version,
    target_rule_set_version,
    target_rule_manifest_hash
  );

comment on constraint civic_genome_rosetta_generation_upgrade_queue_generation_unique
  on public.civic_genome_rosetta_generation_upgrade_queue is
  'One durable upgrade job per exact Rosetta source document and exact engine/rule/manifest generation receipt.';

commit;
