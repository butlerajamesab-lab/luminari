import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260729144500_atlas_stream_identity_constraints.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("Atlas stream identity constraints", () => {
  it("installs the exact unique identities used by ON CONFLICT", () => {
    expect(migration).toContain("create unique index if not exists streams_pkey");
    expect(migration).toContain("on public.streams (stream_id)");
    expect(migration).toContain("create unique index if not exists signal_events_pkey");
    expect(migration).toContain('on public.signal_events (stream_id, "offset")');
    expect(migration).toContain("create unique index if not exists cursors_stream_id_name_key");
    expect(migration).toContain("on public.cursors (stream_id, name)");
  });

  it("fails closed if a same-named non-unique index blocks the contract", () => {
    expect(migration).toContain("i.indisunique");
    expect(migration).toContain("Atlas stream identity contract missing");
  });

  it("contains no destructive row or schema removal", () => {
    expect(migration).not.toMatch(/\bdelete\b/i);
    expect(migration).not.toMatch(/\btruncate\b/i);
    expect(migration).not.toMatch(/\bdrop\b/i);
  });
});
