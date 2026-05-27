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
  module_type: string;
  module_name: string;
  description: string;
  source_file: string | null;
  total_entries: number;
  version: string;
  loaded_at: number;
  is_active: boolean;
}

export interface KnowledgeEntry {
  id: number;
  module_id: number;
  entry_id: string;
  entry_name: string;
  category: string | null;
  severity: string | null;
  domain: string | null;
  payload: Record<string, unknown>;
  tags: string[] | null;
  cross_ref_modules: string[] | null;
  created_at: number;
}

export interface CrossRef {
  id: number;
  source_module_id: number;
  source_entry_id: string;
  target_module_id: number;
  target_entry_id: string | null;
  target_table: string | null;
  relationship: string;
  notes: string | null;
}

// ─── Module Registry ────────────────────────────────────────────

export async function listModules(): Promise<KnowledgeModule[]> {
  const rows = await db.execute(
    sql`SELECT id, module_type, module_name, description, source_file, total_entries, version, loaded_at, is_active
        FROM knowledge_modules WHERE is_active = 1 ORDER BY id`
  );
  return (rows as any)[0].map(parseModuleRow);
}

export async function getModule(moduleType: ModuleType): Promise<KnowledgeModule | null> {
  const rows = await db.execute(
    sql`SELECT id, module_type, module_name, description, source_file, total_entries, version, loaded_at, is_active
        FROM knowledge_modules WHERE module_type = ${moduleType} AND is_active = 1 LIMIT 1`
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

  let whereClause = sql`WHERE ke.module_id = ${module.id}`;
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
    sql`SELECT * FROM knowledge_entries WHERE entry_id = ${entryId} LIMIT 1`
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
      sql`SELECT id FROM knowledge_modules WHERE module_type IN (${sql.join(opts.moduleTypes.map(t => sql`${t}`), sql`, `)})`
    );
    const moduleIds = (moduleRows as any)[0].map((r: any) => r.id);
    if (moduleIds.length > 0) {
      moduleFilter = sql`AND ke.module_id IN (${sql.join(moduleIds.map((id: number) => sql`${id}`), sql`, `)})`;
    }
  }

  const rows = await db.execute(
    sql`SELECT ke.* FROM knowledge_entries ke
        WHERE (ke.entry_name LIKE ${searchPattern} OR ke.entry_id LIKE ${searchPattern} OR ke.category LIKE ${searchPattern})
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
    sql`SELECT kcr.*, km_src.module_type as src_type, km_tgt.module_type as tgt_type
        FROM knowledge_cross_refs kcr
        JOIN knowledge_modules km_src ON kcr.source_module_id = km_src.id
        JOIN knowledge_modules km_tgt ON kcr.target_module_id = km_tgt.id
        WHERE kcr.source_module_id = ${module.id} OR kcr.target_module_id = ${module.id}
        ORDER BY kcr.id`
  );
  return (rows as any)[0].map(parseCrossRefRow);
}

export async function getRelatedEntries(
  entryId: string,
  relationship?: string
): Promise<{ entry: KnowledgeEntry; relationship: string }[]> {
  const entry = await getEntryById(entryId);
  if (!entry || !entry.cross_ref_modules || entry.cross_ref_modules.length === 0) return [];

  // Find entries in the cross-referenced modules that share category/domain
  const results: { entry: KnowledgeEntry; relationship: string }[] = [];
  for (const refModuleType of entry.cross_ref_modules) {
    const refModule = await getModule(refModuleType as ModuleType);
    if (!refModule) continue;

    const rows = await db.execute(
      sql`SELECT * FROM knowledge_entries
          WHERE module_id = ${refModule.id}
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
    (e) => e.entry_name.toLowerCase().includes(claimType.toLowerCase())
  );

  // Find the primary agency from the routing match
  const matchedAgencies: KnowledgeEntry[] = [];
  for (const route of matchedRouting) {
    const payload = route.payload as any;
    const primary_agency = payload?.primary_agency;
    if (primary_agency) {
      const match = agencies.entries.find(
        (a) => a.entry_name.toLowerCase().includes(primary_agency.toLowerCase()) ||
               (a.payload as any)?.agency_name?.toLowerCase().includes(primary_agency.toLowerCase())
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
           e.entry_name.toLowerCase().includes(category.toLowerCase())
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
           e.entry_name.toLowerCase().includes(trigger.toLowerCase())
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
  total_entries: number;
  total_cross_refs: number;
}> {
  const modules = await listModules();
  const total_entries = modules.reduce((sum, m) => sum + m.total_entries, 0);
  const refRows = await db.execute(sql`SELECT COUNT(*) as cnt FROM knowledge_cross_refs`);
  const total_cross_refs = (refRows as any)[0][0].cnt;
  return { modules, total_entries, total_cross_refs };
}

// ─── Row Parsers ────────────────────────────────────────────────

function parseModuleRow(row: any): KnowledgeModule {
  return {
    id: row.id,
    module_type: row.module_type,
    module_name: row.module_name,
    description: row.description,
    source_file: row.source_file,
    total_entries: row.total_entries,
    version: row.version,
    loaded_at: Number(row.loaded_at),
    is_active: Boolean(row.is_active),
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
  let cross_ref_modules = row.cross_ref_modules;
  if (typeof cross_ref_modules === "string") {
    try { cross_ref_modules = JSON.parse(cross_ref_modules); } catch { cross_ref_modules = null; }
  }
  return {
    id: row.id,
    module_id: row.module_id,
    entry_id: row.entry_id,
    entry_name: row.entry_name,
    category: row.category,
    severity: row.severity,
    domain: row.domain,
    payload,
    tags,
    cross_ref_modules,
    created_at: Number(row.created_at),
  };
}

function parseCrossRefRow(row: any): CrossRef {
  return {
    id: row.id,
    source_module_id: row.source_module_id,
    source_entry_id: row.source_entry_id,
    target_module_id: row.target_module_id,
    target_entry_id: row.target_entry_id,
    target_table: row.target_table,
    relationship: row.relationship,
    notes: row.notes,
  };
}
