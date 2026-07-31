/**
 * LumenSend — Letter Generation Engine
 *
 * Uses deterministic template-based generation to produce contextual letters,
 * complaints, appeals, and applications from Luminari's registry data.
 * Pre-fills recipient info from programs and oversight bodies.
 *
 * Principle: Help the person navigate the system as it was designed to work.
 * Surface eligibility boundaries and disqualifiers before sending.
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const statesDir = join(__dirname, "config", "states");

// ─── Registry Data Loaders ───

interface ProgramInfo {
  program_id: string;
  program_name: string;
  agency: string;
  phone: string;
  website: string;
  eligibility: string;
  apply_notes: string;
  source: string;
  region: string;
  category: string;
  city: string;
  state: string;
}

interface OversightBody {
  oversight_body: string;
  jurisdiction: string;
  phone: string;
  complaint_portal: string;
  what_to_report: string;
  legal_threshold: string;
  response_timeline: string;
  escalation_next: string;
  street_address: string;
  city: string;
  state_code: string;
  zip: string;
}

export function loadPrograms(stateCode: string): ProgramInfo[] {
  const sc = stateCode.toLowerCase();
  const path = join(statesDir, `${sc}_programs.json`);
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return data.programs ?? [];
  } catch { return []; }
}

export function loadOversightBodies(stateCode: string): OversightBody[] {
  const sc = stateCode.toLowerCase();
  const path = join(statesDir, `${sc}_oversight.json`);
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    const bodies: OversightBody[] = [];
    for (const chain of (data.oversight_chains ?? [])) {
      for (const b of (chain.bodies ?? [])) {
        bodies.push(b);
      }
    }
    return bodies;
  } catch { return []; }
}

export function findProgram(stateCode: string, programId: string): ProgramInfo | null {
  const programs = loadPrograms(stateCode);
  return programs.find(p => p.program_id === programId) ?? null;
}

export function findOversightBody(stateCode: string, bodyName: string): OversightBody | null {
  const bodies = loadOversightBodies(stateCode);
  return bodies.find(b => b.oversight_body === bodyName) ?? null;
}

// ─── Pre-Flight: Static Eligibility & Disqualifier Warnings ───

export interface PreFlightWarning {
  type: "eligibility_boundary" | "benefit_cliff" | "disqualifier" | "cross_program" | "deadline" | "documentation";
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  source?: string;
}

/**
 * Static pre-flight warnings by document type.
 * These are structural warnings that apply regardless of specific program details.
 */
const STATIC_WARNINGS: Record<string, PreFlightWarning[]> = {
  appeal: [
    {
      type: "deadline",
      severity: "critical",
      title: "Appeal Deadline",
      description: "Most appeals have strict filing deadlines (often 30-90 days from the denial date). Verify your deadline before submitting — late appeals are typically dismissed regardless of merit.",
    },
    {
      type: "documentation",
      severity: "warning",
      title: "Documentation Requirements",
      description: "Appeals require supporting documentation. Gather all denial letters, prior correspondence, and evidence of eligibility before filing. Missing documents may result in summary denial.",
    },
    {
      type: "cross_program",
      severity: "info",
      title: "Continued Benefits During Appeal",
      description: "In some programs, filing a timely appeal preserves your current benefits until a decision is made. Check whether your program offers benefit continuation during the appeal period.",
    },
  ],
  complaint: [
    {
      type: "documentation",
      severity: "warning",
      title: "Retaliation Protection",
      description: "Filing a complaint may trigger retaliation. Document your current situation thoroughly before filing. Keep copies of all communications and note any changes in treatment after submission.",
    },
    {
      type: "documentation",
      severity: "warning",
      title: "Evidence Preservation",
      description: "Preserve all evidence before filing. Once a complaint is filed, the subject may destroy or alter records. Photograph documents, save digital copies, and note witness names.",
    },
    {
      type: "deadline",
      severity: "info",
      title: "Statute of Limitations",
      description: "Complaints often have filing deadlines. Federal civil rights complaints typically must be filed within 180-300 days of the discriminatory act. State deadlines vary.",
    },
  ],
  inquiry: [
    {
      type: "documentation",
      severity: "info",
      title: "Written Record Recommended",
      description: "Submit inquiries in writing to create a paper trail. Written inquiries establish a record of your request and the agency's response timeline.",
    },
    {
      type: "deadline",
      severity: "info",
      title: "Response Timeline",
      description: "Agencies typically have 10-30 business days to respond to written inquiries. Note the date you submit and follow up if no response is received within the stated timeline.",
    },
  ],
  application: [
    {
      type: "eligibility_boundary",
      severity: "warning",
      title: "Income Verification",
      description: "Most assistance programs have income thresholds. Gather recent pay stubs, tax returns, or benefit statements. Reporting income incorrectly (even accidentally) can result in disqualification or fraud charges.",
    },
    {
      type: "benefit_cliff",
      severity: "warning",
      title: "Benefit Cliff Warning",
      description: "Receiving one benefit may affect eligibility for others. Some programs count other benefits as income. Review how this application may interact with your current benefits before submitting.",
    },
    {
      type: "documentation",
      severity: "info",
      title: "Required Documents",
      description: "Applications typically require ID, proof of residence, income verification, and household composition documentation. Incomplete applications are often denied without review.",
    },
  ],
  follow_up: [
    {
      type: "documentation",
      severity: "info",
      title: "Reference Prior Communication",
      description: "Include reference numbers, dates, and names from prior communications. This helps the recipient locate your file and demonstrates a documented history of engagement.",
    },
    {
      type: "deadline",
      severity: "info",
      title: "Escalation Path",
      description: "If this is a second or third follow-up without response, consider escalating to a supervisor or filing a formal complaint about non-responsiveness.",
    },
  ],
  demand: [
    {
      type: "deadline",
      severity: "critical",
      title: "Legal Deadline Implications",
      description: "Demand letters often precede legal action. Ensure your stated deadline is reasonable (typically 10-30 days) and that you are prepared to follow through if the demand is not met.",
    },
    {
      type: "documentation",
      severity: "warning",
      title: "Factual Basis Required",
      description: "Demand letters must be grounded in documented facts and legal rights. Making unsupported claims can undermine your position or expose you to counterclaims.",
    },
  ],
  notice: [
    {
      type: "documentation",
      severity: "info",
      title: "Proof of Delivery",
      description: "Send notices via certified mail or other trackable delivery method. Proof of delivery establishes that the recipient was notified, which may be legally significant.",
    },
    {
      type: "deadline",
      severity: "info",
      title: "Notice Period",
      description: "Many legal actions require advance notice (often 30-60 days). Verify the required notice period for your situation before sending.",
    },
  ],
};

