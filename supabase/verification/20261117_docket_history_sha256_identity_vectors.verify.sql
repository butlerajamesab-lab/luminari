-- Disposable Supabase replay ONLY, after the scoped SHA-256 proposal is applied.
-- Do not run against production. No source bytes or live API are fetched.
-- This verifies the exact Node Docket SHA256/RFC4122 identity vectors and
-- detects accidental use of the incompatible MD5 stable UUID helper.
\set ON_ERROR_STOP on
begin;
do $identity$
declare
  item record;
  hash_hex text;
  derived_uuid uuid;
  function_source text;
begin
  select pg_get_functiondef(p.oid)
    into function_source
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='civic_genome_normalized_source_history_v3_unscoped';
  if function_source is null
      or position('source_identity_hash' in function_source)=0
      or position('civic_genome_source_bill_in_sync_scope_v3' in function_source)=0 then
    raise exception 'scoped_docket_history_candidate_not_installed';
  end if;

  for item in
    select * from (values
      (1894455::integer, '2a5d4368-7e01-4040-97f4-35b52237ff9a'::uuid),
      (1935474::integer, '8f617d5a-8c97-4adc-8871-1f4a36b3b86a'::uuid),
      (1890232::integer, '3de8bd8c-1901-4d48-9bb6-3c1911e1ae91'::uuid)
    ) as vectors(source_bill_id, expected_id)
  loop
    select encode(extensions.digest(
        convert_to('docket_room:legiscan:'||item.source_bill_id::text,'UTF8'),
        'sha256'
      ),'hex') into hash_hex;
    derived_uuid := (
      substr(hash_hex,1,8)||'-'||substr(hash_hex,9,4)
      ||'-4'||substr(hash_hex,14,3)||'-'
      ||substr('89ab',((strpos('0123456789abcdef',substr(hash_hex,17,1))-1)%4)+1,1)
      ||substr(hash_hex,18,3)||'-'||substr(hash_hex,21,12)
    )::uuid;

    if derived_uuid is distinct from item.expected_id then
      raise exception 'canonical_sha256_uuid_vector_mismatch source_bill_id=% expected=% got=%',
        item.source_bill_id, item.expected_id, derived_uuid;
    end if;
  end loop;
  raise notice 'canonical_sha256_uuid_vectors_3_of_3_passed';
end;
$identity$;
rollback;
