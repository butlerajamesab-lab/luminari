/**
 * Paperwork Generation Engine
 * 
 * Generates formal documents from case data:
 * - Appeal letters
 * - Complaint filings
 * - FOIA requests
 * - Record requests
 * - Grievances
 * - Cease & desist letters
 * 
 * Uses LLM to populate templates with case-specific data,
 * then stores generated documents for review/editing/sending.
 */
import { db } from "./db";
import { invokeLLM } from "./_core/llm";
import {
  paperworkTemplates, generatedDocuments,
  cases, claims, findings, events, documents,
} from "../drizzle/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";

// ─── Template Types ───

export const TEMPLATE_TYPES = [
  "appeal_letter",
  "complaint_filing",
  "foia_request",
  "record_request",
  "grievance",
  "cease_desist",
  "demand_letter",
  "formal_response",
] as const;

export type TemplateType = typeof TEMPLATE_TYPES[number];

// ─── Get Templates ───

export async function getTemplates(type?: string) {
  if (type) {
    return db.select().from(paperworkTemplates)
      .where(eq(paperworkTemplates.templateType, type));
  }
  return db.select().from(paperworkTemplates);
}

// ─── Generate Document from Template ───

interface GenerateDocInput {
  caseId: number;
  userId: number;
  templateId?: number;
  documentType: string;
  recipientName?: string;
  recipientAddress?: string;
  customInstructions?: string;
  remedyStepId?: number;
}

export async function generateDocument(input: GenerateDocInput): Promise<number> {
  // Gather case context
  const [[caseRow], caseClaims, caseFindings, caseEvents] = await Promise.all([
    db.select().from(cases).where(eq(cases.id, input.caseId as any)),
    db.select({
      claimType: claims.claimType,
      // @ts-ignore pre-existing type mismatch
      description: claims.description,
      // @ts-ignore pre-existing type mismatch
      severity: claims.severity,
    }).from(claims).where(eq(claims.caseId, input.caseId as any)).limit(10),
    db.select({
      findingType: findings.findingType,
      // @ts-ignore pre-existing type mismatch
      summary: findings.summary,
    }).from(findings).where(eq(findings.caseId, input.caseId as any)).limit(10),
    db.select({
      description: events.description,
      // @ts-ignore pre-existing type mismatch
      eventDate: events.eventDate,
    // @ts-ignore pre-existing type mismatch
    }).from(events).where(eq(events.caseId, input.caseId)).orderBy(events.eventDate).limit(15),
  ]);

  if (!caseRow) throw new Error("Case not found");

  // Get template if specified
  let templateBody = "";
  let templateTitle = "";
  if (input.templateId) {
    const [tmpl] = await db.select().from(paperworkTemplates)
      .where(eq(paperworkTemplates.id, input.templateId));
    if (tmpl) {
      templateBody = tmpl.templateBody;
      templateTitle = tmpl.title;
    }
  }

  const docTypeLabels: Record<string, string> = {
    appeal_letter: "Appeal Letter",
    complaint_filing: "Formal Complaint",
    foia_request: "FOIA Request",
    record_request: "Record Request",
    grievance: "Formal Grievance",
    cease_desist: "Cease and Desist Letter",
    demand_letter: "Demand Letter",
    formal_response: "Formal Response",
  };

  const docLabel = docTypeLabels[input.documentType] || input.documentType;

  const claimsSummary = caseClaims.map((c: any) =>
    `- ${c.claimType}: ${c.description?.slice(0, 120) || "No description"}`
  ).join("\n");

  const findingsSummary = caseFindings.map((f: any) =>
    `- ${f.findingType}: ${f.summary?.slice(0, 120) || "No summary"}`
  ).join("\n");

  const eventsSummary = caseEvents.slice(0, 8).map((e: any) =>
    `- ${e.eventDate ? new Date(e.eventDate).toLocaleDateString() : "Date unknown"}: ${e.description?.slice(0, 100) || "Event"}`
  ).join("\n");

  const prompt = `Generate a professional ${docLabel} based on the following case information. The document should be formal, clear, and suitable for submission to a government agency, court, or organization.

CASE: ${caseRow.name}
${input.recipientName ? `RECIPIENT: ${input.recipientName}` : ""}
${input.recipientAddress ? `ADDRESS: ${input.recipientAddress}` : ""}

CLAIMS:
${claimsSummary || "No specific claims identified yet"}

KEY FINDINGS:
${findingsSummary || "No findings yet"}

KEY EVENTS (CHRONOLOGICAL):
${eventsSummary || "No events extracted yet"}

${templateBody ? `TEMPLATE TO FOLLOW:\n${templateBody}\n` : ""}
${input.customInstructions ? `ADDITIONAL INSTRUCTIONS:\n${input.customInstructions}\n` : ""}

Generate the complete document in Markdown format. Include:
1. Proper header with date, recipient, and sender placeholders
2. Clear subject line
3. Professional opening
4. Factual body referencing specific claims and events
5. Clear request or demand
6. Professional closing
7. Signature block with [YOUR NAME], [YOUR ADDRESS], [YOUR PHONE], [YOUR EMAIL] placeholders

Use formal but accessible language. The person filing this may not be a lawyer.`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: "You are a legal document drafting assistant. Generate professional, formal documents suitable for official submission. Use Markdown formatting. Be specific and reference the case facts provided." },
      { role: "user", content: prompt },
    ],
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) throw new Error("No response from LLM");

  const title = templateTitle || `${docLabel} — ${caseRow.name}`;
  const now = Date.now();

  // @ts-ignore pre-existing type mismatch
  const [inserted] = await db.insert(generatedDocuments).values({
    caseId: input.caseId,
    userId: input.userId,
    templateId: input.templateId || null,
    remedyStepId: input.remedyStepId || null,
    documentType: input.documentType,
    title,
    content,
    recipientName: input.recipientName || null,
    recipientAddress: input.recipientAddress || null,
    createdAt: now,
    updatedAt: now,
  });

  return inserted.insertId;
}

// ─── Get Generated Documents for Case ───

export async function getGeneratedDocuments(caseId: number) {
  return db.select()
    .from(generatedDocuments)
    .where(eq(generatedDocuments.caseId, caseId))
    .orderBy(desc(generatedDocuments.createdAt));
}

// ─── Get Single Generated Document ───

export async function getGeneratedDocument(docId: number) {
  const [doc] = await db.select()
    .from(generatedDocuments)
    .where(eq(generatedDocuments.id, docId));
  return doc || null;
}

// ─── Update Generated Document Content ───

export async function updateGeneratedDocContent(docId: number, content: string) {
  await db.update(generatedDocuments)
    .set({ content, updatedAt: Date.now() })
    .where(eq(generatedDocuments.id, docId));
  return { success: true };
}

// ─── Update Generated Document Status ───

export async function updateGeneratedDocStatus(
  docId: number,
  status: "draft" | "review" | "finalized" | "sent" | "archived"
) {
  const updates: Record<string, unknown> = { status, updatedAt: Date.now() };
  if (status === "sent") updates.sentAt = Date.now();
  await db.update(generatedDocuments)
    .set(updates)
    .where(eq(generatedDocuments.id, docId));
  return { success: true };
}
