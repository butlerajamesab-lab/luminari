import mysql from "mysql2/promise";
import { db } from "../db";
import { documents } from "../../drizzle/schema";
import { sql } from "drizzle-orm";
import { invokeLLMDeterministic } from "../_core/llm";
import fs from "fs";
import crypto from "crypto";

const dbUrl = process.env.DATABASE_URL || '';
const urlObj = new URL(dbUrl);
const user = urlObj.username;
const password = urlObj.password;
const host = urlObj.hostname;
const port = parseInt(urlObj.port || '4000', 10);
const database = 'luminari_registry';

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("EXTRACTION - DIRECT MYSQL2 CONNECTION");
  console.log("═══════════════════════════════════════════════════════════");
  
  // Create DIRECT MySQL2 connection (not through Drizzle)
  const connection = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    ssl: { rejectUnauthorized: true },
  });

  try {
    // Get document
    const docResult = await db.select().from(documents).where(sql`id = 1`);
    if (docResult.length === 0) {
      console.log("Document not found");
      return;
    }

    const doc = docResult[0];
    const caseId = doc.caseId;
    console.log("START EXTRACTION", { documentId: 1, caseId });

    // Extract text
    const text = `ADMINISTRATIVE DOCUMENT - CASE FILE

Agency: Department of Health and Human Services (DHHS)
Jurisdiction: Madison County, Wisconsin

MANDATORY DUTIES:
- RCW 5.70.010 compliance required
- Wisconsin Administrative Code § 101.02 applies

INSTITUTIONAL FAILURES:
- Commissioner failed to review expert medical evaluations
- Agency delayed response by 45 days

ENTITIES PRESENT:
- Agency: Wisconsin Department of Insurance
- Requirement: Background check, financial disclosure
- Deadline: 30 days from approval
- Form: DHS-2026-A
- Statute: RCW 5.70.010
- Responsible Official: Commissioner James Smith
- Location: Madison County Courthouse`;

    console.log("[Extract] Text length:", text.length);

    // Extract entities via LLM
    const prompt = `Extract entities from this text. Return ONLY JSON array.
Categories: AGENCY, REQUIREMENT, DEADLINE, FORM, STATUTE, PERSON, LOCATION, INSTITUTIONAL_FAILURE
Text: ${text}
Format: [{"name": "entity", "type": "CATEGORY"}]`;

    const response = await invokeLLMDeterministic({
      messages: [
        { role: "system", content: "Extract entities. Return JSON array only." },
        { role: "user", content: prompt }
      ],
      documentHash: crypto.createHash('sha256').update(text).digest('hex'),
      pass: `pass_1_${Date.now()}`
    });

    let content = response?.choices?.[0]?.message?.content || "[]";
    if (content.includes("```json")) {
      content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    }
    content = content.trim();

    console.log("[Extract] LLM response:", content.slice(0, 300));

    let entities_list = [];
    try {
      entities_list = JSON.parse(content);
      if (!Array.isArray(entities_list)) entities_list = [];
    } catch (e) {
      console.error("[Extract] Parse error:", e);
      entities_list = [];
    }

    console.log("[Extract] Entities parsed:", entities_list.length);

    // INSERT using DIRECT MySQL2 connection
    let insertedCount = 0;
    for (const entity of entities_list) {
      try {
        const query = `INSERT INTO entities (caseId, name, type, engineVersion, laneId, snapshotId) VALUES (?, ?, ?, 'v1', 'default', 1)`;
        const values = [caseId, entity.name, entity.type];
        
        console.log(`[Direct SQL] Inserting: ${entity.name} (${entity.type})`);
        
        const [result] = await connection.execute(query, values);
        console.log(`[Direct SQL] ✅ Inserted entity: ${entity.name}`);
        insertedCount++;
      } catch (error: any) {
        console.error(`[Direct SQL] ❌ Failed: ${error.message}`);
      }
    }

    console.log(`[Direct SQL] Total inserted: ${insertedCount}`);

    // Verify
    const [rows] = await connection.execute(`SELECT COUNT(*) as count FROM entities WHERE caseId = ?`, [caseId]);
    console.log("[Verify] Entities in case:", (rows as any)[0].count);

  } finally {
    await connection.end();
  }
}

main().catch(console.error);
