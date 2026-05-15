#!/usr/bin/env node

/**
 * Setup script for Business Analytics Engine
 * 1. Creates the business_baselines table (if needed)
 * 2. Seeds it with test data
 * 
 * Usage: npx tsx server/run-business-setup.ts
 */

import { pool } from './db';
import { db, businessBaselines } from '../drizzle/schema';

console.log('🚀 Setting up Business Analytics Engine...\n');

async function setup() {
  try {
    // Step 1: Create table if it doesn't exist
    console.log('📋 Creating business_baselines table...');
    
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS \`business_baselines\` (
        \`id\` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
        \`entity_type\` enum('product','expense_category') NOT NULL,
        \`entity_id\` varchar(255) NOT NULL,
        \`avg_amount\` decimal(10,2) NOT NULL,
        \`stddev_amount\` decimal(10,2),
        \`sample_count\` int NOT NULL,
        \`last_updated\` bigint NOT NULL,
        UNIQUE KEY \`idx_entity_type_id\` (\`entity_type\`,\`entity_id\`),
        KEY \`idx_entity_type\` (\`entity_type\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    
    const connection = await pool.getConnection();
    await connection.query(createTableSQL);
    connection.release();
    
    console.log('✅ Table created/verified\n');

    // Step 2: Clear existing data
    console.log('🗑️  Clearing existing baselines...');
    const clearConnection = await pool.getConnection();
    await clearConnection.query('DELETE FROM business_baselines');
    clearConnection.release();
    console.log('✅ Cleared\n');

    // Step 3: Seed test data
    console.log('📝 Seeding test data...\n');

    const productBaselines = [
      { entityType: 'product', entityId: 'PROD_001', avgAmount: '199.99', stddevAmount: '15.50', sampleCount: 145 },
      { entityType: 'product', entityId: 'PROD_002', avgAmount: '89.50', stddevAmount: '8.20', sampleCount: 203 },
      { entityType: 'product', entityId: 'PROD_003', avgAmount: '450.00', stddevAmount: '35.75', sampleCount: 87 },
      { entityType: 'product', entityId: 'PROD_004', avgAmount: '25.99', stddevAmount: '2.10', sampleCount: 512 },
      { entityType: 'product', entityId: 'PROD_005', avgAmount: '1200.00', stddevAmount: '95.50', sampleCount: 42 },
    ];

    const expenseBaselines = [
      { entityType: 'expense_category', entityId: 'MARKETING', avgAmount: '5000.00', stddevAmount: '750.00', sampleCount: 52 },
      { entityType: 'expense_category', entityId: 'OPERATIONS', avgAmount: '12000.00', stddevAmount: '1500.00', sampleCount: 48 },
      { entityType: 'expense_category', entityId: 'PAYROLL', avgAmount: '45000.00', stddevAmount: '2000.00', sampleCount: 52 },
      { entityType: 'expense_category', entityId: 'UTILITIES', avgAmount: '3500.00', stddevAmount: '400.00', sampleCount: 52 },
      { entityType: 'expense_category', entityId: 'SUPPLIES', avgAmount: '2000.00', stddevAmount: '300.00', sampleCount: 52 },
    ];

    const allBaselines = [...productBaselines, ...expenseBaselines];
    const now = Date.now();

    const seedConnection = await pool.getConnection();
    
    for (const baseline of allBaselines) {
      const sql = `
        INSERT INTO business_baselines 
        (entity_type, entity_id, avg_amount, stddev_amount, sample_count, last_updated)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      await seedConnection.query(sql, [
        baseline.entityType,
        baseline.entityId,
        baseline.avgAmount,
        baseline.stddevAmount,
        baseline.sampleCount,
        now,
      ]);
      
      console.log(`  ✅ ${baseline.entityType}: ${baseline.entityId} (avg: $${baseline.avgAmount})`);
    }
    
    seedConnection.release();

    // Step 4: Verify
    console.log('\n✨ Verification:');
    
    const verifyConnection = await pool.getConnection();
    const [rows] = await verifyConnection.query('SELECT COUNT(*) as count FROM business_baselines');
    const [productCount] = await verifyConnection.query("SELECT COUNT(*) as count FROM business_baselines WHERE entity_type = 'product'");
    const [expenseCount] = await verifyConnection.query("SELECT COUNT(*) as count FROM business_baselines WHERE entity_type = 'expense_category'");
    verifyConnection.release();

    console.log(`  📊 Total baselines: ${rows[0].count}`);
    console.log(`  📦 Products: ${productCount[0].count}`);
    console.log(`  💰 Expense Categories: ${expenseCount[0].count}`);
    console.log('\n🎉 Business Analytics Engine is ready!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error during setup:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setup();
