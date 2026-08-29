grant usage on schema public to anon, authenticated, service_role;
grant all privileges on all tables in schema public to postgres, service_role;
grant select, insert, update, delete, truncate, references, trigger on all tables in schema public to anon, authenticated;
grant usage, select, update on all sequences in schema public to anon, authenticated;
grant all privileges on all sequences in schema public to postgres, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete, truncate, references, trigger on tables to anon, authenticated;
alter default privileges in schema public grant usage, select, update on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
