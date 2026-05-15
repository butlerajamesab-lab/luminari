/**
 * Knowledge Backbone Service
 * 
 * Provides query access to the 7 knowledge backbone modules:
 * T1. claim_catalog → 37 civil rights/consumer protection claim types
 * T2. federal_reference → 15 agencies + 20 routing rules
 * T3. sol_collision → 8 statute of limitations collision scenarios
 * T4. benefits_cascade → 4 cascade pathways
 * T5. gap_playbook → 17 no-remedy gap entries
 * T6. consumer_protection_expanded → confidence engine specification
 * T7. policy_impact → 37 policy events + sub-tables
 * 
 * Cross-references: 10 module-level links connecting modules.
 * 
 * This service is read-only. It does not modify the signal engine
 * or interpretation packs loaded in Session 43d.
 */

import { db } from "./db";
import { sql, eq, and, like, inArray } from "drizzle-orm";

// ─── Module Types ───────────────────────────────────────────────

export type ModuleType =
  | "claim_catalog"
  | "federal_reference"
  | "sol_collision"
  | "benefits_cascade"
  | "gap_playbook"
  | "consumer_protection_expanded"
  | "policy_impact";

export interface KnowledgeModule {
  id: number;
  moduleType: string;
  moduleName: string;
  description: string;
  sourceFile: string | null;
  totalEntries: number;
  version: string;
  loadedAt: number;
  isActive: boolean;
}

export interface KnowledgeEntry {
  id: number;
  moduleId: number;
  entryId: string;
  entryName: string;
  category: string | null;
  severity: string | null;
  domain: string | null;
  payload: Record<string, unknown>;
  tags: string[] | null;
  crossRefModules: string[] | null;
  createdAt: number;
}

export interface CrossRef {
  id: number;
  sourceModuleId: number;
  sourceEntryId: string;
  targetModuleId: number;
  targetEntryId: string | null;
  targetTable: string | null;
  relationship: string;
  notes: string | null;
}

// ─── Module Registry ────────────────────────────────────────────

export async function listModules(): Promise<KnowledgeModule[]> {
  const rows = await db.execute(
    sql`SELECT id, moduleType, moduleName, description, sourceFile, totalEntries, version, loadedAt, isActive
        FROM knowledge_modules WHERE isActive = 1 ORDER BY id`
  );
  return (rows as any)[0].map(parseModuleRow);
}

export async function getModule(moduleType: ModuleType): Promise<KnowledgeModule | null> {
  const rows = await db.execute(
    sql`SELECT id, moduleType, moduleName, description, sourceFile, totalEntries, version, loadedAt, isActive
        FROM knowledge_modules WHERE moduleType = ${moduleType} AND isActive = 1 LIMIT 1`
  );
  const arr = (rows as any)[0];
  return arr.length > 0 ? parseModuleRow(arr[0]) : null;
}

// ─── Entry Queries ──────────────────────────────────────────────

