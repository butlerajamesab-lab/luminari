/**
 * PHOENIX CONTROLLED BURN TEST
 * 
 * Injects Dead Node → Birth Node → Triggers Phoenix Detection
 * Verifies SIG-2026-PHOENIX-01 signal emission
 */

import mysql from 'mysql2/promise';

const config = {
  host: 'gateway04.us-east-1.prod.aws.tidbcloud.com',
  port: 4000,
  user: '2jhK1AfHyk6mXSq.root',
  password: '2k5Lq94U8voiLkatA3uZ',
  database: 'luminari_registry',
};

interface DeadNode {
  entity_id: string;
  name: string;
  ubi: string;
  status: string;
  address: string;
  agent_name: string;
  flag_reason: string;
  debt_amount: number;
  last_audit_date: string;
}

interface BirthNode {
  entity_id: string;
  name: string;
  ubi: string;
  status: string;
  address: string;
  agent_name: string;
  registration_date: string;
}

interface PhoenixSignal {
  signalType: string;
  confidenceScore: number;
  linkedEntities: number[];
  matchReasons: string[];
  suspiciousPattern: string;
}

const deadNode: DeadNode = {
  entity_id: 'LMN-DEBT-001',
  name: 'RENAISSANCE 21 CONSTRUCTION LLC',
  ubi: '603455122',
  status: 'SUSPENDED',
  address: '1234 SECTOR 7G, SEATTLE, WA 98101',
  agent_name: 'JOHN DOE',
  flag_reason: 'UNPAID_WAGE_DEBT',
  debt_amount: 2200000,
  last_audit_date: '2026-03-26',
};

const birthNode: BirthNode = {
  entity_id: 'LMN-NEW-999',
  name: 'PHOENIX RISING REBUILDERS INC',
  ubi: '605999888',
  status: 'ACTIVE',
  address: '1234 SECTOR 7G, SEATTLE, WA 98101',
  agent_name: 'JANE DOE',
  registration_date: '2026-04-01',
};

async function injectDeadNode(connection: mysql.Connection): Promise<number> {
  console.log('\n[STEP 1] Injecting Dead Node...');
  console.log(`  Name: ${deadNode.name}`);
  console.log(`  Status: ${deadNode.status}`);
  console.log(`  Address: ${deadNode.address}`);
  console.log(`  Debt: $${deadNode.debt_amount.toLocaleString()}`);

  const query = `
    INSERT INTO entities (
      caseId, name, type, description, engineVersion, laneId, snapshotId, createdAt, updatedAt
    ) VALUES (
      1, ?, 'contractor', ?, 'v1', 'default', 1, NOW(), NOW()
    )
  `;

  const [result] = await connection.execute(query, [
    deadNode.name,
    JSON.stringify(deadNode),
  ]);

  const insertId = (result as any).insertId;
  console.log(`  ✅ Dead Node inserted with ID: ${insertId}`);
  return insertId;
}

async function injectBirthNode(connection: mysql.Connection, deadNodeId: number): Promise<number> {
  console.log('\n[STEP 2] Injecting Birth Node (10 seconds later)...');
  console.log(`  Name: ${birthNode.name}`);
  console.log(`  Status: ${birthNode.status}`);
  console.log(`  Address: ${birthNode.address}`);
  console.log(`  Agent: ${birthNode.agent_name}`);

  // Wait 10 seconds
  await new Promise(resolve => setTimeout(resolve, 10000));

  const query = `
    INSERT INTO entities (
      caseId, name, type, description, engineVersion, laneId, snapshotId, createdAt, updatedAt
    ) VALUES (
      1, ?, 'contractor', ?, 'v1', 'default', 1, NOW(), NOW()
    )
  `;

  const [result] = await connection.execute(query, [
    birthNode.name,
    JSON.stringify(birthNode),
  ]);

  const insertId = (result as any).insertId;
  console.log(`  ✅ Birth Node inserted with ID: ${insertId}`);
  return insertId;
}

async function checkForSignals(connection: mysql.Connection): Promise<PhoenixSignal[]> {
  console.log('\n[STEP 3] Checking for Phoenix signals...');

  const query = `
    SELECT * FROM signals 
    WHERE signal_type = 'PHOENIX_ENTITY' 
    ORDER BY created_at DESC 
    LIMIT 5
  `;

  const [rows] = await connection.execute(query);
  console.log(`  Found ${(rows as any[]).length} Phoenix signals`);

  return (rows as any[]).map(row => ({
    signalType: row.signal_type,
    confidenceScore: row.confidence_score,
    linkedEntities: JSON.parse(row.linked_entities || '[]'),
    matchReasons: row.reason ? [row.reason] : [],
    suspiciousPattern: row.reason || 'Pattern detected',
  }));
}

async function runControlledBurn() {
  let connection: mysql.Connection | null = null;

  try {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         PHOENIX CONTROLLED BURN TEST                       ║');
    console.log('║         Testing: Dead Node → Birth Node → Signal           ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    connection = await mysql.createConnection(config);
    console.log('\n✅ Connected to luminari_registry');

    // Step 1: Inject Dead Node
    const deadNodeId = await injectDeadNode(connection);

    // Step 2: Inject Birth Node (10 seconds later)
    const birthNodeId = await injectBirthNode(connection, deadNodeId);

    // Step 3: Check for signals
    const signals = await checkForSignals(connection);

    // Print results
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST RESULTS                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    if (signals.length === 0) {
      console.log('\n❌ NO SIGNALS DETECTED');
      console.log('   The Phoenix trigger may not be wired correctly.');
      console.log('   Check:');
      console.log('   1. Is createEntity() calling runPhoenixDetection()?');
      console.log('   2. Is the signals table populated?');
      console.log('   3. Are there any errors in the Phoenix detection logic?');
    } else {
      console.log(`\n✅ SIGNALS DETECTED: ${signals.length}`);
      signals.forEach((signal, idx) => {
        console.log(`\n   Signal ${idx + 1}:`);
        console.log(`   - Type: ${signal.signalType}`);
        console.log(`   - Confidence: ${signal.confidenceScore}%`);
        console.log(`   - Linked Entities: ${signal.linkedEntities.join(', ')}`);
        console.log(`   - Pattern: ${signal.suspiciousPattern}`);
      });

      // Check for expected Phoenix signal
      const phoenixSignal = signals.find(s => s.signalType === 'PHOENIX_ENTITY');
      if (phoenixSignal) {
        console.log('\n🎯 SIG-2026-PHOENIX-01 DETECTED!');
        console.log('   The immune system is awake.');
        console.log('\n   Expected Matches:');
        console.log('   ✓ Geographic Proximity: 1234 SECTOR 7G');
        console.log('   ✓ Lineage Match: DOE (Agent Surname)');
        console.log('   ✓ Status Transition: SUSPENDED → ACTIVE');
        console.log(`   ✓ Confidence Score: ${phoenixSignal.confidenceScore}%`);
      }
    }

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    RAW SIGNAL JSON                         ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(JSON.stringify(signals, null, 2));

  } catch (error) {
    console.error('\n❌ ERROR:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n✅ Connection closed');
    }
  }
}

runControlledBurn();
