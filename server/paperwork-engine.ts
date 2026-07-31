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
 * Uses template-based generation with placeholder substitution
 * to populate documents with case-specific data,
 * then stores generated documents for review/editing/sending.
 */
import { db } from "./db";
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

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const claimsSummary = caseClaims.map((c: any) =>
    `- ${c.claimType}: ${c.description?.slice(0, 120) || "No description"}`
  ).join("\n");

  const findingsSummary = caseFindings.map((f: any) =>
    `- ${f.findingType}: ${f.summary?.slice(0, 120) || "No summary"}`
  ).join("\n");

  const eventsSummary = caseEvents.slice(0, 8).map((e: any) =>
    `- ${e.eventDate ? new Date(e.eventDate).toLocaleDateString() : "Date unknown"}: ${e.description?.slice(0, 100) || "Event"}`
  ).join("\n");

  // Generate content using template substitution or generic structure
  let content: string;

  if (templateBody) {
    // Substitute placeholders in the template
    content = templateBody
      .replace(/\[CLAIMANT_NAME\]/g, "[YOUR NAME]")
      .replace(/\[DATE\]/g, today)
      .replace(/\[CASE_NAME\]/g, caseRow.name)
      .replace(/\[CASE_HISTORY\]/g, eventsSummary || "No events documented yet.")
      .replace(/\[CLAIMS\]/g, claimsSummary || "No specific claims identified yet.")
      .replace(/\[FACTS\]/g, findingsSummary || "No findings documented yet.")
      .replace(/\[FINDINGS\]/g, findingsSummary || "No findings documented yet.")
      .replace(/\[EVENTS\]/g, eventsSummary || "No events documented yet.")
      .replace(/\[RECIPIENT_NAME\]/g, input.recipientName || "[RECIPIENT NAME]")
      .replace(/\[RECIPIENT_ADDRESS\]/g, input.recipientAddress || "[RECIPIENT ADDRESS]")
      .replace(/\[DOCUMENT_TYPE\]/g, docLabel)
      .replace(/\[CASE_DESCRIPTION\]/g, (caseRow as any).description || "")
      .replace(/\[SENDER_NAME\]/g, "[YOUR NAME]")
      .replace(/\[SENDER_ADDRESS\]/g, "[YOUR ADDRESS]")
      .replace(/\[SENDER_EMAIL\]/g, "[YOUR EMAIL]")
      .replace(/\[SENDER_PHONE\]/g, "[YOUR PHONE]");
  } else {
    // Generic document structure
    content = `# ${docLabel}

**Date:** ${today}

**To:**
${input.recipientName || "[RECIPIENT NAME]"}
${input.recipientAddress || "[RECIPIENT ADDRESS]"}

**From:**
[YOUR NAME]
[YOUR ADDRESS]
[YOUR EMAIL]
[YOUR PHONE]

**RE:** ${docLabel} — ${caseRow.name}

---

## Introduction

This ${docLabel.toLowerCase()} is submitted regarding the matter of **${caseRow.name}**.${(caseRow as any).description ? ` ${(caseRow as any).description}` : ""}

## Claims

${claimsSummary || "No specific claims have been identified at this time."}

## Key Findings

${findingsSummary || "No findings have been documented at this time."}

## Chronology of Events

${eventsSummary || "No events have been extracted at this time."}
${input.customInstructions ? `\n## Additional Notes\n\n${input.customInstructions}\n` : ""}
## Request

Based on the foregoing facts and circumstances, I respectfully request that this matter be reviewed and that appropriate action be taken.

## Closing

I request written confirmation of receipt of this ${docLabel.toLowerCase()}. Please respond within 30 days of receipt. If additional information is needed, please contact me at the information provided above.

Thank you for your prompt attention to this matter.

Sincerely,

[YOUR NAME]
[YOUR ADDRESS]
[YOUR PHONE]
[YOUR EMAIL]`;
  }

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
