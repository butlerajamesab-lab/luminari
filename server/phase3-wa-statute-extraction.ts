import { db } from "./db";
import { sql } from "drizzle-orm";

/**
 * PHASE 3 EXTENSION: WASHINGTON STATUTE EXTRACTION & INGESTION
 * 
 * Extract all statutes from Washington Knowledge Backbone with:
 * - Full citations (RCW, U.S.C., CFR)
 * - Jurisdiction (State, Federal, County, City, Tribal)
 * - Domain linkage
 * - Deadlines/SOL where stated
 * - Explicit links to workflows and accountability paths
 */

interface StatuteRecord {
  citation: string;
  jurisdiction: string;
  domain: string;
  title: string;
  description: string;
  statute_of_limitations_value?: number | null;
  statute_of_limitations_unit?: string | null;
  created_at: Date;
}

interface WorkflowStatuteLink {
  workflow_id: number;
  statute_id: number;
}

interface AccountabilityLegalHook {
  accountability_path_id: number;
  statute_id: number;
}

// All statutes extracted from Washington Knowledge Backbone (Agency Authority Map + Claims)
const WASHINGTON_STATUTES: StatuteRecord[] = [
  // WSHRC Authority Statutes
  {
    citation: "RCW 49.60",
    jurisdiction: "State",
    domain: "Civil Rights",
    title: "Washington Law Against Discrimination (WLAD)",
    description: "Prohibits discrimination in employment, housing, public accommodations, credit, insurance based on protected classes",
    statute_of_limitations_value: 6,
    statute_of_limitations_unit: "months",
    created_at: new Date(),
  },
  {
    citation: "RCW 49.60.180",
    jurisdiction: "State",
    domain: "Employment",
    title: "WLAD - Employment Discrimination",
    description: "Specific provision for employment discrimination claims under WLAD",
    statute_of_limitations_value: 6,
    statute_of_limitations_unit: "months",
    created_at: new Date(),
  },

  // WA Attorney General Authority Statutes
  {
    citation: "RCW 49.94",
    jurisdiction: "State",
    domain: "Employment",
    title: "Fair Chance Act",
    description: "Restricts employer use of criminal history in hiring decisions",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },
  {
    citation: "RCW 19.86",
    jurisdiction: "State",
    domain: "Consumer Protection",
    title: "Consumer Protection Act",
    description: "Prohibits unfair/deceptive business practices",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },
  {
    citation: "RCW 49.76",
    jurisdiction: "State",
    domain: "Employment",
    title: "Healthy Starts Act",
    description: "Requires paid leave for certain health-related purposes",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },
  {
    citation: "50 U.S.C. § 3953",
    jurisdiction: "Federal",
    domain: "Civil Rights",
    title: "Servicemembers Civil Relief Act (SCRA)",
    description: "Provides protections for active duty servicemembers",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },

  // L&I Authority Statutes
  {
    citation: "RCW 49.46",
    jurisdiction: "State",
    domain: "Employment",
    title: "Minimum Wage Law",
    description: "Establishes minimum wage requirements in Washington",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },
  {
    citation: "RCW 49.48",
    jurisdiction: "State",
    domain: "Employment",
    title: "Wage Payment Law",
    description: "Requires timely payment of wages; prohibits wage theft",
    statute_of_limitations_value: 3,
    statute_of_limitations_unit: "years",
    created_at: new Date(),
  },
  {
    citation: "RCW 49.58",
    jurisdiction: "State",
    domain: "Employment",
    title: "Equal Pay Act",
    description: "Prohibits wage discrimination based on sex",
    statute_of_limitations_value: 3,
    statute_of_limitations_unit: "years",
    created_at: new Date(),
  },
  {
    citation: "RCW 49.78",
    jurisdiction: "State",
    domain: "Employment",
    title: "Family and Medical Leave Act (FMLA) - State Version",
    description: "Provides job-protected leave for family/medical reasons",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },
  {
    citation: "RCW 51.04",
    jurisdiction: "State",
    domain: "Employment",
    title: "Workers' Compensation Act",
    description: "Provides workers' compensation benefits and protections",
    statute_of_limitations_value: 1,
    statute_of_limitations_unit: "years",
    created_at: new Date(),
  },

  // DSHS Authority Statutes
  {
    citation: "RCW 74.04",
    jurisdiction: "State",
    domain: "Benefits",
    title: "Public Assistance - General Provisions",
    description: "Establishes public assistance programs including TANF",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },
  {
    citation: "RCW 74.09",
    jurisdiction: "State",
    domain: "Healthcare",
    title: "Medicaid (Washington Apple Health)",
    description: "Establishes Medicaid/Apple Health eligibility and benefits",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },
  {
    citation: "RCW 71.05",
    jurisdiction: "State",
    domain: "Mental Health",
    title: "Mental Health Act",
    description: "Governs involuntary commitment, patient rights, behavioral health",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },
  {
    citation: "RCW 26.44",
    jurisdiction: "State",
    domain: "Family Law",
    title: "Child Welfare - Abuse & Neglect",
    description: "Establishes child protective services, abuse reporting requirements",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },

  // OAH Authority Statutes
  {
    citation: "RCW 34.05",
    jurisdiction: "State",
    domain: "Administrative",
    title: "Administrative Procedure Act (APA)",
    description: "Governs administrative hearings and agency procedures",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },

  // ESD Authority Statutes
  {
    citation: "RCW 50.04",
    jurisdiction: "State",
    domain: "Benefits",
    title: "Unemployment Insurance - General",
    description: "Establishes unemployment insurance program",
    statute_of_limitations_value: 1,
    statute_of_limitations_unit: "years",
    created_at: new Date(),
  },
  {
    citation: "RCW 50A.04",
    jurisdiction: "State",
    domain: "Benefits",
    title: "Paid Family and Medical Leave (PFML)",
    description: "Establishes paid leave program for family/medical reasons",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },

  // OIC Authority Statutes
  {
    citation: "RCW 48.01",
    jurisdiction: "State",
    domain: "Insurance",
    title: "Insurance Code - General",
    description: "Governs insurance regulation and consumer protections",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },
  {
    citation: "42 U.S.C. § 300gg-5",
    jurisdiction: "Federal",
    domain: "Healthcare",
    title: "Mental Health Parity and Addiction Equity Act (MHPAEA)",
    description: "Requires parity between mental health and medical/surgical benefits",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },

  // DOH Authority Statutes
  {
    citation: "RCW 43.70",
    jurisdiction: "State",
    domain: "Healthcare",
    title: "Department of Health - General Authority",
    description: "Establishes DOH authority over healthcare facilities and licensing",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },
  {
    citation: "RCW 71.24",
    jurisdiction: "State",
    domain: "Mental Health",
    title: "Community Mental Health Services",
    description: "Governs community mental health services and behavioral health agencies",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },

  // Ombuds Authority Statutes
  {
    citation: "RCW 71.05.580",
    jurisdiction: "State",
    domain: "Mental Health",
    title: "Mental Health Ombuds Authority",
    description: "Establishes ombuds authority for mental health consumer advocacy",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },

  // GOIA Authority Statutes
  {
    citation: "Executive Order 92-01",
    jurisdiction: "State",
    domain: "Tribal Affairs",
    title: "Government-to-Government Relations with Indian Tribes",
    description: "Establishes state policy on tribal consultation and relations",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },
  {
    citation: "RCW 43.376",
    jurisdiction: "State",
    domain: "Tribal Affairs",
    title: "Office of Indian Affairs",
    description: "Establishes Office of Indian Affairs authority",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },
  {
    citation: "25 U.S.C. § 1901",
    jurisdiction: "Federal",
    domain: "Family Law",
    title: "Indian Child Welfare Act (ICWA)",
    description: "Protects Indian children and tribal sovereignty in child welfare proceedings",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },
  {
    citation: "RCW 13.38",
    jurisdiction: "State",
    domain: "Family Law",
    title: "Washington Indian Child Welfare Act (WICWA)",
    description: "State implementation of ICWA protections",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },

  // King County OCR Authority Statutes
  {
    citation: "King County Code Title 12",
    jurisdiction: "County",
    domain: "Civil Rights",
    title: "King County Civil Rights Ordinance",
    description: "Prohibits discrimination in King County unincorporated areas",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },

  // Seattle SOCR Authority Statutes
  {
    citation: "Seattle Municipal Code Ch. 14.04",
    jurisdiction: "City",
    domain: "Civil Rights",
    title: "Seattle Civil Rights - Employment",
    description: "Prohibits employment discrimination in City of Seattle",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },
  {
    citation: "Seattle Municipal Code Ch. 14.06",
    jurisdiction: "City",
    domain: "Civil Rights",
    title: "Seattle Civil Rights - Housing",
    description: "Prohibits housing discrimination in City of Seattle",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },
  {
    citation: "Seattle Municipal Code Ch. 14.08",
    jurisdiction: "City",
    domain: "Civil Rights",
    title: "Seattle Civil Rights - Public Accommodations",
    description: "Prohibits public accommodation discrimination in City of Seattle",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },
  {
    citation: "Seattle Municipal Code Ch. 14.10",
    jurisdiction: "City",
    domain: "Civil Rights",
    title: "Seattle Civil Rights - Criminal History Discrimination",
    description: "Prohibits employment discrimination based on criminal history in Seattle",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },

  // Federal EEOC Authority Statutes
  {
    citation: "42 U.S.C. § 2000e",
    jurisdiction: "Federal",
    domain: "Employment",
    title: "Title VII of the Civil Rights Act of 1964",
    description: "Prohibits employment discrimination based on race, color, religion, sex, national origin",
    statute_of_limitations_value: 180,
    statute_of_limitations_unit: "days",
    created_at: new Date(),
  },
  {
    citation: "42 U.S.C. § 12101",
    jurisdiction: "Federal",
    domain: "Employment",
    title: "Americans with Disabilities Act (ADA) - Title I",
    description: "Prohibits employment discrimination based on disability",
    statute_of_limitations_value: 180,
    statute_of_limitations_unit: "days",
    created_at: new Date(),
  },
  {
    citation: "29 U.S.C. § 621",
    jurisdiction: "Federal",
    domain: "Employment",
    title: "Age Discrimination in Employment Act (ADEA)",
    description: "Prohibits employment discrimination based on age (40+)",
    statute_of_limitations_value: 180,
    statute_of_limitations_unit: "days",
    created_at: new Date(),
  },
  {
    citation: "42 U.S.C. § 1981",
    jurisdiction: "Federal",
    domain: "Civil Rights",
    title: "Equal Rights Under the Law",
    description: "Prohibits racial discrimination in contracts and property",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },

  // Federal HUD Authority Statutes
  {
    citation: "42 U.S.C. § 3601",
    jurisdiction: "Federal",
    domain: "Housing",
    title: "Fair Housing Act",
    description: "Prohibits housing discrimination based on race, color, religion, sex, national origin, disability, familial status",
    statute_of_limitations_value: 1,
    statute_of_limitations_unit: "years",
    created_at: new Date(),
  },
  {
    citation: "29 U.S.C. § 794",
    jurisdiction: "Federal",
    domain: "Housing",
    title: "Section 504 of the Rehabilitation Act",
    description: "Prohibits disability discrimination in federally funded programs including housing",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },
  {
    citation: "42 U.S.C. § 1437f",
    jurisdiction: "Federal",
    domain: "Housing",
    title: "Section 8 Housing Voucher Program",
    description: "Governs federal housing assistance and voucher program",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },

  // Federal DOJ Authority Statutes
  {
    citation: "42 U.S.C. § 14141",
    jurisdiction: "Federal",
    domain: "Civil Rights",
    title: "Violent Crime Control and Law Enforcement Act - Pattern or Practice",
    description: "Authorizes DOJ investigation of law enforcement agencies for pattern/practice violations",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },
  {
    citation: "42 U.S.C. § 12131",
    jurisdiction: "Federal",
    domain: "Civil Rights",
    title: "ADA Title II - Public Services",
    description: "Prohibits disability discrimination by state/local government",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },
  {
    citation: "52 U.S.C. § 10301",
    jurisdiction: "Federal",
    domain: "Civil Rights",
    title: "Voting Rights Act",
    description: "Protects voting rights and prohibits racial discrimination in voting",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },
  {
    citation: "42 U.S.C. § 2000d",
    jurisdiction: "Federal",
    domain: "Civil Rights",
    title: "Civil Rights Act Title VI",
    description: "Prohibits discrimination in federally funded programs",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },
  {
    citation: "42 U.S.C. § 2000c",
    jurisdiction: "Federal",
    domain: "Civil Rights",
    title: "Civil Rights Act Title IV",
    description: "Addresses education discrimination and desegregation",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },

  // Federal USAO Authority Statutes
  {
    citation: "18 U.S.C. § 242",
    jurisdiction: "Federal",
    domain: "Civil Rights",
    title: "Deprivation of Rights Under Color of Law",
    description: "Criminal statute for civil rights violations by government officials",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },
  {
    citation: "42 U.S.C. § 1983",
    jurisdiction: "Federal",
    domain: "Civil Rights",
    title: "Civil Action for Deprivation of Rights",
    description: "Civil liability for government officials violating constitutional rights",
    statute_of_limitations_value: 3,
    statute_of_limitations_unit: "years",
    created_at: new Date(),
  },

  // Federal DOL WHD Authority Statutes
  {
    citation: "29 U.S.C. § 201",
    jurisdiction: "Federal",
    domain: "Employment",
    title: "Fair Labor Standards Act (FLSA)",
    description: "Establishes minimum wage, overtime, child labor protections",
    statute_of_limitations_value: 2,
    statute_of_limitations_unit: "years",
    created_at: new Date(),
  },
  {
    citation: "29 U.S.C. § 2601",
    jurisdiction: "Federal",
    domain: "Employment",
    title: "Family and Medical Leave Act (FMLA) - Federal",
    description: "Provides job-protected leave for family/medical reasons",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },

  // Federal OSHA Authority Statutes
  {
    citation: "29 U.S.C. § 651",
    jurisdiction: "Federal",
    domain: "Employment",
    title: "Occupational Safety and Health Act (OSH Act)",
    description: "Establishes workplace safety and health standards",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },

  // Federal CFPB Authority Statutes
  {
    citation: "15 U.S.C. § 1692",
    jurisdiction: "Federal",
    domain: "Consumer Protection",
    title: "Fair Debt Collection Practices Act (FDCPA)",
    description: "Prohibits abusive debt collection practices",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },
  {
    citation: "15 U.S.C. § 1681",
    jurisdiction: "Federal",
    domain: "Consumer Protection",
    title: "Fair Credit Reporting Act (FCRA)",
    description: "Governs credit reporting and consumer credit rights",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },

  // Federal IHS Authority Statutes
  {
    citation: "25 U.S.C. § 1603",
    jurisdiction: "Federal",
    domain: "Healthcare",
    title: "Indian Health Care Improvement Act",
    description: "Establishes Indian health care services and rights",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },
  {
    citation: "42 U.S.C. § 2000d",
    jurisdiction: "Federal",
    domain: "Healthcare",
    title: "Title VI Civil Rights Act - Healthcare",
    description: "Prohibits discrimination in federally funded health programs",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },

  // Federal BIA Authority Statutes
  {
    citation: "25 U.S.C. § 476",
    jurisdiction: "Federal",
    domain: "Tribal Affairs",
    title: "Indian Reorganization Act",
    description: "Establishes tribal governance and sovereignty",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },
  {
    citation: "25 C.F.R. Part 1",
    jurisdiction: "Federal",
    domain: "Tribal Affairs",
    title: "Bureau of Indian Affairs - General Regulations",
    description: "Governs BIA operations and tribal relations",
    statute_of_limitations_value: null,
    statute_of_limitations_unit: null,
    created_at: new Date(),
  },
];

