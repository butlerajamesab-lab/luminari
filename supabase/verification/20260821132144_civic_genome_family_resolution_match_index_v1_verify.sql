select
  index_class.relname as index_name,
  index_state.indisvalid as is_valid,
  index_state.indisready as is_ready,
  pg_size_pretty(pg_relation_size(index_state.indexrelid)) as index_size,
  pg_get_indexdef(index_state.indexrelid) as index_definition
from pg_index index_state
join pg_class index_class on index_class.oid = index_state.indexrelid
where index_state.indexrelid = 'public.idx_civic_genome_trait_confirmed_match'::regclass;
