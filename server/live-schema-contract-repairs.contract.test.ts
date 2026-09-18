import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Live-schema contract guards for three surfaces that were silently broken
 * against the Supabase Postgres database (verified 2026-09-17 against the
 * deployed build):
 *
 *   1. usersAdmin.list       → 500  (Drizzle users table used camelCase column names)
 *   2. resourceVerification.* → 500  (mysql2 `?` placeholders + `[rows]` destructure)
 *   3. workbench.*            → 400  (caseId declared as uuid; live cases.id is integer)
 */
function read(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

describe("public.users Drizzle mapping", () => {
  const schema = read("../drizzle/schema.ts");
  const start = schema.indexOf('export const users = pgTable("users"');
  const end = schema.indexOf("export type User =", start);
  const definition = schema.slice(start, end);

  it("targets the live snake_case physical columns", () => {
    for (const column of [
      '"open_id"',
      '"login_method"',
      '"created_at"',
      '"updated_at"',
      '"last_signed_in"',
    ]) {
      expect(definition).toContain(column);
    }
  });

  it("contains none of the camelCase physical column names that 500'd usersAdmin.list", () => {
    for (const legacy of ['"openId"', '"loginMethod"', '"createdAt"', '"updatedAt"', '"lastSignedIn"']) {
      expect(definition).not.toContain(legacy);
    }
  });
});

describe("unified_resources raw SQL is Postgres-shaped", () => {
  const routers = read("./routers.ts");
  const start = routers.indexOf("const resourceVerificationRouter = router({");
  const end = routers.indexOf("// ─── Support Matcher Router", start);
  const router_source = routers.slice(start, end);

  it("has no mysql2-style array destructure of pool.query results", () => {
    expect(router_source).not.toMatch(/const \[\w+\] = await rawPool\.query/);
    expect(routers).not.toMatch(/const \[\w+\] = await rawPool\.query/);
  });

  it("uses $n placeholders rather than ? placeholders", () => {
    expect(router_source).not.toMatch(/rawPool\.query\([^;]*\?[^;]*\]/s);
    expect(router_source).toMatch(/\$1/);
  });

  it("references the live snake_case columns and never the camelCase names as bare identifiers", () => {
    for (const column of [
      "verification_status",
      "last_verified_at",
      "resource_type",
      "state_code",
      "flagged_reason",
      "verified_by",
      "updated_at",
    ]) {
      expect(router_source).toContain(column);
    }
    // camelCase must only appear as a quoted alias (AS "camelCase"), never as a bare column.
    for (const bare of [
      / WHERE isActive/, / SET isActive/, / verificationStatus =/, / lastVerifiedAt </,
      /ORDER BY lastVerifiedAt/, /DISTINCT resourceType/,
    ]) {
      expect(router_source).not.toMatch(bare);
    }
  });

  it("treats is_active as the integer column it is in the live table", () => {
    expect(router_source).not.toMatch(/is_active = (true|false)/i);
    expect(router_source).not.toMatch(/isActive = (true|false)/i);
    expect(router_source).toContain("is_active <> 0");
  });
});

describe("workbench router case identity", () => {
  const workbench = read("./routers/workbench.ts");

  it("accepts the live integer case id, not a uuid", () => {
    expect(workbench).not.toContain("z.string().uuid()");
    expect(workbench).toContain("caseId: z.number().int().positive()");
  });

  it("uses the shared ownership check (owner + collaborator) instead of a local owner_ref lookup", () => {
    expect(workbench).not.toContain("owner_ref");
    expect(workbench).toMatch(/import \{ getPool, verifyCaseOwnership \} from "\.\.\/db"/);
  });

  it("does not cast case ids to any to silence the schema mismatch", () => {
    expect(workbench).not.toContain("input.caseId as any");
    expect(workbench).not.toContain("const caseId = input.caseId as any");
  });

  it("reads live physical columns directly instead of the drifted Drizzle declarations", () => {
    // The Drizzle tables it used to import declare camelCase physical names
    // (caseId, flagType, evidenceId, ...) and uuid case_id on integer tables.
    expect(workbench).not.toMatch(/from "\.\.\/\.\.\/drizzle\/schema"/);
    expect(workbench).not.toMatch(/from "drizzle-orm"/);
    expect(workbench).toContain("getPool().query(");
  });

  it("never selects columns that do not exist in the live schema", () => {
    // Flagged by review on PR #677: claims.pipeline_run_id, claims.created_at,
    // findings.finding_text and findings.confidence_label are not live columns.
    const selects = workbench.match(/SELECT[\s\S]*?FROM public\.\w+/g) ?? [];
    expect(selects.length).toBeGreaterThan(10);
    for (const select of selects) {
      expect(select).not.toMatch(/\bpipeline_run_id\b/);
      expect(select).not.toMatch(/\bfinding_text\b/);
      expect(select).not.toMatch(/\bconfidence_label\b/);
    }
    const claimsSelects = selects.filter(s => /FROM public\.claims\b/.test(s) && !/COUNT\(/.test(s));
    expect(claimsSelects.length).toBeGreaterThan(0);
    for (const select of claimsSelects) expect(select).not.toMatch(/\bcreated_at\b/);
  });

  it("compares the integer checked flag numerically, and only ::text-compares the uuid-keyed satellites", () => {
    expect(workbench).toContain("checked <> 0");
    expect(workbench).not.toContain("checked = true");
    expect(workbench).toMatch(/FROM public\.events\s+WHERE case_id::text = \$1::text/);
    expect(workbench).toMatch(/FROM public\.evidence_items ei\s+WHERE ei\.case_id::text = \$1::text/);
    expect(workbench).toMatch(/FROM public\.claims\s+WHERE case_id = \$1/);
    expect(workbench).toMatch(/FROM public\.findings\s+WHERE case_id = \$1/);
  });
});
