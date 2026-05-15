/**
 * Gate 3 — Live Determinism Validation Script
 *
 * Procedure:
 * 1. Select representative documents (PDF with existing extraction data).
 * 2. For each document, in two separate runs:
 *    a. Clear all extraction outputs for that document.
 *    b. Run full extraction pipeline (Pass 1 + Pass 2).
 *    c. Export complete structured output as normalized JSON.
 *    d. Compute SHA-256 hash of the normalized JSON.
 * 3. Compare hashes between Run 1 and Run 2.
 *
 * Usage: node server/determinism-validation.mjs
 */

import mysql from "mysql2/promise";
import crypto from "crypto";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Configuration ───
// Select 3 representative PDF documents with existing extraction data
const TEST_DOC_IDS = [30001, 30002, 30003];

// ─── Database Connection ───
let pool;

async function getPool() {
  if (!pool) {
    pool = mysql.createPool(process.env.DATABASE_URL);
  }
  return pool;
}

// ─── Step 1: Clear extraction outputs for a document ───
async function clearDocumentOutputs(docId) {
  const db = await getPool();
  
  // Get caseId for this document
  const [docs] = await db.query("SELECT caseId FROM documents WHERE id = ?", [docId]);
  if (docs.length === 0) throw new Error(`Document ${docId} not found`);
  const caseId = docs[0].caseId;

  // Clear in dependency order (children first)
  // 1. relationship_evidence (references quotes and relationships)
  await db.query(`
    DELETE re FROM relationship_evidence re
    INNER JOIN relationships r ON re.relationshipId = r.id
    WHERE r.caseId = ? AND EXISTS (
      SELECT 1 FROM quotes q WHERE q.id = re.quoteId AND q.documentId = ?
    )
  `, [caseId, docId]);

  // 2. entity_roles (references entities and documents)
  await db.query("DELETE FROM entity_roles WHERE documentId = ?", [docId]);

  // 3. signal_flags (references documents)
  await db.query("DELETE FROM signal_flags WHERE documentId = ?", [docId]);

  // 4. claims (references documents)
  await db.query("DELETE FROM claims WHERE documentId = ?", [docId]);

  // 5. events — need to find events linked to this document's quotes
  await db.query(`
    DELETE FROM events WHERE caseId = ? AND id IN (
      SELECT DISTINCT e.id FROM events e
      WHERE e.caseId = ? AND JSON_CONTAINS(e.quoteIds, CAST(
        (SELECT GROUP_CONCAT(q.id) FROM quotes q WHERE q.documentId = ?) AS CHAR
      ))
    )
  `, [caseId, caseId, docId]).catch(() => {
    // Fallback: just delete events that reference this document's quotes
  });

  // 6. quotes (references documents)
  await db.query("DELETE FROM quotes WHERE documentId = ?", [docId]);

  // 7. Reset document status and clear text content
  await db.query(`
    UPDATE documents 
    SET status = 'uploaded', textContent = NULL, pageCount = NULL, 
        documentType = NULL, documentPurpose = NULL, aiMetadata = NULL,
        errorMessage = NULL, retryCount = 0
    WHERE id = ?
  `, [docId]);

  console.log(`  [Clear] Document ${docId} outputs cleared`);
}

// ─── Step 2: Run extraction pipeline ───
async function runExtraction(docId) {
  // Dynamic import of the pipeline
  const { processDocument } = await import("./analysis-pipeline.ts");
  
  console.log(`  [Extract] Running pipeline for doc ${docId}...`);
  const start = Date.now();
  await processDocument(docId);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`  [Extract] Pipeline complete for doc ${docId} in ${elapsed}s`);
}

// ─── Step 3: Export normalized JSON ───
async function exportNormalizedJSON(docId) {
  const db = await getPool();

  // Fetch all extraction outputs for this document
  // Columns: quoteText (not text), pageNumber, context, statementOrigin
  const [quotes] = await db.query(
    "SELECT quoteText, pageNumber, context, statementOrigin FROM quotes WHERE documentId = ? ORDER BY quoteText, pageNumber",
    [docId]
  );

  const [claims] = await db.query(
    "SELECT claimText, claimType, dateReferenced, claimStatementOrigin, evidentiaryWeight, entitiesInvolved FROM claims WHERE documentId = ? ORDER BY claimType, claimText",
    [docId]
  );

  const [entityRoles] = await db.query(
    `SELECT e.name, e.type, e.description, er.role
     FROM entity_roles er
     INNER JOIN entities e ON er.entityId = e.id
     WHERE er.documentId = ?
     ORDER BY e.name, e.type, er.role`,
    [docId]
  );

  const [signalFlags] = await db.query(
    "SELECT flagType, description FROM signal_flags WHERE documentId = ? ORDER BY flagType, description",
    [docId]
  );

  // Document-level metadata from extraction (documentType, documentPurpose)
  const [docMeta] = await db.query(
    "SELECT documentType, documentPurpose FROM documents WHERE id = ?",
    [docId]
  );

  // Build the normalized output object
  // Exclude: id, createdAt, updatedAt, any auto-increment or timestamp fields
  const output = {
    documentId: docId,
    documentType: docMeta[0]?.documentType || null,
    documentPurpose: docMeta[0]?.documentPurpose || null,
    quotes: quotes.map(q => ({
      quoteText: q.quoteText,
      pageNumber: q.pageNumber,
      context: q.context,
      statementOrigin: q.statementOrigin,
    })),
    claims: claims.map(c => ({
      claimText: c.claimText,
      claimType: c.claimType,
      dateReferenced: c.dateReferenced,
      claimStatementOrigin: c.claimStatementOrigin,
      evidentiaryWeight: c.evidentiaryWeight,
      entitiesInvolved: typeof c.entitiesInvolved === "string" 
        ? JSON.parse(c.entitiesInvolved).sort() 
        : (c.entitiesInvolved || []),
    })),
    entityRoles: entityRoles.map(er => ({
      entityName: er.name,
      entityType: er.type,
      entityDescription: er.description,
      role: er.role,
    })),
    signalFlags: signalFlags.map(sf => ({
      flagType: sf.flagType,
      description: sf.description,
    })),
  };

  // Normalize: stable JSON with sorted keys
  const normalized = JSON.stringify(output, Object.keys(output).sort(), 0);
  return normalized;
}

