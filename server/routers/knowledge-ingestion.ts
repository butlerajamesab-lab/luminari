import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { db, getPool } from "../db";
import { sql } from "drizzle-orm";
import {
  legalStatutes,
  legalCaseLaw,
  agencyAuthorityMap,
  strategyClaimCatalog,
  lumensendTemplates,
  assemblySectionLibrary,
  legislatorContacts,
  advocacyOrganizations,
  doctrineRegistry,
  workflowMaster,
  evidenceProfiles,
  deadlineRules,
  escalationRoutes,
  weakJointTriggers,
  proofFrameworks,
  courtDirectory,
  signalRegistry,
  patternRegistry,
  settlementFormulas,
} from "../../drizzle/schema";

/* ─── Admin guard ─── */
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
  return next({ ctx });
});

/* ─── Shared bulk insert helper ─── */
async function bulkInsert<T extends Record<string, any>>(
  table: any,
  rows: T[],
  addedBy: string
): Promise<{ inserted: number; skipped: number; errors: string[] }> {
  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];
  const now = Date.now();

  for (let i = 0; i < rows.length; i++) {
    try {
      const row = { ...rows[i], createdAt: now, updatedAt: now, addedBy };
      await db.insert(table).values(row);
      inserted++;
    } catch (err: any) {
      if (err?.code === "ER_DUP_ENTRY") {
        skipped++;
      } else {
        errors.push(`Row ${i}: ${err?.message ?? "Unknown error"}`);
      }
    }
  }
  return { inserted, skipped, errors };
}

/* ─── Zod schemas for each table's import format ─── */
const statuteImportSchema = z.object({
  jurisdiction: z.string(),
  citation: z.string(),
  title: z.string(),
  fullText: z.string().optional(),
  summary: z.string().optional(),
  domains: z.array(z.string()),
  sourceType: z.enum(["statute", "regulation", "case_law", "executive_order", "agency_guidance", "model_legislation"]).default("statute"),
  keyRequirements: z.array(z.string()).optional(),
  deadlines: z.array(z.object({ description: z.string(), days: z.number(), from: z.string() })).optional(),
  effectiveDate: z.number().optional(),
  sourceUrl: z.string().optional(),
  keyProvisions: z.array(z.string()).optional(),
  definitions: z.array(z.string()).optional(),
  administrativeAgencies: z.array(z.string()).optional(),
  enforcementTriggers: z.array(z.string()).optional(),
  neutralSummaryCard: z.string().optional(),
});

const caseLawImportSchema = z.object({
  jurisdiction: z.string(),
  citation: z.string(),
  caseName: z.string(),
  court: z.string(),
  yearDecided: z.number().optional(),
  holding: z.string().optional(),
  keyQuotes: z.array(z.object({ quote: z.string(), page: z.string().optional(), context: z.string().optional() })).optional(),
  statutesInterpreted: z.array(z.string()).optional(),
  domains: z.array(z.string()),
  subsequentHistory: z.string().optional(),
  sourceUrl: z.string().optional(),
});

const agencyImportSchema = z.object({
  statute: z.string(),
  agency: z.string(),
  agencyShort: z.string(),
  domain: z.string(),
  complaintTypes: z.array(z.string()),
  statutoryAuthority: z.array(z.string()),
  responseTimelineDays: z.number().optional(),
  complaintPathway: z.string().optional(),
  commonOutcomes: z.array(z.string()),
  linkedWeakJoints: z.array(z.string()).optional(),
});

const claimCatalogImportSchema = z.object({
  claimType: z.string(),
  jurisdiction: z.string().optional(),
  statuteCitation: z.string().optional(),
  elementsRequired: z.any().optional(),
  standardOfProof: z.string().optional(),
  typicalForum: z.string().optional(),
  solYears: z.number().optional(),
  damagesAvailable: z.any().optional(),
  defenses: z.any().optional(),
  notes: z.string().optional(),
});

const templateImportSchema = z.object({
  documentType: z.enum(["appeal", "complaint", "inquiry", "application", "follow_up", "demand", "notice"]),
  name: z.string(),
  description: z.string().optional(),
  subjectTemplate: z.string(),
  bodyTemplate: z.string(),
});

const sectionLibraryImportSchema = z.object({
  sectionName: z.string(),
  sectionType: z.string(),
  templateId: z.number().optional(),
  orderIndex: z.number().optional(),
  contentTemplate: z.string().optional(),
  placeholders: z.any().optional(),
  conditionalRules: z.any().optional(),
  legalStandards: z.any().optional(),
  exampleContent: z.string().optional(),
  notes: z.string().optional(),
});

const legislatorImportSchema = z.object({
  fullName: z.string(),
  title: z.string().optional(),
  jurisdiction: z.string(),
  chamber: z.enum(["federal_senate", "federal_house", "state_senate", "state_house", "state_assembly", "city_council", "county_commission", "other"]),
  party: z.string().optional(),
  district: z.string().optional(),
  state: z.string().optional(),
  contactEmail: z.string().optional(),
  contactPhone: z.string().optional(),
  officeAddress: z.string().optional(),
  website: z.string().optional(),
  committees: z.array(z.string()).optional(),
  domains: z.array(z.string()).optional(),
  termStart: z.number().optional(),
  termEnd: z.number().optional(),
  notes: z.string().optional(),
});

const advocacyOrgImportSchema = z.object({
  name: z.string(),
  orgType: z.enum(["legal_aid", "nonprofit", "community_org", "union", "bar_association", "government_program", "advocacy_group", "research_institute", "other"]),
  jurisdiction: z.string(),
  state: z.string().optional(),
  domains: z.array(z.string()).optional(),
  contactEmail: z.string().optional(),
  contactPhone: z.string().optional(),
  website: z.string().optional(),
  address: z.string().optional(),
  description: z.string().optional(),
  servicesOffered: z.array(z.string()).optional(),
  eligibilityCriteria: z.string().optional(),
  languages: z.array(z.string()).optional(),
  hoursOfOperation: z.string().optional(),
  intakeUrl: z.string().optional(),
});


