create or replace function private.invoke_geocode_worker_once(p_batch_size integer default 1)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, net, vault
as $function$
declare
  v_url text;
  v_key text;
  v_cron_secret text;
  v_request_id bigint;
  v_batch integer := greatest(1, least(coalesce(p_batch_size, 1), 10));
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' order by created_at desc limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'publishable_key' order by created_at desc limit 1;
  select decrypted_secret into v_cron_secret from vault.decrypted_secrets where name = 'geocode_worker_cron_secret' order by created_at desc limit 1;
  select net.http_post(
    url := v_url || '/functions/v1/geocode-queue-worker?batch_size=' || v_batch::text,
    headers := jsonb_build_object('Content-Type','application/json','apikey',v_key,'x-cron-secret',v_cron_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) into v_request_id;
  return v_request_id;
end
$function$;
revoke all on function private.invoke_geocode_worker_once(integer) from public, anon, authenticated;
grant execute on function private.invoke_geocode_worker_once(integer) to postgres;
