/**
 * LumenSend — Letter Generation Engine
 *
 * Uses LLM to generate contextual letters, complaints, appeals, and applications
 * from Luminari's registry data. Pre-fills recipient info from programs and oversight bodies.
 *
 * Principle: Help the person navigate the system as it was designed to work.
 * Surface eligibility boundaries and disqualifiers before sending.
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { invokeLLM } from "./_core/llm";

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

// ─── Pre-Flight: Eligibility & Disqualifier Check ───

export interface PreFlightWarning {
  type: "eligibility_boundary" | "benefit_cliff" | "disqualifier" | "cross_program" | "deadline" | "documentation";
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  source?: string;
}

export async function generatePreFlight(opts: {
  stateCode: string;
  documentType: string;
  contextType: string;
  programId?: string;
  oversightBody?: string;
  userSituation?: string;
}): Promise<PreFlightWarning[]> {
  const { stateCode, documentType, contextType, programId, oversightBody, userSituation } = opts;

  // Gather context
  let contextData = "";
  if (programId) {
    const prog = findProgram(stateCode, programId);
    if (prog) {
      contextData += `\nTarget Program: ${prog.program_name}\nAgency: ${prog.agency}\nEligibility: ${prog.eligibility}\nApply Notes: ${prog.apply_notes}\n`;
    }
  }
  if (oversightBody) {
    const body = findOversightBody(stateCode, oversightBody);
    if (body) {
      contextData += `\nOversight Body: ${body.oversight_body}\nWhat to Report: ${body.what_to_report}\nLegal Threshold: ${body.legal_threshold}\nResponse Timeline: ${body.response_timeline}\n`;
    }
  }

  // Load related programs for cross-program warnings
  const allPrograms = loadPrograms(stateCode);
  const programSummary = allPrograms.slice(0, 20).map(p =>
    `${p.program_name}: ${p.eligibility}`
  ).join("\n");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a pre-flight eligibility checker for a civic assistance tool called Luminari LumenSend. Your job is to surface eligibility boundaries, benefit cliffs, disqualifiers, and cross-program interactions that the user should know BEFORE they submit an application, appeal, or complaint.

You must be factual and structural. Do not give legal advice. Do not judge. Surface documented rules and thresholds only.

Return a JSON array of warnings. Each warning has:
- type: "eligibility_boundary" | "benefit_cliff" | "disqualifier" | "cross_program" | "deadline" | "documentation"
- severity: "info" | "warning" | "critical"
- title: short title (max 80 chars)
- description: clear explanation of the boundary/cliff/disqualifier (max 300 chars)

Return between 2-6 warnings. Focus on the most important structural traps.`
      },
      {
        role: "user",
        content: `State: ${stateCode}
Document Type: ${documentType}
Context: ${contextType}
${contextData}
${userSituation ? `User Situation: ${userSituation}` : ""}

Available programs in this state:
${programSummary}

Generate pre-flight warnings for this action.`
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "preflight_warnings",
        strict: true,
        schema: {
          type: "object",
          properties: {
            warnings: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["eligibility_boundary", "benefit_cliff", "disqualifier", "cross_program", "deadline", "documentation"] },
                  severity: { type: "string", enum: ["info", "warning", "critical"] },
                  title: { type: "string" },
                  description: { type: "string" },
                },
                required: ["type", "severity", "title", "description"],
                additionalProperties: false,
              }
            }
          },
          required: ["warnings"],
          additionalProperties: false,
        }
      }
    }
  });

  try {
    const content = response.choices[0].message.content;
    const parsed = JSON.parse(typeof content === "string" ? content : "{}");
    return parsed.warnings ?? [];
  } catch {
    return [];
  }
}

// ─── Letter Generation ───

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
  let recipientInfo = "";
  let recipientAgency = "";
  let recipientAddress = "";
  let recipientEmail = "";
  let recipientPhone = "";
  let recipientName = "";

  if (programId) {
    const prog = findProgram(stateCode, programId);
    if (prog) {
      recipientAgency = prog.agency;
      recipientPhone = prog.phone || "";
      recipientInfo = `Agency: ${prog.agency}\nProgram: ${prog.program_name}\nPhone: ${prog.phone}\nWebsite: ${prog.website}\nEligibility: ${prog.eligibility}\nHow to Apply: ${prog.apply_notes}`;
    }
  }

  if (oversightBody) {
    const body = findOversightBody(stateCode, oversightBody);
    if (body) {
      recipientAgency = body.oversight_body;
      recipientAddress = [body.street_address, body.city, body.state_code, body.zip].filter(Boolean).join(", ");
      recipientPhone = body.phone || "";
      recipientInfo = `Body: ${body.oversight_body}\nAddress: ${recipientAddress}\nPhone: ${body.phone}\nComplaint Portal: ${body.complaint_portal}\nWhat to Report: ${body.what_to_report}\nLegal Threshold: ${body.legal_threshold}\nResponse Timeline: ${body.response_timeline}`;
    }
  }

  // Load related oversight bodies for dispatch bundle suggestions
  const allBodies = loadOversightBodies(stateCode);
  const bodySummary = allBodies.slice(0, 10).map(b =>
    `${b.oversight_body} (${b.jurisdiction}): ${b.what_to_report}`
  ).join("\n");

  const docTypeLabels: Record<string, string> = {
    appeal: "Appeal Letter",
    complaint: "Formal Complaint",
    inquiry: "Inquiry Letter",
    application: "Application Cover Letter",
    follow_up: "Follow-Up Letter",
    demand: "Demand Letter",
    notice: "Notice Letter",
  };

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a document generation engine for Luminari LumenSend. You generate formal ${docTypeLabels[documentType] || "letters"} that help people navigate government systems, file complaints, appeal denials, and apply for programs.

Rules:
- Write in a formal, professional tone
- Include specific statutory references, agency names, and contact info from the provided context
- Include protective language: request written confirmation of receipt, request information about how this action may affect other benefits
- Do not give legal advice — frame everything as the person exercising their documented rights
- Include a clear subject line
- Date the letter with today's date
- Include sender and recipient addresses in the body
- End with a clear call to action and response deadline request

Also identify 0-3 related actions the person should consider (other agencies to contact, related programs to apply for, escalation paths). These form the "dispatch bundle."

Return JSON with: subject, body, recipientAgency, recipientName (use "To Whom It May Concern" if unknown), recipientAddress, recipientEmail, recipientPhone, documentType, and relatedActions array.`
      },
      {
        role: "user",
        content: `State: ${stateCode}
Document Type: ${documentType}
Context: ${contextType}

Sender: ${senderName}
${senderAddress ? `Address: ${senderAddress}` : ""}
${senderEmail ? `Email: ${senderEmail}` : ""}
${senderPhone ? `Phone: ${senderPhone}` : ""}

Recipient Info:
${recipientInfo || "Not specified — use general inquiry format"}

Situation:
${situation}

${additionalContext ? `Additional Context:\n${additionalContext}` : ""}

Other oversight bodies in this state:
${bodySummary}

Generate the ${docTypeLabels[documentType] || "letter"}.`
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "generated_letter",
        strict: true,
        schema: {
          type: "object",
          properties: {
            subject: { type: "string" },
            body: { type: "string" },
            recipientAgency: { type: "string" },
            recipientName: { type: "string" },
            recipientAddress: { type: "string" },
            recipientEmail: { type: "string" },
            recipientPhone: { type: "string" },
            documentType: { type: "string" },
            relatedActions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  documentType: { type: "string" },
                  recipientAgency: { type: "string" },
                  description: { type: "string" },
                },
                required: ["documentType", "recipientAgency", "description"],
                additionalProperties: false,
              }
            }
          },
          required: ["subject", "body", "recipientAgency", "recipientName", "recipientAddress", "recipientEmail", "recipientPhone", "documentType", "relatedActions"],
          additionalProperties: false,
        }
      }
    }
  });

  try {
    const content = response.choices[0].message.content;
    const parsed = JSON.parse(typeof content === "string" ? content : "{}");
    // Override with known data if we have it
    return {
      ...parsed,
      recipientAgency: recipientAgency || parsed.recipientAgency,
      recipientAddress: recipientAddress || parsed.recipientAddress,
      recipientEmail: recipientEmail || parsed.recipientEmail,
      recipientPhone: recipientPhone || parsed.recipientPhone,
    };
  } catch {
    return {
      subject: `${docTypeLabels[documentType] || "Letter"} — ${situation.slice(0, 60)}`,
      body: `Dear Sir or Madam,\n\nI am writing regarding: ${situation}\n\nPlease respond at your earliest convenience.\n\nSincerely,\n${senderName}`,
      recipientAgency,
      recipientName: "To Whom It May Concern",
      recipientAddress,
      recipientEmail,
      recipientPhone,
      documentType,
      relatedActions: [],
    };
  }
}
