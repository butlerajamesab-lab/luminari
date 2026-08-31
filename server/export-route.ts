import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import * as dbHelpers from "./db";
import { db } from "./db";
import { documents, entities, quotes, claims, findings, events, relationships, signalFlags, documentCorrelations } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { streamJsonExport, streamHtmlBundle } from "./export-streaming";
import { ENGINE_VERSION, ENGINE_MODEL_IDENTIFIER, ENGINE_DETERMINISM_PARAMS } from "../shared/const";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDate(ts: number | null | undefined): string {
  if (!ts) return "N/A";
  return new Date(ts).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

const baseStyles = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; color: #1a1a2e; line-height: 1.6; padding: 40px; max-width: 900px; margin: 0 auto; background: #fff; }
    h1 { font-size: 24px; font-weight: 700; border-bottom: 3px solid #0a1628; padding-bottom: 8px; margin-bottom: 24px; }
    h2 { font-size: 18px; font-weight: 600; color: #0a1628; margin-top: 32px; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
    h3 { font-size: 15px; font-weight: 600; margin-top: 20px; margin-bottom: 8px; }
    p { margin-bottom: 8px; font-size: 13px; }
    .meta { color: #64748b; font-size: 12px; margin-bottom: 4px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; background: #f1f5f9; color: #475569; margin-right: 6px; }
    .badge-strong { background: #dcfce7; color: #166534; }
    .badge-moderate { background: #fef3c7; color: #92400e; }
    .badge-preliminary { background: #e0e7ff; color: #3730a3; }
    .badge-flag { background: #fef2f2; color: #991b1b; }
    .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 12px; page-break-inside: avoid; }
    .quote-block { border-left: 3px solid #0ea5e9; padding: 8px 12px; margin: 8px 0; background: #f8fafc; font-style: italic; font-size: 12px; }
    .citation { color: #0ea5e9; font-size: 11px; font-weight: 500; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
    th { background: #f1f5f9; text-align: left; padding: 8px; font-weight: 600; border-bottom: 2px solid #e2e8f0; }
    td { padding: 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 2px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
    .toc { margin: 16px 0; }
    .toc a { color: #0a1628; text-decoration: none; font-size: 13px; display: block; padding: 4px 0; }
    .toc a:hover { color: #0ea5e9; }
    .print-btn { position: fixed; top: 20px; right: 20px; background: #0a1628; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; z-index: 100; }
    .print-btn:hover { background: #1e293b; }
    @media print { .print-btn { display: none; } body { padding: 20px; } }
  </style>
`;

export function registerExportRoute(app: Express) {
  app.get("/api/export/:type", async (req: Request, res: Response) => {
    try {
      let user;
      try {
        user = await sdk.authenticateRequest(req);
      } catch {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const caseId = parseInt(req.query.caseId as string);
      if (!caseId || isNaN(caseId)) {
        res.status(400).json({ error: "caseId is required" });
        return;
      }

      // Verify ownership or collaborator access (read-only is sufficient for export)
      try {
        await dbHelpers.verifyCaseOwnership(caseId, user.id);
      } catch {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      // Fetch case data — owner path uses getCase(userId), collaborator path uses direct fetch
      let caseData = await dbHelpers.getCase(caseId, user.id);
      if (!caseData) {
        // Collaborator: getCase filters by userId, so fetch directly since verifyCaseOwnership passed
        const [c] = await db.select().from((await import("../drizzle/schema")).cases).where(eq((await import("../drizzle/schema")).cases.id, caseId));
        if (!c) { res.status(404).json({ error: "Case not found" }); return; }
        caseData = c as any;
      }

      const exportType = req.params.type;
      let html = "";

      switch (exportType) {
        case "case-brief":
          html = await generateCaseBrief(caseData, caseId);
          break;
        case "entity-report":
          html = await generateEntityReport(caseData, caseId);
          break;
        case "timeline-report":
          html = await generateTimelineReport(caseData, caseId);
          break;
        case "relationship-report":
          html = await generateRelationshipReport(caseData, caseId);
          break;
        case "full-bundle":
          await streamHtmlBundle(res, caseData, caseId, bundleStyles, bundleScript, escapeHtml);
          return;
        case "json-dump": {
          const includeText = req.query.includeText === "true";
          const snapshotId = req.query.snapshotId ? parseInt(req.query.snapshotId as string, 10) : 0;
          await streamJsonExport(res, caseData, caseId, { includeTextContent: includeText, snapshotId });
          return;
        }
        default:
          res.status(400).json({ error: "Unknown export type" });
          return;
      }

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (err: any) {
      console.error("[Export] Error:", err);
      res.status(500).json({ error: err.message || "Export failed" });
    }
  });
}

async function generateCaseBrief(caseData: any, caseId: number): Promise<string> {
  const allDocs = await dbHelpers.listDocuments(caseId);
  const allFindings = await dbHelpers.listFindings(caseId);
  const allFlags = await dbHelpers.listSignalFlags(caseId);
  const allEvents = await dbHelpers.listEvents(caseId);
  const allEntities = await dbHelpers.listEntities(caseId);
  const allQuotes = await dbHelpers.getQuotesForCase(caseId);
  const allClaims = await dbHelpers.listClaims(caseId);
  const allCorrelations = await dbHelpers.listCorrelations(caseId);
  const stats = await dbHelpers.getCaseStats(caseId);

  const now = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Case Brief — ${escapeHtml(caseData.name)}</title>${baseStyles}</head><body>
    <button class="print-btn" onclick="window.print()">Print / Save PDF</button>

    <h1>CASE BRIEF</h1>
    <p><strong>Case:</strong> ${escapeHtml(caseData.name)}</p>
    ${caseData.description ? `<p><strong>Description:</strong> ${escapeHtml(caseData.description)}</p>` : ""}
    <p class="meta">Generated: ${now} | Documents: ${stats.documents} | Entities: ${stats.entities} | Quotes: ${stats.quotes} | Findings: ${stats.findings}</p>
    <p class="meta">This report was generated by Luminari. All assertions are anchored to source documents. This system organizes and clarifies — it does not argue.</p>

    <div class="toc">
      <h2>Table of Contents</h2>
      <a href="#executive-summary">1. Executive Summary</a>
      <a href="#key-findings">2. Key Findings (${allFindings.length})</a>
      <a href="#signal-flags">3. Signal Flags (${allFlags.length})</a>
      <a href="#timeline">4. Timeline of Events (${allEvents.length})</a>
      <a href="#entities">5. Entities (${allEntities.length})</a>
      <a href="#correlations">6. Cross-Document Correlations (${allCorrelations.length})</a>
      <a href="#document-index">7. Document Index (${allDocs.length})</a>
      <a href="#citation-table">8. Citation Table</a>
    </div>

    <h2 id="executive-summary">1. Executive Summary</h2>
    <div class="card">
      <p>This case brief covers <strong>${stats.documents} source documents</strong> from which the system extracted <strong>${stats.quotes} verbatim quotes</strong>, identified <strong>${stats.entities} entities</strong>, documented <strong>${stats.events} events</strong>, and generated <strong>${stats.findings} findings</strong>.</p>
      <p>${stats.signalFlags} signal flags were raised, indicating areas requiring attention. ${allCorrelations.length} cross-document correlations were identified linking evidence across multiple source documents.</p>
    </div>

    <h2 id="key-findings">2. Key Findings</h2>
    ${allFindings.length === 0 ? '<p class="meta">No findings generated yet.</p>' :
      allFindings.map((f, i) => `
        <div class="card">
          <h3>Finding ${i + 1}: ${escapeHtml(f.title)}</h3>
          <span class="badge badge-${f.confidence || 'preliminary'}">${f.confidence || "preliminary"}</span>
          <span class="badge">${f.findingType}</span>
          <p style="margin-top:8px">${escapeHtml(f.description)}</p>
          ${f.significance ? `<p class="meta" style="margin-top:4px"><strong>Significance:</strong> ${escapeHtml(f.significance)}</p>` : ""}
          ${f.claimIds && Array.isArray(f.claimIds) && f.claimIds.length > 0 ? `<p class="citation">Supporting claims: ${f.claimIds.map((id: number) => `#${id}`).join(", ")}</p>` : ""}
        </div>
      `).join("")
    }

    <h2 id="signal-flags">3. Signal Flags</h2>
    ${allFlags.length === 0 ? '<p class="meta">No signal flags raised.</p>' :
      `<table>
        <thead><tr><th>#</th><th>Type</th><th>Description</th><th>Document</th></tr></thead>
        <tbody>${allFlags.map((f, i) => {
          const doc = allDocs.find(d => d.id === f.documentId);
          return `<tr><td>${i + 1}</td><td><span class="badge badge-flag">${escapeHtml(f.flagType.replace(/_/g, " "))}</span></td><td>${escapeHtml(f.description || "")}</td><td>${doc ? escapeHtml(doc.filename) : `Doc #${f.documentId}`}</td></tr>`;
        }).join("")}</tbody>
      </table>`
    }

    <h2 id="timeline">4. Timeline of Events</h2>
    ${allEvents.length === 0 ? '<p class="meta">No events documented.</p>' :
      `<table>
        <thead><tr><th>Date</th><th>Event</th><th>Description</th><th>Location</th></tr></thead>
        <tbody>${allEvents.map(e => `<tr><td style="white-space:nowrap">${escapeHtml(e.dateOccurred || "Unknown")}</td><td><strong>${escapeHtml(e.title)}</strong></td><td>${escapeHtml(e.description || "")}</td><td>${escapeHtml(e.location || "")}</td></tr>`).join("")}</tbody>
      </table>`
    }

    <h2 id="entities">5. Entities</h2>
    ${allEntities.length === 0 ? '<p class="meta">No entities identified.</p>' :
      `<table>
        <thead><tr><th>Name</th><th>Type</th><th>Description</th></tr></thead>
        <tbody>${allEntities.map(e => `<tr><td><strong>${escapeHtml(e.name)}</strong></td><td><span class="badge">${escapeHtml(e.type)}</span></td><td>${escapeHtml(e.description || "")}</td></tr>`).join("")}</tbody>
      </table>`
    }

    <h2 id="correlations">6. Cross-Document Correlations</h2>
    ${allCorrelations.length === 0 ? '<p class="meta">No cross-document correlations found.</p>' :
      allCorrelations.map((c, i) => {
        const srcDoc = allDocs.find(d => d.id === c.sourceDocumentId);
        const tgtDoc = allDocs.find(d => d.id === c.targetDocumentId);
        return `<div class="card">
          <h3>Correlation ${i + 1}: ${escapeHtml(c.correlationType)}</h3>
          <p class="meta">Between: ${srcDoc ? escapeHtml(srcDoc.filename) : `Doc #${c.sourceDocumentId}`} ↔ ${tgtDoc ? escapeHtml(tgtDoc.filename) : `Doc #${c.targetDocumentId}`}</p>
          <p>${escapeHtml(c.description || "")}</p>
        </div>`;
      }).join("")
    }

    <h2 id="document-index">7. Document Index</h2>
    <table>
      <thead><tr><th>#</th><th>Filename</th><th>Type</th><th>Purpose</th><th>Status</th><th>SHA-256</th></tr></thead>
      <tbody>${allDocs.map((d, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(d.filename)}</td><td>${escapeHtml(d.documentType || d.fileType)}</td><td>${escapeHtml(d.documentPurpose || "—")}</td><td><span class="badge">${d.status}</span></td><td style="font-family:monospace;font-size:10px">${d.sha256Hash.slice(0, 16)}…</td></tr>`).join("")}</tbody>
    </table>

    <h2 id="citation-table">8. Citation Table</h2>
    <p class="meta">All verbatim quotes extracted from source documents, with page references where available.</p>
    <table>
      <thead><tr><th>#</th><th>Quote</th><th>Document</th><th>Page</th></tr></thead>
      <tbody>${allQuotes.slice(0, 200).map((q, i) => {
        const doc = allDocs.find(d => d.id === q.documentId);
        return `<tr><td>${i + 1}</td><td class="quote-block" style="border-left:none;background:none;padding:4px">"${escapeHtml(q.text.length > 200 ? q.text.slice(0, 200) + "…" : q.text)}"</td><td>${doc ? escapeHtml(doc.filename) : `Doc #${q.documentId}`}</td><td>${q.pageNumber ?? "—"}</td></tr>`;
      }).join("")}</tbody>
    </table>
    ${allQuotes.length > 200 ? `<p class="meta">Showing first 200 of ${allQuotes.length} quotes.</p>` : ""}

    <div class="footer">
      <p>Luminari — Case Brief</p>
      <p>Generated ${now} | ${stats.documents} documents | ${stats.quotes} citations | ${stats.findings} findings</p>
      <p>This document presents organized evidence. It does not constitute legal advice or argument.</p>
    </div>
  </body></html>`;
}

async function generateEntityReport(caseData: any, caseId: number): Promise<string> {
  const allEntities = await dbHelpers.listEntities(caseId);
  const allDocs = await dbHelpers.listDocuments(caseId);
  const allRelationships = await dbHelpers.listRelationships(caseId);
  const now = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Entity Report — ${escapeHtml(caseData.name)}</title>${baseStyles}</head><body>
    <button class="print-btn" onclick="window.print()">Print / Save PDF</button>

    <h1>ENTITY REPORT</h1>
    <p><strong>Case:</strong> ${escapeHtml(caseData.name)}</p>
    <p class="meta">Generated: ${now} | ${allEntities.length} entities tracked</p>

    ${allEntities.map((entity, i) => {
      const rels = allRelationships.filter(r => r.sourceEntityId === entity.id || r.targetEntityId === entity.id);
      return `
        <div class="card">
          <h3>${i + 1}. ${escapeHtml(entity.name)}</h3>
          <span class="badge">${escapeHtml(entity.type)}</span>
          ${entity.description ? `<p style="margin-top:8px">${escapeHtml(entity.description)}</p>` : ""}
          ${rels.length > 0 ? `
            <h3 style="font-size:13px;margin-top:12px">Relationships (${rels.length})</h3>
            <table>
              <thead><tr><th>Connected To</th><th>Relationship</th><th>Description</th></tr></thead>
              <tbody>${rels.map(r => {
                const otherId = r.sourceEntityId === entity.id ? r.targetEntityId : r.sourceEntityId;
                const other = allEntities.find(e => e.id === otherId);
                return `<tr><td>${other ? escapeHtml(other.name) : `Entity #${otherId}`}</td><td>${escapeHtml(r.relationshipType)}</td><td>${escapeHtml(r.description || "")}</td></tr>`;
              }).join("")}</tbody>
            </table>
          ` : '<p class="meta">No relationships documented.</p>'}
        </div>
      `;
    }).join("")}

    <div class="footer">
      <p>Luminari — Entity Report | Generated ${now}</p>
    </div>
  </body></html>`;
}

async function generateTimelineReport(caseData: any, caseId: number): Promise<string> {
  const allEvents = await dbHelpers.listEvents(caseId);
  const allDocs = await dbHelpers.listDocuments(caseId);
  const now = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Timeline Report — ${escapeHtml(caseData.name)}</title>${baseStyles}</head><body>
    <button class="print-btn" onclick="window.print()">Print / Save PDF</button>

    <h1>TIMELINE REPORT</h1>
    <p><strong>Case:</strong> ${escapeHtml(caseData.name)}</p>
    <p class="meta">Generated: ${now} | ${allEvents.length} events documented</p>

    ${allEvents.length === 0 ? '<p>No events documented yet.</p>' :
      allEvents.map((e, i) => `
        <div class="card">
          <p class="meta" style="font-weight:600;color:#0a1628">${escapeHtml(e.dateOccurred || "Date unknown")}</p>
          <h3>${escapeHtml(e.title)}</h3>
          <span class="badge">${escapeHtml(e.eventType)}</span>
          ${e.location ? `<span class="badge">${escapeHtml(e.location)}</span>` : ""}
          ${e.description ? `<p style="margin-top:8px">${escapeHtml(e.description)}</p>` : ""}
        </div>
      `).join("")
    }

    <div class="footer">
      <p>Luminari — Timeline Report | Generated ${now}</p>
    </div>
  </body></html>`;
}

async function generateRelationshipReport(caseData: any, caseId: number): Promise<string> {
  const allRelationships = await dbHelpers.listRelationships(caseId);
  const allEntities = await dbHelpers.listEntities(caseId);
  const now = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Relationship Report — ${escapeHtml(caseData.name)}</title>${baseStyles}</head><body>
    <button class="print-btn" onclick="window.print()">Print / Save PDF</button>

    <h1>RELATIONSHIP REPORT</h1>
    <p><strong>Case:</strong> ${escapeHtml(caseData.name)}</p>
    <p class="meta">Generated: ${now} | ${allRelationships.length} relationships documented | ${allEntities.length} entities</p>

    ${allRelationships.length === 0 ? '<p>No relationships documented yet.</p>' :
      `<table>
        <thead><tr><th>#</th><th>Source</th><th>Relationship</th><th>Target</th><th>Description</th><th>Evidence</th></tr></thead>
        <tbody>${allRelationships.map((r, i) => {
          const src = allEntities.find(e => e.id === r.sourceEntityId);
          const tgt = allEntities.find(e => e.id === r.targetEntityId);
          return `<tr><td>${i + 1}</td><td><strong>${src ? escapeHtml(src.name) : `#${r.sourceEntityId}`}</strong></td><td>${escapeHtml(r.relationshipType)}</td><td><strong>${tgt ? escapeHtml(tgt.name) : `#${r.targetEntityId}`}</strong></td><td>${escapeHtml(r.description || "")}</td><td>${r.evidenceCount || 0} source(s)</td></tr>`;
        }).join("")}</tbody>
      </table>`
    }

    <div class="footer">
      <p>Luminari — Relationship Report | Generated ${now}</p>
    </div>
  </body></html>`;
}

// ─── Self-Contained HTML Bundle (works offline, zero dependencies) ───
const bundleStyles = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    :root { --bg: #0f172a; --surface: #1e293b; --border: #334155; --text: #e2e8f0; --muted: #94a3b8; --primary: #38bdf8; --accent: #0ea5e9; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
    .container { max-width: 1100px; margin: 0 auto; padding: 24px; }
    h1 { font-size: 28px; font-weight: 700; color: #fff; margin-bottom: 8px; }
    h2 { font-size: 20px; font-weight: 600; color: var(--primary); margin-top: 40px; margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 8px; cursor: pointer; }
    h2:hover { color: #7dd3fc; }
    h2::before { content: '▸ '; font-size: 14px; }
    h2.open::before { content: '▾ '; }
    h3 { font-size: 15px; font-weight: 600; margin-top: 16px; margin-bottom: 6px; }
    p { margin-bottom: 8px; font-size: 13px; }
    .meta { color: var(--muted); font-size: 12px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; background: var(--surface); color: var(--muted); margin-right: 4px; border: 1px solid var(--border); }
    .badge-finding { border-color: #22d3ee; color: #22d3ee; }
    .badge-note { border-color: #a78bfa; color: #a78bfa; }
    .badge-flag { border-color: #f87171; color: #f87171; }
    .badge-strong { border-color: #4ade80; color: #4ade80; }
    .badge-moderate { border-color: #fbbf24; color: #fbbf24; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 12px; }
    .quote-block { border-left: 3px solid var(--accent); padding: 8px 12px; margin: 8px 0; background: rgba(14,165,233,0.08); font-style: italic; font-size: 12px; color: #cbd5e1; }
    .citation { color: var(--accent); font-size: 11px; font-weight: 500; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
    th { background: var(--surface); text-align: left; padding: 8px; font-weight: 600; border-bottom: 2px solid var(--border); color: var(--muted); }
    td { padding: 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
    tr:hover td { background: rgba(56,189,248,0.04); }
    .section-content { display: none; }
    .section-content.open { display: block; }
    .header { border-bottom: 2px solid var(--border); padding-bottom: 16px; margin-bottom: 24px; }
    .header .subtitle { color: var(--muted); font-size: 14px; }
    .stats-bar { display: flex; gap: 24px; flex-wrap: wrap; margin: 16px 0; }
    .stat { text-align: center; }
    .stat-value { font-size: 24px; font-weight: 700; color: var(--primary); }
    .stat-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .footer { margin-top: 48px; padding-top: 16px; border-top: 2px solid var(--border); text-align: center; color: var(--muted); font-size: 11px; }
    .nav { position: sticky; top: 0; background: var(--bg); border-bottom: 1px solid var(--border); padding: 12px 0; z-index: 10; margin-bottom: 24px; display: flex; gap: 8px; flex-wrap: wrap; }
    .nav a { color: var(--muted); text-decoration: none; font-size: 12px; padding: 4px 12px; border-radius: 4px; border: 1px solid var(--border); transition: all 0.2s; }
    .nav a:hover { color: var(--primary); border-color: var(--primary); }
    .search-box { width: 100%; padding: 8px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-size: 13px; margin-bottom: 16px; outline: none; }
    .search-box:focus { border-color: var(--primary); }
    .search-box::placeholder { color: var(--muted); }
    .highlight { background: rgba(250,204,21,0.3); border-radius: 2px; }
    .toolbar { display: flex; gap: 8px; margin-bottom: 16px; }
    .toolbar button { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 12px; }
    .toolbar button:hover { border-color: var(--primary); color: var(--primary); }
    @media print {
      body { background: #fff; color: #1a1a2e; }
      .nav, .toolbar, .search-box { display: none; }
      .section-content { display: block !important; }
      .card { border-color: #e2e8f0; background: #fff; }
      .quote-block { background: #f8fafc; color: #334155; }
      th { background: #f1f5f9; color: #475569; }
      td { border-color: #f1f5f9; }
      h2 { color: #0a1628; border-color: #e2e8f0; }
      h2::before { content: ''; }
      .badge { background: #f1f5f9; color: #475569; border-color: #e2e8f0; }
      .footer { color: #94a3b8; border-color: #e2e8f0; }
      .header { border-color: #e2e8f0; }
    }
  </style>
`;

const bundleScript = `
  <script>
    // Section toggle
    document.querySelectorAll('h2[data-section]').forEach(h2 => {
      h2.addEventListener('click', () => {
        const section = document.getElementById(h2.dataset.section);
        if (section) {
          section.classList.toggle('open');
          h2.classList.toggle('open');
        }
      });
    });
    // Open all by default
    document.querySelectorAll('.section-content').forEach(s => s.classList.add('open'));
    document.querySelectorAll('h2[data-section]').forEach(h => h.classList.add('open'));

    // Search
    const searchBox = document.getElementById('search-input');
    if (searchBox) {
      let debounce;
      searchBox.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          const query = searchBox.value.trim().toLowerCase();
          document.querySelectorAll('.highlight').forEach(el => {
            el.outerHTML = el.textContent;
          });
          if (!query || query.length < 2) return;
          document.querySelectorAll('.card, td, .quote-block').forEach(el => {
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
            const textNodes = [];
            while (walker.nextNode()) textNodes.push(walker.currentNode);
            textNodes.forEach(node => {
              const idx = node.textContent.toLowerCase().indexOf(query);
              if (idx >= 0) {
                const span = document.createElement('span');
                span.className = 'highlight';
                const range = document.createRange();
                range.setStart(node, idx);
                range.setEnd(node, idx + query.length);
                range.surroundContents(span);
              }
            });
          });
        }, 300);
      });
    }

    // Expand/collapse all
    function expandAll() {
      document.querySelectorAll('.section-content').forEach(s => s.classList.add('open'));
      document.querySelectorAll('h2[data-section]').forEach(h => h.classList.add('open'));
    }
    function collapseAll() {
      document.querySelectorAll('.section-content').forEach(s => s.classList.remove('open'));
      document.querySelectorAll('h2[data-section]').forEach(h => h.classList.remove('open'));
    }
  </script>
`;

async function generateFullBundle(caseData: any, caseId: number): Promise<string> {
  const allDocs = await dbHelpers.listDocuments(caseId);
  const allFindings = await dbHelpers.listFindings(caseId);
  const allFlags = await dbHelpers.listSignalFlags(caseId);
  const allEvents = await dbHelpers.listEvents(caseId);
  const allEntities = await dbHelpers.listEntities(caseId);
  const allQuotes = await dbHelpers.getQuotesForCase(caseId);
  const allClaims = await dbHelpers.listClaims(caseId);
  const allCorrelations = await dbHelpers.listCorrelations(caseId);
  const allRelationships = await dbHelpers.listRelationships(caseId);
  const stats = await dbHelpers.getCaseStats(caseId);

  const now = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const caseName = escapeHtml(caseData.name);

  // Build entity lookup for inline references
  const entityMap = new Map(allEntities.map(e => [e.id, e]));
  const docMap = new Map(allDocs.map(d => [d.id, d]));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${caseName} — Luminari Case Bundle</title>
  <meta name="description" content="Self-contained offline case bundle generated by Luminari. No internet required.">
  <meta name="generator" content="Luminari v4.0">
  <meta name="engine-version" content="${ENGINE_VERSION}">
  ${bundleStyles}
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${caseName}</h1>
      <p class="subtitle">${caseData.description ? escapeHtml(caseData.description) : "Luminari Case Bundle"}</p>
      <p class="meta">Generated: ${now} | Domain: ${caseData.domain ? escapeHtml(caseData.domain) : "—"} | Container: ${caseData.container ? escapeHtml(caseData.container) : "—"}</p>
      <p class="meta">This is a self-contained offline document. No internet connection is required to view it.</p>
    </div>

    <div class="stats-bar">
      <div class="stat"><div class="stat-value">${stats.documents}</div><div class="stat-label">Documents</div></div>
      <div class="stat"><div class="stat-value">${stats.entities}</div><div class="stat-label">Entities</div></div>
      <div class="stat"><div class="stat-value">${stats.quotes}</div><div class="stat-label">Quotes</div></div>
      <div class="stat"><div class="stat-value">${stats.claims}</div><div class="stat-label">Claims</div></div>
      <div class="stat"><div class="stat-value">${stats.findings}</div><div class="stat-label">Findings</div></div>
      <div class="stat"><div class="stat-value">${stats.events}</div><div class="stat-label">Events</div></div>
      <div class="stat"><div class="stat-value">${stats.relationships}</div><div class="stat-label">Relationships</div></div>
      <div class="stat"><div class="stat-value">${stats.signalFlags}</div><div class="stat-label">Signal Flags</div></div>
    </div>

    <div class="nav">
      <a href="#sec-findings">Findings</a>
      <a href="#sec-signals">Signals</a>
      <a href="#sec-timeline">Timeline</a>
      <a href="#sec-entities">Entities</a>
      <a href="#sec-relationships">Relationships</a>
      <a href="#sec-correlations">Correlations</a>
      <a href="#sec-documents">Documents</a>
      <a href="#sec-quotes">Quotes</a>
      <a href="#sec-claims">Claims</a>
    </div>

    <input type="text" id="search-input" class="search-box" placeholder="Search across all evidence...">

    <div class="toolbar">
      <button onclick="expandAll()">Expand All</button>
      <button onclick="collapseAll()">Collapse All</button>
      <button onclick="window.print()">Print / Save PDF</button>
    </div>

    <!-- FINDINGS -->
    <h2 id="sec-findings" data-section="findings-content">Findings (${allFindings.length})</h2>
    <div id="findings-content" class="section-content">
      ${allFindings.length === 0 ? '<p class="meta">No findings generated.</p>' :
        allFindings.map((f, i) => {
          const weightBadge = f.evidentiaryWeight === "finding" ? "badge-finding" : "badge-note";
          const confBadge = f.confidence === "strong" ? "badge-strong" : f.confidence === "moderate" ? "badge-moderate" : "";
          return `<div class="card">
            <h3>Finding ${i + 1}: ${escapeHtml(f.title)}</h3>
            <span class="badge ${weightBadge}">${f.evidentiaryWeight === "finding" ? "Finding" : "Note/Signal"}</span>
            <span class="badge ${confBadge}">${f.confidence || "preliminary"}</span>
            <span class="badge">${escapeHtml(f.findingType)}</span>
            <p style="margin-top:8px">${escapeHtml(f.description)}</p>
            ${f.significance ? `<p class="meta"><strong>Context:</strong> ${escapeHtml(f.significance)}</p>` : ""}
            ${f.claimIds && Array.isArray(f.claimIds) && f.claimIds.length > 0 ? `<p class="citation">Backing claims: ${f.claimIds.map((id: number) => `#${id}`).join(", ")}</p>` : ""}
          </div>`;
        }).join("")
      }
    </div>

    <!-- SIGNAL FLAGS -->
    <h2 id="sec-signals" data-section="signals-content">Signal Flags (${allFlags.length})</h2>
    <div id="signals-content" class="section-content">
      ${allFlags.length === 0 ? '<p class="meta">No signal flags raised.</p>' :
        `<table>
          <thead><tr><th>#</th><th>Type</th><th>Description</th><th>Source Document</th></tr></thead>
          <tbody>${allFlags.map((f, i) => {
            const doc = docMap.get(f.documentId);
            return `<tr><td>${i + 1}</td><td><span class="badge badge-flag">${escapeHtml(f.flagType.replace(/_/g, " "))}</span></td><td>${escapeHtml(f.description || "")}</td><td>${doc ? escapeHtml(doc.filename) : `Doc #${f.documentId}`}</td></tr>`;
          }).join("")}</tbody>
        </table>`
      }
    </div>

    <!-- TIMELINE -->
    <h2 id="sec-timeline" data-section="timeline-content">Timeline (${allEvents.length} events)</h2>
    <div id="timeline-content" class="section-content">
      ${allEvents.length === 0 ? '<p class="meta">No events documented.</p>' :
        allEvents.map((e, i) => `
          <div class="card">
            <p class="meta" style="font-weight:600;color:var(--primary)">${escapeHtml(e.dateOccurred || "Date unknown")}${e.datePrecision && e.datePrecision !== "exact" ? ` (${e.datePrecision})` : ""}</p>
            <h3>${escapeHtml(e.title)}</h3>
            <span class="badge">${escapeHtml(e.eventType)}</span>
            ${e.location ? `<span class="badge">${escapeHtml(e.location)}</span>` : ""}
            ${e.description ? `<p style="margin-top:8px">${escapeHtml(e.description)}</p>` : ""}
            ${e.entitiesInvolved && Array.isArray(e.entitiesInvolved) && e.entitiesInvolved.length > 0 ? `<p class="citation">Entities: ${(e.entitiesInvolved as number[]).map(id => { const ent = entityMap.get(id); return ent ? escapeHtml(ent.name) : `#${id}`; }).join(", ")}</p>` : ""}
          </div>
        `).join("")
      }
    </div>

    <!-- ENTITIES -->
    <h2 id="sec-entities" data-section="entities-content">Entities (${allEntities.length})</h2>
    <div id="entities-content" class="section-content">
      ${allEntities.length === 0 ? '<p class="meta">No entities identified.</p>' :
        `<table>
          <thead><tr><th>#</th><th>Name</th><th>Type</th><th>Description</th><th>Aliases</th></tr></thead>
          <tbody>${allEntities.map((e, i) => `<tr><td>${i + 1}</td><td><strong>${escapeHtml(e.name)}</strong></td><td><span class="badge">${escapeHtml(e.type)}</span></td><td>${escapeHtml(e.description || "")}</td><td>${e.aliases && Array.isArray(e.aliases) && e.aliases.length > 0 ? (e.aliases as string[]).map(a => escapeHtml(a)).join(", ") : "—"}</td></tr>`).join("")}</tbody>
        </table>`
      }
    </div>

    <!-- RELATIONSHIPS -->
    <h2 id="sec-relationships" data-section="relationships-content">Relationships (${allRelationships.length})</h2>
    <div id="relationships-content" class="section-content">
      ${allRelationships.length === 0 ? '<p class="meta">No relationships documented.</p>' :
        `<table>
          <thead><tr><th>#</th><th>Source</th><th>Relationship</th><th>Target</th><th>Description</th><th>Evidence</th></tr></thead>
          <tbody>${allRelationships.map((r, i) => {
            const src = entityMap.get(r.sourceEntityId);
            const tgt = entityMap.get(r.targetEntityId);
            return `<tr><td>${i + 1}</td><td><strong>${src ? escapeHtml(src.name) : `#${r.sourceEntityId}`}</strong></td><td>${escapeHtml(r.relationshipType)}</td><td><strong>${tgt ? escapeHtml(tgt.name) : `#${r.targetEntityId}`}</strong></td><td>${escapeHtml(r.description || "")}</td><td>${r.evidenceCount || 0} source(s)</td></tr>`;
          }).join("")}</tbody>
        </table>`
      }
    </div>

    <!-- CORRELATIONS -->
    <h2 id="sec-correlations" data-section="correlations-content">Cross-Document Correlations (${allCorrelations.length})</h2>
    <div id="correlations-content" class="section-content">
      ${allCorrelations.length === 0 ? '<p class="meta">No correlations found.</p>' :
        allCorrelations.map((c, i) => {
          const srcDoc = docMap.get(c.sourceDocumentId);
          const tgtDoc = docMap.get(c.targetDocumentId);
          return `<div class="card">
            <h3>Correlation ${i + 1}: ${escapeHtml(c.correlationType.replace(/_/g, " "))}</h3>
            <p class="meta">${srcDoc ? escapeHtml(srcDoc.filename) : `Doc #${c.sourceDocumentId}`} ↔ ${tgtDoc ? escapeHtml(tgtDoc.filename) : `Doc #${c.targetDocumentId}`}</p>
            <p>${escapeHtml(c.description || "")}</p>
            ${c.sharedIdentifiers && Array.isArray(c.sharedIdentifiers) && c.sharedIdentifiers.length > 0 ? `<p class="citation">Shared: ${(c.sharedIdentifiers as string[]).map(s => escapeHtml(s)).join(", ")}</p>` : ""}
          </div>`;
        }).join("")
      }
    </div>

    <!-- DOCUMENTS -->
    <h2 id="sec-documents" data-section="documents-content">Document Index (${allDocs.length})</h2>
    <div id="documents-content" class="section-content">
      ${allDocs.length === 0 ? '<p class="meta">No documents uploaded.</p>' :
        `<table>
          <thead><tr><th>#</th><th>Filename</th><th>Type</th><th>Purpose</th><th>Status</th><th>SHA-256</th><th>Size</th></tr></thead>
          <tbody>${allDocs.map((d, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(d.filename)}</td><td>${escapeHtml(d.documentType || d.fileType)}</td><td>${escapeHtml(d.documentPurpose || "—")}</td><td><span class="badge">${d.status}</span></td><td style="font-family:monospace;font-size:10px">${d.sha256Hash}</td><td>${(d.fileSize / 1024).toFixed(1)} KB</td></tr>`).join("")}</tbody>
        </table>`
      }
    </div>

    <!-- QUOTES -->
    <h2 id="sec-quotes" data-section="quotes-content">Verbatim Quotes (${allQuotes.length})</h2>
    <div id="quotes-content" class="section-content">
      ${allQuotes.length === 0 ? '<p class="meta">No quotes extracted.</p>' :
        `<table>
          <thead><tr><th>#</th><th>Quote</th><th>Document</th><th>Page</th><th>Origin</th></tr></thead>
          <tbody>${allQuotes.map((q, i) => {
            const doc = docMap.get(q.documentId);
            return `<tr><td>${i + 1}</td><td><div class="quote-block">"${escapeHtml(q.text)}"</div></td><td>${doc ? escapeHtml(doc.filename) : `Doc #${q.documentId}`}</td><td>${q.pageNumber ?? "—"}</td><td><span class="badge">${escapeHtml(q.statementOrigin.replace(/_/g, " "))}</span></td></tr>`;
          }).join("")}</tbody>
        </table>`
      }
    </div>

    <!-- CLAIMS -->
    <h2 id="sec-claims" data-section="claims-content">Claims (${allClaims.length})</h2>
    <div id="claims-content" class="section-content">
      ${allClaims.length === 0 ? '<p class="meta">No claims extracted.</p>' :
        `<table>
          <thead><tr><th>#</th><th>Claim</th><th>Type</th><th>Origin</th><th>Weight</th><th>Document</th></tr></thead>
          <tbody>${allClaims.map((c, i) => {
            const doc = docMap.get(c.documentId);
            return `<tr><td>${i + 1}</td><td>${escapeHtml(c.claimText)}</td><td><span class="badge">${escapeHtml(c.claimType)}</span></td><td>${escapeHtml(c.statementOrigin.replace(/_/g, " "))}</td><td><span class="badge ${c.evidentiaryWeight === "finding_eligible" ? "badge-finding" : ""}">${escapeHtml(c.evidentiaryWeight.replace(/_/g, " "))}</span></td><td>${doc ? escapeHtml(doc.filename) : `Doc #${c.documentId}`}</td></tr>`;
          }).join("")}</tbody>
        </table>`
      }
    </div>

    <div class="footer">
      <p><strong>Luminari v4.0</strong> — Self-Contained Case Bundle</p>
      <p>Engine: ${ENGINE_VERSION}</p>
      <p>Generated ${now} | ${stats.documents} documents | ${stats.quotes} quotes | ${stats.findings} findings</p>
      <p>This document is fully self-contained and requires no internet connection. It presents organized evidence — it does not constitute legal advice or argument.</p>
      <p style="margin-top:8px;font-size:10px">Integrity note: This bundle was generated from the Luminari evidence database at the time shown above. Document hashes (SHA-256) are included for verification.</p>
    </div>
  </div>
  ${bundleScript}
</body>
</html>`;
}

// ─── Full JSON Data Export (portable, importable) ───
async function generateJsonDump(caseData: any, caseId: number) {
  const allDocs = await dbHelpers.listDocuments(caseId);
  const allFindings = await dbHelpers.listFindings(caseId);
  const allFlags = await dbHelpers.listSignalFlags(caseId);
  const allEvents = await dbHelpers.listEvents(caseId);
  const allEntities = await dbHelpers.listEntities(caseId);
  const allQuotes = await dbHelpers.getQuotesForCase(caseId);
  const allClaims = await dbHelpers.listClaims(caseId);
  const allCorrelations = await dbHelpers.listCorrelations(caseId);
  const allRelationships = await dbHelpers.listRelationships(caseId);
  const stats = await dbHelpers.getCaseStats(caseId);

  // Fetch entity roles and relationship evidence for completeness
  const allEntityRoles: any[] = [];
  for (const entity of allEntities) {
    const roles = await dbHelpers.getEntityRolesForEntity(entity.id);
    allEntityRoles.push(...roles.map(r => ({ ...r, entityName: entity.name })));
  }

  const allRelEvidence: any[] = [];
  for (const rel of allRelationships) {
    const evidence = await dbHelpers.getEvidenceForRelationship(rel.id);
    allRelEvidence.push(...evidence.map(e => ({ ...e, relationshipId: rel.id })));
  }

  return {
    _meta: {
      generator: "Luminari v4.0",
      exportedAt: new Date().toISOString(),
      exportedAtTimestamp: Date.now(),
      format: "luminari-case-dump-v1",
      description: "Complete case data export. This file contains all structured data from a Luminari investigation. It can be imported into any compatible system or used for offline analysis.",
      engineVersion: ENGINE_VERSION,
      modelIdentifier: ENGINE_MODEL_IDENTIFIER,
      determinismParameters: ENGINE_DETERMINISM_PARAMS,
    },
    case: {
      id: caseData.id,
      name: caseData.name,
      description: caseData.description,
      domain: caseData.domain,
      container: caseData.container,
      status: caseData.status,
      createdAt: caseData.createdAt,
      updatedAt: caseData.updatedAt,
    },
    statistics: stats,
    documents: allDocs.map(d => ({
      id: d.id,
      filename: d.filename,
      fileType: d.fileType,
      mimeType: d.mimeType,
      fileSize: d.fileSize,
      sha256Hash: d.sha256Hash,
      status: d.status,
      textContent: d.textContent,
      pageCount: d.pageCount,
      durationSeconds: d.durationSeconds,
      documentType: d.documentType,
      documentPurpose: d.documentPurpose,
      aiMetadata: d.aiMetadata,
      createdAt: d.createdAt,
    })),
    quotes: allQuotes.map(q => ({
      id: q.id,
      documentId: q.documentId,
      text: q.text,
      pageNumber: q.pageNumber,
      timestampStart: q.timestampStart,
      timestampEnd: q.timestampEnd,
      context: q.context,
      statementOrigin: q.statementOrigin,
    })),
    entities: allEntities.map(e => ({
      id: e.id,
      name: e.name,
      type: e.type,
      description: e.description,
      aliases: e.aliases,
    })),
    entityRoles: allEntityRoles,
    claims: allClaims.map(c => ({
      id: c.id,
      documentId: c.documentId,
      quoteId: c.quoteId,
      claimText: c.claimText,
      claimType: c.claimType,
      dateReferenced: c.dateReferenced,
      entitiesInvolved: c.entitiesInvolved,
      statementOrigin: c.statementOrigin,
      evidentiaryWeight: c.evidentiaryWeight,
    })),
    findings: allFindings.map(f => ({
      id: f.id,
      findingType: f.findingType,
      title: f.title,
      description: f.description,
      significance: f.significance,
      claimIds: f.claimIds,
      confidence: f.confidence,
      evidentiaryWeight: f.evidentiaryWeight,
      createdAt: f.createdAt,
    })),
    events: allEvents.map(e => ({
      id: e.id,
      eventType: e.eventType,
      title: e.title,
      description: e.description,
      dateOccurred: e.dateOccurred,
      datePrecision: e.datePrecision,
      location: e.location,
      entitiesInvolved: e.entitiesInvolved,
      quoteIds: e.quoteIds,
    })),
    relationships: allRelationships.map(r => ({
      id: r.id,
      sourceEntityId: r.sourceEntityId,
      targetEntityId: r.targetEntityId,
      relationshipType: r.relationshipType,
      description: r.description,
      evidenceCount: r.evidenceCount,
    })),
    relationshipEvidence: allRelEvidence,
    signalFlags: allFlags.map(f => ({
      id: f.id,
      documentId: f.documentId,
      flagType: f.flagType,
      description: f.description,
      quoteId: f.quoteId,
    })),
    correlations: allCorrelations.map(c => ({
      id: c.id,
      sourceDocumentId: c.sourceDocumentId,
      targetDocumentId: c.targetDocumentId,
      correlationType: c.correlationType,
      description: c.description,
      sharedIdentifiers: c.sharedIdentifiers,
    })),
  };
}