export async function getEntriesByModule(
  moduleType: ModuleType,
  opts?: { category?: string; severity?: string; domain?: string; limit?: number; offset?: number }
): Promise<{ entries: KnowledgeEntry[]; total: number }> {
  const module = await getModule(moduleType);
  if (!module) return { entries: [], total: 0 };

  let whereClause = sql`WHERE ke.moduleId = ${module.id}`;
  if (opts?.category) whereClause = sql`${whereClause} AND ke.category = ${opts.category}`;
  if (opts?.severity) whereClause = sql`${whereClause} AND ke.severity = ${opts.severity}`;
  if (opts?.domain) whereClause = sql`${whereClause} AND ke.domain = ${opts.domain}`;

  const countRows = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM knowledge_entries ke ${whereClause}`
  );
  const total = (countRows as any)[0][0].cnt;

  const limit = opts?.limit || 100;
  const offset = opts?.offset || 0;
  const rows = await db.execute(
    sql`SELECT ke.* FROM knowledge_entries ke ${whereClause} ORDER BY ke.id LIMIT ${limit} OFFSET ${offset}`
  );
  return { entries: (rows as any)[0].map(parseEntryRow), total };
}

export async function getEntryById(entryId: string): Promise<KnowledgeEntry | null> {
  const rows = await db.execute(
    sql`SELECT * FROM knowledge_entries WHERE entryId = ${entryId} LIMIT 1`
  );
  const arr = (rows as any)[0];
  return arr.length > 0 ? parseEntryRow(arr[0]) : null;
}

export async function searchEntries(
  query: string,
  opts?: { moduleTypes?: ModuleType[]; limit?: number }
): Promise<KnowledgeEntry[]> {
  const searchPattern = `%${query}%`;
  const limit = opts?.limit || 20;

  let moduleFilter = sql``;
  if (opts?.moduleTypes && opts.moduleTypes.length > 0) {
    const moduleRows = await db.execute(
      sql`SELECT id FROM knowledge_modules WHERE moduleType IN (${sql.join(opts.moduleTypes.map(t => sql`${t}`), sql`, `)})`
    );
    const moduleIds = (moduleRows as any)[0].map((r: any) => r.id);
    if (moduleIds.length > 0) {
      moduleFilter = sql`AND ke.moduleId IN (${sql.join(moduleIds.map((id: number) => sql`${id}`), sql`, `)})`;
    }
  }

  const rows = await db.execute(
    sql`SELECT ke.* FROM knowledge_entries ke
        WHERE (ke.entryName LIKE ${searchPattern} OR ke.entryId LIKE ${searchPattern} OR ke.category LIKE ${searchPattern})
        ${moduleFilter}
        ORDER BY ke.id LIMIT ${limit}`
  );
  return (rows as any)[0].map(parseEntryRow);
}

// ─── Cross-Reference Queries ────────────────────────────────────

export async function getCrossRefs(moduleType: ModuleType): Promise<CrossRef[]> {
  const module = await getModule(moduleType);
  if (!module) return [];

  const rows = await db.execute(
    sql`SELECT kcr.*, km_src.moduleType as srcType, km_tgt.moduleType as tgtType
        FROM knowledge_cross_refs kcr
        JOIN knowledge_modules km_src ON kcr.sourceModuleId = km_src.id
        JOIN knowledge_modules km_tgt ON kcr.targetModuleId = km_tgt.id
        WHERE kcr.sourceModuleId = ${module.id} OR kcr.targetModuleId = ${module.id}
        ORDER BY kcr.id`
  );
  return (rows as any)[0].map(parseCrossRefRow);
}

export async function getRelatedEntries(
  entryId: string,
  relationship?: string
): Promise<{ entry: KnowledgeEntry; relationship: string }[]> {
  const entry = await getEntryById(entryId);
  if (!entry || !entry.crossRefModules || entry.crossRefModules.length === 0) return [];

  // Find entries in the cross-referenced modules that share category/domain
  const results: { entry: KnowledgeEntry; relationship: string }[] = [];
  for (const refModuleType of entry.crossRefModules) {
    const refModule = await getModule(refModuleType as ModuleType);
    if (!refModule) continue;

    const rows = await db.execute(
      sql`SELECT * FROM knowledge_entries
          WHERE moduleId = ${refModule.id}
          AND (category = ${entry.category} OR domain = ${entry.domain})
          LIMIT 5`
    );
    for (const row of (rows as any)[0]) {
      results.push({
        entry: parseEntryRow(row),
        relationship: relationship || `cross_ref_${refModuleType}`,
      });
    }
  }
  return results;
}

// ─── Specialized Queries ────────────────────────────────────────

/**
 * T1. Look up a claim type by category or name pattern.
 * Returns the full claim definition with elements, proof framework, SOL, etc.
 */
export async function lookupClaim(query: string): Promise<KnowledgeEntry[]> {
  return searchEntries(query, { moduleTypes: ["claim_catalog"], limit: 10 });
}

/**
 * T2. Route a claim type to the appropriate federal agency.
 * Returns the agency authority entry and routing matrix entry.
 */
export async function routeToAgency(claimType: string): Promise<{
  agencies: KnowledgeEntry[];
  routing: KnowledgeEntry[];
}> {
  const agencies = await getEntriesByModule("federal_reference", { category: "agency_authority" });
  const routing = await getEntriesByModule("federal_reference", { category: "routing_matrix" });

  const matchedRouting = routing.entries.filter(
    (e) => e.entryName.toLowerCase().includes(claimType.toLowerCase())
  );

  // Find the primary agency from the routing match
  const matchedAgencies: KnowledgeEntry[] = [];
  for (const route of matchedRouting) {
    const payload = route.payload as any;
    const primaryAgency = payload?.primary_agency;
    if (primaryAgency) {
      const match = agencies.entries.find(
        (a) => a.entryName.toLowerCase().includes(primaryAgency.toLowerCase()) ||
               (a.payload as any)?.agency_name?.toLowerCase().includes(primaryAgency.toLowerCase())
      );
      if (match) matchedAgencies.push(match);
    }
  }

  return { agencies: matchedAgencies, routing: matchedRouting };
}

/**
 * T3. Check SOL collision scenarios for a given claim category.
 */
export async function checkSOLCollision(category: string): Promise<KnowledgeEntry[]> {
  const { entries } = await getEntriesByModule("sol_collision");
  return entries.filter(
    (e) => e.category?.toLowerCase().includes(category.toLowerCase()) ||
           e.entryName.toLowerCase().includes(category.toLowerCase())
  );
}

/**
 * T4. Get cascade pathways triggered by a harm event.
 */
export async function getCascadePathways(trigger?: string): Promise<KnowledgeEntry[]> {
  const { entries } = await getEntriesByModule("benefits_cascade");
  if (!trigger) return entries;
  return entries.filter(
    (e) => e.domain?.toLowerCase().includes(trigger.toLowerCase()) ||
           e.entryName.toLowerCase().includes(trigger.toLowerCase())
  );
}

/**
 * T5. Find no-remedy gaps for a given category.
 */
export async function findGaps(category?: string): Promise<KnowledgeEntry[]> {
  if (category) {
    const { entries } = await getEntriesByModule("gap_playbook", { category });
    return entries;
  }
  const { entries } = await getEntriesByModule("gap_playbook");
  return entries;
}

/**
 * T6. Get the confidence engine specification.
 */
export async function getConfidenceEngineSpec(): Promise<KnowledgeEntry | null> {
  return getEntryById("CONFIDENCE-ENGINE-SPEC");
}

/**
 * T7. Get policy events by direction or type.
 */
export async function getPolicyEvents(opts?: {
  direction?: string;
  type?: string;
}): Promise<KnowledgeEntry[]> {
  const { entries } = await getEntriesByModule("policy_impact", {
    category: "policy_event_registry",
  });
  if (!opts) return entries;
  return entries.filter((e) => {
    const p = e.payload as any;
    if (opts.direction && p.direction !== opts.direction) return false;
    if (opts.type && p.type !== opts.type) return false;
    return true;
  });
}

// ─── Backbone Summary ───────────────────────────────────────────

export async function getBackboneSummary(): Promise<{
  modules: KnowledgeModule[];
  totalEntries: number;
  totalCrossRefs: number;
}> {
  const modules = await listModules();
  const totalEntries = modules.reduce((sum, m) => sum + m.totalEntries, 0);
  const refRows = await db.execute(sql`SELECT COUNT(*) as cnt FROM knowledge_cross_refs`);
  const totalCrossRefs = (refRows as any)[0][0].cnt;
  return { modules, totalEntries, totalCrossRefs };
}

// ─── Row Parsers ────────────────────────────────────────────────

function parseModuleRow(row: any): KnowledgeModule {
  return {
    id: row.id,
    moduleType: row.moduleType,
    moduleName: row.moduleName,
    description: row.description,
    sourceFile: row.sourceFile,
    totalEntries: row.totalEntries,
    version: row.version,
    loadedAt: Number(row.loadedAt),
    isActive: Boolean(row.isActive),
  };
}

function parseEntryRow(row: any): KnowledgeEntry {
  let payload = row.payload;
  if (typeof payload === "string") {
    try { payload = JSON.parse(payload); } catch { payload = {}; }
  }
  let tags = row.tags;
  if (typeof tags === "string") {
    try { tags = JSON.parse(tags); } catch { tags = null; }
  }
  let crossRefModules = row.crossRefModules;
  if (typeof crossRefModules === "string") {
    try { crossRefModules = JSON.parse(crossRefModules); } catch { crossRefModules = null; }
  }
  return {
    id: row.id,
    moduleId: row.moduleId,
    entryId: row.entryId,
    entryName: row.entryName,
    category: row.category,
    severity: row.severity,
    domain: row.domain,
    payload,
    tags,
    crossRefModules,
    createdAt: Number(row.createdAt),
  };
}

function parseCrossRefRow(row: any): CrossRef {
  return {
    id: row.id,
    sourceModuleId: row.sourceModuleId,
    sourceEntryId: row.sourceEntryId,
    targetModuleId: row.targetModuleId,
    targetEntryId: row.targetEntryId,
    targetTable: row.targetTable,
    relationship: row.relationship,
    notes: row.notes,
  };
}
