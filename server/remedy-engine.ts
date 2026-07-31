/**
 * Remedy Path Engine
 * 
 * Generates remedy paths from case data using deterministic lookup tables, with:
 * - Viability assessment (moderate by default — only human review can assess strong/weak)
 * - Step-by-step action plans with deadlines
 * - Documentation requirements per step
 * - Readiness indicators (what % of requirements are met)
 * - Tool links for each step (filing generator, FOIA, etc.)
 */
import { db } from "./db";
import {
  remedyPaths, remedySteps, remedyDocRequirements,
  cases, claims, findings, events, documents, checklistItems,
  missingRecords, evidenceItems,
} from "../drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";

// ─── Types ───

interface RemedyPathGeneration {
  title: string;
  description: string;
  pathType: "administrative" | "judicial" | "legislative" | "informal" | "hybrid";
  viability: "strong" | "moderate" | "weak" | "uncertain";
  estimatedTimeline: string;
  estimatedCost: string;
  riskLevel: "low" | "medium" | "high";
  prerequisites: string[];
  relatedClaimTypes: string[];
  steps: {
    title: string;
    description: string;
    actionType: string;
    estimatedDuration: string;
    linkedToolHref: string;
    docRequirements: {
      documentType: string;
      description: string;
      required: boolean;
    }[];
  }[];
}

// ─── Remedy Path Lookup Table ───