export async function generatePreFlight(opts: {
  stateCode: string;
  documentType: string;
  contextType: string;
  programId?: string;
  oversightBody?: string;
  userSituation?: string;
}): Promise<PreFlightWarning[]> {
  const { stateCode, documentType, programId, oversightBody } = opts;

  // Start with static warnings for this document type
  const warnings: PreFlightWarning[] = [
    ...(STATIC_WARNINGS[documentType] || STATIC_WARNINGS["inquiry"] || []),
  ];

  // Add program-specific eligibility warning if we have program data
  if (programId) {
    const prog = findProgram(stateCode, programId);
    if (prog && prog.eligibility) {
      warnings.push({
        type: "eligibility_boundary",
        severity: "warning",
        title: `${prog.program_name} Eligibility Requirements`,
        description: `This program requires: ${prog.eligibility.slice(0, 250)}`,
        source: prog.source,
      });
    }
  }

  // Add oversight body threshold warning if applicable
  if (oversightBody) {
    const body = findOversightBody(stateCode, oversightBody);
    if (body && body.legal_threshold) {
      warnings.push({
        type: "eligibility_boundary",
        severity: "warning",
        title: `${body.oversight_body} Filing Threshold`,
        description: `This body requires: ${body.legal_threshold.slice(0, 250)}`,
      });
    }
    if (body && body.response_timeline) {
      warnings.push({
        type: "deadline",
        severity: "info",
        title: `Expected Response Timeline`,
        description: `${body.oversight_body} response timeline: ${body.response_timeline.slice(0, 200)}`,
      });
    }
  }

  return warnings;
}

// ─── Letter Generation (Template-Based) ───

export interface GeneratedLetter {
  subject: string;
  body: string;
  recipientAgency: string;
  recipientName: string;
  recipientAddress: string;
  recipientEmail: string;
  recipientPhone: string;
  documentType: string;
  relatedActions?: Array<{
    documentType: string;
    recipientAgency: string;
    description: string;
  }>;
}

const docTypeLabels: Record<string, string> = {
  appeal: "Appeal Letter",
  complaint: "Formal Complaint",
  inquiry: "Inquiry Letter",
  application: "Application Cover Letter",
  follow_up: "Follow-Up Letter",
  demand: "Demand Letter",
  notice: "Notice Letter",
};

