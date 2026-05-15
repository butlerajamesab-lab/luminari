/**
 * Gate 3 — Detailed Diff Analysis
 * 
 * Runs extraction twice for a single document and produces a field-by-field
 * diff report categorizing every difference.
 */

import mysql from "mysql2/promise";
import crypto from "crypto";

const DOC_ID = 30001; // Smallest doc — fewest outputs, easiest to diff

let pool;
async function getPool() {
  if (!pool) pool = mysql.createPool(process.env.DATABASE_URL);
  return pool;
}

async function clearDocumentOutputs(docId) {
  const db = await getPool();
  const [docs] = await db.query("SELECT caseId FROM documents WHERE id = ?", [docId]);
  if (docs.length === 0) throw new Error(`Document ${docId} not found`);

  await db.query("DELETE FROM entity_roles WHERE documentId = ?", [docId]);
  await db.query("DELETE FROM signal_flags WHERE documentId = ?", [docId]);
  await db.query("DELETE FROM claims WHERE documentId = ?", [docId]);
  await db.query("DELETE FROM quotes WHERE documentId = ?", [docId]);
  await db.query(`
    UPDATE documents 
    SET status = 'uploaded', textContent = NULL, pageCount = NULL, 
        documentType = NULL, documentPurpose = NULL, aiMetadata = NULL,
        errorMessage = NULL, retryCount = 0
    WHERE id = ?
  `, [docId]);
  console.log(`  [Clear] Document ${docId} outputs cleared`);
}