const knowledgeBackboneTableList = [
  { name: "legal_statutes", label: "Statutes", target: 900 },
  { name: "legal_case_law", label: "Case Law", target: 400 },
  { name: "agency_authority_map", label: "Agency Authorities", target: 200 },
  { name: "strategy_claim_catalog", label: "Claim Catalog", target: 100 },
  { name: "lumensend_templates", label: "LumenSend Templates", target: 50 },
  { name: "assembly_section_library", label: "Section Library", target: 60 },
  { name: "legislator_contacts", label: "Legislator Contacts", target: 65 },
  { name: "advocacy_organizations", label: "Advocacy Organizations", target: 100 },
  { name: "doctrine_registry", label: "Doctrine Registry", target: 100 },
  { name: "court_directory", label: "Court Directory", target: 180 },
  { name: "workflow_master", label: "Workflows", target: 100 },
  { name: "evidence_profiles", label: "Evidence Profiles", target: 50 },
  { name: "deadline_rules", label: "Deadline Rules", target: 100 },
  { name: "escalation_routes", label: "Escalation Routes", target: 50 },
  { name: "weak_joint_triggers", label: "Weak Joint Registry", target: 50 },
  { name: "proof_frameworks", label: "Proof Frameworks", target: 90 },
  { name: "signal_registry", label: "Signal Registry", target: 100 },
  { name: "pattern_registry", label: "Pattern Registry", target: 50 },
  { name: "settlement_formulas", label: "Settlement Formulas", target: 70 },
  { name: "evidence_confidence_rules", label: "Evidence Confidence Rules", target: 70 },
  { name: "claim_validation_rules", label: "Claim Validation Rules", target: 220 },
  { name: "remedy_feasibility_rules", label: "Remedy Feasibility Rules", target: 30 },
  { name: "procedural_paths", label: "Procedural Paths", target: 160 },
  { name: "coalition_legislators", label: "Coalition Legislators", target: 60 },
  { name: "coalition_agencies", label: "Coalition Agencies", target: 35 },
  { name: "coalition_advocacy_orgs", label: "Coalition Advocacy Orgs", target: 30 },
  { name: "coalition_media", label: "Coalition Media", target: 20 },
  { name: "reform_packages", label: "Reform Packages", target: 5 },
  { name: "advocacy_targets", label: "Advocacy Targets", target: 50 },
  { name: "campaigns", label: "Campaigns", target: 3 },
  { name: "reform_package_versions", label: "Reform Package Versions", target: 3 },
  { name: "reform_strategy_memory", label: "Strategy Memory", target: 5 },
  { name: "data_stream_registry", label: "Data Stream Registry", target: 15 },
  { name: "consumer_complaints", label: "Consumer Complaints", target: 200 },
  { name: "campaign_finance_records", label: "Campaign Finance", target: 150 },
  { name: "legal_enforcement_records", label: "Enforcement Records", target: 900 },
  { name: "legal_weak_joints", label: "Weak Joint Registry (Legal)", target: 100 },
  { name: "policy_change_registry", label: "Policy Changes", target: 25 },
  { name: "registry_jurisdictions", label: "Registry Jurisdictions", target: 50 },
  { name: "registry_programs", label: "Registry Programs", target: 500 },
  { name: "registry_oversight_bodies", label: "Oversight Bodies", target: 70 },
  { name: "registry_workflows", label: "Registry Workflows", target: 30 },
  { name: "registry_policy_alerts", label: "Policy Alerts", target: 20 },
  { name: "registry_contacts", label: "Registry Contacts", target: 100 },
  { name: "registry_signals", label: "Registry Signals", target: 200 },
] as const;

const allowedKnowledgeBackboneTables = new Set(knowledgeBackboneTableList.map((table) => table.name));
const safeIdentifierPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function quoteSafeIdentifier(identifier: string): string {
  if (!safeIdentifierPattern.test(identifier)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Unsafe SQL identifier: ${identifier}` });
  }
  return `"${identifier.replace(/"/g, '""')}"`;
}

