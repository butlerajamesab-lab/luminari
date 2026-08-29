
-- Drop the old restrictive constraint and replace with expanded version
-- that covers all resource types present in the new data files
ALTER TABLE programs DROP CONSTRAINT IF EXISTS programs_resource_type_check;

ALTER TABLE programs ADD CONSTRAINT programs_resource_type_check
CHECK (resource_type = ANY (ARRAY[
  -- Original values
  'emergency_cash','rental_assistance','utility_assistance','food','healthcare',
  'mental_health','substance_use','dental','vision','prescription','housing',
  'shelter','dv_services','legal_aid','expungement','immigration',
  'benefits_navigation','disability','veterans','childcare','youth',
  'elder_care','job_training','transportation','tribal','faith_based',
  'nonprofit_emergency','grant','hotline','other',
  -- New values from wa-resources and canonical registry
  'benefits_office','clinic','hospital','food_bank','tribal_service',
  'housing_provider','nonprofit','program','community_health',
  'workforce','financial_assistance','crisis_line'
]));
