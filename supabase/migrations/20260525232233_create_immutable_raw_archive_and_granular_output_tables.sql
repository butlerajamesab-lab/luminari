
-- IMMUTABLE ARCHIVE: Raw material locked away
CREATE TABLE IF NOT EXISTS registry_raw_archive (
  id BIGSERIAL PRIMARY KEY,
  source_table TEXT NOT NULL,
  source_id BIGINT,
  raw_content TEXT NOT NULL,
  archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  locked BOOLEAN DEFAULT TRUE
);
CREATE INDEX idx_raw_archive_source ON registry_raw_archive(source_table);
ALTER TABLE registry_raw_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY archive_read_only ON registry_raw_archive FOR ALL USING (locked = TRUE);

-- Archive optional legacy sources only when their exact contracts exist.
-- Their absence on a zero-based replay must not prevent the immutable archive
-- and granular output schema from being created.
do $archive$
declare
  prerequisite_count integer;
begin
  select count(*)
    into prerequisite_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'raw_table_cells'
    and column_name = any(array[
      'id',
      'cell_text'
    ]);

  if prerequisite_count = 2 then
    execute $insert$
      insert into public.registry_raw_archive
        (source_table, source_id, raw_content)
      select 'raw_table_cells', id, cell_text
      from public.raw_table_cells
      where cell_text is not null
    $insert$;
  end if;

  select count(*)
    into prerequisite_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'field_dictionary'
    and column_name = any(array[
      'id',
      'field_name'
    ]);

  if prerequisite_count = 2 then
    execute $insert$
      insert into public.registry_raw_archive
        (source_table, source_id, raw_content)
      select 'field_dictionary', id, field_name
      from public.field_dictionary
      where field_name is not null
    $insert$;
  end if;
end
$archive$;

-- GRANULAR OUTPUT TABLES (by specific resource type, not generic categories)

