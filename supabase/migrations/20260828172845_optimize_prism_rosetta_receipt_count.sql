create index if not exists civic_genome_prism_binding_receipt_count_idx
  on public.civic_genome_prism_verification_binding (
    assembly_run_id,
    prism_rule_set_id,
    prism_rule_set_version
  );
