/**
 * Document Export Service
 * Generates PDF and TXT exports from remedy documents,
 * stores them in S3, and returns download URLs.
 */
import { db } from "./db";
import { sql } from "drizzle-orm";
import { storagePut } from "./storage";
import PDFDocument from "pdfkit";

interface ExportResult {
  docId: string;
  format: "pdf" | "txt";
  fileUrl: string;
  fileKey: string;
  fileName: string;
}

/**
 * Fetch a generated document from the remedy_doc_generated table
 */
async function getDocContent(docId: string): Promise<{
  docId: string;
  templateId: string;
  documentTitle: string;
  documentContent: string;
  documentType: string;
  jurisdiction: string;
  caseId: number | null;
  createdAt: number;
}> {
  const [rows] = await db.execute(
    sql`SELECT doc_id, template_id, document_title, document_content, document_type,
               jurisdiction, case_id, created_at
        FROM remedy_doc_generated WHERE doc_id = ${docId} LIMIT 1`
  );
  const arr = rows as unknown as any[];
  if (arr.length === 0) throw new Error(`Document not found: ${docId}`);
  const r = arr[0];
  return {
    docId: r.doc_id,
    templateId: r.template_id,
    documentTitle: r.document_title || "Untitled Document",
    documentContent: r.document_content || "",
    documentType: r.document_type || "general",
    jurisdiction: r.jurisdiction || "",
    caseId: r.case_id,
    createdAt: r.created_at,
  };
}

/**
 * Generate a random suffix for file keys
 */
function randomSuffix(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Export a document as PDF
 */
export async function exportDocumentPDF(docId: string): Promise<ExportResult> {
  const doc = await getDocContent(docId);
  const pdfBuffer = await generatePDFBuffer(doc);
  const fileName = sanitizeFilename(doc.documentTitle) + ".pdf";
  const fileKey = `exports/${docId}-${randomSuffix()}.pdf`;
  const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");

  // Update the file_url in the DB
  await db.execute(
    sql`UPDATE remedy_doc_generated SET file_url = ${url}, updated_at = ${Date.now()} WHERE doc_id = ${docId}`
  );

  return { docId, format: "pdf", fileUrl: url, fileKey, fileName };
}

/**
 * Export a document as plain text
 */
export async function exportDocumentTXT(docId: string): Promise<ExportResult> {
  const doc = await getDocContent(docId);
  const textContent = generateTXTContent(doc);
  const fileName = sanitizeFilename(doc.documentTitle) + ".txt";
  const fileKey = `exports/${docId}-${randomSuffix()}.txt`;
  const { url } = await storagePut(fileKey, Buffer.from(textContent, "utf-8"), "text/plain");

  return { docId, format: "txt", fileUrl: url, fileKey, fileName };
}

/**
 * Generate PDF buffer from document content using PDFKit
 */
async function generatePDFBuffer(doc: {
  documentTitle: string;
  documentContent: string;
  documentType: string;
  jurisdiction: string;
  createdAt: number;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: "LETTER",
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      info: {
        Title: doc.documentTitle,
        Author: "LUMINARI Forensic Engine",
        Subject: `${doc.documentType} — ${doc.jurisdiction}`,
        Creator: "LUMINARI Document Export Service",
      },
    });

    const chunks: Buffer[] = [];
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);

    // ─── Header ───
    pdf.fontSize(10).fillColor("#666666")
      .text("LUMINARI FORENSIC ENGINE", 72, 40, { align: "left" })
      .text(new Date(doc.createdAt).toLocaleDateString("en-US", {
        year: "numeric", month: "long", day: "numeric",
      }), { align: "right" });
    pdf.moveTo(72, 58).lineTo(540, 58).strokeColor("#cccccc").stroke();

    // ─── Title ───
    pdf.moveDown(1);
    pdf.fontSize(18).fillColor("#1a1a1a")
      .text(doc.documentTitle, { align: "center" });
    pdf.moveDown(0.3);

    // ─── Document Type & Jurisdiction ───
    if (doc.documentType || doc.jurisdiction) {
      pdf.fontSize(10).fillColor("#888888")
        .text(
          [doc.documentType, doc.jurisdiction].filter(Boolean).join(" — "),
          { align: "center" }
        );
    }
    pdf.moveDown(1);
    pdf.moveTo(72, pdf.y).lineTo(540, pdf.y).strokeColor("#dddddd").stroke();
    pdf.moveDown(0.5);

    // ─── Body Content ───
    const content = doc.documentContent;
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();

      // Heading detection
      if (trimmed.startsWith("# ")) {
        pdf.moveDown(0.5);
        pdf.fontSize(16).fillColor("#1a1a1a").font("Helvetica-Bold")
          .text(trimmed.substring(2));
        pdf.font("Helvetica");
        pdf.moveDown(0.3);
      } else if (trimmed.startsWith("## ")) {
        pdf.moveDown(0.4);
        pdf.fontSize(14).fillColor("#333333").font("Helvetica-Bold")
          .text(trimmed.substring(3));
        pdf.font("Helvetica");
        pdf.moveDown(0.2);
      } else if (trimmed.startsWith("### ")) {
        pdf.moveDown(0.3);
        pdf.fontSize(12).fillColor("#444444").font("Helvetica-Bold")
          .text(trimmed.substring(4));
        pdf.font("Helvetica");
        pdf.moveDown(0.2);
      } else if (trimmed.startsWith("---") || trimmed.startsWith("___")) {
        pdf.moveDown(0.3);
        pdf.moveTo(72, pdf.y).lineTo(540, pdf.y).strokeColor("#dddddd").stroke();
        pdf.moveDown(0.3);
      } else if (trimmed === "") {
        pdf.moveDown(0.5);
      } else if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
        pdf.fontSize(11).fillColor("#1a1a1a").font("Helvetica-Bold")
          .text(trimmed.replace(/\*\*/g, ""));
        pdf.font("Helvetica");
      } else if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
        pdf.fontSize(11).fillColor("#333333")
          .text(`  •  ${trimmed.substring(2)}`, { indent: 20 });
      } else if (/^\d+\.\s/.test(trimmed)) {
        pdf.fontSize(11).fillColor("#333333")
          .text(`  ${trimmed}`, { indent: 20 });
      } else {
        // Regular paragraph
        pdf.fontSize(11).fillColor("#333333")
          .text(trimmed, { lineGap: 3 });
      }

      // Check for page overflow
      if (pdf.y > 700) {
        pdf.addPage();
      }
    }

    // ─── Signature Block ───
    pdf.moveDown(2);
    pdf.moveTo(72, pdf.y).lineTo(300, pdf.y).strokeColor("#999999").stroke();
    pdf.moveDown(0.3);
    pdf.fontSize(10).fillColor("#666666")
      .text("Signature: _________________________________")
      .moveDown(0.5)
      .text("Date: _________________________________")
      .moveDown(0.5)
      .text("Name (Printed): _________________________________");

    // ─── Footer ───
    pdf.moveDown(2);
    pdf.fontSize(8).fillColor("#aaaaaa")
      .text(
        "Generated by LUMINARI Forensic Engine — This document is computer-generated and may require review before submission.",
        72, pdf.y, { align: "center", width: 468 }
      );

    pdf.end();
  });
}