const REMEDY_PATHS_BY_CLAIM_TYPE: Record<string, RemedyPathGeneration[]> = {
  housing_discrimination: [
    {
      title: "HUD Fair Housing Complaint",
      description: "File a complaint with the U.S. Department of Housing and Urban Development alleging fair housing violations.",
      pathType: "administrative",
      viability: "moderate",
      estimatedTimeline: "6-12 months",
      estimatedCost: "$0 (no filing fee)",
      riskLevel: "low",
      prerequisites: ["Identify the discriminatory act", "Document the timeline of events"],
      relatedClaimTypes: ["housing_discrimination"],
      steps: [
        { title: "Gather evidence of discrimination", description: "Collect all communications, applications, and records showing discriminatory treatment.", actionType: "gather_evidence", estimatedDuration: "1-2 weeks", linkedToolHref: "/upload", docRequirements: [{ documentType: "Communication records", description: "Emails, texts, or letters with landlord/property manager", required: true }, { documentType: "Rental application", description: "Your application and any denial notice", required: true }] },
        { title: "File HUD complaint", description: "Submit Form HUD-903 online or by mail within one year of the discriminatory act.", actionType: "file_document", estimatedDuration: "1-2 days", linkedToolHref: "/filing-generator", docRequirements: [{ documentType: "HUD complaint form", description: "Completed HUD-903 form", required: true }] },
        { title: "Await HUD investigation", description: "HUD will investigate and attempt conciliation within 100 days.", actionType: "wait", estimatedDuration: "3-6 months", linkedToolHref: "/deadline-calculator", docRequirements: [] },
        { title: "Participate in conciliation or hearing", description: "If conciliation fails, case proceeds to administrative hearing or federal court.", actionType: "attend_hearing", estimatedDuration: "2-4 months", linkedToolHref: "/narrative", docRequirements: [{ documentType: "Evidence summary", description: "Organized evidence for presentation", required: true }] },
      ],
    },
    {
      title: "State Fair Housing Agency Complaint",
      description: "File a complaint with your state's civil rights or fair housing enforcement agency.",
      pathType: "administrative",
      viability: "moderate",
      estimatedTimeline: "4-8 months",
      estimatedCost: "$0 (no filing fee)",
      riskLevel: "low",
      prerequisites: ["Identify applicable state fair housing law"],
      relatedClaimTypes: ["housing_discrimination"],
      steps: [
        { title: "Identify your state agency", description: "Find the appropriate state civil rights or human rights commission.", actionType: "gather_evidence", estimatedDuration: "1 day", linkedToolHref: "/upload", docRequirements: [] },
        { title: "File state complaint", description: "Submit complaint to the state agency. Many have work-sharing agreements with HUD.", actionType: "file_document", estimatedDuration: "1-2 days", linkedToolHref: "/filing-generator", docRequirements: [{ documentType: "State complaint form", description: "Completed state agency complaint form", required: true }] },
        { title: "Await state investigation", description: "State agency investigates and may mediate or issue findings.", actionType: "wait", estimatedDuration: "2-6 months", linkedToolHref: "/deadline-calculator", docRequirements: [] },
      ],
    },
  ],
  employment_discrimination: [
    {
      title: "EEOC Charge of Discrimination",
      description: "File a charge with the Equal Employment Opportunity Commission.",
      pathType: "administrative",
      viability: "moderate",
      estimatedTimeline: "6-18 months",
      estimatedCost: "$0 (no filing fee)",
      riskLevel: "low",
      prerequisites: ["Identify the discriminatory act", "File within 180/300 days of the act"],
      relatedClaimTypes: ["employment_discrimination"],
      steps: [
        { title: "Document discriminatory treatment", description: "Gather performance reviews, communications, and witness information.", actionType: "gather_evidence", estimatedDuration: "1-2 weeks", linkedToolHref: "/upload", docRequirements: [{ documentType: "Employment records", description: "Performance reviews, job descriptions, pay records", required: true }, { documentType: "Communications", description: "Emails or messages showing discriminatory conduct", required: true }] },
        { title: "File EEOC charge", description: "Submit charge online, by mail, or in person at an EEOC office.", actionType: "file_document", estimatedDuration: "1-3 days", linkedToolHref: "/filing-generator", docRequirements: [{ documentType: "EEOC charge form", description: "Completed EEOC intake questionnaire", required: true }] },
        { title: "Await EEOC investigation", description: "EEOC investigates, may mediate, or issues right-to-sue letter.", actionType: "wait", estimatedDuration: "6-12 months", linkedToolHref: "/deadline-calculator", docRequirements: [] },
        { title: "Review right-to-sue options", description: "If EEOC does not resolve, you receive a right-to-sue letter allowing federal court action within 90 days.", actionType: "review", estimatedDuration: "1-2 weeks", linkedToolHref: "/narrative", docRequirements: [] },
      ],
    },
  ],
  consumer_fraud: [
    {
      title: "Attorney General Consumer Complaint",
      description: "File a consumer protection complaint with your state Attorney General's office.",
      pathType: "administrative",
      viability: "moderate",
      estimatedTimeline: "2-6 months",
      estimatedCost: "$0",
      riskLevel: "low",
      prerequisites: ["Document the deceptive practice", "Gather purchase records"],
      relatedClaimTypes: ["consumer_fraud"],
      steps: [
        { title: "Gather transaction records", description: "Collect receipts, contracts, advertising materials, and correspondence.", actionType: "gather_evidence", estimatedDuration: "1 week", linkedToolHref: "/upload", docRequirements: [{ documentType: "Purchase records", description: "Receipts, contracts, or billing statements", required: true }, { documentType: "Advertising materials", description: "Ads or claims that were deceptive", required: false }] },
        { title: "File AG complaint", description: "Submit complaint to your state Attorney General's consumer protection division.", actionType: "file_document", estimatedDuration: "1-2 days", linkedToolHref: "/filing-generator", docRequirements: [{ documentType: "AG complaint form", description: "Completed consumer complaint form", required: true }] },
        { title: "Await AG response", description: "AG office reviews and may investigate, mediate, or refer.", actionType: "wait", estimatedDuration: "1-4 months", linkedToolHref: "/deadline-calculator", docRequirements: [] },
      ],
    },
    {
      title: "Small Claims Court Action",
      description: "File a small claims court case to recover damages from the deceptive practice.",
      pathType: "judicial",
      viability: "moderate",
      estimatedTimeline: "2-4 months",
      estimatedCost: "$30-75 filing fee",
      riskLevel: "medium",
      prerequisites: ["Calculate your damages", "Identify the correct defendant"],
      relatedClaimTypes: ["consumer_fraud"],
      steps: [
        { title: "Calculate damages", description: "Determine the amount you lost due to the deceptive practice.", actionType: "review", estimatedDuration: "1-2 days", linkedToolHref: "/narrative", docRequirements: [{ documentType: "Damages calculation", description: "Itemized list of losses", required: true }] },
        { title: "File small claims complaint", description: "File at your local courthouse. Most states have limits of $5,000-$10,000.", actionType: "file_document", estimatedDuration: "1 day", linkedToolHref: "/filing-generator", docRequirements: [{ documentType: "Small claims form", description: "Completed court complaint form", required: true }] },
        { title: "Serve the defendant", description: "Arrange service of process on the business.", actionType: "submit_form", estimatedDuration: "1-2 weeks", linkedToolHref: "/lumensend", docRequirements: [] },
        { title: "Attend hearing", description: "Present your evidence at the small claims hearing.", actionType: "attend_hearing", estimatedDuration: "1 day", linkedToolHref: "/narrative", docRequirements: [{ documentType: "Evidence packet", description: "Organized documents for court", required: true }] },
      ],
    },
  ],
  insurance_bad_faith: [
    {
      title: "Insurance Commissioner Complaint",
      description: "File a complaint with your state's Department of Insurance.",
      pathType: "administrative",
      viability: "moderate",
      estimatedTimeline: "2-6 months",
      estimatedCost: "$0",
      riskLevel: "low",
      prerequisites: ["Document the denial or bad faith conduct"],
      relatedClaimTypes: ["insurance_bad_faith"],
      steps: [
        { title: "Gather insurance documents", description: "Collect your policy, denial letter, correspondence, and claim records.", actionType: "gather_evidence", estimatedDuration: "1 week", linkedToolHref: "/upload", docRequirements: [{ documentType: "Insurance policy", description: "Full policy document", required: true }, { documentType: "Denial letter", description: "Written denial or adverse decision", required: true }] },
        { title: "File DOI complaint", description: "Submit complaint to your state Department of Insurance.", actionType: "file_document", estimatedDuration: "1-2 days", linkedToolHref: "/filing-generator", docRequirements: [{ documentType: "DOI complaint form", description: "Completed insurance complaint form", required: true }] },
        { title: "Await DOI investigation", description: "Department reviews and may require insurer to respond.", actionType: "wait", estimatedDuration: "1-4 months", linkedToolHref: "/deadline-calculator", docRequirements: [] },
      ],
    },
  ],
  wage_theft: [
    {
      title: "Department of Labor Wage Complaint",
      description: "File a wage complaint with your state labor department or the federal DOL Wage and Hour Division.",
      pathType: "administrative",
      viability: "moderate",
      estimatedTimeline: "3-9 months",
      estimatedCost: "$0",
      riskLevel: "low",
      prerequisites: ["Document hours worked and wages owed"],
      relatedClaimTypes: ["wage_theft", "overtime_violation"],
      steps: [
        { title: "Document wages owed", description: "Calculate unpaid wages using pay stubs, timesheets, and employment records.", actionType: "gather_evidence", estimatedDuration: "1 week", linkedToolHref: "/upload", docRequirements: [{ documentType: "Pay stubs", description: "Recent pay stubs showing underpayment", required: true }, { documentType: "Time records", description: "Timesheets or personal records of hours worked", required: true }] },
        { title: "File wage complaint", description: "Submit complaint to state labor agency or federal WHD.", actionType: "file_document", estimatedDuration: "1-2 days", linkedToolHref: "/filing-generator", docRequirements: [{ documentType: "Wage complaint form", description: "Completed wage claim form", required: true }] },
        { title: "Await investigation", description: "Agency investigates and may order employer to pay back wages.", actionType: "wait", estimatedDuration: "2-6 months", linkedToolHref: "/deadline-calculator", docRequirements: [] },
      ],
    },
  ],
  debt_collection_abuse: [
    {
      title: "CFPB Complaint",
      description: "File a complaint with the Consumer Financial Protection Bureau about debt collection harassment.",
      pathType: "administrative",
      viability: "moderate",
      estimatedTimeline: "1-3 months",
      estimatedCost: "$0",
      riskLevel: "low",
      prerequisites: ["Document the harassing conduct"],
      relatedClaimTypes: ["debt_collection_abuse"],
      steps: [
        { title: "Document collector violations", description: "Record call logs, save voicemails, and keep all written communications.", actionType: "gather_evidence", estimatedDuration: "1 week", linkedToolHref: "/upload", docRequirements: [{ documentType: "Call logs", description: "Phone records showing frequency of calls", required: true }, { documentType: "Written communications", description: "Letters or notices from collector", required: true }] },
        { title: "File CFPB complaint", description: "Submit complaint online at consumerfinance.gov.", actionType: "file_document", estimatedDuration: "1 day", linkedToolHref: "/filing-generator", docRequirements: [{ documentType: "CFPB complaint", description: "Online complaint submission", required: true }] },
        { title: "Send cease and desist", description: "Send written notice to collector demanding they stop contact.", actionType: "submit_form", estimatedDuration: "1 day", linkedToolHref: "/lumensend", docRequirements: [{ documentType: "Cease and desist letter", description: "Written demand to stop contact", required: true }] },
      ],
    },
  ],
  landlord_tenant: [
    {
      title: "Tenant Rights Complaint",
      description: "File a complaint with your local housing authority or tenant protection agency.",
      pathType: "administrative",
      viability: "moderate",
      estimatedTimeline: "2-4 months",
      estimatedCost: "$0",
      riskLevel: "low",
      prerequisites: ["Document the lease violation or habitability issue"],
      relatedClaimTypes: ["landlord_tenant"],
      steps: [
        { title: "Document the issue", description: "Photograph conditions, save communications, and review your lease.", actionType: "gather_evidence", estimatedDuration: "1 week", linkedToolHref: "/upload", docRequirements: [{ documentType: "Lease agreement", description: "Current lease or rental agreement", required: true }, { documentType: "Photos/evidence", description: "Photos of conditions or violations", required: true }] },
        { title: "Send written notice to landlord", description: "Formally notify landlord of the issue and request remedy.", actionType: "submit_form", estimatedDuration: "1-2 days", linkedToolHref: "/lumensend", docRequirements: [{ documentType: "Notice letter", description: "Written notice to landlord", required: true }] },
        { title: "File agency complaint", description: "If landlord does not respond, file with local housing authority.", actionType: "file_document", estimatedDuration: "1-2 days", linkedToolHref: "/filing-generator", docRequirements: [{ documentType: "Housing complaint form", description: "Completed complaint form", required: true }] },
      ],
    },
  ],
  police_misconduct: [
    {
      title: "Internal Affairs / Civilian Complaint",
      description: "File a formal complaint with the police department's internal affairs division or civilian oversight board.",
      pathType: "administrative",
      viability: "moderate",
      estimatedTimeline: "3-12 months",
      estimatedCost: "$0",
      riskLevel: "medium",
      prerequisites: ["Document the incident", "Identify officers involved if possible"],
      relatedClaimTypes: ["police_misconduct", "section_1983"],
      steps: [
        { title: "Document the incident", description: "Write detailed account, gather witness information, photograph injuries.", actionType: "gather_evidence", estimatedDuration: "1-2 weeks", linkedToolHref: "/upload", docRequirements: [{ documentType: "Incident narrative", description: "Detailed written account of what happened", required: true }, { documentType: "Medical records", description: "Records of any injuries sustained", required: false }] },
        { title: "File FOIA for body camera footage", description: "Request body camera and dashcam footage through public records.", actionType: "file_document", estimatedDuration: "1-2 days", linkedToolHref: "/foia", docRequirements: [{ documentType: "FOIA request", description: "Public records request for footage", required: true }] },
        { title: "File formal complaint", description: "Submit complaint to internal affairs or civilian oversight board.", actionType: "file_document", estimatedDuration: "1-2 days", linkedToolHref: "/filing-generator", docRequirements: [{ documentType: "Complaint form", description: "Completed misconduct complaint form", required: true }] },
        { title: "Await investigation", description: "Internal affairs or oversight board investigates.", actionType: "wait", estimatedDuration: "3-9 months", linkedToolHref: "/deadline-calculator", docRequirements: [] },
      ],
    },
  ],
  disability_benefits: [
    {
      title: "SSA Appeal / Reconsideration",
      description: "Appeal the denial of disability benefits through the Social Security Administration's appeals process.",
      pathType: "administrative",
      viability: "moderate",
      estimatedTimeline: "6-24 months",
      estimatedCost: "$0",
      riskLevel: "low",
      prerequisites: ["Receive denial letter", "File within 60 days of denial"],
      relatedClaimTypes: ["disability_benefits"],
      steps: [
        { title: "Gather medical evidence", description: "Collect all medical records, doctor statements, and treatment history.", actionType: "gather_evidence", estimatedDuration: "2-4 weeks", linkedToolHref: "/upload", docRequirements: [{ documentType: "Medical records", description: "Complete treatment records", required: true }, { documentType: "Doctor statements", description: "Statements about functional limitations", required: true }] },
        { title: "File request for reconsideration", description: "Submit SSA-561 form within 60 days of denial.", actionType: "file_document", estimatedDuration: "1-2 days", linkedToolHref: "/filing-generator", docRequirements: [{ documentType: "SSA-561 form", description: "Request for reconsideration form", required: true }] },
        { title: "Await reconsideration decision", description: "SSA reviews with new examiner. If denied, request ALJ hearing.", actionType: "wait", estimatedDuration: "3-6 months", linkedToolHref: "/deadline-calculator", docRequirements: [] },
        { title: "Request ALJ hearing if needed", description: "If reconsideration denied, request hearing before Administrative Law Judge.", actionType: "file_document", estimatedDuration: "1 day", linkedToolHref: "/filing-generator", docRequirements: [{ documentType: "Hearing request", description: "HA-501 Request for Hearing form", required: true }] },
      ],
    },
  ],
  wrongful_conviction: [
    {
      title: "Post-Conviction Review / Innocence Claim",
      description: "Pursue post-conviction relief through available legal mechanisms.",
      pathType: "judicial",
      viability: "moderate",
      estimatedTimeline: "12-36+ months",
      estimatedCost: "Varies (legal aid may be available)",
      riskLevel: "medium",
      prerequisites: ["Identify new evidence or legal error", "Research state post-conviction procedures"],
      relatedClaimTypes: ["wrongful_conviction"],
      steps: [
        { title: "Organize case records", description: "Gather trial transcripts, police reports, and all case documents.", actionType: "gather_evidence", estimatedDuration: "2-4 weeks", linkedToolHref: "/upload", docRequirements: [{ documentType: "Trial transcripts", description: "Complete trial record", required: true }, { documentType: "Police reports", description: "All investigation reports", required: true }] },
        { title: "File FOIA for investigative records", description: "Request complete investigative file through public records.", actionType: "file_document", estimatedDuration: "1-2 days", linkedToolHref: "/foia", docRequirements: [{ documentType: "FOIA request", description: "Records request for full investigative file", required: true }] },
        { title: "Contact innocence organization", description: "Reach out to your state's innocence project or legal aid organization.", actionType: "contact_agency", estimatedDuration: "1-2 weeks", linkedToolHref: "/lumensend", docRequirements: [] },
        { title: "File post-conviction motion", description: "With legal assistance, file appropriate post-conviction motion.", actionType: "file_document", estimatedDuration: "1-3 months", linkedToolHref: "/filing-generator", docRequirements: [{ documentType: "Post-conviction motion", description: "Legal motion with supporting evidence", required: true }] },
      ],
    },
  ],
};

