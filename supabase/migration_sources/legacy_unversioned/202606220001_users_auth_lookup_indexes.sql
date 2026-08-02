create index if not exists users_open_id_idx
  on public.users (open_id)
  where open_id is not null;

create index if not exists users_lower_email_idx
  on public.users ((lower(email)))
  where email is not null;