/**
 * Generate plain text content from document
 */
function generateTXTContent(doc: {
  documentTitle: string;
  documentContent: string;
  documentType: string;
  jurisdiction: string;
  createdAt: number;
}): string {
  const header = [
    "=" .repeat(72),
    doc.documentTitle.toUpperCase(),
    `Document Type: ${doc.documentType}`,
    doc.jurisdiction ? `Jurisdiction: ${doc.jurisdiction}` : "",
    `Generated: ${new Date(doc.createdAt).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    })}`,
    "=".repeat(72),
    "",
  ].filter(Boolean).join("\n");

  // Strip markdown formatting for plain text
  let body = doc.documentContent;
  body = body.replace(/^#{1,3}\s+/gm, ""); // Remove heading markers
  body = body.replace(/\*\*(.*?)\*\*/g, "$1"); // Remove bold markers
  body = body.replace(/\*(.*?)\*/g, "$1"); // Remove italic markers
  body = body.replace(/^---+$/gm, "-".repeat(72)); // Horizontal rules

  const footer = [
    "",
    "-".repeat(72),
    "Signature: _________________________________",
    "",
    "Date: _________________________________",
    "",
    "Name (Printed): _________________________________",
    "",
    "-".repeat(72),
    "Generated by LUMINARI Forensic Engine",
    "This document is computer-generated and may require review before submission.",
  ].join("\n");

  return header + "\n" + body + "\n" + footer;
}

/**
 * Sanitize filename for safe file storage
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s-_]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 100)
    .toLowerCase();
}
