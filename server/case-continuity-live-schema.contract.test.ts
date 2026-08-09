import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { caseWorkspacePath, normalizeCaseId } from "../client/src/lib/caseNavigation";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("canonical Lighthouse case navigation", () => {
  it("normalizes only positive integer legacy case ids", () => {
    expect(normalizeCaseId(2)).toBe(2);
    expect(normalizeCaseId("2")).toBe(2);
    expect(normalizeCaseId("e650c976-0178-4d72-9dda-092eddf3207a")).toBeNull();
    expect(normalizeCaseId("2.5")).toBeNull();
    expect(normalizeCaseId(0)).toBeNull();
  });

  it("routes every valid id to the sole canonical case workspace", () => {
    expect(caseWorkspacePath(2)).toBe("/guide/2");
    expect(caseWorkspacePath("3")).toBe("/guide/3");
    expect(caseWorkspacePath("invalid")).toBe("/cases");
  });

  it("keeps historical /case links as a redirect, never a second case reader", () => {
    const legacyRoute = read("../client/src/pages/Case.tsx");
    expect(legacyRoute).toContain("caseWorkspacePath(id)");
    expect(legacyRoute).not.toContain("luminari.getCase");
    expect(legacyRoute).not.toContain("Case not found");
  });

  it("does not generate retired /case/:id links from case-facing surfaces", () => {
    const sources = [
      "../client/src/pages/DocumentDetail.tsx",
      "../client/src/pages/Patterns.tsx",
      "../client/src/components/PatternSignals.tsx",
      "../client/src/pages/Intake.tsx",
    ].map(read).join("\n");

    expect(sources).not.toContain("`/case/${");
    expect(sources).toContain("caseWorkspacePath");
  });
});

describe("responsive case workspace", () => {
  it("uses the mobile workspace on narrow screens and coarse-pointer phone/tablet viewports", () => {
    const mobileHook = read("../client/src/hooks/useMobile.tsx");
    const dashboard = read("../client/src/components/DashboardLayout.tsx");

    expect(mobileHook).toContain("(pointer: coarse) and (max-width:");
    expect(mobileHook).toContain("setIsMobile(mql.matches)");
    expect(dashboard).toContain("if (isMobile)");
    expect(dashboard).toContain("<MobileLayout>{children}</MobileLayout>");
  });
});

describe("live workflow registry schema boundary", () => {
  const loader = read("./intake-governed-legal-registry.ts");

  it("maps retrieved live columns into the governed contract", () => {
    expect(loader).toContain("'workflow_' || id::text as workflow_key");
    expect(loader).toContain("title as workflow_name");
    expect(loader).toContain("action_description as action");
    expect(loader).toContain("deadline_rule as due_rule");
    expect(loader).toContain("lower(coalesce(workflow_status, 'active')) = 'active'");
  });

  it("does not query columns absent from the live workflow tables", () => {
    expect(loader).not.toContain("select id, workflow_key, workflow_name");
    expect(loader).not.toContain("coalesce(is_active, 1)");
    expect(loader).not.toContain("step_number, step_order, action, owner");
  });
});

describe("live relational schema boundary", () => {
  const schema = read("../drizzle/schema.ts");

  it("maps checklist fields to production snake_case and converts integer booleans", () => {
    expect(schema).toContain('caseId: integer("case_id")');
    expect(schema).toContain('checkedAt: bigint("checked_at"');
    expect(schema).toContain('createdAt: bigint("created_at"');
    expect(schema).toContain('checked: boolean_integer("checked")');
    expect(schema).not.toContain('caseId: integer("caseId").notNull(),\n  label: varchar("label", { length: 512 })');
  });

  it("maps the populated claim-element library to its production columns", () => {
    expect(schema).toContain('claimType: text("claim_type")');
    expect(schema).toContain('elementName: text("element_name")');
    expect(schema).toContain('elementOrder: integer("element_order")');
    expect(schema).toContain('evidenceTypes: json_text("evidence_types")');
    expect(schema).not.toContain('claimType: text("claimType").notNull()');
  });
});
