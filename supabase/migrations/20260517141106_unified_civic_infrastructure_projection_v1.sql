-- Historical reconciliation record.
--
-- Production already contains the evolved public.v_unified_civic_infrastructure
-- view. The original May 17 projection used obsolete quoted camelCase column
-- names and a narrower three-source definition. Replaying it would fail against
-- the snake_case database and overwrite the authoritative production view.
--
-- This timestamp matches a migration version already recorded in production.
-- No tables, views, columns, policies, or data are changed.

select 1;
