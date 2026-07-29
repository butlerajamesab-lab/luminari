-- Give the authenticated geocode worker enough time to verify its dedicated
-- Vault-backed cron secret and process one bounded batch.
--
-- The first custom-auth deployment reached the Edge Function, but pg_net's
-- default 5-second timeout expired while the service-role verifier completed.
-- The worker now distinguishes a rejected credential from verifier
-- unavailability. This migration preserves the existing schedule, URL, batch
-- size, publishable gateway key, and x-cron-secret while increasing only the
-- pg_net request timeout.

do $block$
begin
  if exists (
    select 1
      from cron.job
     where jobname = 'geocode-queue-worker-timer'
  ) then
    perform cron.unschedule('geocode-queue-worker-timer');
  end if;
end
$block$;

select cron.schedule(
  'geocode-queue-worker-timer',
  '*/15 * * * *',
  $cron$
    select net.http_post(
      url := (
        select decrypted_secret
          from vault.decrypted_secrets
         where name = 'project_url'
         order by created_at desc
         limit 1
      ) || '/functions/v1/geocode-queue-worker?batch_size=25',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          select decrypted_secret
            from vault.decrypted_secrets
           where name = 'publishable_key'
           order by created_at desc
           limit 1
        ),
        'x-cron-secret', (
          select decrypted_secret
            from vault.decrypted_secrets
           where name = 'geocode_worker_cron_secret'
           order by created_at desc
           limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$
);
