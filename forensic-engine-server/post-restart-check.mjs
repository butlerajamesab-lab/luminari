import mysql from "mysql2/promise";
import crypto from "crypto";

const DOC_ID = 30001;
const pool = mysql.createPool(process.env.DATABASE_URL);

// Clear
await pool.query("DELETE FROM entity_roles WHERE documentId = ?", [DOC_ID]);
await pool.query("DELETE FROM signal_flags WHERE documentId = ?", [DOC_ID]);
await pool.query("DELETE FROM claims WHERE documentId = ?", [DOC_ID]);
await pool.query("DELETE FROM quotes WHERE documentId = ?", [DOC_ID]);
await pool.query(`UPDATE documents SET status='uploaded', textContent=NULL, pageCount=NULL, documentType=NULL, documentPurpose=NULL, aiMetadata=NULL, errorMessage=NULL, retryCount=0 WHERE id = ?`, [DOC_ID]);
console.log("Cleared doc 30001");

// Run extraction
const { processDocument } = await import("./analysis-pipeline.ts");
await processDocument(DOC_ID);
console.log("Extraction complete");

// Export
const [quotes] = await pool.query("SELECT quoteText, pageNumber, context, statementOrigin FROM quotes WHERE documentId = ? ORDER BY quoteText, pageNumber", [DOC_ID]);
const [claims] = await pool.query("SELECT claimText, claimType, dateReferenced, claimStatementOrigin, evidentiaryWeight FROM claims WHERE documentId = ? ORDER BY claimType, claimText", [DOC_ID]);
const [entityRoles] = await pool.query("SELECT e.name, e.type, er.role FROM entity_roles er INNER JOIN entities e ON er.entityId = e.id WHERE er.documentId = ? ORDER BY e.name, e.type, er.role", [DOC_ID]);

console.log("POST-RESTART RUN:");
console.log("  quotes:", quotes.length);
console.log("  claims:", claims.length);
console.log("  entityRoles:", entityRoles.length);

const normalized = JSON.stringify({ quotes, claims, entityRoles });
const hash = crypto.createHash("sha256").update(normalized).digest("hex");
console.log("  hash:", hash);

await pool.end();
