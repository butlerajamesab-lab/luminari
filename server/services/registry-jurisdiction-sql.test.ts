import { afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { registryJurisdictionJoin } from './registry-jurisdiction-sql';

// CI supplies PostgreSQL. This exercises the actual SQL with read-only CTEs,
// including duplicate catalog aliases that previously multiplied program rows.
describe.skipIf(!process.env.DATABASE_URL)('registry jurisdiction SQL on PostgreSQL', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  afterAll(async () => { await pool.end(); });

  it('preserves source identities and refuses conflicting state codes', async () => {
    const { rows } = await pool.query(`
      WITH fixtures(id,name,abbreviation) AS (VALUES
        ('nc-id','North Carolina (NC)','NC'),
        ('tx-id','Texas (TX)','TX'), ('us-tx','Texas','TX'),
        ('conflict-a','Conflict','CA'), ('conflict-b','Conflict','NY')
      ), inputs(label,jurisdiction,expected_code,expected_id) AS (VALUES
        ('name','North Carolina','NC','nc-id'),
        ('abbreviation','nc','NC','nc-id'),
        ('source_id','nc-id','NC','nc-id'),
        ('us_code','us-nc','NC','nc-id'),
        ('j_code','j_nc','NC','nc-id'),
        ('j_name','j_North_Carolina','NC','nc-id'),
        ('name_with_code','North Carolina (NC)','NC','nc-id'),
        ('whitespace',' North Carolina ','NC','nc-id'),
        ('duplicate_alias','TX','TX','tx-id'),
        ('exact_id_precedence','us-tx','TX','us-tx'),
        ('unknown','Atlantis',null,null),
        ('conflicting_codes','Conflict',null,null),
        ('empty','',null,null), ('absent',null,null,null)
      )
      SELECT i.label, j.id, j.abbreviation, i.expected_id, i.expected_code
      FROM inputs i
      ${registryJurisdictionJoin('i.jurisdiction').replace('public.registry_jurisdictions', 'fixtures')}
      ORDER BY i.label`);
    expect(rows).toHaveLength(14);
    for (const row of rows) {
      expect(row.id, row.label).toBe(row.expected_id);
      expect(row.abbreviation, row.label).toBe(row.expected_code);
    }
  });
});