// ─── Generic Fallback Path ───

const GENERIC_CONSULT_PATH: RemedyPathGeneration = {
  title: "Consult with Legal Aid",
  description: "Connect with a legal aid organization or attorney for guidance on your specific situation.",
  pathType: "informal",
  viability: "moderate",
  estimatedTimeline: "1-4 weeks to get initial consultation",
  estimatedCost: "$0 (legal aid) or varies (private attorney)",
  riskLevel: "low",
  prerequisites: ["Organize your documents", "Write a summary of your situation"],
  relatedClaimTypes: [],
  steps: [
    { title: "Organize your documents", description: "Gather all relevant documents, communications, and records.", actionType: "gather_evidence", estimatedDuration: "1-2 weeks", linkedToolHref: "/upload", docRequirements: [{ documentType: "Case documents", description: "All relevant documents organized chronologically", required: true }] },
    { title: "Find legal aid resources", description: "Search for legal aid organizations in your area that handle your type of case.", actionType: "contact_agency", estimatedDuration: "1-3 days", linkedToolHref: "/lumensend", docRequirements: [] },
    { title: "Prepare case summary", description: "Write a clear, chronological summary of what happened for the attorney.", actionType: "review", estimatedDuration: "1-2 days", linkedToolHref: "/narrative", docRequirements: [{ documentType: "Case summary", description: "Written narrative of events", required: true }] },
    { title: "Schedule consultation", description: "Contact the legal aid organization and schedule an initial consultation.", actionType: "contact_agency", estimatedDuration: "1-2 weeks", linkedToolHref: "/lumensend", docRequirements: [] },
  ],
};

