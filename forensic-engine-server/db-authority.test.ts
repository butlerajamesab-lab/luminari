/**
 * Database Authority Tests
 * 
 * Verifies that ALL database connections target luminari_registry
 * and that the canonical spine tables exist with expected data.
 */
import { describe, it, expect } from 'vitest';
import { pool } from './db';

describe('Database Authority — Single Source of Truth', () => {
  it('should be connected to luminari_registry', async () => {
    const [rows] = await pool.query('SELECT DATABASE() as db');
    const currentDb = (rows as any[])[0]?.db;
    expect(currentDb).toBe('luminari_registry');
  });

  it('should have canonical spine tables present', async () => {
    const [tables] = await pool.query('SHOW TABLES');
    const tableNames = (tables as any[]).map(r => Object.values(r)[0] as string);
    
    const requiredCanonicalTables = [
      'live_signals',
      'detected_signals',
      'ingested_records',
      'signal_flow_logs',
      'world_nodes',
      'remedy_paths',
      'sunam_gate_log',
    ];
    
    for (const table of requiredCanonicalTables) {
      expect(tableNames).toContain(table);
    }
  });

  it('should have live_signals with data (>1000 rows)', async () => {
    const [rows] = await pool.query('SELECT COUNT(*) as cnt FROM live_signals');
    const count = (rows as any[])[0]?.cnt;
    expect(Number(count)).toBeGreaterThan(1000);
  });

  it('should have detected_signals with data (>100 rows)', async () => {
    const [rows] = await pool.query('SELECT COUNT(*) as cnt FROM detected_signals');
    const count = (rows as any[])[0]?.cnt;
    expect(Number(count)).toBeGreaterThan(100);
  });

  it('should NOT be connected to the default platform database', async () => {
    const [rows] = await pool.query('SELECT DATABASE() as db');
    const currentDb = (rows as any[])[0]?.db;
    expect(currentDb).not.toBe('AXzmPhCfhqjYYjh6uJijzm');
  });

  it('should have registry tables populated', async () => {
    const registryChecks = [
      { table: 'agency_authority_map', minRows: 50 },
      { table: 'registry_programs', minRows: 500 },
      { table: 'unified_resources', minRows: 600 },
    ];
    
    for (const check of registryChecks) {
      const [rows] = await pool.query(`SELECT COUNT(*) as cnt FROM \`${check.table}\``);
      const count = Number((rows as any[])[0]?.cnt);
      expect(count).toBeGreaterThanOrEqual(check.minRows);
    }
  });

  it('should have the db.ts connection override forcing luminari_registry', async () => {
    // Verify the pool config by checking we can query luminari_registry-specific data
    // The default DB (AXzmPhCfhqjYYjh6uJijzm) has only 60 live_signals
    // luminari_registry has 1216+ live_signals
    const [rows] = await pool.query('SELECT COUNT(*) as cnt FROM live_signals');
    const count = Number((rows as any[])[0]?.cnt);
    // If we were on the wrong DB, this would be ~60
    expect(count).toBeGreaterThan(500);
  });
});
