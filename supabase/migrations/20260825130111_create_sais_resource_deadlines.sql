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
