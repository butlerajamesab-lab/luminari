ALTER TABLE IF EXISTS public.trend_records ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT true;
ALTER TABLE IF EXISTS public.trends ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT true;
ALTER TABLE IF EXISTS public.signal_change_percentages ADD COLUMN IF NOT EXISTS expected_value NUMERIC;
ALTER TABLE IF EXISTS public.policy_changes ADD COLUMN IF NOT EXISTS expected_value NUMERIC;

CREATE TABLE IF NOT EXISTS public.policy_pattern_impacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID,
  pattern_id UUID,
  impact_score NUMERIC,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_pattern_impacts_policy_id
ON public.policy_pattern_impacts(policy_id);

CREATE INDEX IF NOT EXISTS idx_policy_pattern_impacts_pattern_id
ON public.policy_pattern_impacts(pattern_id);