// ─── Gather Case Context ───

async function gatherCaseContext(caseId: number) {
  const [
    [caseRow],
    caseClaims,
    caseFindings,
    caseEvents,
    [docCount],
    caseChecklist,
    caseMissing,
    caseEvidence,
  ] = await Promise.all([
    db.select().from(cases).where(eq(cases.id, caseId)),
    db.select({
      id: claims.id,
      claimType: claims.claimType,
      // @ts-ignore pre-existing type mismatch
      description: claims.description,
      // @ts-ignore pre-existing type mismatch
      severity: claims.severity,
      // @ts-ignore pre-existing type mismatch
      confidence: claims.confidence,
    }).from(claims).where(eq(claims.caseId, caseId)).limit(20),
    db.select({
      id: findings.id,
      findingType: findings.findingType,
      // @ts-ignore pre-existing type mismatch
      summary: findings.summary,
      // @ts-ignore pre-existing type mismatch
      severity: findings.severity,
    }).from(findings).where(eq(findings.caseId, caseId)).limit(15),
    db.select({
      id: events.id,
      description: events.description,
      eventType: events.eventType,
      // @ts-ignore pre-existing type mismatch
      eventDate: events.eventDate,
    // @ts-ignore pre-existing type mismatch
    }).from(events).where(eq(events.caseId, caseId)).orderBy(events.eventDate).limit(20),
    db.select({ c: sql<number>`COUNT(*)` }).from(documents).where(eq(documents.caseId, caseId)),
    db.select().from(checklistItems).where(eq(checklistItems.caseId, caseId)),
    db.select().from(missingRecords).where(eq(missingRecords.caseId, caseId)),
    db.select({ c: sql<number>`COUNT(*)` }).from(evidenceItems).where(eq(evidenceItems.caseId, caseId)),
  ]);

  return {
    case: caseRow,
    claims: caseClaims,
    findings: caseFindings,
    events: caseEvents,
    documentCount: docCount.c,
    checklist: caseChecklist,
    missingRecords: caseMissing,
    // @ts-ignore pre-existing type mismatch
    evidenceCount: caseEvidence.c,
  };
}