async function runExtraction(docId) {
  const { processDocument } = await import("./analysis-pipeline.ts");
  const start = Date.now();
  await processDocument(docId);
  console.log(`  [Extract] Done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

async function exportFullOutput(docId) {
  const db = await getPool();

  const [docMeta] = await db.query(
    "SELECT textContent, documentType, documentPurpose, aiMetadata FROM documents WHERE id = ?", [docId]
  );
  const [quotes] = await db.query(
    "SELECT quoteText, pageNumber, context, statementOrigin FROM quotes WHERE documentId = ? ORDER BY quoteText, pageNumber", [docId]
  );
  const [claims] = await db.query(
    "SELECT claimText, claimType, dateReferenced, claimStatementOrigin, evidentiaryWeight, entitiesInvolved FROM claims WHERE documentId = ? ORDER BY claimType, claimText", [docId]
  );
  const [entityRoles] = await db.query(
    `SELECT e.name, e.type, e.description, er.role
     FROM entity_roles er INNER JOIN entities e ON er.entityId = e.id
     WHERE er.documentId = ? ORDER BY e.name, e.type, er.role`, [docId]
  );
  const [signalFlags] = await db.query(
    "SELECT flagType, description FROM signal_flags WHERE documentId = ? ORDER BY flagType, description", [docId]
  );

  return {
    textContent: docMeta[0]?.textContent || "",
    documentType: docMeta[0]?.documentType || null,
    documentPurpose: docMeta[0]?.documentPurpose || null,
    aiMetadata: docMeta[0]?.aiMetadata || null,
    quotes,
    claims,
    entityRoles,
    signalFlags,
  };
}

function diffArrays(label, arr1, arr2, keyFn) {
  console.log(`\n  === ${label} ===`);
  console.log(`  Run 1 count: ${arr1.length}, Run 2 count: ${arr2.length}`);
  
  if (arr1.length !== arr2.length) {
    console.log(`  ⚠ COUNT DRIFT: ${arr1.length} → ${arr2.length}`);
  }

  // Match by key function
  const map1 = new Map();
  const map2 = new Map();
  arr1.forEach((item, i) => map1.set(keyFn(item), { item, idx: i }));
  arr2.forEach((item, i) => map2.set(keyFn(item), { item, idx: i }));

  let matched = 0, onlyIn1 = 0, onlyIn2 = 0, contentDiff = 0;

  for (const [key, { item }] of map1) {
    if (map2.has(key)) {
      const item2 = map2.get(key).item;
      const j1 = JSON.stringify(item);
      const j2 = JSON.stringify(item2);
      if (j1 === j2) {
        matched++;
      } else {
        contentDiff++;
        console.log(`  ⚠ CONTENT DRIFT for key "${key.substring(0, 60)}...":`);
        // Find which fields differ
        for (const field of Object.keys(item)) {
          if (JSON.stringify(item[field]) !== JSON.stringify(item2[field])) {
            console.log(`    Field "${field}":`);
            console.log(`      Run 1: ${JSON.stringify(item[field]).substring(0, 100)}`);
            console.log(`      Run 2: ${JSON.stringify(item2[field]).substring(0, 100)}`);
          }
        }
      }
    } else {
      onlyIn1++;
      console.log(`  ⚠ ONLY IN RUN 1: "${key.substring(0, 80)}"`);
    }
  }

  for (const [key] of map2) {
    if (!map1.has(key)) {
      onlyIn2++;
      console.log(`  ⚠ ONLY IN RUN 2: "${key.substring(0, 80)}"`);
    }
  }

  console.log(`  Summary: ${matched} matched, ${contentDiff} content-drifted, ${onlyIn1} only-in-run1, ${onlyIn2} only-in-run2`);
  return { matched, contentDiff, onlyIn1, onlyIn2 };
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`Gate 3 — Detailed Diff Analysis (Doc ${DOC_ID})`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Run 1
  console.log("=== RUN 1 ===");
  await clearDocumentOutputs(DOC_ID);
  await runExtraction(DOC_ID);
  const out1 = await exportFullOutput(DOC_ID);

  // Run 2
  console.log("\n=== RUN 2 ===");
  await clearDocumentOutputs(DOC_ID);
  await runExtraction(DOC_ID);
  const out2 = await exportFullOutput(DOC_ID);

  // Diff analysis
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("FIELD-BY-FIELD DIFF ANALYSIS");
  console.log("═══════════════════════════════════════════════════════════════");

  // Text extraction comparison
  console.log("\n  === textContent ===");
  const textHash1 = crypto.createHash("sha256").update(out1.textContent).digest("hex").substring(0, 16);
  const textHash2 = crypto.createHash("sha256").update(out2.textContent).digest("hex").substring(0, 16);
  console.log(`  Run 1 hash: ${textHash1} (${out1.textContent.length} chars)`);
  console.log(`  Run 2 hash: ${textHash2} (${out2.textContent.length} chars)`);
  console.log(`  Text extraction match: ${textHash1 === textHash2 ? "✅" : "❌"}`);
  if (textHash1 !== textHash2) {
    // Find first difference
    for (let i = 0; i < Math.max(out1.textContent.length, out2.textContent.length); i++) {
      if (out1.textContent[i] !== out2.textContent[i]) {
        console.log(`  First diff at char ${i}:`);
        console.log(`    Run 1: ...${out1.textContent.substring(Math.max(0, i - 20), i + 40)}...`);
        console.log(`    Run 2: ...${out2.textContent.substring(Math.max(0, i - 20), i + 40)}...`);
        break;
      }
    }
  }

  // Document metadata
  console.log("\n  === documentType ===");
  console.log(`  Run 1: ${out1.documentType}`);
  console.log(`  Run 2: ${out2.documentType}`);
  console.log(`  Match: ${out1.documentType === out2.documentType ? "✅" : "❌"}`);

  console.log("\n  === documentPurpose ===");
  console.log(`  Run 1: ${(out1.documentPurpose || "").substring(0, 120)}`);
  console.log(`  Run 2: ${(out2.documentPurpose || "").substring(0, 120)}`);
  console.log(`  Match: ${out1.documentPurpose === out2.documentPurpose ? "✅" : "❌"}`);

  // Quotes
  diffArrays("quotes", out1.quotes, out2.quotes, 
    q => `${q.quoteText?.substring(0, 50)}|${q.pageNumber}`);

  // Claims
  diffArrays("claims", out1.claims, out2.claims,
    c => `${c.claimType}|${c.claimText?.substring(0, 50)}`);

  // Entity roles
  diffArrays("entityRoles", out1.entityRoles, out2.entityRoles,
    er => `${er.name}|${er.type}|${er.role}`);

  // Signal flags
  diffArrays("signalFlags", out1.signalFlags, out2.signalFlags,
    sf => `${sf.flagType}|${sf.description?.substring(0, 50)}`);

  await pool.end();
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
