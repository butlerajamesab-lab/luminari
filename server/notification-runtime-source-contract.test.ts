import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("notification runtime source contract", () => {
  const indexSource = readFileSync("server/_core/index.ts", "utf8");
  const storeSource = readFileSync("server/notifications-runtime-store.ts", "utf8");
  const routerSource = readFileSync(
    "server/routers/notifications-runtime-router.ts",
    "utf8"
  );
  const migrationSource = readFileSync(
    "supabase/migrations/20260731194411_notifications_runtime_contract.sql",
    "utf8"
  );

  it("routes notification procedures before the legacy application router", () => {
    const mount = indexSource.indexOf('app.use(\n    "/api/trpc"');
    const runtime = indexSource.indexOf(
      "notificationRuntimeTrpcMiddleware",
      mount
    );
    const legacy = indexSource.indexOf(
      "createExpressMiddleware({ router: appRouter, createContext })",
      mount
    );

    expect(mount).toBeGreaterThanOrEqual(0);
    expect(runtime).toBeGreaterThan(mount);
    expect(legacy).toBeGreaterThan(runtime);
  });

  it("uses only snake_case notification columns and PostgreSQL RETURNING", () => {
    for (const column of [
      "user_id",
      "link_url",
      "read_at",
      "created_at",
    ]) {
      expect(storeSource).toContain(column);
    }

    expect(storeSource).toContain("insert into public.notifications");
    expect(storeSource).toContain("returning");
    expect(storeSource).not.toContain("insertId");
    expect(storeSource).not.toContain('"userId"');
    expect(storeSource).not.toContain('"readAt"');
  });

  it("requires the canonical resolved user for every client operation", () => {
    expect(routerSource.match(/protectedProcedure/g)?.length).toBe(4);
    expect(routerSource).toContain("ctx.user.id");
    expect(routerSource).not.toContain("publicProcedure");
  });

  it("keeps the PostgREST notification table server-mediated", () => {
    expect(migrationSource).toContain(
      "revoke all on table public.notifications from public, anon, authenticated"
    );
    expect(migrationSource).toContain(
      "grant select, insert, update, delete on table public.notifications to service_role"
    );
    expect(migrationSource).toContain("alter table public.notifications enable row level security");
    expect(migrationSource).not.toContain('"userId"');
    expect(migrationSource).not.toContain('"readAt"');
  });
});
