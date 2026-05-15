import { db } from "../db";
import { sql } from "drizzle-orm";
import { documents } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import fs from "fs";
import crypto from "crypto";

async function updateFilePointer() {
  try {
    const filePath = "/home/ubuntu/uploads/test_insurance_policy.pdf";
    
    console.log("[UPDATE] Checking if file exists...");
    if (!fs.existsSync(filePath)) {
      console.error("[ERROR] File not found:", filePath);
      process.exit(1);
    }
    
    const fileSize = fs.statSync(filePath).size;
    console.log("[UPDATE] ✅ File exists, size:", fileSize, "bytes");
    
    console.log("[UPDATE] Reading file to verify it's readable...");
    const fileContent = fs.readFileSync(filePath);
    console.log("[UPDATE] ✅ File readable, content size:", fileContent.length);
    
    // Calculate SHA256 hash
    const hash = crypto.createHash("sha256").update(fileContent).digest("hex");
    console.log("[UPDATE] File SHA256:", hash);
    
    console.log("[UPDATE] Updating documents table...");
    
    // Update the test document with real file path
    await db
      .update(documents)
      .set({
        s3Url: `file://${filePath}`,
        s3Key: filePath,
        fileSize: fileSize,
        sha256Hash: hash,
      })
      .where(eq(documents.id, 1));
    
    console.log("[UPDATE] ✅ Document updated with real file pointer");
    
    // Verify update
    const updated = await db
      .select()
      .from(documents)
      .where(eq(documents.id, 1));
    
    if (updated.length > 0) {
      const doc = updated[0];
      console.log("[VERIFY] Updated document:");
      console.log("  - s3Key:", doc.s3Key);
      console.log("  - s3Url:", doc.s3Url);
      console.log("  - fileSize:", doc.fileSize);
      console.log("  - sha256Hash:", doc.sha256Hash);
    }
    
    console.log("[UPDATE] ✅ FILE POINTER ESTABLISHED");
    process.exit(0);
  } catch (error) {
    console.error("[ERROR] Failed:", error);
    process.exit(1);
  }
}

updateFilePointer();
