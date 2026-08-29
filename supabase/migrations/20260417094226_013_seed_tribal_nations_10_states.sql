
-- ============================================================
-- MIGRATION 013: Tribal Nations — AL, TN, SC, NC, MD, AR, MS, LA, CT
-- Separate sovereigns. Equal standing. No state above another.
-- ============================================================

INSERT INTO tribal_jurisdictions (
  tribe_key, tribe_name, state_code, region, county,
  website_url, phone,
  tribal_court, tribal_social_services, tribal_housing,
  tribal_tanf, tribal_health, tribal_enrollment,
  treaty_rights_in_state, is_federally_recognized,
  created_at, updated_at
) VALUES

-- ─── ALABAMA ───────────────────────────────────────────────
('al-poarch-creek', 'Poarch Band of Creek Indians',
  'AL', 'South Alabama', 'Escambia',
  'https://www.poarchcreekindians.org', '251-368-9136',
  'Poarch Creek Tribal Court', 'Poarch Creek Social Services', 'Poarch Creek Housing',
  'Poarch Creek TANF', 'Poarch Creek Indian Health Center', 'Poarch Creek Enrollment',
  TRUE, TRUE, 0, 0),

-- ─── TENNESSEE ─────────────────────────────────────────────
-- Tennessee has no federally recognized tribes with reservation land
-- EBCI (NC) is noted in TN registry for border members — handled in NC entry

-- ─── SOUTH CAROLINA ────────────────────────────────────────
('sc-catawba', 'Catawba Indian Nation',
  'SC', 'Piedmont', 'York',
  'https://www.catawbaindian.net', '803-366-4792',
  'Catawba Tribal Court', 'Catawba Social Services', 'Catawba Housing',
  NULL, 'Catawba Health Services', 'Catawba Enrollment',
  TRUE, TRUE, 0, 0),

-- ─── NORTH CAROLINA ────────────────────────────────────────
('nc-eastern-band-cherokee', 'Eastern Band of Cherokee Indians (EBCI)',
  'NC', 'Western Mountains', 'Cherokee/Jackson/Swain',
  'https://www.ebci.com', '828-497-7000',
  'EBCI Tribal Court', 'EBCI Social Services', 'EBCI Housing',
  'EBCI TANF', 'Cherokee Indian Hospital (IHS)', 'EBCI Enrollment',
  TRUE, TRUE, 0, 0),

-- ─── MARYLAND ──────────────────────────────────────────────
-- Maryland has no federally recognized tribes

-- ─── ARKANSAS ──────────────────────────────────────────────
-- Arkansas has no federally recognized tribes with reservation land
-- Cherokee, Osage with AR historical ties are Oklahoma-based

-- ─── MISSISSIPPI ───────────────────────────────────────────
('ms-choctaw', 'Mississippi Band of Choctaw Indians (MBCI)',
  'MS', 'East Central', 'Neshoba/Choctaw',
  'https://www.choctaw.org', '601-656-5251',
  'MBCI Tribal Court', 'MBCI Social Services', 'MBCI Housing Authority',
  'MBCI TANF', 'Choctaw Health Center (IHS)', 'MBCI Enrollment',
  TRUE, TRUE, 0, 0),

-- ─── LOUISIANA ─────────────────────────────────────────────
('la-chitimacha', 'Chitimacha Tribe of Louisiana',
  'LA', 'South Louisiana', 'St. Mary',
  'https://chitimacha.gov', '337-923-4973',
  NULL, 'Chitimacha Social Services', 'Chitimacha Housing',
  NULL, 'Chitimacha Health (IHS Nashville Area)', 'Chitimacha Enrollment',
  TRUE, TRUE, 0, 0),

('la-coushatta', 'Coushatta Tribe of Louisiana',
  'LA', 'Southwest Louisiana', 'Allen',
  'https://koasati-nsn.gov', '337-584-1150',
  NULL, 'Coushatta Social Services', 'Coushatta Housing',
  NULL, 'Coushatta Health (IHS Nashville Area)', 'Coushatta Enrollment',
  TRUE, TRUE, 0, 0),

('la-jena-choctaw', 'Jena Band of Choctaw Indians',
  'LA', 'Central Louisiana', 'LaSalle',
  'https://jenabandofchoctaw.org', '318-992-2717',
  NULL, 'Jena Choctaw Social Services', NULL,
  NULL, 'Jena Choctaw Health (IHS Nashville Area)', 'Jena Choctaw Enrollment',
  TRUE, TRUE, 0, 0),

('la-tunica-biloxi', 'Tunica-Biloxi Indian Tribe of Louisiana',
  'LA', 'Central Louisiana', 'Avoyelles',
  'https://tunica.org', '318-253-9767',
  NULL, 'Tunica-Biloxi Social Services', NULL,
  NULL, 'Tunica-Biloxi Health (IHS Nashville Area)', 'Tunica-Biloxi Enrollment',
  TRUE, TRUE, 0, 0),

-- ─── CONNECTICUT ───────────────────────────────────────────
('ct-mashantucket-pequot', 'Mashantucket Pequot Tribal Nation',
  'CT', 'Southeast Connecticut', 'New London',
  'https://www.mptn-nsn.gov', '860-396-6500',
  'Mashantucket Pequot Tribal Court', 'Mashantucket Pequot Social Services', 'Mashantucket Pequot Housing',
  'Mashantucket Pequot TANF', 'Mashantucket Pequot Health', 'Mashantucket Pequot Enrollment',
  TRUE, TRUE, 0, 0),

('ct-mohegan', 'Mohegan Tribe of Indians of Connecticut',
  'CT', 'Southeast Connecticut', 'New London',
  'https://www.mohegantribe.com', '860-862-6100',
  'Mohegan Tribal Court', 'Mohegan Social Services', 'Mohegan Housing',
  'Mohegan TANF', 'Mohegan Health Services', 'Mohegan Enrollment',
  TRUE, TRUE, 0, 0);
