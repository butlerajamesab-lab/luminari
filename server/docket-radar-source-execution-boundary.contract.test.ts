import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Docket refresh / Rosetta execution boundary", () => {
  it("keeps Radar activation source-only", () => {
    const worker = read("server/docket-jurisdiction-activation-queue-worker.ts");
    expect(worker).toContain(
      "register_docket_legislative_version_spine($1::integer, false)",
    );
    expect(worker).not.toContain(
      "register_docket_legislative_version_spine($1::integer, true)",
    );
  });

  it("keeps automatic cache and Genome registration non-executing", () => {
    const migration = read(
      "supabase/migrations/20260918215000_docket_refresh_registration_only.sql",
    );
    expect(migration).toContain(
      "register_docket_legislative_version_spine(new.bill_id, false)",
    );
    expect(migration).toContain(
      "register_docket_legislative_version_spine(v_source_bill_id, false)",
    );
    expect(migration).not.toMatch(
      /register_docket_legislative_version_spine\([^)]*,\s*true\)/,
    );
  });

  it("does not auto-start legislative execution in the production worker blueprint", () => {
    const blueprint = read("render.prism-worker.yaml");
    expect(blueprint).toMatch(
      /- key: LEGISLATIVE_VERSION_QUEUE_ENABLED\s+value: "false"/,
    );
  });
});
