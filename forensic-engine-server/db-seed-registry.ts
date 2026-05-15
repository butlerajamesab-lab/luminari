/**
 * Registry Seed Data
 * Populates forms_registry, agencies_registry, escalation_registry with canonical extraction data
 * Run once during initial setup
 */

import { db } from "./db";
import { formsRegistry, agenciesRegistry, escalationRegistry, mentalHealthResources } from "../drizzle/schema";

const NOW = Date.now();

export async function seedRegistry() {
  console.log("🌱 Seeding legal registry tables...");

  // ─── AGENCIES ───
  const agencies = [
    // Housing
    {
      id: "agency_hud_fheo",
      agencyName: "HUD Office of Fair Housing and Equal Opportunity",
      jurisdiction: "NATIONAL",
      domain: "housing" as const,
      agencyType: "federal" as const,
      website: "https://www.hud.gov/program_offices/fair_housing_equal_opp",
      contactMethods: {
        phone: "1-800-669-9777",
        web: "https://www.hud.gov/fairhousing",
        mail: "Office of Fair Housing and Equal Opportunity, 451 7th Street S.W., Room 5100, Washington, D.C. 20410",
      },
      officialStatus: "active" as const,
      notes: "Federal agency handling housing discrimination complaints",
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: "agency_wa_hrc",
      agencyName: "Washington State Human Rights Commission",
      jurisdiction: "WA",
      domain: "housing" as const,
      agencyType: "state" as const,
      website: "https://deptofcommerce.wa.gov/civil-rights/housing-discrimination",
      contactMethods: {
        phone: "1-206-464-6500",
        web: "https://deptofcommerce.wa.gov/civil-rights/housing-discrimination",
        walk_in: "Seattle, WA",
      },
      officialStatus: "active" as const,
      notes: "State agency for housing discrimination complaints",
      createdAt: NOW,
      updatedAt: NOW,
    },
    // Employment
    {
      id: "agency_dol_whd",
      agencyName: "Department of Labor - Wage and Hour Division",
      jurisdiction: "NATIONAL",
      domain: "employment" as const,
      agencyType: "federal" as const,
      website: "https://www.dol.gov/agencies/whd",
      contactMethods: {
        phone: "1-866-4-USWAGE",
        web: "https://www.dol.gov/agencies/whd/contact/complaints",
      },
      officialStatus: "active" as const,
      notes: "Federal agency handling wage and hour violations",
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: "agency_eeoc",
      agencyName: "Equal Employment Opportunity Commission",
      jurisdiction: "NATIONAL",
      domain: "employment" as const,
      agencyType: "federal" as const,
      website: "https://www.eeoc.gov",
      contactMethods: {
        phone: "1-202-663-4900",
        web: "https://www.eeoc.gov/filing-charge-discrimination",
      },
      officialStatus: "active" as const,
      notes: "Federal agency handling employment discrimination complaints",
      createdAt: NOW,
      updatedAt: NOW,
    },
    // Consumer Protection
    {
      id: "agency_ftc",
      agencyName: "Federal Trade Commission",
      jurisdiction: "NATIONAL",
      domain: "consumer_protection" as const,
      agencyType: "federal" as const,
      website: "https://www.ftc.gov",
      contactMethods: {
        web: "https://reportfraud.ftc.gov/",
      },
      officialStatus: "active" as const,
      notes: "Federal consumer protection agency",
      createdAt: NOW,
      updatedAt: NOW,
    },
    // Mental Health
    {
      id: "agency_988_lifeline",
      agencyName: "988 Suicide & Crisis Lifeline",
      jurisdiction: "NATIONAL",
      domain: "mental_health" as const,
      agencyType: "nonprofit" as const,
      website: "https://988lifeline.org/",
      contactMethods: {
        phone: "988",
        text: "Text 988",
        chat: "https://988lifeline.org/chat",
      },
      officialStatus: "active" as const,
      notes: "National crisis support service",
      createdAt: NOW,
      updatedAt: NOW,
    },
  ];

  // ─── FORMS ───
  const forms = [
    // Housing
    {
      id: "form_hud_903",
      formName: "Housing Discrimination Complaint",
      agencyId: "agency_hud_fheo",
      domain: "housing" as const,
      jurisdiction: "NATIONAL",
      url: "https://www.hud.gov/program_offices/fair_housing_equal_opp",
      accessMethods: ["web" as const, "phone" as const, "mail" as const],
      filingDeadline: "1 year from incident",
      requiredFields: ["name", "email", "incident_date", "property_address", "description"],
      isActive: true,
      notes: "Federal form for housing discrimination complaints",
      lastVerified: "2026-03-25",
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: "form_wa_hrc_housing",
      formName: "Housing Discrimination Complaint",
      agencyId: "agency_wa_hrc",
      domain: "housing" as const,
      jurisdiction: "WA",
      url: "https://deptofcommerce.wa.gov/civil-rights/housing-discrimination",
      accessMethods: ["web" as const, "phone" as const, "walk_in" as const],
      filingDeadline: "1 year from incident",
      requiredFields: ["name", "contact_info", "incident_date", "description"],
      isActive: true,
      notes: "Washington state housing discrimination complaint form",
      lastVerified: "2026-03-25",
      createdAt: NOW,
      updatedAt: NOW,
    },
    // Employment
    {
      id: "form_dol_whd_complaint",
      formName: "Wage and Hour Complaint",
      agencyId: "agency_dol_whd",
      domain: "employment" as const,
      jurisdiction: "NATIONAL",
      url: "https://www.dol.gov/agencies/whd/contact/complaints",
      accessMethods: ["web" as const, "phone" as const, "mail" as const],
      filingDeadline: "3 years from violation (2 years for willful violations)",
      requiredFields: ["name", "email", "employer_name", "incident_date", "description"],
      isActive: true,
      notes: "Federal wage and hour complaint form",
      lastVerified: "2026-03-25",
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: "form_eeoc_charge",
      formName: "Charge of Discrimination",
      agencyId: "agency_eeoc",
      domain: "employment" as const,
      jurisdiction: "NATIONAL",
      url: "https://www.eeoc.gov/filing-charge-discrimination",
      accessMethods: ["web" as const, "phone" as const, "mail" as const],
      filingDeadline: "180-300 days from incident (varies by state)",
      requiredFields: ["name", "email", "employer_name", "incident_date", "discrimination_type"],
      isActive: true,
      notes: "Federal employment discrimination charge form",
      lastVerified: "2026-03-25",
      createdAt: NOW,
      updatedAt: NOW,
    },
    // Consumer
    {
      id: "form_ftc_complaint",
      formName: "Consumer Complaint Submission",
      agencyId: "agency_ftc",
      domain: "consumer_protection" as const,
      jurisdiction: "NATIONAL",
      url: "https://reportfraud.ftc.gov/",
      accessMethods: ["web" as const],
      filingDeadline: "No deadline",
      requiredFields: ["name", "email", "complaint_type", "description"],
      isActive: true,
      notes: "Federal consumer fraud complaint form",
      lastVerified: "2026-03-25",
      createdAt: NOW,
      updatedAt: NOW,
    },
  ];

  // ─── ESCALATION PATHS ───
  const escalations = [
    {
      id: "esc_housing_001",
      fromAgencyId: "agency_hud_fheo",
      toAgencyId: "agency_wa_hrc",
      jurisdiction: "WA",
      domain: "housing" as const,
      triggerCondition: "HUD complaint filed",
      pathwayDescription: "HUD complaint can be filed simultaneously with state human rights commission",
      timeline: "Concurrent filing",
      simultaneousFiling: true,
      notes: "Dual filing allowed under Fair Housing Act",
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: "esc_employment_001",
      fromAgencyId: "agency_dol_whd",
      toAgencyId: "agency_eeoc",
      jurisdiction: "NATIONAL",
      domain: "employment" as const,
      triggerCondition: "Wage violation with discrimination component",
      pathwayDescription: "Wage and hour complaint can be escalated to EEOC if discrimination is involved",
      timeline: "Within 180 days",
      simultaneousFiling: true,
      notes: "Applicable when discrimination is involved in wage theft",
      createdAt: NOW,
      updatedAt: NOW,
    },
  ];

  // ─── MENTAL HEALTH RESOURCES ───
  const mhResources = [
    {
      id: "mh_988_national",
      resourceName: "988 Suicide & Crisis Lifeline",
      resourceType: "crisis_hotline" as const,
      jurisdiction: "NATIONAL",
      website: "https://988lifeline.org/",
      contactMethods: {
        phone: "988",
        text: "Text 988",
        chat: "https://988lifeline.org/chat",
      },
      availability: {
        hours: "24/7",
        is24_7: true,
      },
      populationServed: ["all ages", "all populations"],
      servicesProvided: ["crisis support", "suicide prevention", "mental health resources"],
      eligibility: "Open to all",
      cost: "Free",
      languages: ["English", "Spanish"],
      sourceUrl: "https://988lifeline.org/",
      lastVerified: "2026-03-25",
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: "mh_crisis_text_line",
      resourceName: "Crisis Text Line",
      resourceType: "crisis_hotline" as const,
      jurisdiction: "NATIONAL",
      website: "https://www.crisistextline.org/",
      contactMethods: {
        text: "Text HOME to 741741",
        web: "https://www.crisistextline.org/",
      },
      availability: {
        hours: "24/7",
        is24_7: true,
      },
      populationServed: ["all ages", "all populations"],
      servicesProvided: ["crisis support", "text-based counseling"],
      eligibility: "Open to all",
      cost: "Free",
      languages: ["English"],
      sourceUrl: "https://www.crisistextline.org/",
      lastVerified: "2026-03-25",
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: "mh_samhsa_helpline",
      resourceName: "SAMHSA National Helpline",
      resourceType: "substance_use" as const,
      jurisdiction: "NATIONAL",
      website: "https://www.samhsa.gov/find-help/national-helpline",
      contactMethods: {
        phone: "1-800-662-4357",
        web: "https://www.samhsa.gov/find-help/national-helpline",
      },
      availability: {
        hours: "24/7",
        is24_7: true,
      },
      populationServed: ["substance use disorder", "mental health"],
      servicesProvided: ["referral", "information", "support"],
      eligibility: "Open to all",
      cost: "Free",
      languages: ["English", "Spanish"],
      sourceUrl: "https://www.samhsa.gov/find-help/national-helpline",
      lastVerified: "2026-03-25",
      createdAt: NOW,
      updatedAt: NOW,
    },
  ];

  try {
    // Insert agencies
    for (const agency of agencies) {
      await db.insert(agenciesRegistry).values(agency).onDuplicateKeyUpdate({ set: agency });
    }
    console.log(`✅ Inserted ${agencies.length} agencies`);

    // Insert forms
    for (const form of forms) {
      await db.insert(formsRegistry).values(form).onDuplicateKeyUpdate({ set: form });
    }
    console.log(`✅ Inserted ${forms.length} forms`);

    // Insert escalation paths
    for (const escalation of escalations) {
      await db.insert(escalationRegistry).values(escalation).onDuplicateKeyUpdate({ set: escalation });
    }
    console.log(`✅ Inserted ${escalations.length} escalation paths`);

    // Insert mental health resources
    for (const resource of mhResources) {
      await db.insert(mentalHealthResources).values(resource).onDuplicateKeyUpdate({ set: resource });
    }
    console.log(`✅ Inserted ${mhResources.length} mental health resources`);

    console.log("🎉 Registry seeding complete!");
  } catch (error) {
    console.error("❌ Registry seeding failed:", error);
    throw error;
  }
}