// ─── Generate Remedy Paths (Deterministic) ───

export async function generateRemedyPaths(caseId: number, userId: number): Promise<number[]> {
  const ctx = await gatherCaseContext(caseId);
  if (!ctx.case) throw new Error("Case not found");

  // Collect unique claim types from the case
  const claimTypes = Array.from(new Set(
    ctx.claims.map(c => c.claimType).filter(Boolean) as string[]
  ));

  // Build remedy paths from lookup table based on claim types
  const pathsToCreate: RemedyPathGeneration[] = [];
  const usedTitles = new Set<string>();

  for (const claimType of claimTypes) {
    const paths = REMEDY_PATHS_BY_CLAIM_TYPE[claimType];
    if (paths) {
      for (const path of paths) {
        if (!usedTitles.has(path.title)) {
          pathsToCreate.push(path);
          usedTitles.add(path.title);
        }
      }
    }
  }

  // If no claim types matched, return generic path
  if (pathsToCreate.length === 0) {
    pathsToCreate.push(GENERIC_CONSULT_PATH);
  }

  // Limit to 4 paths maximum
  const finalPaths = pathsToCreate.slice(0, 4);

  const createdPathIds: number[] = [];
  const now = Date.now();

  for (const path of finalPaths) {
    // Insert remedy path
    const [inserted] = await db.insert(remedyPaths).values({
      caseId,
      userId,
      title: path.title,
      description: path.description,
      pathType: path.pathType,
      viability: path.viability,
      estimatedTimeline: path.estimatedTimeline,
      estimatedCost: path.estimatedCost,
      riskLevel: path.riskLevel,
      prerequisites: path.prerequisites,
      relatedClaimTypes: path.relatedClaimTypes,
      generatedBy: "template",
      createdAt: now,
      updatedAt: now,
    });
    const pathId = inserted.insertId;
    createdPathIds.push(pathId);

    // Insert steps
    for (let i = 0; i < path.steps.length; i++) {
      const step = path.steps[i];
      const [stepInserted] = await db.insert(remedySteps).values({
        pathId,
        stepOrder: i + 1,
        title: step.title,
        description: step.description,
        actionType: step.actionType,
        estimatedDuration: step.estimatedDuration,
        linkedToolHref: step.linkedToolHref,
        createdAt: now,
      });
      const stepId = stepInserted.insertId;

      // Insert doc requirements
      for (const req of step.docRequirements) {
        await db.insert(remedyDocRequirements).values({
          stepId,
          documentType: req.documentType,
          description: req.description,
          required: req.required ? 1 : 0,
          createdAt: now,
        });
      }
    }
  }

  return createdPathIds;
}