export async function generateLetter(opts: {
  stateCode: string;
  documentType: string;
  contextType: string;
  programId?: string;
  oversightBody?: string;
  senderName: string;
  senderAddress?: string;
  senderEmail?: string;
  senderPhone?: string;
  situation: string;
  additionalContext?: string;
}): Promise<GeneratedLetter> {
  const {
    stateCode, documentType, contextType,
    programId, oversightBody,
    senderName, senderAddress, senderEmail, senderPhone,
    situation, additionalContext
  } = opts;

  // Gather recipient info
  let recipientAgency = "";
  let recipientAddress = "";
  let recipientEmail = "";
  let recipientPhone = "";
  let recipientName = "To Whom It May Concern";
  let recipientContext = "";

  if (programId) {
    const prog = findProgram(stateCode, programId);
    if (prog) {
      recipientAgency = prog.agency;
      recipientPhone = prog.phone || "";
      recipientContext = `Program: ${prog.program_name}\nEligibility: ${prog.eligibility}\nHow to Apply: ${prog.apply_notes}`;
    }
  }

  if (oversightBody) {
    const body = findOversightBody(stateCode, oversightBody);
    if (body) {
      recipientAgency = body.oversight_body;
      recipientAddress = [body.street_address, body.city, body.state_code, body.zip].filter(Boolean).join(", ");
      recipientPhone = body.phone || "";
      recipientEmail = body.complaint_portal || "";
      recipientContext = `What to Report: ${body.what_to_report}\nLegal Threshold: ${body.legal_threshold}`;
    }
  }

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const docLabel = docTypeLabels[documentType] || "Letter";
  const subject = `${docLabel} — ${situation.slice(0, 80)}`;

  // Build the letter body from template
  const senderBlock = [
    senderName,
    senderAddress || "[YOUR ADDRESS]",
    senderEmail || "[YOUR EMAIL]",
    senderPhone || "[YOUR PHONE]",
  ].join("\n");

  const recipientBlock = [
    recipientName,
    recipientAgency || "[AGENCY NAME]",
    recipientAddress || "[AGENCY ADDRESS]",
  ].filter(Boolean).join("\n");

  // Document type-specific opening and closing
  const openings: Record<string, string> = {
    appeal: "I am writing to formally appeal the decision described below. I believe this decision was made in error and respectfully request that it be reconsidered based on the following information.",
    complaint: "I am writing to file a formal complaint regarding the matter described below. I request that this complaint be investigated and that appropriate corrective action be taken.",
    inquiry: "I am writing to request information regarding the matter described below. I would appreciate a written response at your earliest convenience.",
    application: "I am writing to submit my application for the program described below. I believe I meet the eligibility requirements and have enclosed the relevant supporting documentation.",
    follow_up: "I am writing to follow up on my previous communication regarding the matter described below. I have not yet received a response and would appreciate an update on the status of my request.",
    demand: "I am writing to formally demand action regarding the matter described below. If this matter is not resolved within a reasonable timeframe, I will be forced to pursue additional remedies available to me under law.",
    notice: "This letter serves as formal notice regarding the matter described below. Please take appropriate action within the timeframe specified.",
  };

  const closings: Record<string, string> = {
    appeal: "I respectfully request that this appeal be reviewed promptly and that I receive written notification of the decision. Please confirm receipt of this appeal in writing.",
    complaint: "I request written confirmation of receipt of this complaint and notification of any investigation or action taken. Please provide a timeline for resolution.",
    inquiry: "I would appreciate a written response within 30 days. If additional information is needed to process this request, please contact me at the information provided above.",
    application: "Please confirm receipt of this application and notify me of any additional documentation required. I am available to provide further information as needed.",
    follow_up: "I request a written response within 10 business days. If my original request has been processed, please provide the current status. If additional information is needed, please contact me.",
    demand: "I expect a written response within 14 days of receipt of this letter. Failure to respond or take corrective action will result in my pursuing all available legal remedies.",
    notice: "Please acknowledge receipt of this notice in writing. Retain this letter for your records.",
  };

  const opening = openings[documentType] || openings["inquiry"];
  const closing = closings[documentType] || closings["inquiry"];

  const body = `${today}

${senderBlock}

${recipientBlock}

RE: ${subject}

Dear ${recipientName}:

${opening}

SITUATION:
${situation}
${additionalContext ? `\nADDITIONAL CONTEXT:\n${additionalContext}` : ""}
${recipientContext ? `\nRELEVANT PROGRAM/AGENCY INFORMATION:\n${recipientContext}` : ""}

${closing}

I request written confirmation of receipt of this ${docLabel.toLowerCase()}.

Sincerely,

${senderName}
${senderAddress || "[YOUR ADDRESS]"}
${senderEmail || "[YOUR EMAIL]"}
${senderPhone || "[YOUR PHONE]"}`;

  // Build related actions from other oversight bodies in the state
  const relatedActions: Array<{ documentType: string; recipientAgency: string; description: string }> = [];
  const allBodies = loadOversightBodies(stateCode);
  const otherBodies = allBodies.filter(b => b.oversight_body !== recipientAgency).slice(0, 3);
  for (const ob of otherBodies) {
    if (ob.what_to_report && situation.toLowerCase().split(/\s+/).some(word =>
      word.length > 4 && ob.what_to_report.toLowerCase().includes(word)
    )) {
      relatedActions.push({
        documentType: "complaint",
        recipientAgency: ob.oversight_body,
        description: `Consider also filing with ${ob.oversight_body} (${ob.jurisdiction}): ${ob.what_to_report.slice(0, 100)}`,
      });
    }
  }

  return {
    subject,
    body,
    recipientAgency,
    recipientName,
    recipientAddress,
    recipientEmail,
    recipientPhone,
    documentType,
    relatedActions,
  };
}
