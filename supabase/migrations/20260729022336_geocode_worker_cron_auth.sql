-- Secure the scheduled geocode worker without exposing it as a public endpoint.
--
-- The historical cron sent only the project publishable key while the Edge
-- Function required a user JWT, so every invocation was rejected at the
-- platform gateway. This migration creates a dedicated random cron secret,
-- stores only its SHA-256 digest outside Vault, exposes a service-role-only
-- verifier RPC, and rewires the existing cron job to send the secret through a
-- purpose-specific header.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.worker_cron_secret_hash (
  worker_key text primary key,
  secret_hash bytea not null,
  rotated_at timestamptz not null default now(),
  constraint worker_cron_secret_hash_worker_key_check
    check (worker_key ~ '^[a-z][a-z0-9_]*$')
);

revoke all on table private.worker_cron_secret_hash from public, anon, authenticated;

-- Create the random secret entirely inside PostgreSQL. The plaintext is never
-- returned by the migration and is retained only in Supabase Vault.
do $block$
declare
  secret_name constant text := 'geocode_worker_cron_secret';
  secret_value text;
  existing_secret_id uuid;
begin
  select id
    into existing_secret_id
    from vault.secrets
   where name = secret_name
   order by created_at desc
   limit 1;

  if existing_secret_id is null then
    secret_value := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(
      secret_value,
      secret_name,
      'Dedicated shared secret for the Lighthouse geocode worker cron',
      null
    );
  else
    select decrypted_secret
      into secret_value
      from vault.decrypted_secrets
     where id = existing_secret_id;
  end if;

  if secret_value is null or length(secret_value) < 32 then
    raise exception 'geocode worker cron secret is absent or invalid';
  end if;

  insert into private.worker_cron_secret_hash (
    worker_key,
    secret_hash,
    rotated_at
  ) values (
    'geocode_queue_worker',
    extensions.digest(secret_value, 'sha256'),
    now()
  )
  on conflict (worker_key) do update
    set secret_hash = excluded.secret_hash,
        rotated_at = excluded.rotated_at;
end
$block$;

create or replace function public.verify_geocode_worker_cron_secret(
  p_candidate text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, extensions
as $function$
  select coalesce(
    extensions.digest(coalesce(p_candidate, ''), 'sha256') = secret_hash,
    false
  )
  from private.worker_cron_secret_hash
  where worker_key = 'geocode_queue_worker'
$function$;

revoke all on function public.verify_geocode_worker_cron_secret(text)
  from public, anon, authenticated;
grant execute on function public.verify_geocode_worker_cron_secret(text)
  to service_role;

-- Replace the ineffective publishable-key-only call. verify_jwt is disabled on
-- this worker deployment; the function itself validates x-cron-secret through
-- the service-role-only verifier before reading or writing queue data.
do $block$
declare
  existing_job boolean := false;
begin
  -- Local/preview Supabase instances may not expose pg_cron. The secret and
  -- verifier remain mandatory; schedule only when the platform capability is
  -- actually present, and never report a schedule otherwise.
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
      body := '{}'::jsonb
    );
        $cron$
      )
    $schedule$;
  end if;
end
$block$;
