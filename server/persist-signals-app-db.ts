import { db, pool } from "./db";

async function persistSignals() {
  try {
    console.log("[Persist] Using app's DB instance");

    // Get document using app's db
    const [docs] = await pool.execute(
      'SELECT id, caseId, textContent FROM documents WHERE id = 60001'
    );
    
    const doc = (docs as any[])[0];
    const caseId = doc.caseId;
    const content = doc.textContent || '';

    console.log(`[Persist] Document 60001 belongs to case ${caseId}`);

    // Extract forms
    const signals: any[] = [];
    
    if (content.includes('medical') || content.includes('provider')) {
      signals.push({
        caseId,
        evidenceId: 60001,
        signalType: 'FORM_DETECTION',
        description: JSON.stringify({
          title: 'Medical Record Form',
          confidence: 0.85,
          domain: 'healthcare'
        })
      });
    }
    
    if (content.includes('billing') || content.includes('charges')) {
      signals.push({
        caseId,
        evidenceId: 60001,
        signalType: 'FORM_DETECTION',
        description: JSON.stringify({
          title: 'Billing/Insurance Form',
          confidence: 0.90,
          domain: 'financial'
        })
      });
    }

    console.log(`[Persist] Extracted ${signals.length} signals`);

    // CRITICAL: Persist using app's pool with explicit logging
    const insertPromises = signals.map(async (signal) => {
      const [result] = await pool.execute(
        `INSERT INTO signals (case_id, evidence_id, signal_type, description, created_at) 
         VALUES (?, ?, ?, ?, NOW())`,
        [signal.caseId, signal.evidenceId, signal.signalType, signal.description]
      );
      console.log(`[Persist] INSERT RESULT:`, result);
      return result;
    });

    const results = await Promise.all(insertPromises);
    console.log(`[Persist] Persisted ${results.length} signals`);

    // Verify persistence
    const [persisted] = await pool.execute(
      'SELECT id, case_id, signal_type FROM signals WHERE case_id = ?',
      [caseId]
    );

    const count = (persisted as any[]).length;
    console.log(`[Persist] Verification: ${count} signals exist for case ${caseId}`);
    
    if (count >= 2) {
      console.log(`✅ SUCCESS`);
      (persisted as any[]).forEach((s: any) => {
        console.log(`   - ID ${s.id}: ${s.signal_type}`);
      });
      process.exit(0);
    } else {
      console.log(`B) FAILURE: Expected 2+ signals, found ${count}`);
      process.exit(1);
    }
  } catch (error) {
    console.log(`B) FAILURE: ${(error as any).message}`);
    console.error(error);
    process.exit(1);
  }
}

persistSignals();
