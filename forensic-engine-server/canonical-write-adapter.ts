/**
 * Canonical Write Adapter
 *
 * ALL engine writes MUST go through this adapter.
 * NO direct writes to legacy tables.
 * NO dual writes.
 * Every write targets a canonical_* table and returns an OutputRefEntity.
 */

import { db } from "./db";
import { sql } from "drizzle-orm";
import type { OutputRefEntity } from "./output-refs";

const CANONICAL_PREFIX = "canonical_";

function assertCanonical(table: string): void {
  if (!table.startsWith(CANONICAL_PREFIX)) {
    throw new Error(`[CanonicalWriteAdapter] BLOCKED: write to non-canonical table "${table}"`);
  }
}

// ─── Generic Canonical Insert ───

export async function canonicalInsert(
  table: string,
  data: Record<string, any>,
  entityType: string
): Promise<OutputRefEntity> {
  assertCanonical(table);

  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const record = { ...data, createdAt: data.createdAt || now, updatedAt: data.updatedAt || now };

  // Build column/value pairs
  const cols = Object.keys(record).filter(k => k !== "id");
  const placeholders = cols.map(() => "?").join(", ");
  const values = cols.map(k => {
    // @ts-ignore
    const v = record[k];
    if (v === null || v === undefined) return null;
    if (typeof v === "object") return JSON.stringify(v);
    return v;
  });

  const colStr = cols.map(c => `\`${c}\``).join(", ");
  const query = `INSERT INTO \`${table}\` (${colStr}) VALUES (${placeholders})`;

  const [result] = await db.execute(sql.raw(query.replace(/\?/g, () => {
    const val = values.shift();
    if (val === null) return "NULL";
    if (typeof val === "number") return String(val);
    return `'${String(val).replace(/'/g, "''")}'`;
  })));

  const insertId = (result as any).insertId;

  // Verify the row exists
  const [verify] = await db.execute(
    sql.raw(`SELECT id FROM \`${table}\` WHERE id = ${insertId} LIMIT 1`)
  );
  if ((verify as unknown as any[]).length === 0) {
    throw new Error(`[CanonicalWriteAdapter] Insert verification failed: id=${insertId} not found in "${table}"`);
  }

  return { type: entityType, id: insertId, table };
}

// ─── Generic Canonical Update ───

export async function canonicalUpdate(
  table: string,
  id: number,
  data: Record<string, any>
): Promise<void> {
  assertCanonical(table);

  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const record = { ...data, updatedAt: now };

  const setClauses = Object.entries(record)
    .filter(([k]) => k !== "id")
    .map(([k, v]) => {
      if (v === null) return `\`${k}\` = NULL`;
      if (typeof v === "object") return `\`${k}\` = '${JSON.stringify(v).replace(/'/g, "''")}'`;
      if (typeof v === "number") return `\`${k}\` = ${v}`;
      return `\`${k}\` = '${String(v).replace(/'/g, "''")}'`;
    })
    .join(", ");

  await db.execute(sql.raw(`UPDATE \`${table}\` SET ${setClauses} WHERE id = ${id}`));
}

// ─── Pattern Engine → canonical_pattern_registry ───

export async function writePatternResult(data: {
  name: string;
  description?: string;
  patternType?: string;
  domains?: string[];
  indicators?: any[];
  confidence?: number;
  sourceEngineId: string;
}): Promise<OutputRefEntity> {
  return canonicalInsert("canonical_pattern_registry", data, "pattern");
}

// ─── Strategy Engine → canonical_workflows ───

export async function writeStrategyWorkflow(data: {
  name: string;
  description?: string;
  caseId?: number;
  status?: string;
  steps?: any[];
  assignedTo?: string;
  priority?: string;
  dueDate?: string;
  domains?: string[];
}): Promise<OutputRefEntity> {
  return canonicalInsert("canonical_workflows", data, "workflow");
}

// ─── Claim Detection → canonical_claim_catalog ───

export async function writeClaimResult(data: {
  claimType: string;
  description?: string;
  domains?: string[];
  statuteIds?: number[];
  caseLawIds?: number[];
  elements?: any[];
  defenses?: any[];
  remedies?: any[];
  jurisdiction?: string;
  addedBy?: string;
}): Promise<OutputRefEntity> {
  return canonicalInsert("canonical_claim_catalog", data, "claim");
}

// ─── Viability Engine → canonical_claim_validation_rules ───

export async function writeValidationRule(data: {
  ruleName: string;
  description?: string;
  claimType?: string;
  conditions?: any;
  severity?: string;
  isActive?: boolean;
  domains?: string[];
}): Promise<OutputRefEntity> {
  return canonicalInsert("canonical_claim_validation_rules", data, "validation_rule");
}

// ─── Procedural Path → canonical_procedural_paths ───

export async function writeProceduralPath(data: {
  name: string;
  description?: string;
  caseId?: number;
  pathType?: string;
  steps?: any[];
  requirements?: any[];
  jurisdiction?: string;
  estimatedDuration?: string;
  domains?: string[];
}): Promise<OutputRefEntity> {
  return canonicalInsert("canonical_procedural_paths", data, "procedural_path");
}

// ─── Settlement Formula → canonical_settlement_formulas ───

export async function writeSettlementFormula(data: {
  name: string;
  description?: string;
  claimType?: string;
  formula?: string;
  variables?: any[];
  minValue?: number;
  max_value?: number;
  jurisdiction?: string;
  precedentIds?: number[];
  domains?: string[];
}): Promise<OutputRefEntity> {
  return canonicalInsert("canonical_settlement_formulas", data, "settlement_formula");
}

// ─── Enforcement Record → canonical_enforcement_records ───

export async function writeEnforcementRecord(data: {
  title: string;
  description?: string;
  agencyName?: string;
  actionType?: string;
  targetEntity?: string;
  outcome?: string;
  penaltyAmount?: number;
  jurisdiction?: string;
  effectiveDate?: string;
  domains?: string[];
  sourceUrl?: string;
}): Promise<OutputRefEntity> {
  return canonicalInsert("canonical_enforcement_records", data, "enforcement_record");
}

// ─── Global Write Guard ───

/**
 * Validates that a table name is canonical before any write.
 * Call this at the top of any write path to enforce the constraint.
 */
export function guardCanonicalWrite(table: string): void {
  assertCanonical(table);
}
