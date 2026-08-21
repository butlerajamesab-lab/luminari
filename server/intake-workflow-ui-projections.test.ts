import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../supabase/migrations/20260821234206_add_governed_intake_and_workflow_ui_projections_v1.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("governed intake and workflow UI projections", () => {
  it("projects existing reviewed route and situation-action truth instead of inventing a new router", () => {
    expect(migration).toContain("public.v_lighthouse_reviewed_action_route_current_v1");
    expect(migration).toContain("public.v_lighthouse_situation_action_current_v1");
    expect(migration).toContain("public.v_ui_intake_routing_v1");
    expect(migration).toContain("public.v_ui_workflow_router_v1");
  });

  it("preserves fail-visible verification and routing state", () => {
    expect(migration).toContain("verification_status");
    expect(migration).toContain("is_user_routable");
    expect(migration).toContain("partial_review");
    expect(migration).toContain("verified_routable");
    expect(migration).toContain("workflow_route_state");
  });

  it("is projection-only", () => {
    expect(migration).not.toMatch(/\b(insert|update|delete|truncate)\b/i);
  });
});
