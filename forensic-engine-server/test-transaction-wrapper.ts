import { insertSignalsBatch } from './transaction-wrapper';

async function testBatch() {
  try {
    console.log('[Test] Inserting batch of signals with transaction wrapper');
    
    const signals = [
      {
        caseId: 90007,
        evidenceId: 60001,
        signalType: 'FORM_DETECTION',
        description: JSON.stringify({ title: 'Test Signal 1', confidence: 0.85 })
      },
      {
        caseId: 90007,
        evidenceId: 60001,
        signalType: 'FORM_DETECTION',
        description: JSON.stringify({ title: 'Test Signal 2', confidence: 0.90 })
      }
    ];

    const insertedIds = await insertSignalsBatch(signals);
    console.log(`✅ SUCCESS`);
    console.log(`Inserted ${insertedIds.length} signals with IDs:`, insertedIds);
    
    process.exit(0);
  } catch (error) {
    console.log(`B) FAILURE: ${(error as any).message}`);
    process.exit(1);
  }
}

testBatch();
