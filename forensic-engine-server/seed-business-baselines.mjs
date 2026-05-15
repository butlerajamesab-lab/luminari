#!/usr/bin/env node

/**
 * Seed script for Business Analytics Engine
 * Populates business_baselines table with test data
 * 
 * Usage: node seed-business-baselines.mjs
 */

import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'forensic_engine',
});

console.log('🌱 Seeding Business Baselines...\n');

// Product baselines (expected prices)
const productBaselines = [
  { entityType: 'product', entityId: 'PROD_001', avgAmount: '199.99', stddevAmount: '15.50', sampleCount: 145 },
  { entityType: 'product', entityId: 'PROD_002', avgAmount: '89.50', stddevAmount: '8.20', sampleCount: 203 },
  { entityType: 'product', entityId: 'PROD_003', avgAmount: '450.00', stddevAmount: '35.75', sampleCount: 87 },
  { entityType: 'product', entityId: 'PROD_004', avgAmount: '25.99', stddevAmount: '2.10', sampleCount: 512 },
  { entityType: 'product', entityId: 'PROD_005', avgAmount: '1200.00', stddevAmount: '95.50', sampleCount: 42 },
];

// Expense category baselines (expected spending)
const expenseBaselines = [
  { entityType: 'expense_category', entityId: 'MARKETING', avgAmount: '5000.00', stddevAmount: '750.00', sampleCount: 52 },
  { entityType: 'expense_category', entityId: 'OPERATIONS', avgAmount: '12000.00', stddevAmount: '1500.00', sampleCount: 48 },
  { entityType: 'expense_category', entityId: 'PAYROLL', avgAmount: '45000.00', stddevAmount: '2000.00', sampleCount: 52 },
  { entityType: 'expense_category', entityId: 'UTILITIES', avgAmount: '3500.00', stddevAmount: '400.00', sampleCount: 52 },
  { entityType: 'expense_category', entityId: 'SUPPLIES', avgAmount: '2000.00', stddevAmount: '300.00', sampleCount: 52 },
];

const allBaselines = [...productBaselines, ...expenseBaselines];

try {
  // Clear existing baselines
  console.log('🗑️  Clearing existing baselines...');
  await connection.execute('TRUNCATE TABLE business_baselines');

  // Insert new baselines
  console.log('📝 Inserting baselines...\n');
  
  for (const baseline of allBaselines) {
    const now = Date.now();
    await connection.execute(
      `INSERT INTO business_baselines 
       (entityType, entityId, avgAmount, stddevAmount, sampleCount, lastUpdated) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        baseline.entityType,
        baseline.entityId,
        baseline.avgAmount,
        baseline.stddevAmount,
        baseline.sampleCount,
        now,
      ]
    );
    
    console.log(`  ✅ ${baseline.entityType}: ${baseline.entityId} (avg: $${baseline.avgAmount})`);
  }

  // Verify insertion
  const [rows] = await connection.execute(
    'SELECT COUNT(*) as count FROM business_baselines'
  );
  
  console.log(`\n✨ Successfully seeded ${rows[0].count} baselines!\n`);

  // Show summary
  const [productCount] = await connection.execute(
    "SELECT COUNT(*) as count FROM business_baselines WHERE entityType = 'product'"
  );
  const [expenseCount] = await connection.execute(
    "SELECT COUNT(*) as count FROM business_baselines WHERE entityType = 'expense_category'"
  );

  console.log('📊 Summary:');
  console.log(`  Products: ${productCount[0].count}`);
  console.log(`  Expense Categories: ${expenseCount[0].count}`);
  console.log(`  Total: ${rows[0].count}\n`);

  process.exit(0);
} catch (error) {
  console.error('❌ Error seeding baselines:', error.message);
  process.exit(1);
} finally {
  await connection.end();
}