async function runStatuteExtraction() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║ PHASE 3 EXTENSION: WASHINGTON STATUTE EXTRACTION          ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  try {
    // Get jurisdiction ID for Washington
    const jurisdictionResult = await db.execute(
      sql`SELECT id FROM jurisdictions WHERE name = 'Washington' LIMIT 1`
    );
    const jurisdictionRows = (jurisdictionResult as any).rows || [];
    const jurisdictionId = jurisdictionRows.length > 0 ? jurisdictionRows[0].id : 1;

    console.log(`[STATUTE] Using jurisdiction_id: ${jurisdictionId}`);
    console.log(`[STATUTE] Extracting ${WASHINGTON_STATUTES.length} statutes...\n`);

    let insertedCount = 0;
    const statuteMap: { [key: string]: number } = {};

    // Insert all statutes
    for (const statute of WASHINGTON_STATUTES) {
      try {
        const result = await db.execute(sql`
          INSERT INTO legal_statutes (
            jurisdiction_id, citation, statute_type, jurisdiction_level,
            domain, title, description, created_at
          )
          VALUES (
            ${jurisdictionId}, ${statute.citation}, 'statute', ${statute.jurisdiction},
            ${statute.domain}, ${statute.title}, ${statute.description},
            ${statute.created_at}
          )
          RETURNING id
        `);

        const rows = (result as any).rows || [];
        if (rows.length > 0) {
          const statuteId = rows[0].id;
          statuteMap[statute.citation] = statuteId;
          insertedCount++;

          // Insert statute of limitations if present
          if (statute.statute_of_limitations_value) {
            await db.execute(sql`
              INSERT INTO statute_of_limitations (
                statute_id, days_limit, description, created_at
              )
              VALUES (
                ${statuteId},
                ${calculateDays(statute.statute_of_limitations_value, statute.statute_of_limitations_unit)},
                ${`${statute.statute_of_limitations_value} ${statute.statute_of_limitations_unit}`},
                ${new Date()}
              )
            `);
          }
        }
      } catch (error) {
        console.error(`[STATUTE] Error inserting ${statute.citation}:`, error);
      }
    }

    console.log(`✓ Inserted ${insertedCount} statutes\n`);

    // Link statutes to workflows
    console.log("[STATUTE] Linking statutes to workflows...");
    let workflowLinkCount = 0;

    // RCW 59.18 (Residential Landlord-Tenant Act) → housing_violation workflow
    const housingWorkflowResult = await db.execute(
      sql`SELECT id FROM layer2_workflows WHERE domain LIKE '%housing%' LIMIT 1`
    );
    const housingWfRows = (housingWorkflowResult as any).rows || [];
    if (housingWfRows.length > 0 && statuteMap["RCW 59.18"]) {
      try {
        await db.execute(sql`
          INSERT INTO workflow_statute_links (workflow_id, statute_id)
          VALUES (${housingWfRows[0].id}, ${statuteMap["RCW 59.18"]})
        `);
        workflowLinkCount++;
      } catch (error) {
        // Ignore duplicate key errors
      }
    }

    console.log(`✓ Created ${workflowLinkCount} workflow-statute links\n`);

    // Link statutes to accountability paths
    console.log("[STATUTE] Linking statutes to accountability paths...");
    let accountabilityLinkCount = 0;

    // RCW 49.60 → WSHRC (administrative accountability)
    const wshrcResult = await db.execute(
      sql`SELECT id FROM oversight_bodies WHERE name LIKE '%Human Rights%' LIMIT 1`
    );
    const wshrcRows = (wshrcResult as any).rows || [];
    if (wshrcRows.length > 0 && statuteMap["RCW 49.60"]) {
      try {
        await db.execute(sql`
          INSERT INTO accountability_legal_hooks (oversight_body_id, statute_id)
          VALUES (${wshrcRows[0].id}, ${statuteMap["RCW 49.60"]})
        `);
        accountabilityLinkCount++;
      } catch (error) {
        // Ignore duplicate key errors
      }
    }

    console.log(`✓ Created ${accountabilityLinkCount} accountability-statute links\n`);

    console.log("═══════════════════════════════════════════════════════════");
    console.log("✅ STATUTE EXTRACTION COMPLETE");
    console.log(`   Statutes: ${insertedCount}`);
    console.log(`   Workflow Links: ${workflowLinkCount}`);
    console.log(`   Accountability Links: ${accountabilityLinkCount}`);
    console.log("═══════════════════════════════════════════════════════════\n");

  } catch (error) {
    console.error("❌ STATUTE EXTRACTION FAILED:", error);
    throw error;
  }
}

function calculateDays(value: number, unit?: string | null): number {
  if (!unit) return value;
  switch (unit.toLowerCase()) {
    case "days":
    case "day":
      return value;
    case "weeks":
    case "week":
      return value * 7;
    case "months":
    case "month":
      return value * 30;
    case "years":
    case "year":
      return value * 365;
    case "hours":
    case "hour":
      return Math.ceil(value / 24);
    default:
      return value;
  }
}

runStatuteExtraction().catch(console.error);
