#!/usr/bin/env node

/**
 * Seed script for Business Analytics Engine
 * Populates business_baselines table with test data
 * 
 * Usage: npx tsx server/seed-business-baselines.ts
 */

import { db, pool } from './db';
import { businessBaselines } from '../drizzle/schema';

console.log('🌱 Seeding Business Baselines...\n');

// Product baselines (expected prices)
const productBaselines = [
  { entityType: 'product' as const, entityId: 'PROD_001', avgAmount: '199.99', stddevAmount: '15.50', sampleCount: 145 },
  { entityType: 'product' as const, entityId: 'PROD_002', avgAmount: '89.50', stddevAmount: '8.20', sampleCount: 203 },
  { entityType: 'product' as const, entityId: 'PROD_003', avgAmount: '450.00', stddevAmount: '35.75', sampleCount: 87 },
  { entityType: 'product' as const, entityId: 'PROD_004', avgAmount: '25.99', stddevAmount: '2.10', sampleCount: 512 },
  { entityType: 'product' as const, entityId: 'PROD_005', avgAmount: '1200.00', stddevAmount: '95.50', sampleCount: 42 },
];

// Expense category baselines (expected spending)
const expenseBaselines = [
  { entityType: 'expense_category' as const, entityId: 'MARKETING', avgAmount: '5000.00', stddevAmount: '750.00', sampleCount: 52 },
  { entityType: 'expense_category' as const, entityId: 'OPERATIONS', avgAmount: '12000.00', stddevAmount: '1500.00', sampleCount: 48 },
  { entityType: 'expense_category' as const, entityId: 'PAYROLL', avgAmount: '45000.00', stddevAmount: '2000.00', sampleCount: 52 },
  { entityType: 'expense_category' as const, entityId: 'UTILITIES', avgAmount: '3500.00', stddevAmount: '400.00', sampleCount: 52 },
  { entityType: 'expense_category' as const, entityId: 'SUPPLIES', avgAmount: '2000.00', stddevAmount: '300.00', sampleCount: 52 },
];

const allBaselines = [...productBaselines, ...expenseBaselines];

async function seed() {
  try {
    // Clear existing baselines
    console.log('🗑️  Clearing existing baselines...');
    await db.delete(businessBaselines);

    // Insert new baselines
    console.log('📝 Inserting baselines...\n');
    
    const now = Date.now();
    
    for (const baseline of allBaselines) {
      await db.insert(businessBaselines).values({
        ...baseline,
        lastUpdated: now,
      });
      
      console.log(`  ✅ ${baseline.entityType}: ${baseline.entityId} (avg: $${baseline.avgAmount})`);
    }

    // Verify insertion
    const rows = await db.select().from(businessBaselines);
    
    console.log(`\n✨ Successfully seeded ${rows.length} baselines!\n`);

    // Show summary
    const productCount = rows.filter(r => r.entityType === 'product').length;
    const expenseCount = rows.filter(r => r.entityType === 'expense_category').length;

    console.log('📊 Summary:');
    console.log(`  Products: ${productCount}`);
    console.log(`  Expense Categories: ${expenseCount}`);
    console.log(`  Total: ${rows.length}\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding baselines:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
