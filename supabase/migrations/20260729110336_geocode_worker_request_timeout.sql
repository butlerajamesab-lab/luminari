-- Keep the authenticated geocode cron request alive long enough for the bounded
-- worker batch to complete. The original pg_net call inherited the 5-second
-- default, which exposed the successful authentication repair but timed out
-- before the Edge Function could finish its sequential geocoder work.
--
-- Ten rows preserves bounded execution while a 120-second caller timeout leaves
-- room for upstream latency and the worker's retry-safe queue transitions.

do $block$
declare
  existing_job boolean := false;
begin
  -- A local or preview Supabase stack may not expose pg_cron. The previous
  -- migration already made the authentication boundary mandatory; update the
  -- schedule only when the scheduling capability is actually present.
  if to_regclass('cron.job') is not null
     and to_regprocedure('cron.schedule(text,text,text)') is not null
     and to_regprocedure('cron.unschedule(text)') is not null then
    execute $query$
      select exists (
        select 1
        from cron.job
        where jobname = 'geocode-queue-worker-timer'
      )
    $query$
    into existing_job;

    if existing_job then
      execute $query$
        select cron.unschedule('geocode-queue-worker-timer')
      $query$;
    end if;

    execute $schedule$
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
      ) || '/functions/v1/geocode-queue-worker?batch_size=10',
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
      timeout_milliseconds := 120000
    );
        $cron$
      )
    $schedule$;
  end if;
end
$block$;
