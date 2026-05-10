/**
 * LUMINARI V2 — DOCUMENT TEMPLATES
 * 
 * Generates formal documents for civic-forensic cases:
 * - FOIA request letters (to government agencies)
 * - Case reports (digitized full case summary)
 * - Escalation letters (to nonprofits and legal aid organizations)
 * 
 * All templates use real legal language and interpolate case data.
 * Output is HTML suitable for print, PDF conversion, or browser display.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CaseData {
  record_id: string;
  jurisdiction: string;
  system_primary: string;
  evidence?: Array<{
    content: string;
    source_type: string;
    confidence: number;
  }>;
  findings?: Array<{
    description: string;
    severity: string;
  }>;
  statutes?: Array<{
    citation: string;
    title: string;
  }>;
}

export interface ExportPayload {
  case_id: string;
  record_id: string;
  jurisdiction: string;
  system_primary: string;
  problem_type: string;
  generated_at: string;
  schema_version: string;
  source_facts?: {
    evidence_count: number;
    finding_count: number;
    action_count: number;
  };
  derived_context?: {
    dominant_problem_type: string;
    dominant_jurisdiction: string;
    dominant_system: string;
    avg_friction: number;
    max_friction: number;
    coordination_summary?: {
      deadlocked: number;
      with_conflicts: number;
    };
  };
  evidence?: Array<{
    id: string;
    content: string;
    source_type: string;
    confidence: number;
  }>;
  findings?: Array<{
    id: string;
    description: string;
    severity: string;
  }>;
  statutes?: Array<{
    citation: string;
    title: string;
  }>;
  remedy_paths?: Array<{
    type: string;
    primary: boolean;
    timeline_days: number;
  }>;
  grounding_entities?: Array<{
    name: string;
    type: string;
    role: string;
  }>;
}

// ─── FOIA Request Letter ────────────────────────────────────────────────────

export function generateFOIARequest(caseData: CaseData, targetAgency: string): string {
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const evidenceTypes = caseData.evidence
    ? Array.from(new Set(caseData.evidence.map((e) => e.source_type))).join(", ")
    : "records";

  const findingsSummary = caseData.findings
    ? caseData.findings.slice(0, 2).map((f) => `• ${f.description}`).join("\n")
    : "• Systemic issues identified in case analysis";

  const statutesCited = caseData.statutes
    ? caseData.statutes.map((s) => `${s.citation} — ${s.title}`).join("\n")
    : "Applicable federal and state statutes";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FOIA Request — ${caseData.record_id}</title>
  <style>
    body {
      font-family: "Times New Roman", Times, serif;
      line-height: 1.6;
      max-width: 8.5in;
      margin: 0.5in auto;
      padding: 0;
      color: #000;
      background: #fff;
    }
    .header {
      text-align: center;
      margin-bottom: 1in;
      border-bottom: 2px solid #000;
      padding-bottom: 0.25in;
    }
    .header h1 {
      margin: 0;
      font-size: 16pt;
      font-weight: bold;
    }
    .header p {
      margin: 0.1in 0;
      font-size: 10pt;
    }
    .letter-date {
      text-align: left;
      margin-bottom: 0.5in;
      font-size: 11pt;
    }
    .recipient {
      margin-bottom: 0.5in;
      font-size: 11pt;
    }
    .salutation {
      margin-bottom: 0.3in;
      font-size: 11pt;
    }
    .body {
      font-size: 11pt;
      text-align: justify;
    }
    .body p {
      margin: 0.25in 0;
      text-indent: 0.5in;
    }
    .body p:first-of-type {
      text-indent: 0.5in;
    }
    .list {
      margin: 0.25in 0.5in;
      font-size: 11pt;
    }
    .list-item {
      margin: 0.1in 0;
    }
    .closing {
      margin-top: 0.5in;
      font-size: 11pt;
    }
    .signature {
      margin-top: 0.5in;
      font-size: 11pt;
    }
    .footer {
      margin-top: 1in;
      border-top: 1px solid #ccc;
      padding-top: 0.25in;
      font-size: 9pt;
      color: #666;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>FREEDOM OF INFORMATION ACT REQUEST</h1>
    <p>Case ID: ${caseData.record_id}</p>
    <p>Jurisdiction: ${caseData.jurisdiction}</p>
  </div>

  <div class="letter-date">
    ${dateStr}
  </div>

  <div class="recipient">
    <strong>${targetAgency}</strong><br>
    Freedom of Information Act Officer<br>
    [AGENCY ADDRESS]<br>
    [CITY, STATE ZIP]
  </div>

  <div class="salutation">
    Re: FOIA Request — Records Pertaining to ${caseData.system_primary} System Issues in ${caseData.jurisdiction}
  </div>

  <div class="body">
    <p>Dear FOIA Officer:</p>

    <p>Pursuant to the Freedom of Information Act, 5 U.S.C. § 552, and implementing regulations, I hereby request access to records held by ${targetAgency} that relate to the systemic issues documented in Case ${caseData.record_id}.</p>

    <p><strong>Records Requested:</strong></p>
    <div class="list">
      <div class="list-item">1. All ${evidenceTypes} related to ${caseData.system_primary} system administration in ${caseData.jurisdiction} for the period of [DATE RANGE].</div>
      <div class="list-item">2. Internal communications, memoranda, and policy documents concerning the issues identified in the attached case analysis.</div>
      <div class="list-item">3. Any complaints, investigations, or remedial actions taken in response to the systemic issues described herein.</div>
      <div class="list-item">4. Records demonstrating compliance with applicable statutes and regulations cited below.</div>
    </div>

    <p><strong>Basis for Request:</strong></p>
    <p>The attached case analysis identifies the following systemic findings:</p>
    <div class="list">
      ${findingsSummary}
    </div>

    <p>These findings are supported by ${caseData.evidence?.length || 0} evidence items with an average confidence level of ${caseData.evidence ? (caseData.evidence.reduce((sum, e) => sum + e.confidence, 0) / caseData.evidence.length * 100).toFixed(0) : 0}%. The request is grounded in the following legal authorities:</p>
    <div class="list">
      ${statutesCited}
    </div>

    <p><strong>Fee Waiver Request:</strong></p>
    <p>I request a waiver of search, review, and duplication fees pursuant to 5 U.S.C. § 552(a)(4)(A)(iii). Disclosure of the requested records is in the public interest because it will contribute significantly to public understanding of government operations and systemic issues affecting citizens in ${caseData.jurisdiction}. The records are not primarily in the commercial interest of the requester.</p>

    <p><strong>Response Deadline:</strong></p>
    <p>I expect a substantive response within 20 business days of receipt of this request, as required by law. If you anticipate difficulty meeting this deadline, please contact me immediately.</p>

    <p><strong>Contact Information:</strong></p>
    <div class="list">
      <div class="list-item">Name: [YOUR NAME]</div>
      <div class="list-item">Address: [YOUR ADDRESS]</div>
      <div class="list-item">Phone: [YOUR PHONE]</div>
      <div class="list-item">Email: [YOUR EMAIL]</div>
    </div>
  </div>

  <div class="closing">
    <p>Thank you for your prompt attention to this request. I look forward to receiving the requested records.</p>
    <p>Respectfully,</p>
  </div>

  <div class="signature">
    <p>[YOUR NAME]<br>
    [DATE]</p>
  </div>

  <div class="footer">
    <p>Generated by Luminari V2 Civic-Forensic Operating System</p>
    <p>Case ID: ${caseData.record_id} | Jurisdiction: ${caseData.jurisdiction}</p>
  </div>
</body>
</html>
  `;
}

// ─── Case Report ────────────────────────────────────────────────────────────

export function generateCaseReport(exportPayload: ExportPayload): string {
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const frictionPercent = ((exportPayload.derived_context?.avg_friction ?? 0) * 100).toFixed(1);
  const riskLevel =
    parseFloat(frictionPercent) > 70 ? "HIGH" : parseFloat(frictionPercent) > 40 ? "MEDIUM" : "LOW";

  const evidenceTable = exportPayload.evidence
    ? exportPayload.evidence
        .map(
          (e) =>
            `<tr><td>${e.source_type}</td><td>${(e.confidence * 100).toFixed(0)}%</td><td>${e.content.substring(0, 100)}...</td></tr>`
        )
        .join("")
    : "<tr><td colspan='3'>No evidence items</td></tr>";

  const findingsTable = exportPayload.findings
    ? exportPayload.findings
        .map((f) => `<tr><td>${f.severity}</td><td>${f.description}</td></tr>`)
        .join("")
    : "<tr><td colspan='2'>No findings</td></tr>";

  const statutesTable = exportPayload.statutes
    ? exportPayload.statutes
        .map((s) => `<tr><td>${s.citation}</td><td>${s.title}</td></tr>`)
        .join("")
    : "<tr><td colspan='2'>No statutes cited</td></tr>";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Case Report — ${exportPayload.record_id}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
      max-width: 8.5in;
      margin: 0;
      padding: 0.5in;
      color: #333;
      background: #fff;
    }
    .cover-page {
      page-break-after: always;
      text-align: center;
      padding: 2in 0;
      border-bottom: 3px solid #1a1a1a;
      margin-bottom: 1in;
    }
    .cover-page h1 {
      font-size: 28pt;
      margin: 0.5in 0;
      color: #1a1a1a;
    }
    .cover-page .meta {
      font-size: 12pt;
      margin: 0.25in 0;
      color: #666;
    }
    .section {
      margin-bottom: 0.75in;
      page-break-inside: avoid;
    }
    .section h2 {
      font-size: 14pt;
      font-weight: bold;
      border-bottom: 2px solid #1a1a1a;
      padding-bottom: 0.1in;
      margin: 0.5in 0 0.25in 0;
      color: #1a1a1a;
    }
    .section h3 {
      font-size: 12pt;
      font-weight: bold;
      margin: 0.25in 0 0.1in 0;
      color: #333;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.25in;
      margin: 0.25in 0;
    }
    .summary-card {
      border: 1px solid #ddd;
      padding: 0.2in;
      background: #f9f9f9;
      font-size: 10pt;
    }
    .summary-card .label {
      font-weight: bold;
      color: #666;
      font-size: 9pt;
      text-transform: uppercase;
    }
    .summary-card .value {
      font-size: 14pt;
      font-weight: bold;
      color: #1a1a1a;
      margin-top: 0.05in;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 0.25in 0;
      font-size: 10pt;
    }
    th {
      background: #1a1a1a;
      color: #fff;
      padding: 0.1in;
      text-align: left;
      font-weight: bold;
    }
    td {
      padding: 0.1in;
      border-bottom: 1px solid #ddd;
    }
    tr:nth-child(even) {
      background: #f9f9f9;
    }
    .footer {
      margin-top: 1in;
      padding-top: 0.25in;
      border-top: 1px solid #ddd;
      font-size: 9pt;
      color: #999;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="cover-page">
    <h1>CASE REPORT</h1>
    <div class="meta">
      <p><strong>Case ID:</strong> ${exportPayload.record_id}</p>
      <p><strong>Jurisdiction:</strong> ${exportPayload.jurisdiction}</p>
      <p><strong>System:</strong> ${exportPayload.system_primary}</p>
      <p><strong>Problem Type:</strong> ${exportPayload.problem_type}</p>
      <p><strong>Generated:</strong> ${dateStr}</p>
      <p><strong>Schema Version:</strong> ${exportPayload.schema_version}</p>
    </div>
  </div>

  <div class="section">
    <h2>Executive Summary</h2>
    <div class="summary-grid">
      <div class="summary-card">
        <div class="label">Average Friction</div>
        <div class="value">${frictionPercent}%</div>
      </div>
      <div class="summary-card">
        <div class="label">Risk Level</div>
        <div class="value">${riskLevel}</div>
      </div>
      <div class="summary-card">
        <div class="label">Evidence Items</div>
        <div class="value">${exportPayload.source_facts?.evidence_count || 0}</div>
      </div>
      <div class="summary-card">
        <div class="label">Findings</div>
        <div class="value">${exportPayload.source_facts?.finding_count || 0}</div>
      </div>
    </div>
    <p>This report documents systemic issues identified in the ${exportPayload.system_primary} system affecting ${exportPayload.jurisdiction}. The analysis reveals significant friction points and coordination challenges requiring escalation and intervention.</p>
  </div>

  <div class="section">
    <h2>Evidence</h2>
    <p>Total evidence items: ${exportPayload.source_facts?.evidence_count || 0}</p>
    <table>
      <thead>
        <tr>
          <th>Source Type</th>
          <th>Confidence</th>
          <th>Content Summary</th>
        </tr>
      </thead>
      <tbody>
        ${evidenceTable}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>Findings</h2>
    <p>Total findings: ${exportPayload.source_facts?.finding_count || 0}</p>
    <table>
      <thead>
        <tr>
          <th>Severity</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        ${findingsTable}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>Coordination Analysis</h2>
    <p>Systems Involved: ${exportPayload.derived_context?.dominant_system || "N/A"}</p>
    <p>Deadlocked Issues: ${exportPayload.derived_context?.coordination_summary?.deadlocked || 0}</p>
    <p>Issues with Conflicts: ${exportPayload.derived_context?.coordination_summary?.with_conflicts || 0}</p>
  </div>

  <div class="section">
    <h2>Escalation Pathways</h2>
    <p>Total remedy pathways: ${exportPayload.remedy_paths?.length || 0}</p>
    ${
      exportPayload.remedy_paths
        ? exportPayload.remedy_paths
            .map((p) => `<p><strong>${p.type}</strong> (${p.timeline_days} days) ${p.primary ? "[PRIMARY]" : ""}</p>`)
            .join("")
        : "<p>No remedy pathways defined.</p>"
    }
  </div>

  <div class="section">
    <h2>Actions Recommended</h2>
    <p>Total actions queued: ${exportPayload.source_facts?.action_count || 0}</p>
    <p>Actions are detailed in the accompanying action bundle and transmission endpoints.</p>
  </div>

  <div class="section">
    <h2>Appendix: Legal References</h2>
    <table>
      <thead>
        <tr>
          <th>Citation</th>
          <th>Title</th>
        </tr>
      </thead>
      <tbody>
        ${statutesTable}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>Appendix: Grounding Entities</h2>
    ${
      exportPayload.grounding_entities
        ? exportPayload.grounding_entities
            .map((e) => `<p><strong>${e.name}</strong> (${e.type}) — ${e.role}</p>`)
            .join("")
        : "<p>No grounding entities defined.</p>"
    }
  </div>

  <div class="footer">
    <p>Luminari V2 Civic-Forensic Operating System</p>
    <p>Case: ${exportPayload.record_id} | Generated: ${dateStr}</p>
  </div>
</body>
</html>
  `;
}

// ─── Escalation Letter (Foundations/Nonprofits) ──────────────────────────────

export function generateEscalationLetter(
  caseData: CaseData,
  targetOrg: string,
  orgType: "nonprofit_advocacy" | "legal_aid_foundation"
): string {
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const topFindings = caseData.findings ? caseData.findings.slice(0, 3) : [];
  const findingsList = topFindings.map((f) => `• ${f.description} (${f.severity})`).join("\n");

  const askText =
    orgType === "nonprofit_advocacy"
      ? "We seek your organization's support in bringing public attention to these systemic issues through advocacy, public education, and policy engagement."
      : "We request your organization's legal expertise and resources to provide representation, file amicus briefs, or support litigation addressing these systemic issues.";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Escalation Letter — ${caseData.record_id}</title>
  <style>
    body {
      font-family: "Times New Roman", Times, serif;
      line-height: 1.6;
      max-width: 8.5in;
      margin: 0.5in auto;
      padding: 0;
      color: #000;
      background: #fff;
    }
    .header {
      text-align: center;
      margin-bottom: 1in;
      border-bottom: 2px solid #000;
      padding-bottom: 0.25in;
    }
    .header h1 {
      margin: 0;
      font-size: 16pt;
      font-weight: bold;
    }
    .header p {
      margin: 0.1in 0;
      font-size: 10pt;
    }
    .letter-date {
      text-align: left;
      margin-bottom: 0.5in;
      font-size: 11pt;
    }
    .recipient {
      margin-bottom: 0.5in;
      font-size: 11pt;
    }
    .salutation {
      margin-bottom: 0.3in;
      font-size: 11pt;
    }
    .body {
      font-size: 11pt;
      text-align: justify;
    }
    .body p {
      margin: 0.25in 0;
      text-indent: 0.5in;
    }
    .body p:first-of-type {
      text-indent: 0.5in;
    }
    .list {
      margin: 0.25in 0.5in;
      font-size: 11pt;
    }
    .list-item {
      margin: 0.1in 0;
    }
    .closing {
      margin-top: 0.5in;
      font-size: 11pt;
    }
    .signature {
      margin-top: 0.5in;
      font-size: 11pt;
    }
    .footer {
      margin-top: 1in;
      border-top: 1px solid #ccc;
      padding-top: 0.25in;
      font-size: 9pt;
      color: #666;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>REQUEST FOR ADVOCACY SUPPORT</h1>
    <p>Case ID: ${caseData.record_id}</p>
    <p>Jurisdiction: ${caseData.jurisdiction}</p>
  </div>

  <div class="letter-date">
    ${dateStr}
  </div>

  <div class="recipient">
    <strong>${targetOrg}</strong><br>
    [ORGANIZATION ADDRESS]<br>
    [CITY, STATE ZIP]
  </div>

  <div class="salutation">
    Re: Request for Advocacy Support — Systemic Issues in ${caseData.system_primary} — ${caseData.jurisdiction}
  </div>

  <div class="body">
    <p>Dear ${targetOrg}:</p>

    <p>I am writing to request your organization's support in addressing systemic issues identified in Case ${caseData.record_id}. Our analysis has documented significant friction points and coordination failures in the ${caseData.system_primary} system affecting residents of ${caseData.jurisdiction}.</p>

    <p><strong>Key Findings:</strong></p>
    <div class="list">
      ${findingsList}
    </div>

    <p><strong>Evidence Base:</strong></p>
    <p>This assessment is grounded in ${caseData.evidence?.length || 0} evidence items with an average confidence level of ${caseData.evidence ? (caseData.evidence.reduce((sum, e) => sum + e.confidence, 0) / caseData.evidence.length * 100).toFixed(0) : 0}%. The issues identified are supported by the following legal authorities:</p>
    <div class="list">
      ${caseData.statutes ? caseData.statutes.map((s) => `<div class="list-item">${s.citation} — ${s.title}</div>`).join("") : "<div class='list-item'>Applicable federal and state law</div>"}
    </div>

    <p><strong>Why This Matters:</strong></p>
    <p>The systemic issues documented in this case reflect broader coordination failures and enforcement gaps that affect vulnerable populations. The friction coefficient and alignment gaps identified suggest that current remedies are insufficient and that escalation to advocacy and legal intervention is warranted.</p>

    <p><strong>Specific Request:</strong></p>
    <p>${askText}</p>

    <p>We believe your organization's expertise and resources are critical to achieving meaningful change. Attached is the full case report and supporting documentation.</p>

    <p><strong>Contact Information:</strong></p>
    <div class="list">
      <div class="list-item">Name: [YOUR NAME]</div>
      <div class="list-item">Address: [YOUR ADDRESS]</div>
      <div class="list-item">Phone: [YOUR PHONE]</div>
      <div class="list-item">Email: [YOUR EMAIL]</div>
    </div>
  </div>

  <div class="closing">
    <p>I look forward to discussing how we can work together to address these systemic issues.</p>
    <p>Respectfully,</p>
  </div>

  <div class="signature">
    <p>[YOUR NAME]<br>
    [DATE]</p>
  </div>

  <div class="footer">
    <p>Generated by Luminari V2 Civic-Forensic Operating System</p>
    <p>Case ID: ${caseData.record_id} | Jurisdiction: ${caseData.jurisdiction}</p>
  </div>
</body>
</html>
  `;
}

// ─── Utility: Open HTML in new window for print/save ────────────────────────

export function openDocumentForPrint(html: string, title: string = "Document"): void {
  const newWindow = window.open("", "_blank");
  if (newWindow) {
    newWindow.document.write(html);
    newWindow.document.close();
    newWindow.document.title = title;
    // Auto-trigger print dialog after a brief delay
    setTimeout(() => newWindow.print(), 500);
  }
}
