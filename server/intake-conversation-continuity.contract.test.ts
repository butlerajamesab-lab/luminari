import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("intake conversation continuity wiring", () => {
  it("keeps public guidance deterministic and all case writes authenticated", () => {
    const router = read("server/routers.ts");
    const intake = read("client/src/pages/Intake.tsx");

    expect(router).toContain("converse: publicProcedure");
    expect(router).toContain("createCase: protectedProcedure");
    expect(router).toContain("addContext: protectedProcedure");
    expect(router).toContain("requested: input.conversationalWording && Boolean(ctx.user)");
    expect(intake).toContain("trpc.intake.createCase.useMutation");
    expect(intake).toContain("trpc.intake.addContext.useMutation");
    expect(intake).toContain("user_content_shared_with_model: false");
  });

  it("registers exact declared context through the existing service-only database boundary", () => {
    const registration = read("server/declared-intake-context.ts");
    const migration = read("supabase/migrations/20260809125105_register_declared_intake_context.sql");

    expect(registration).toContain("Buffer.from(JSON.stringify(declaration), \"utf8\")");
    expect(registration).toContain("public.register_declared_intake_context_v1");
    expect(registration).toContain("declared_intake_context_origin_case_mismatch");
    expect(registration).toContain("rollback_failed_declared_intake_document");
    expect(registration).toContain("await storageDelete(stored.key)");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog, public, extensions");
    expect(migration).toContain("revoke all on function public.register_declared_intake_context_v1");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });

  it("bounds public deterministic intake text before keyword scanning", () => {
    const router = read("server/routers.ts");

    expect(router).toContain("const intake_answer_text_schema = z.string().trim().max(8_000)");
    expect(router).toContain("const intake_combined_text_schema = z.string().trim().max(20_000)");
    expect(router).toContain("text: intake_combined_text_schema.min(1)");
  });

  it("consumes upload origin context in both browser storage and live component state", () => {
    const upload = read("client/src/pages/Upload.tsx");
    const clear_index = upload.indexOf("clear_case_intake_origin_context(currentCaseId)");
    const state_index = upload.indexOf("setOriginContext(null)", clear_index);

    expect(clear_index).toBeGreaterThan(-1);
    expect(state_index).toBeGreaterThan(clear_index);
  });
});
