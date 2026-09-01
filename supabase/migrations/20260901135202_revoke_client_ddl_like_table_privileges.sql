begin;

-- Browser-facing roles need normal CRUD only when an RLS policy explicitly
-- permits it. These DDL-like table privileges are outside that contract and
-- bypass or weaken the intended PostgREST/RLS boundary.
revoke truncate, references, trigger
  on all tables in schema public
  from anon, authenticated;

-- Repository migrations create public tables as postgres. Preserve the same
-- least-privilege boundary for future tables created by that owner.
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables
  from anon, authenticated;

commit;
