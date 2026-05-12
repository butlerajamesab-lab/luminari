import { db } from "./db";
import { sql } from "drizzle-orm";

export async function listJurisdictions() {
  const result = await db.execute(
    sql`SELECT * FROM registry_jurisdictions ORDER BY name`
  );
  return result.rows ?? [];
}

export async function getJurisdiction(id: string | number) {
  const result = await db.execute(
    sql`SELECT * FROM registry_jurisdictions WHERE id = ${Number(id)} LIMIT 1`
  );
  return (result.rows ?? [])[0] ?? null;
}

export async function listPrograms(jurisdictionId?: string | number, category?: string) {
  if (jurisdictionId && category) {
    const result = await db.execute(
      sql`SELECT * FROM registry_programs WHERE jurisdiction_id = ${Number(jurisdictionId)} AND category = ${category} ORDER BY name`
    );
    return result.rows ?? [];
  }
  if (jurisdictionId) {
    const result = await db.execute(
      sql`SELECT * FROM registry_programs WHERE jurisdiction_id = ${Number(jurisdictionId)} ORDER BY name`
    );
    return result.rows ?? [];
  }
  const result = await db.execute(
    sql`SELECT * FROM registry_programs ORDER BY name`
  );
  return result.rows ?? [];
}

export async function listPolicyAlerts(jurisdictionId?: string | number) {
  if (jurisdictionId) {
    const result = await db.execute(
      sql`SELECT * FROM registry_policy_alerts WHERE jurisdiction_id = ${Number(jurisdictionId)} ORDER BY created_at DESC`
    );
    return result.rows ?? [];
  }
  const result = await db.execute(
    sql`SELECT * FROM registry_policy_alerts ORDER BY created_at DESC`
  );
  return result.rows ?? [];
}

export async function listWorkflows(jurisdictionId?: string | number) {
  if (jurisdictionId) {
    const result = await db.execute(
      sql`SELECT * FROM registry_workflows WHERE jurisdiction_id = ${Number(jurisdictionId)} ORDER BY name`
    );
    return result.rows ?? [];
  }
  const result = await db.execute(
    sql`SELECT * FROM registry_workflows ORDER BY name`
  );
  return result.rows ?? [];
}

export async function listOversightBodies(jurisdictionId?: string | number) {
  if (jurisdictionId) {
    const result = await db.execute(
      sql`SELECT * FROM registry_oversight_bodies WHERE jurisdiction_id_rob = ${Number(jurisdictionId)} ORDER BY agency_name_rob`
    );
    return result.rows ?? [];
  }
  const result = await db.execute(
    sql`SELECT * FROM registry_oversight_bodies ORDER BY agency_name_rob`
  );
  return result.rows ?? [];
}

export async function getSignals(jurisdictionId?: string | number, signalType?: string) {
  if (jurisdictionId && signalType) {
    const result = await db.execute(
      sql`SELECT * FROM registry_signals WHERE jurisdiction_id = ${Number(jurisdictionId)} AND signal_type = ${signalType} ORDER BY created_at DESC`
    );
    return result.rows ?? [];
  }
  if (jurisdictionId) {
    const result = await db.execute(
      sql`SELECT * FROM registry_signals WHERE jurisdiction_id = ${Number(jurisdictionId)} ORDER BY created_at DESC`
    );
    return result.rows ?? [];
  }
  if (signalType) {
    const result = await db.execute(
      sql`SELECT * FROM registry_signals WHERE signal_type = ${signalType} ORDER BY created_at DESC`
    );
    return result.rows ?? [];
  }
  const result = await db.execute(
    sql`SELECT * FROM registry_signals ORDER BY created_at DESC`
  );
  return result.rows ?? [];
}

export async function getSourceTraceability(jurisdictionId: string | number) {
  return { jurisdictionId, sources: [], lastUpdated: null };
}

export async function getProgramCategories(jurisdictionId?: string | number) {
  if (jurisdictionId) {
    const result = await db.execute(
      sql`SELECT DISTINCT category FROM registry_programs WHERE jurisdiction_id = ${Number(jurisdictionId)} AND category IS NOT NULL ORDER BY category`
    );
    return (result.rows ?? []).map((r: any) => r.category);
  }
  const result = await db.execute(
    sql`SELECT DISTINCT category FROM registry_programs WHERE category IS NOT NULL ORDER BY category`
  );
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