-- Food Banks
CREATE TABLE IF NOT EXISTS registry_entities_food_banks (
  id BIGSERIAL PRIMARY KEY,
  organization_name TEXT NOT NULL,
  service_categories TEXT[],
  eligibility_summary TEXT,
  phone TEXT,
  email TEXT,
  website_url TEXT,
  phone_formatted TEXT,
  has_phone BOOLEAN,
  has_website BOOLEAN,
  has_email BOOLEAN,
  hours_of_operation TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  county TEXT,
  state TEXT,
  postal_code TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  operational_status TEXT,
  accepting_intake BOOLEAN,
  by_appointment BOOLEAN,
  first_come_first_served BOOLEAN,
  is_24_7 BOOLEAN,
  is_seasonal BOOLEAN,
  service_area TEXT,
  languages_served TEXT[],
  accepts_cash_assistance BOOLEAN,
  requires_application BOOLEAN,
  application_methods TEXT[],
  documents_required TEXT[],
  income_limits TEXT,
  confidence_scores JSONB,
  source_id TEXT,
  forensic_provenance JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shelters
CREATE TABLE IF NOT EXISTS registry_entities_shelters (
  id BIGSERIAL PRIMARY KEY,
  organization_name TEXT NOT NULL,
  shelter_type TEXT,
  service_categories TEXT[],
  phone TEXT,
  email TEXT,
  website_url TEXT,
  phone_formatted TEXT,
  has_phone BOOLEAN,
  has_website BOOLEAN,
  has_email BOOLEAN,
  hours_of_operation TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  county TEXT,
  state TEXT,
  postal_code TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  bed_count INTEGER,
  accepts_families BOOLEAN,
  accepts_children BOOLEAN,
  accepts_pets BOOLEAN,
  accepts_individuals BOOLEAN,
  requires_background_check BOOLEAN,
  is_24_7 BOOLEAN,
  intake_phone TEXT,
  intake_process TEXT,
  eligibility_summary TEXT,
  confidence_scores JSONB,
  source_id TEXT,
  forensic_provenance JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Hospitals & Healthcare
CREATE TABLE IF NOT EXISTS registry_entities_hospitals (
  id BIGSERIAL PRIMARY KEY,
  organization_name TEXT NOT NULL,
  facility_type TEXT,
  service_categories TEXT[],
  phone TEXT,
  email TEXT,
  website_url TEXT,
  phone_formatted TEXT,
  has_phone BOOLEAN,
  has_website BOOLEAN,
  has_email BOOLEAN,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  county TEXT,
  state TEXT,
  postal_code TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  emergency_room BOOLEAN,
  inpatient_beds INTEGER,
  urgent_care BOOLEAN,
  accepts_uninsured BOOLEAN,
  financial_assistance_available BOOLEAN,
  accepts_medicaid BOOLEAN,
  accepts_medicare BOOLEAN,
  specialties TEXT[],
  hours_of_operation TEXT,
  confidence_scores JSONB,
  source_id TEXT,
  forensic_provenance JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Legal Aid Organizations
CREATE TABLE IF NOT EXISTS registry_entities_legal_aid (
  id BIGSERIAL PRIMARY KEY,
  organization_name TEXT NOT NULL,
  service_categories TEXT[],
  phone TEXT,
  email TEXT,
  website_url TEXT,
  phone_formatted TEXT,
  has_phone BOOLEAN,
  has_website BOOLEAN,
  has_email BOOLEAN,
  hours_of_operation TEXT,
  address_line1 TEXT,
  city TEXT,
  county TEXT,
  state TEXT,
  postal_code TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  practice_areas TEXT[],
  income_limits TEXT,
  accepts_immigration_cases BOOLEAN,
  accepts_family_law BOOLEAN,
  accepts_housing BOOLEAN,
  accepts_employment BOOLEAN,
  pro_bono_available BOOLEAN,
  intake_method TEXT,
  languages_served TEXT[],
  confidence_scores JSONB,
  source_id TEXT,
  forensic_provenance JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Mental Health Services
CREATE TABLE IF NOT EXISTS registry_entities_mental_health (
  id BIGSERIAL PRIMARY KEY,
  organization_name TEXT NOT NULL,
  service_categories TEXT[],
  phone TEXT,
  email TEXT,
  website_url TEXT,
  phone_formatted TEXT,
  has_phone BOOLEAN,
  has_website BOOLEAN,
  has_email BOOLEAN,
  hours_of_operation TEXT,
  address_line1 TEXT,
  city TEXT,
  county TEXT,
  state TEXT,
  postal_code TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  service_types TEXT[],
  crisis_line BOOLEAN,
  crisis_phone TEXT,
  accepts_uninsured BOOLEAN,
  accepts_medicaid BOOLEAN,
  sliding_scale_fees BOOLEAN,
  therapist_count INTEGER,
  languages_served TEXT[],
  specializations TEXT[],
  intake_process TEXT,
  confidence_scores JSONB,
  source_id TEXT,
  forensic_provenance JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Nonprofit Organizations (general)
CREATE TABLE IF NOT EXISTS registry_entities_nonprofits (
  id BIGSERIAL PRIMARY KEY,
  organization_name TEXT NOT NULL,
  mission_statement TEXT,
  service_categories TEXT[],
  phone TEXT,
  email TEXT,
  website_url TEXT,
  phone_formatted TEXT,
  has_phone BOOLEAN,
  has_website BOOLEAN,
  has_email BOOLEAN,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  county TEXT,
  state TEXT,
  postal_code TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  ein TEXT,
  tax_status TEXT,
  founded_year INTEGER,
  annual_budget NUMERIC,
  staff_count INTEGER,
  volunteer_count INTEGER,
  board_size INTEGER,
  service_area TEXT,
  languages_served TEXT[],
  confidence_scores JSONB,
  source_id TEXT,
  forensic_provenance JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Government Agencies
CREATE TABLE IF NOT EXISTS registry_entities_government_agencies (
  id BIGSERIAL PRIMARY KEY,
  organization_name TEXT NOT NULL,
  agency_type TEXT,
  service_categories TEXT[],
  phone TEXT,
  email TEXT,
  website_url TEXT,
  phone_formatted TEXT,
  has_phone BOOLEAN,
  has_website BOOLEAN,
  has_email BOOLEAN,
  hours_of_operation TEXT,
  address_line1 TEXT,
  city TEXT,
  county TEXT,
  state TEXT,
  postal_code TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  jurisdiction_level TEXT,
  department TEXT,
  director_name TEXT,
  programs_offered TEXT[],
  eligibility_summary TEXT,
  application_methods TEXT[],
  online_services BOOLEAN,
  walk_in_available BOOLEAN,
  confidence_scores JSONB,
  source_id TEXT,
  forensic_provenance JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for fast lookup
CREATE INDEX idx_food_banks_city ON registry_entities_food_banks(city, state);
CREATE INDEX idx_shelters_city ON registry_entities_shelters(city, state);
CREATE INDEX idx_hospitals_city ON registry_entities_hospitals(city, state);
CREATE INDEX idx_legal_aid_city ON registry_entities_legal_aid(city, state);
CREATE INDEX idx_mental_health_city ON registry_entities_mental_health(city, state);
CREATE INDEX idx_nonprofits_city ON registry_entities_nonprofits(city, state);
CREATE INDEX idx_government_city ON registry_entities_government_agencies(city, state);

CREATE INDEX idx_food_banks_coordinates ON registry_entities_food_banks(latitude, longitude);
CREATE INDEX idx_shelters_coordinates ON registry_entities_shelters(latitude, longitude);
CREATE INDEX idx_hospitals_coordinates ON registry_entities_hospitals(latitude, longitude);
CREATE INDEX idx_legal_aid_coordinates ON registry_entities_legal_aid(latitude, longitude);
CREATE INDEX idx_mental_health_coordinates ON registry_entities_mental_health(latitude, longitude);
CREATE INDEX idx_nonprofits_coordinates ON registry_entities_nonprofits(latitude, longitude);
CREATE INDEX idx_government_coordinates ON registry_entities_government_agencies(latitude, longitude);
