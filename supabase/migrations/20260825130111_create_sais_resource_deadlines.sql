-- Production migration-ledger reconciliation.
--
-- This table already exists in Lighthouse under migration version
-- 20260825130111. Keep this file byte-equivalent in effect so fresh databases
-- and the repository describe the same history. Forward security changes live
-- in a later migration; do not rewrite this historical statement.

CREATE TABLE IF NOT EXISTS sais_resource_deadlines (
  resource_id text PRIMARY KEY REFERENCES sais_resources(resource_id) ON DELETE CASCADE,
  appeal_deadline text,
  continued_benefits_deadline text,
  hearing_request_deadline text,
  reconsideration_deadline text,
  judicial_review_deadline text,
  source_file text,
  source_hash8 text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