/* ─── Knowledge Ingestion Router ─── */
export const knowledgeIngestionRouter = router({
  /* ── Population Stats (all knowledge tables) ── */
  populationStats: publicProcedure.query(async () => {
    const tables = knowledgeBackboneTableList;

    const results = await Promise.all(
      tables.map(async (t) => {
        try {
          const { rows } = await getPool().query(`SELECT COUNT(*)::int AS cnt FROM ${quoteSafeIdentifier(t.name)}`);
          const cnt = Number(rows[0]?.cnt ?? 0);
          return {
            name: t.name,
            label: t.label,
            count: cnt,
            target: t.target,
            coverage: Math.min(100, Math.round((cnt / t.target) * 100)),
          };
        } catch {
          return { name: t.name, label: t.label, count: 0, target: t.target, coverage: 0 };
        }
      })
    );

    const totalPopulated = results.reduce((s, r) => s + r.count, 0);
    const totalTarget = results.reduce((s, r) => s + r.target, 0);
    const criticallyLow = results.filter((r) => r.count === 0);
    const underPopulated = results.filter((r) => r.count > 0 && r.coverage < 25);

    return {
      tables: results,
      summary: {
        totalPopulated,
        totalTarget,
        overallCoverage: totalTarget ? Math.round((totalPopulated / totalTarget) * 100) : 0,
        criticallyLow: criticallyLow.map((r) => r.label),
        underPopulated: underPopulated.map((r) => r.label),
      },
    };
  }),

  /* ── Bulk Import: Statutes ── */
  importStatutes: adminProcedure
    .input(z.object({ records: z.array(statuteImportSchema).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      return bulkInsert(legalStatutes, input.records, ctx.user.name ?? ctx.user.openId);
    }),

  /* ── Bulk Import: Case Law ── */
  importCaseLaw: adminProcedure
    .input(z.object({ records: z.array(caseLawImportSchema).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      return bulkInsert(legalCaseLaw, input.records, ctx.user.name ?? ctx.user.openId);
    }),

  /* ── Bulk Import: Agency Authority Map ── */
  importAgencyAuthorities: adminProcedure
    .input(z.object({ records: z.array(agencyImportSchema).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      return bulkInsert(agencyAuthorityMap, input.records, ctx.user.name ?? ctx.user.openId);
    }),

  /* ── Bulk Import: Claim Catalog ── */
  importClaimCatalog: adminProcedure
    .input(z.object({ records: z.array(claimCatalogImportSchema).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      return bulkInsert(strategyClaimCatalog, input.records, ctx.user.name ?? ctx.user.openId);
    }),

  /* ── Bulk Import: LumenSend Templates ── */
  importTemplates: adminProcedure
    .input(z.object({ records: z.array(templateImportSchema).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const now = Date.now();
      let inserted = 0;
      const errors: string[] = [];
      for (let i = 0; i < input.records.length; i++) {
        try {
          await db.insert(lumensendTemplates).values({ ...input.records[i], createdAt: now });
          inserted++;
        } catch (err: any) {
          errors.push(`Row ${i}: ${err?.message ?? "Unknown error"}`);
        }
      }
      return { inserted, skipped: 0, errors };
    }),

  /* ── Bulk Import: Assembly Section Library ── */
  importSectionLibrary: adminProcedure
    .input(z.object({ records: z.array(sectionLibraryImportSchema).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const now = Date.now();
      let inserted = 0;
      const errors: string[] = [];
      for (let i = 0; i < input.records.length; i++) {
        try {
          await db.insert(assemblySectionLibrary).values({ ...input.records[i], createdAt: now });
          inserted++;
        } catch (err: any) {
          errors.push(`Row ${i}: ${err?.message ?? "Unknown error"}`);
        }
      }
      return { inserted, skipped: 0, errors };
    }),

  /* ── Bulk Import: Legislator Contacts ── */
  importLegislators: adminProcedure
    .input(z.object({ records: z.array(legislatorImportSchema).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      return bulkInsert(legislatorContacts, input.records, ctx.user.name ?? ctx.user.openId);
    }),

  /* ── Bulk Import: Advocacy Organizations ── */
  importAdvocacyOrgs: adminProcedure
    .input(z.object({ records: z.array(advocacyOrgImportSchema).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      return bulkInsert(advocacyOrganizations, input.records, ctx.user.name ?? ctx.user.openId);
    }),

  /* ── Bulk Import: Doctrine Registry ── */
  importDoctrineRegistry: adminProcedure
    .input(z.object({ records: z.array(z.object({
      name: z.string(),
      description: z.string(),
      primaryCases: z.array(z.string()),
      domains: z.array(z.string()),
    })).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      return bulkInsert(doctrineRegistry, input.records, ctx.user.name ?? ctx.user.openId);
    }),

  /* ── Bulk Import: Court Directory ── */
  importCourtDirectory: adminProcedure
    .input(z.object({ records: z.array(z.object({
      courtName: z.string(),
      courtType: z.string(),
      jurisdiction: z.string(),
      address: z.string().optional(),
      phone: z.string().optional(),
      website: z.string().optional(),
      filingUrl: z.string().optional(),
      clerkName: z.string().optional(),
      clerkEmail: z.string().optional(),
      domains: z.array(z.string()).optional(),
      notes: z.string().optional(),
    })).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      return bulkInsert(courtDirectory, input.records, ctx.user.name ?? ctx.user.openId);
    }),

  /* ── Bulk Import: Workflow Master ── */
  importWorkflowMaster: adminProcedure
    .input(z.object({ records: z.array(z.object({
      title: z.string(),
      domain: z.string(),
      issueTypes: z.array(z.string()),
      jurisdiction: z.string(),
      primaryAgency: z.string(),
      triggerConditions: z.array(z.string()).optional(),
      entryForms: z.array(z.string()).optional(),
      initialDeadlineRule: z.string().optional(),
      appealChain: z.array(z.any()).optional(),
      estimatedDuration: z.string().optional(),
      successRate: z.string().optional(),
      remedies: z.array(z.string()).optional(),
    })).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      return bulkInsert(workflowMaster, input.records, ctx.user.name ?? ctx.user.openId);
    }),

  /* ── Bulk Import: Evidence Profiles ── */
  importEvidenceProfiles: adminProcedure
    .input(z.object({ records: z.array(z.object({
      issueType: z.string(),
      domain: z.string().optional(),
      requiredMinimum: z.array(z.string()),
      recommended: z.array(z.string()).optional(),
      highValue: z.array(z.string()).optional(),
      commonFailureModes: z.array(z.string()).optional(),
      preservationNotes: z.string().optional(),
      spoliationRisks: z.array(z.string()).optional(),
    })).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      return bulkInsert(evidenceProfiles, input.records, ctx.user.name ?? ctx.user.openId);
    }),

  /* ── Bulk Import: Deadline Rules ── */
  importDeadlineRules: adminProcedure
    .input(z.object({ records: z.array(z.object({
      domain: z.string(),
      jurisdiction: z.string(),
      claimType: z.string(),
      deadlineType: z.enum(["filing", "response", "appeal", "discovery", "administrative_exhaustion", "tolling_expiry", "statute_of_limitations"]),
      timeLimitDays: z.number().optional(),
      extendedLimitDays: z.number().optional(),
      extendedCondition: z.string().optional(),
      tollingPossible: z.boolean().optional(),
      tollingConditions: z.array(z.string()).optional(),
      authority: z.string().optional(),
      notes: z.string().optional(),
    })).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      return bulkInsert(deadlineRules, input.records, ctx.user.name ?? ctx.user.openId);
    }),

  /* ── Bulk Import: Escalation Routes ── */
  importEscalationRoutes: adminProcedure
    .input(z.object({ records: z.array(z.object({
      workflowId: z.number(),
      title: z.string().optional(),
      triggerConditions: z.array(z.string()),
      routes: z.array(z.any()),
      priority: z.enum(["low", "medium", "high", "critical"]).optional(),
      preservationRequirements: z.array(z.string()).optional(),
      notes: z.string().optional(),
    })).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      return bulkInsert(escalationRoutes, input.records, ctx.user.name ?? ctx.user.openId);
    }),

  /* ── Bulk Import: Weak Joint Triggers ── */
  importWeakJointTriggers: adminProcedure
    .input(z.object({ records: z.array(z.object({
      weakJointId: z.number(),
      triggerName: z.string(),
      triggerCondition: z.string(),
      severityWeight: z.string(),
    })).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      return bulkInsert(weakJointTriggers, input.records, ctx.user.name ?? ctx.user.openId);
    }),

  /* ── Bulk Import: Proof Frameworks ── */
  importProofFrameworks: adminProcedure
    .input(z.object({ records: z.array(z.object({
      claimType: z.string(),
      domain: z.string(),
      elementsOfProof: z.array(z.string()),
      burdenOfProof: z.string(),
      standardOfReview: z.string().optional(),
      requiredCausation: z.string().optional(),
      typicalEvidence: z.array(z.string()).optional(),
      commonDefenses: z.array(z.string()).optional(),
      keyPrecedents: z.array(z.string()).optional(),
      notes: z.string().optional(),
    })).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      return bulkInsert(proofFrameworks, input.records, ctx.user.name ?? ctx.user.openId);
    }),

  /* ── Bulk Import: Signal Registry ── */
  importSignalRegistry: adminProcedure
    .input(z.object({ records: z.array(z.object({
      signalId: z.string(),
      domain: z.string(),
      triggerPatterns: z.array(z.string()),
      linkedDoctrine: z.array(z.string()).optional(),
      linkedWeakJoints: z.array(z.string()).optional(),
      severity: z.enum(["critical", "high", "medium", "low"]).optional(),
      explanation: z.string(),
      recommendedNextSteps: z.array(z.string()).optional(),
    })).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      return bulkInsert(signalRegistry, input.records, ctx.user.name ?? ctx.user.openId);
    }),

  /* ── Bulk Import: Pattern Registry ── */
  importPatternRegistry: adminProcedure
    .input(z.object({ records: z.array(z.object({
      patternId: z.string(),
      patternName: z.string(),
      patternDescription: z.string().optional(),
      patternType: z.string().optional(),
      signalType: z.string().optional(),
      jurisdictionScope: z.string().optional(),
      relatedLaws: z.array(z.string()).optional(),
      relatedAgencies: z.array(z.string()).optional(),
      harmDomains: z.array(z.string()).optional(),
    })).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const now = Date.now();
      let inserted = 0;
      const errors: string[] = [];
      for (let i = 0; i < input.records.length; i++) {
        try {
          await db.insert(patternRegistry).values({ ...input.records[i], createdAt: now, updatedAt: now });
          inserted++;
        } catch (err: any) {
          if (err?.code === "ER_DUP_ENTRY") { /* skip */ } else {
            errors.push(`Row ${i}: ${err?.message ?? "Unknown error"}`);
          }
        }
      }
      return { inserted, skipped: input.records.length - inserted - errors.length, errors };
    }),

  /* ── Bulk Import: Settlement Formulas ── */
  importSettlementFormulas: adminProcedure
    .input(z.object({ records: z.array(z.object({
      formulaId: z.string(),
      formulaName: z.string(),
      claimType: z.string(),
      jurisdiction: z.string(),
      formulaExpression: z.string(),
      variables: z.array(z.string()).optional(),
      multiplierRanges: z.any().optional(),
      statutoryBasis: z.array(z.string()).optional(),
      notes: z.string().optional(),
    })).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      let inserted = 0;
      const errors: string[] = [];
      for (let i = 0; i < input.records.length; i++) {
        try {
          await db.insert(settlementFormulas).values(input.records[i]);
          inserted++;
        } catch (err: any) {
          if (err?.code === "ER_DUP_ENTRY") { /* skip */ } else {
            errors.push(`Row ${i}: ${err?.message ?? "Unknown error"}`);
          }
        }
      }
      return { inserted, skipped: input.records.length - inserted - errors.length, errors };
    }),

  /* ── Universal JSON Import (auto-detect format, flatten domain groups, preserve snake_case fields) ── */
  importUniversalJSON: adminProcedure
    .input(z.object({
      targetTable: z.string(),
      rawJson: z.string().max(5_000_000),
    }))
    .mutation(async ({ ctx, input }) => {
      const addedBy = ctx.user.name ?? ctx.user.openId;
      let parsed: any;
      try {
        parsed = JSON.parse(input.rawJson);
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid JSON" });
      }

      // Flatten domain-grouped objects into a single array
      let records: any[];
      if (Array.isArray(parsed)) {
        records = parsed;
      } else if (typeof parsed === "object" && parsed !== null) {
        records = [];
        for (const [domainKey, arr] of Object.entries(parsed)) {
          if (Array.isArray(arr)) {
            for (const rec of arr) {
              records.push(typeof rec === "object" && rec !== null && !Array.isArray(rec) ? { ...rec, _sourceGroup: domainKey } : rec);
            }
          }
        }
      } else {
        throw new TRPCError({ code: "BAD_REQUEST", message: "JSON must be an array or an object with array values" });
      }

      if (records.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "No records found in JSON" });
      if (records.length > 2000) throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum 2000 records per import" });

      if (!allowedKnowledgeBackboneTables.has(input.targetTable as any)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported Knowledge Backbone target table" });
      }

      const quotedTable = quoteSafeIdentifier(input.targetTable);
      const pool = getPool();
      const { rows: columnRows } = await pool.query(
        `
          SELECT column_name, data_type, udt_name
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
        `,
        [input.targetTable]
      );

      if (columnRows.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Target table not found: ${input.targetTable}` });
      }

      const columns = new Map<string, { dataType: string; udtName: string }>(
        columnRows.map((row: { column_name: string; data_type: string; udt_name: string }) => [
          row.column_name,
          { dataType: row.data_type, udtName: row.udt_name },
        ])
      );

      // Legacy NOT NULL columns that need defaults per table. Keep universal JSON defaults snake_case only.
      const legacyDefaults: Record<string, Record<string, any>> = {
        legal_statutes: { jurisdiction_id: 0, statute_citation: "" },
        legal_case_law: { jurisdiction_id: 0, case_citation: "" },
        lumensend_templates: { name: "" },
        legislator_contacts: { full_name: "", jurisdiction: "", chamber: "other" },
        advocacy_organizations: { name: "", org_type: "other", jurisdiction: "" },
        deadline_rules: { claim_type: "", jurisdiction: "", trigger_event: "", deadline_type: "filing" },
        weak_joint_triggers: { trigger_name: "" },
      };

      const isJsonColumn = (columnName: string) => {
        const column = columns.get(columnName);
        return column?.dataType === "json" || column?.dataType === "jsonb" || column?.udtName === "json" || column?.udtName === "jsonb";
      };

      const normalizeValue = (columnName: string, value: any) => {
        if (value === undefined) return undefined;
        if (isJsonColumn(columnName)) {
          if (typeof value === "string") {
            try {
              JSON.parse(value);
              return value;
            } catch {
              return JSON.stringify(value);
            }
          }
          return JSON.stringify(value);
        }
        if (Array.isArray(value) || (typeof value === "object" && value !== null)) return JSON.stringify(value);
        return value;
      };

      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const auditValue = (columnName: string) => {
        const column = columns.get(columnName);
        if (["bigint", "integer", "numeric", "double precision", "real", "smallint"].includes(column?.dataType ?? "")) return nowMs;
        return nowIso;
      };

      let inserted = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (let i = 0; i < records.length; i++) {
        try {
          const raw = records[i];
          if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
            skipped++;
            errors.push(`Row ${i + 1}: record must be a JSON object`);
            continue;
          }

          const row: Record<string, any> = {};
          let matchedInputColumn = false;

          for (const [key, value] of Object.entries(raw)) {
            if (key === "meta" || key === "_sourceGroup") continue;
            if (!safeIdentifierPattern.test(key) || !columns.has(key)) continue;
            const normalizedValue = normalizeValue(key, value);
            if (normalizedValue === undefined) continue;
            row[key] = normalizedValue;
            matchedInputColumn = true;
          }

          if (!matchedInputColumn) {
            skipped++;
            errors.push(`Row ${i + 1}: no valid snake_case columns matched target table`);
            continue;
          }

          const defaults = legacyDefaults[input.targetTable] ?? {};
          for (const [columnName, defaultValue] of Object.entries(defaults)) {
            if (columns.has(columnName) && row[columnName] === undefined) row[columnName] = normalizeValue(columnName, defaultValue);
          }

          if (columns.has("created_at") && row.created_at === undefined) row.created_at = auditValue("created_at");
          if (columns.has("updated_at") && row.updated_at === undefined) row.updated_at = auditValue("updated_at");
          if (columns.has("added_by") && row.added_by === undefined) row.added_by = addedBy;

          const columnNames = Object.keys(row).filter((columnName) => columns.has(columnName));
          if (columnNames.length === 0) {
            skipped++;
            errors.push(`Row ${i + 1}: no valid snake_case columns matched target table`);
            continue;
          }

          const quotedColumns = columnNames.map(quoteSafeIdentifier).join(", ");
          const values = columnNames.map((columnName) => row[columnName]);
          const placeholders = columnNames
            .map((columnName, valueIndex) => {
              const placeholder = `$${valueIndex + 1}`;
              if (isJsonColumn(columnName)) return `${placeholder}::${columns.get(columnName)?.udtName === "json" ? "json" : "jsonb"}`;
              return placeholder;
            })
            .join(", ");

          await pool.query(`INSERT INTO ${quotedTable} (${quotedColumns}) VALUES (${placeholders})`, values);
          inserted++;
        } catch (err: any) {
          if (err?.code === "ER_DUP_ENTRY" || err?.code === "23505") {
            skipped++;
          } else {
            errors.push(`Row ${i + 1}: ${err?.message ?? "Unknown"}`);
          }
        }
      }

      return { inserted, skipped, errors, total: records.length };
    }),

  /* ══════════════════════════════════════════════════════════════
     KNOWLEDGE BACKBONE EXPLORER — Browse / Search endpoints
     ══════════════════════════════════════════════════════════════ */

  /** Browse statutes with optional search & jurisdiction filter */
  browseStatutes: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      jurisdiction: z.string().optional(),
      domain: z.string().optional(),
      limit: z.number().min(1).max(100).default(25),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const conditions: string[] = [];
      if (input.search) conditions.push(`(title LIKE '%${input.search.replace(/'/g, "''")}%' OR citation LIKE '%${input.search.replace(/'/g, "''")}%' OR summary LIKE '%${input.search.replace(/'/g, "''")}%')`);
      if (input.jurisdiction) conditions.push(`jurisdiction = '${input.jurisdiction.replace(/'/g, "''")}' `);
      if (input.domain) conditions.push(`domains LIKE '%${input.domain.replace(/'/g, "''")}%'`);
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const [rows] = await db.execute(sql.raw(`SELECT id, jurisdiction, citation, title, summary, domains, sourceType, createdAt FROM legal_statutes ${where} ORDER BY createdAt DESC LIMIT ${input.limit} OFFSET ${input.offset}`));
      const [countRows] = await db.execute(sql.raw(`SELECT COUNT(*) as cnt FROM legal_statutes ${where}`));
      return { rows: rows as unknown as unknown as any[], total: Number((countRows as unknown as any[])[0]?.cnt ?? 0) };
    }),

  /** Browse case law with optional search & jurisdiction filter */
  browseCaseLaw: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      jurisdiction: z.string().optional(),
      domain: z.string().optional(),
      limit: z.number().min(1).max(100).default(25),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const conditions: string[] = [];
      if (input.search) conditions.push(`(caseName LIKE '%${input.search.replace(/'/g, "''")}%' OR citation LIKE '%${input.search.replace(/'/g, "''")}%' OR holding LIKE '%${input.search.replace(/'/g, "''")}%')`);
      if (input.jurisdiction) conditions.push(`jurisdiction = '${input.jurisdiction.replace(/'/g, "''")}' `);
      if (input.domain) conditions.push(`domains LIKE '%${input.domain.replace(/'/g, "''")}%'`);
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const [rows] = await db.execute(sql.raw(`SELECT id, caseName, citation, jurisdiction, court, holding AS summary, yearDecided, keyQuotes, domains, createdAt FROM legal_case_law ${where} ORDER BY createdAt DESC LIMIT ${input.limit} OFFSET ${input.offset}`));
      const [countRows] = await db.execute(sql.raw(`SELECT COUNT(*) as cnt FROM legal_case_law ${where}`));
      return { rows: rows as unknown as unknown as any[], total: Number((countRows as unknown as any[])[0]?.cnt ?? 0) };
    }),

  /** Browse agency authorities — primary source: agencies_registry (20 real agencies with contact info) */
  browseAgencies: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      jurisdiction: z.string().optional(),
      limit: z.number().min(1).max(100).default(25),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      // Build conditions for agencies_registry
      const arConditions: string[] = [];
      if (input.search) arConditions.push(`(agencyName LIKE '%${input.search.replace(/'/g, "''")}%' OR domain LIKE '%${input.search.replace(/'/g, "''")}%' OR jurisdiction LIKE '%${input.search.replace(/'/g, "''")}%')`);
      if (input.jurisdiction) arConditions.push(`jurisdiction = '${input.jurisdiction.replace(/'/g, "''")}'`);
      const arWhere = arConditions.length > 0 ? `WHERE ${arConditions.join(' AND ')}` : '';

      // Build conditions for agency_authority_map
      const aamConditions: string[] = [];
      if (input.search) aamConditions.push(`(agency LIKE '%${input.search.replace(/'/g, "''")}%' OR domain LIKE '%${input.search.replace(/'/g, "''")}%' OR statute LIKE '%${input.search.replace(/'/g, "''")}%')`);
      const aamWhere = aamConditions.length > 0 ? `WHERE ${aamConditions.join(' AND ')}` : '';

      // Query agencies_registry first (has real contact info)
      const [arRows] = await db.execute(sql.raw(`SELECT id, agencyName AS agency_name, jurisdiction, domain AS authority_type, agencyType AS agency_type, website AS website_url, contactMethods AS contact_methods, officialStatus AS official_status, createdAt AS created_at FROM agencies_registry ${arWhere} ORDER BY agencyName ASC`));
      // Query agency_authority_map for enforcement pathway data
      const [aamRows] = await db.execute(sql.raw(`SELECT id, agency AS agency_name, agencyShort AS agency_short, domain AS authority_type, statute, complaintPathway AS filing_url, responseTimelineDays AS response_timeline_days, complaintTypes AS complaint_types, createdAt AS created_at FROM agency_authority_map ${aamWhere} ORDER BY createdAt DESC`));

      // Merge: agencies_registry rows first, then agency_authority_map rows not already covered
      const arNames = new Set((arRows as unknown as any[]).map((r: any) => r.agency_name?.toLowerCase()));
      const aamFiltered = (aamRows as unknown as any[]).filter((r: any) => !arNames.has(r.agency_name?.toLowerCase()));

      // Normalize agencies_registry rows to match UI shape
      const normalizedAR = (arRows as unknown as any[]).map((r: any) => {
        const cm = typeof r.contact_methods === 'string' ? JSON.parse(r.contact_methods) : (r.contact_methods ?? {});
        return {
          id: r.id,
          agency_name: r.agency_name,
          jurisdiction: r.jurisdiction,
          authority_type: r.authority_type,
          agency_type: r.agency_type,
          website_url: r.website_url,
          phone: cm.phone ?? null,
          email: cm.email ?? null,
          address: cm.address ?? null,
          filing_url: cm.filing_url ?? cm.filingUrl ?? r.website_url,
          official_status: r.official_status,
          created_at: r.created_at,
        };
      });

      const allRows = [...normalizedAR, ...aamFiltered];
      const total = allRows.length;
      const paginated = allRows.slice(input.offset, input.offset + input.limit);
      return { rows: paginated, total };
    }),

  /** Browse court directory */
  browseCourts: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      jurisdiction: z.string().optional(),
      courtType: z.string().optional(),
      limit: z.number().min(1).max(100).default(25),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const conditions: string[] = [];
      // court_directory is empty — serve from registry_oversight_bodies (218 rows)
      if (input.search) conditions.push(`(agency_name_rob LIKE '%${input.search.replace(/'/g, "''")}%' OR function_rob LIKE '%${input.search.replace(/'/g, "''")}%')`);
      if (input.courtType) conditions.push(`function_rob LIKE '%${input.courtType.replace(/'/g, "''")}%'`);
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const [rows] = await db.execute(sql.raw(`SELECT id, agency_name_rob AS court_name, function_rob AS court_type, contact_rob AS filing_portal, pathway_rob AS escalation_path, statute_of_limitations_rob AS sol, created_at_rob AS created_at FROM registry_oversight_bodies ${where} ORDER BY created_at_rob DESC LIMIT ${input.limit} OFFSET ${input.offset}`));
      const [countRows] = await db.execute(sql.raw(`SELECT COUNT(*) as cnt FROM registry_oversight_bodies ${where}`));
      return { rows: rows as unknown as unknown as any[], total: Number((countRows as unknown as any[])[0]?.cnt ?? 0) };
    }),

  /** Browse advocacy targets */
  browseAdvocacyTargets: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      targetType: z.string().optional(),
      limit: z.number().min(1).max(100).default(25),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const conditions: string[] = [];
      // advocacy_targets table doesn't exist — serve from registry_programs (1694 rows)
      if (input.search) conditions.push(`(name_rp LIKE '%${input.search.replace(/'/g, "''")}%' OR agency_rp LIKE '%${input.search.replace(/'/g, "''")}%' OR eligibility_rp LIKE '%${input.search.replace(/'/g, "''")}%')`);
      if (input.targetType) conditions.push(`category_rp LIKE '%${input.targetType.replace(/'/g, "''")}%'`);
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const [rows] = await db.execute(sql.raw(`SELECT id, name_rp AS target_name, category_rp AS target_type, jurisdiction_id_rp AS jurisdiction, contact_rp AS contact_info, created_at_rp AS created_at FROM registry_programs ${where} ORDER BY created_at_rp DESC LIMIT ${input.limit} OFFSET ${input.offset}`));
      const [countRows] = await db.execute(sql.raw(`SELECT COUNT(*) as cnt FROM registry_programs ${where}`));
      return { rows: rows as unknown as unknown as any[], total: Number((countRows as unknown as any[])[0]?.cnt ?? 0) };
    }),

  /** Browse settlement formulas */
  browseSettlementFormulas: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      claimType: z.string().optional(),
      limit: z.number().min(1).max(100).default(25),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const conditions: string[] = [];
      // settlement_formulas uses snake_case columns: formula_name, claim_type, formula_expression
      if (input.search) conditions.push(`(formula_name LIKE '%${input.search.replace(/'/g, "''")}%' OR claim_type LIKE '%${input.search.replace(/'/g, "''")}%' OR notes LIKE '%${input.search.replace(/'/g, "''")}%')`);
      if (input.claimType) conditions.push(`claim_type = '${input.claimType.replace(/'/g, "''")}' `);
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const [rows] = await db.execute(sql.raw(`SELECT formula_id AS id, formula_name, claim_type, jurisdiction, formula_expression AS base_multiplier, notes AS description, created_at FROM settlement_formulas ${where} ORDER BY created_at DESC LIMIT ${input.limit} OFFSET ${input.offset}`));
      const [countRows] = await db.execute(sql.raw(`SELECT COUNT(*) as cnt FROM settlement_formulas ${where}`));
      return { rows: rows as unknown as unknown as any[], total: Number((countRows as unknown as any[])[0]?.cnt ?? 0) };
    }),

  /** Get distinct jurisdictions across all knowledge tables */
  getJurisdictions: protectedProcedure.query(async () => {
    const [rows] = await db.execute(sql.raw(`
      SELECT DISTINCT jurisdiction FROM (
        SELECT jurisdiction FROM legal_statutes
        UNION SELECT jurisdiction FROM legal_case_law
        UNION SELECT DISTINCT jurisdiction_id_rp AS jurisdiction FROM registry_programs WHERE jurisdiction_id_rp IS NOT NULL
      ) AS all_jurisdictions
      WHERE jurisdiction IS NOT NULL AND jurisdiction != '' AND jurisdiction NOT IN ('state')
      ORDER BY jurisdiction
    `));
    // Normalize: convert j_xxx IDs to Title Case labels, deduplicate
    const stateMap: Record<string, string> = {
      j_alaska: 'Alaska', j_american_samoa: 'American Samoa', j_arizona: 'Arizona',
      j_arkansas: 'Arkansas', j_co: 'Colorado', j_connecticut: 'Connecticut',
      j_delaware: 'Delaware', j_fl: 'Florida', j_ga: 'Georgia', j_guam: 'Guam',
      j_hawaii: 'Hawaii', j_idaho: 'Idaho', j_il: 'Illinois', j_in: 'Indiana',
      j_iowa: 'Iowa', j_kansas: 'Kansas', j_louisiana: 'Louisiana', j_maine: 'Maine',
      j_maryland: 'Maryland', j_massachusetts: 'Massachusetts', j_mi: 'Michigan',
      j_mississippi: 'Mississippi', j_mn: 'Minnesota', j_montana: 'Montana',
      j_nebraska: 'Nebraska', j_nevada: 'Nevada', j_new_hampshire: 'New Hampshire',
      j_new_jersey: 'New Jersey', j_new_mexico: 'New Mexico', j_nh: 'New Hampshire',
      j_nj: 'New Jersey', j_nm: 'New Mexico', j_north_dakota: 'North Dakota',
      j_northern_mariana_islands: 'Northern Mariana Islands', j_ny: 'New York',
      j_oh: 'Ohio', j_oklahoma: 'Oklahoma', j_pennsylvania: 'Pennsylvania',
      j_puerto_rico: 'Puerto Rico', j_rhode_island: 'Rhode Island',
      j_south_dakota: 'South Dakota', j_tx: 'Texas', j_us_virgin_islands: 'U.S. Virgin Islands',
      j_utah: 'Utah', j_va: 'Virginia', j_vermont: 'Vermont', j_vi: 'U.S. Virgin Islands',
      j_washington: 'Washington', j_washington_dc: 'Washington D.C.',
      j_wi: 'Wisconsin', j_wv: 'West Virginia', j_wyoming: 'Wyoming',
    };
    const seen = new Set<string>();
    const result: string[] = [];
    for (const r of rows as unknown as any[]) {
      const raw: string = r.jurisdiction;
      const normalized = stateMap[raw.toLowerCase()] ?? (raw === 'federal' || raw === 'Federal' ? 'Federal' : raw);
      if (!seen.has(normalized)) { seen.add(normalized); result.push(normalized); }
    }
    return result.sort((a, b) => a === 'Federal' ? -1 : b === 'Federal' ? 1 : a.localeCompare(b));
  }),

  /** Get distinct domains across statutes and case law */
  getDomains: protectedProcedure.query(async () => {
    const [rows] = await db.execute(sql.raw(`
      SELECT DISTINCT domains FROM legal_statutes WHERE domains IS NOT NULL
      UNION SELECT DISTINCT domains FROM legal_case_law WHERE domains IS NOT NULL
    `));
    const domainSet = new Set<string>();
    for (const r of rows as unknown as any[]) {
      try {
        const parsed = typeof r.domains === 'string' ? JSON.parse(r.domains) : r.domains;
        if (Array.isArray(parsed)) parsed.forEach((d: string) => domainSet.add(d));
        else if (typeof parsed === 'string') domainSet.add(parsed);
      } catch { /* skip */ }
    }
    return Array.from(domainSet).sort();
  }),

  /* ══════════════════════════════════════════════════════════════
     SQL PASTE IMPORT — Parse INSERT INTO statements
     ══════════════════════════════════════════════════════════════ */
  importSQL: adminProcedure
    .input(z.object({
      targetTable: z.string(),
      rawSql: z.string().max(5_000_000),
    }))
    .mutation(async ({ ctx, input }) => {
      const addedBy = ctx.user.name ?? ctx.user.openId;
      const now = Date.now();

      // Allowed tables (same as JSON import)
      const allowedTables = new Set([
        'legal_statutes', 'legal_case_law', 'agency_authority_map', 'strategy_claim_catalog',
        'lumensend_templates', 'assembly_section_library', 'legislator_contacts',
        'advocacy_organizations', 'doctrine_registry', 'court_directory', 'workflow_master',
        'evidence_profiles', 'deadline_rules', 'escalation_routes', 'weak_joint_triggers',
        'proof_frameworks', 'signal_registry', 'pattern_registry', 'settlement_formulas',
      ]);

      if (!allowedTables.has(input.targetTable)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Table '${input.targetTable}' is not an allowed import target` });
      }

      const rawSql = input.rawSql.trim();

      // Parse SQL INSERT statements
      // Supports: INSERT INTO table (col1, col2) VALUES (val1, val2), (val3, val4);
      // Also supports multiple INSERT statements separated by semicolons
      const records: Record<string, any>[] = [];
      const errors: string[] = [];

      // Split on semicolons to handle multiple INSERT statements
      const statements = rawSql.split(/;\s*/).filter(s => s.trim().length > 0);

      for (const stmt of statements) {
        const trimmed = stmt.trim();
        // Skip non-INSERT statements (CREATE TABLE, SET, etc.)
        if (!trimmed.match(/^INSERT\s+INTO/i)) continue;

        try {
          // Extract column names
          const colMatch = trimmed.match(/INSERT\s+INTO\s+[`'"]?\w+[`'"]?\s*\(([^)]+)\)/i);
          if (!colMatch) {
            errors.push(`Could not parse columns from: ${trimmed.substring(0, 80)}...`);
            continue;
          }
          const columns = colMatch[1].split(',').map(c => c.trim().replace(/[`'"]/g, ''));

          // Extract VALUES section
          const valuesMatch = trimmed.match(/VALUES\s*(.+)$/is);
          if (!valuesMatch) {
            errors.push(`Could not parse VALUES from: ${trimmed.substring(0, 80)}...`);
            continue;
          }

          // Parse individual value tuples — handle nested parens, strings with commas/parens
          const valuesStr = valuesMatch[1];
          const tuples: string[] = [];
          let depth = 0;
          let current = '';
          let inString: string | null = null;
          let escaped = false;

          for (let i = 0; i < valuesStr.length; i++) {
            const ch = valuesStr[i];
            if (escaped) { current += ch; escaped = false; continue; }
            if (ch === '\\') { current += ch; escaped = true; continue; }

            if (inString) {
              current += ch;
              if (ch === inString) {
                // Check for escaped quote (e.g., '' in SQL)
                if (i + 1 < valuesStr.length && valuesStr[i + 1] === inString) {
                  current += valuesStr[i + 1];
                  i++;
                } else {
                  inString = null;
                }
              }
              continue;
            }

            if (ch === "'" || ch === '"') { inString = ch; current += ch; continue; }
            if (ch === '(') { depth++; if (depth === 1) { current = ''; continue; } }
            if (ch === ')') {
              depth--;
              if (depth === 0) { tuples.push(current); current = ''; continue; }
            }
            if (depth > 0) current += ch;
          }

          // Parse each tuple into column→value pairs
          for (const tuple of tuples) {
            try {
              const values = parseSqlValues(tuple);
              if (values.length !== columns.length) {
                errors.push(`Column count mismatch: expected ${columns.length}, got ${values.length}`);
                continue;
              }
              const record: Record<string, any> = {};
              for (let j = 0; j < columns.length; j++) {
                record[columns[j]] = values[j];
              }
              records.push(record);
            } catch (e: any) {
              errors.push(`Parse error in tuple: ${e?.message ?? 'Unknown'}`);
            }
          }
        } catch (e: any) {
          errors.push(`Statement parse error: ${e?.message ?? 'Unknown'}`);
        }
      }

      if (records.length === 0 && errors.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No INSERT statements found. Paste SQL INSERT INTO ... VALUES ... statements." });
      }
      if (records.length > 2000) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum 2000 records per import" });
      }

      // Insert records using raw SQL (same as JSON fallback path)
      let inserted = 0;
      for (let i = 0; i < records.length; i++) {
        try {
          const rec = records[i];
          // Add defaults
          if (!rec.createdAt) rec.createdAt = now;
          if (!rec.updatedAt) rec.updatedAt = now;
          if (!rec.addedBy) rec.addedBy = addedBy;

          const cols = Object.keys(rec);
          const vals = cols.map(c => {
            const v = rec[c];
            return typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
          });
          const placeholders = cols.map(() => '?').join(', ');
          await db.execute(
            sql.raw(
              `INSERT INTO \`${input.targetTable}\` (${cols.map(c => `\`${c}\``).join(', ')}) VALUES (${placeholders})`,
        // @ts-ignore - extra arg is valid at runtime
              vals as any
            )
          );
          inserted++;
        } catch (err: any) {
          if (err?.code === 'ER_DUP_ENTRY') { /* skip */ } else {
            errors.push(`Row ${i}: ${err?.message ?? 'Unknown'}`);
          }
        }
      }

      return { inserted, skipped: records.length - inserted - errors.length, errors: errors.slice(0, 20), total: records.length };
    }),
});

/** Parse a SQL values tuple string into an array of JS values */
function parseSqlValues(tuple: string): any[] {
  const values: any[] = [];
  let current = '';
  let inString: string | null = null;
  let escaped = false;
  let depth = 0;

  for (let i = 0; i <= tuple.length; i++) {
    const ch = i < tuple.length ? tuple[i] : ',';

    if (escaped) { current += ch; escaped = false; continue; }
    if (ch === '\\') { current += ch; escaped = true; continue; }

    if (inString) {
      if (ch === inString) {
        if (i + 1 < tuple.length && tuple[i + 1] === inString) {
          current += inString;
          i++;
        } else {
          inString = null;
        }
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === "'" || ch === '"') { inString = ch; continue; }
    if (ch === '(') { depth++; current += ch; continue; }
    if (ch === ')') { depth--; current += ch; continue; }

    if (ch === ',' && depth === 0 && i <= tuple.length) {
      const trimmed = current.trim();
      if (trimmed.toUpperCase() === 'NULL') {
        values.push(null);
      } else if (trimmed.toUpperCase() === 'TRUE') {
        values.push(true);
      } else if (trimmed.toUpperCase() === 'FALSE') {
        values.push(false);
      } else if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        values.push(Number(trimmed));
      } else {
        // String value (quotes already stripped)
        values.push(trimmed);
      }
      current = '';
    } else {
      current += ch;
    }
  }

  return values;
}