// ─── Get Remedy Paths for Case ───

export async function getRemedyPathsForCase(caseId: number) {
  const paths = await db.select()
    .from(remedyPaths)
    .where(eq(remedyPaths.caseId, caseId))
    .orderBy(desc(remedyPaths.createdAt));

  // For each path, get steps and their doc requirements
  const enriched = await Promise.all(paths.map(async (path) => {
    const steps = await db.select()
      .from(remedySteps)
      .where(eq(remedySteps.pathId, path.id))
      .orderBy(remedySteps.stepOrder);

    const stepsWithDocs = await Promise.all(steps.map(async (step) => {
      const docs = await db.select()
        .from(remedyDocRequirements)
        .where(eq(remedyDocRequirements.stepId, step.id));
      return { ...step, docRequirements: docs };
    }));

    // Calculate readiness
    const totalRequired = stepsWithDocs.reduce((sum, s) =>
      sum + s.docRequirements.filter(d => d.required).length, 0);
    const totalFulfilled = stepsWithDocs.reduce((sum, s) =>
      sum + s.docRequirements.filter(d => d.fulfilled).length, 0);
    const completedSteps = stepsWithDocs.filter(s => s.status === "completed").length;

    return {
      ...path,
      steps: stepsWithDocs,
      readiness: {
        docsFulfilled: totalFulfilled,
        docsRequired: totalRequired,
        docsPercent: totalRequired > 0 ? Math.round((totalFulfilled / totalRequired) * 100) : 100,
        stepsCompleted: completedSteps,
        stepsTotal: stepsWithDocs.length,
        stepsPercent: stepsWithDocs.length > 0 ? Math.round((completedSteps / stepsWithDocs.length) * 100) : 0,
      },
    };
  }));

  return enriched;
}

// ─── Update Step Status ───

export async function updateStepStatus(stepId: number, status: "pending" | "in_progress" | "completed" | "skipped" | "blocked") {
  const completedAt = status === "completed" ? Date.now() : null;
  await db.update(remedySteps)
    .set({ status, completedAt })
    .where(eq(remedySteps.id, stepId));
  return { success: true };
}

// ─── Fulfill Doc Requirement ───

export async function fulfillDocRequirement(reqId: number, docId: number | null) {
  await db.update(remedyDocRequirements)
    .set({
      fulfilled: docId ? 1 : 0,
      fulfilledByDocId: docId,
    })
    .where(eq(remedyDocRequirements.id, reqId));
  return { success: true };
}

// ─── Update Remedy Path Status ───

export async function updateRemedyPathStatus(pathId: number, status: "draft" | "active" | "completed" | "abandoned") {
  await db.update(remedyPaths)
    .set({ status, updatedAt: Date.now() })
    .where(eq(remedyPaths.id, pathId));
  return { success: true };
}
