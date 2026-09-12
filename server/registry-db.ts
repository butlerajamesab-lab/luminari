import { db } from "./db";
import { sql } from "drizzle-orm";
import { registryJurisdictionJoin } from "./services/registry-jurisdiction-sql";

// Keep stored text identities intact. Resolve existing legacy encodings against
// a selected canonical jurisdiction without multiplying source rows.
function jurisdictionFilter(source: string, jurisdictionId: string | number) {
  const id = String(jurisdictionId);
  return sql`(${sql.raw(source)} = ${id} OR EXISTS (
    SELECT 1 FROM registry_jurisdictions selected_j
    ${sql.raw(registryJurisdictionJoin(source, "matched_j"))}
    WHERE selected_j.id = ${id}
      AND (matched_j.id = selected_j.id OR matched_j.abbreviation = selected_j.abbreviation)
  ))`;
}

export async function listJurisdictions() {
  const result = await db.execute(sql`SELECT * FROM registry_jurisdictions ORDER BY name, id`);
  return result.rows ?? [];
}

export async function getJurisdiction(id: string | number) {
  const result = await db.execute(
    sql`SELECT * FROM registry_jurisdictions WHERE id = ${String(id)} LIMIT 1`
  );
  return (result.rows ?? [])[0] ?? null;
}

export async function listPrograms(jurisdictionId?: string | number, category?: string) {
  const conditions = [];
  if (jurisdictionId !== undefined) conditions.push(jurisdictionFilter("COALESCE(NULLIF(p.jurisdiction_id, ''), p.jurisdiction_id_rp)", jurisdictionId));
  if (category !== undefined) conditions.push(sql`p.category = ${category}`);
  const where = conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;
  const result = await db.execute(sql`SELECT p.* FROM registry_programs p ${where} ORDER BY p.name, p.id`);
  return result.rows ?? [];
}

export async function listPolicyAlerts(jurisdictionId?: string | number) {
  const where = jurisdictionId === undefined ? sql`` : sql`WHERE ${jurisdictionFilter("a.jurisdiction_id_rpa", jurisdictionId)}`;
  const result = await db.execute(sql`SELECT a.* FROM registry_policy_alerts a ${where} ORDER BY a.created_at_rpa DESC, a.id`);
  return result.rows ?? [];
}

export async function listWorkflows(jurisdictionId?: string | number) {
  const where = jurisdictionId === undefined ? sql`` : sql`WHERE ${jurisdictionFilter("w.jurisdiction_id_rw", jurisdictionId)}`;
  const result = await db.execute(sql`SELECT w.* FROM registry_workflows w ${where} ORDER BY w.workflow_type_rw, w.id`);
  return result.rows ?? [];
}

export async function listOversightBodies(jurisdictionId?: string | number) {
  const where = jurisdictionId === undefined ? sql`` : sql`WHERE ${jurisdictionFilter("o.jurisdiction_id_rob", jurisdictionId)}`;
  const result = await db.execute(sql`SELECT o.* FROM registry_oversight_bodies o ${where} ORDER BY o.agency_name_rob, o.id`);
  return result.rows ?? [];
}

export async function getSignals(jurisdictionId?: string | number, signalType?: string) {
  const conditions = [];
  if (jurisdictionId !== undefined) conditions.push(jurisdictionFilter("s.jurisdiction_id_rs", jurisdictionId));
  if (signalType !== undefined) conditions.push(sql`s.signal_type_rs = ${signalType}`);
  const where = conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;
  const result = await db.execute(sql`SELECT s.* FROM registry_signals s ${where} ORDER BY s.created_at_rs DESC, s.id`);
  return result.rows ?? [];
}

export async function getSourceTraceability(jurisdictionId: string | number) {
  return { jurisdictionId, sources: [], lastUpdated: null };
}

export async function getProgramCategories(jurisdictionId?: string | number) {
  const condition = jurisdictionId === undefined ? sql`` : sql`AND ${jurisdictionFilter("COALESCE(NULLIF(p.jurisdiction_id, ''), p.jurisdiction_id_rp)", jurisdictionId)}`;
  const result = await db.execute(sql`SELECT DISTINCT p.category FROM registry_programs p WHERE p.category IS NOT NULL ${condition} ORDER BY p.category`);
  return (result.rows ?? []).map((r: any) => r.category);
}

export async function getCounts() {
  const jurisdictions = await db.execute(sql`SELECT COUNT(*) as count FROM registry_jurisdictions`);
  const programs = await db.execute(sql`SELECT COUNT(*) as count FROM registry_programs`);
  const alerts = await db.execute(sql`SELECT COUNT(*) as count FROM registry_policy_alerts`);
  const workflows = await db.execute(sql`SELECT COUNT(*) as count FROM registry_workflows`);
  const oversight = await db.execute(sql`SELECT COUNT(*) as count FROM registry_oversight_bodies`);
  const signals = await db.execute(sql`SELECT COUNT(*) as count FROM registry_signals`);

  return {
    jurisdictions: Number((jurisdictions.rows ?? [])[0]?.count ?? 0),
    programs: Number((programs.rows ?? [])[0]?.count ?? 0),
    policyAlerts: Number((alerts.rows ?? [])[0]?.count ?? 0),
    workflows: Number((workflows.rows ?? [])[0]?.count ?? 0),
    oversightBodies: Number((oversight.rows ?? [])[0]?.count ?? 0),
    signals: Number((signals.rows ?? [])[0]?.count ?? 0),
  };
}

export default {
  listJurisdictions,
  getJurisdiction,
  listPrograms,
  listPolicyAlerts,
  listWorkflows,
  listOversightBodies,
  getSignals,
  getSourceTraceability,
  getProgramCategories,
  getCounts,
};
