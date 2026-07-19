-- Historical reconciliation record.
--
-- The original May 17 projection used quoted frontend-style camelCase column
-- names such as "agencyName", "complaintType", and "patternDescription".
-- The live database is snake_case and production already contains a broader,
-- evolved public.v_unified_civic_infrastructure view backed by nine sources.
--
-- Replaying the original three-source projection would both fail against the
-- snake_case schema and overwrite working production infrastructure. The live
-- view is authoritative for this checkpoint.
--
-- No tables, views, columns, policies, or data are changed.

select 1;
