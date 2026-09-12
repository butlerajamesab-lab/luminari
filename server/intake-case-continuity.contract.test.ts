import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("case intake continuity wiring", () => {
  it("adds an authenticated continuity api that supports legacy ids and canonical uuid bridge reads", () => {
    const analyze = read("server/routers/analyze.ts");
    const continuity = read("server/intake-case-continuity.ts");

    expect(analyze).toContain("getCaseIntakeContinuity: protectedProcedure");
    expect(analyze).toContain("await db_helpers.verifyCaseOwnership(input.caseId, ctx.user.id)");
    expect(analyze).toContain("where case_uuid = $1::uuid");
    expect(continuity).toContain("from public.case_identity_bridge");
    expect(continuity).toContain("from public.case_intake_links");
    expect(continuity).toContain("read_case_intake_integrity_projection(case_id, {");
    expect(continuity).toContain('link_scope: "all"');
    expect(continuity).toContain('case_overview: "/case-overview"');
  });

  it("keeps primary and related intake sessions separate instead of auto-merging clean-room restarts", () => {
    const continuity = read("server/intake-case-continuity.ts");

    expect(continuity).toContain("primary_sessions: sessions.filter((session) => session.is_primary)");
    expect(continuity).toContain("related_sessions: sessions.filter((session) => !session.is_primary)");
    expect(continuity).not.toContain("auto_merge");
    expect(continuity).not.toContain("promoteCaseIntakeSignals");
  });

  it("reuses the existing upload path for evidence/context origin propagation", () => {
    const upload_route = read("server/upload-route.ts");
    const upload_page = read("client/src/pages/Upload.tsx");
    const router = read("server/routers.ts");
    const shared = read("shared/case-intake-continuity.ts");

    expect(shared).toContain('"new_evidence"');
    expect(shared).toContain('"adds_context"');
    expect(router).toContain("originContext: case_intake_continuity_origin_context_schema.optional()");
    expect(router).toContain("originContext.case_id must match caseId");
    expect(upload_route).toContain("readRequestedOriginContext(");
    expect(upload_route).toContain('error: "Origin context case does not match upload target"');
    expect(upload_route).toContain("metadata: requestedOriginContext");
    expect(upload_route).toContain("origin_context: effectiveOriginContext");
    expect(upload_page).toContain('formData.append("originContext", JSON.stringify(originContext))');
  });

  it("wires the shared continuity panel into case workflow surfaces without duplicating page logic", () => {
    const dashboard_layout = read("client/src/components/DashboardLayout.tsx");
    const dashboard = read("client/src/pages/GuidedDashboard.tsx");
    const panel = read("client/src/components/CaseIntakeContinuityPanel.tsx");

    expect(dashboard_layout).toContain("CaseIntakeContinuityPanel");
    expect(dashboard_layout).toContain('routePath={location}');
    expect(dashboard).toContain('surfaceOverride="act"');
    expect(panel).toContain("trpc.analyze.getCaseIntakeContinuity.useQuery");
    expect(panel).toContain("function with_from_param(href: string)");
    expect(panel).toContain("const from = buildFromParam();");
    expect(panel).toContain('setLocation(with_from_param("/upload"))');
    expect(panel).toContain("setLocation(with_from_param(link.href))");
    expect(panel).toContain("setLocation(with_from_param(href))");
    expect(panel).toContain('.filter(([label]) => label !== surface)');
  });
});
