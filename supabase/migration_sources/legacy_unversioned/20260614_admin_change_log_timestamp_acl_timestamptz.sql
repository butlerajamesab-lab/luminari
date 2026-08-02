alter table public.admin_change_log
  alter column timestamp_acl type timestamptz
  using case
    when timestamp_acl is null then null
    else to_timestamp(timestamp_acl::double precision / 1000.0)
  end;

alter table public.admin_change_log
  alter column timestamp_acl set default now();