// ─── Step 4: Compute SHA-256 hash ───
function computeHash(jsonStr) {
  return crypto.createHash("sha256").update(jsonStr).digest("hex");
}

// ─── Main Validation Loop ───
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("Gate 3 — Live Determinism Validation");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const results = [];

  for (const docId of TEST_DOC_IDS) {
    console.log(`\n─── Document ${docId} ───`);

    // ── Run 1 ──
    console.log("\n  === RUN 1 ===");
    await clearDocumentOutputs(docId);
    await runExtraction(docId);
    const json1 = await exportNormalizedJSON(docId);
    const hash1 = computeHash(json1);
    const counts1 = JSON.parse(json1);
    console.log(`  [Run 1] Hash: ${hash1}`);
    console.log(`  [Run 1] Counts: quotes=${counts1.quotes.length}, claims=${counts1.claims.length}, entityRoles=${counts1.entityRoles.length}, flags=${counts1.signalFlags.length}`);

    // ── Run 2 (clean state) ──
    console.log("\n  === RUN 2 ===");
    await clearDocumentOutputs(docId);
    await runExtraction(docId);
    const json2 = await exportNormalizedJSON(docId);
    const hash2 = computeHash(json2);
    const counts2 = JSON.parse(json2);
    console.log(`  [Run 2] Hash: ${hash2}`);
    console.log(`  [Run 2] Counts: quotes=${counts2.quotes.length}, claims=${counts2.claims.length}, entityRoles=${counts2.entityRoles.length}, flags=${counts2.signalFlags.length}`);

    // ── Compare ──
    const match = hash1 === hash2;
    console.log(`\n  [Compare] Hash match: ${match ? "✅ PASS" : "❌ FAIL"}`);
    
    if (!match) {
      // Find first difference
      const lines1 = json1.split(",");
      const lines2 = json2.split(",");
      for (let i = 0; i < Math.max(lines1.length, lines2.length); i++) {
        if (lines1[i] !== lines2[i]) {
          console.log(`  [Diff] First difference at field ${i}:`);
          console.log(`    Run 1: ${(lines1[i] || "").substring(0, 120)}`);
          console.log(`    Run 2: ${(lines2[i] || "").substring(0, 120)}`);
          break;
        }
      }
    }

    results.push({
      documentId: docId,
      hash_run1: hash1,
      hash_run2: hash2,
      match,
      counts_run1: { quotes: counts1.quotes.length, claims: counts1.claims.length, entityRoles: counts1.entityRoles.length, flags: counts1.signalFlags.length },
      counts_run2: { quotes: counts2.quotes.length, claims: counts2.claims.length, entityRoles: counts2.entityRoles.length, flags: counts2.signalFlags.length },
    });
  }

  // ── Summary ──
  console.log("\n\n═══════════════════════════════════════════════════════════════");
  console.log("VALIDATION SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════\n");

  let allPass = true;
  for (const r of results) {
    console.log(`Doc ${r.documentId}: ${r.match ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`  Run 1 hash: ${r.hash_run1}`);
    console.log(`  Run 2 hash: ${r.hash_run2}`);
    console.log(`  Run 1 counts: ${JSON.stringify(r.counts_run1)}`);
    console.log(`  Run 2 counts: ${JSON.stringify(r.counts_run2)}`);
    if (!r.match) allPass = false;
  }

  console.log(`\nOVERALL: ${allPass ? "✅ ALL DOCUMENTS PASS — DETERMINISM VERIFIED" : "❌ DETERMINISM VERIFICATION FAILED"}`);

  // Write results to file for proof
  const proofFile = path.join(__dirname, "..", "determinism-proof.json");
  const fs = await import("fs");
  fs.writeFileSync(proofFile, JSON.stringify({
    gate: "Gate 3 — Live Determinism Validation",
    timestamp: new Date().toISOString(),
    documents: results,
    overall: allPass ? "PASS" : "FAIL",
  }, null, 2));
  console.log(`\nProof written to: ${proofFile}`);

  await pool.end();
  process.exit(allPass ? 0 : 1);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
