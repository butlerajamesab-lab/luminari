import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const migration = read(
  "supabase/migrations/20260909143000_lighthouse_runtime_postgres_contract_v1.sql",
);
const verification = read(
  "supabase/verification/20260909143000_lighthouse_runtime_postgres_contract_v1_verify.sql",
);
const canonicalSpine = read("server/routers/canonical-spine-router.ts");
const timeTravel = read("server/engines/time-travel-engine.ts");

const executableSql = migration
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("Lighthouse PostgreSQL runtime contract", () => {
  it("preserves the production patterns view row-for-row before conversion", () => {
    expect(migration).toContain(
      "create temporary table luminari_patterns_view_backup on commit drop",
    );
    expect(migration).toContain(
      "if restored_row_count <> preserved_row_count then",
    );
    expect(migration).toContain(
      "raise exception 'Pattern conversion preserved % of % source rows'",
    );
    expect(migration).toContain("source_signature text");
    expect(migration).toContain(
      "'legacy-pattern:' || coalesce(nullif(to_jsonb(b)->>'signature', ''), 'unsigned') || ':' || (to_jsonb(b)->>'id')",
    );
  });

  it("retains duplicate legacy signatures as provenance and verifies unique runtime identities", () => {
    expect(migration).toContain("with duplicate_signatures as (");
    expect(migration).toContain(
      "source_signature = coalesce(p.source_signature, p.signature)",
    );
    expect(migration).toContain(
      "signature = 'legacy-pattern:' || p.signature || ':' || p.id::text",
    );
    expect(migration).toContain(
      "create unique index if not exists uq_patterns_signature",
    );
    expect(verification).toContain(
      "raise exception 'Duplicate non-null pattern signatures remain'",
    );
    expect(verification).toContain(
      "raise exception 'A duplicated legacy pattern signature was not separated from its preserved source value'",
    );
  });

  it("has no destructive data reset in the executable migration", () => {
    expect(executableSql).not.toMatch(/\btruncate\b/i);
    expect(executableSql).not.toMatch(/\bdelete\s+from\b/i);
    expect(executableSql).not.toMatch(/\bdrop\s+table\b/i);
    expect(executableSql).not.toMatch(/\bcascade\b/i);
  });

  it("keeps repaired runtime objects behind the service-role boundary", () => {
    expect(migration).toContain(
      "execute format('alter table public.%I enable row level security', relation_name)",
    );
    expect(migration).toContain(
      "execute format('revoke all on table public.%I from public, anon, authenticated', relation_name)",
    );
    expect(migration).toContain(
      "execute format('grant all on table public.%I to service_role', relation_name)",
    );
    expect(migration).toContain(
      "execute format('alter view public.%I set (security_invoker = true)', view_name)",
    );
    expect(migration).toContain("public.runtime_contract_receipts");
    expect(verification).toContain(
      "Lighthouse runtime contract receipt is absent or invalid",
    );
  });

  it("uses PostgreSQL upsert and epoch-millisecond contracts in active runtime paths", () => {
    expect(canonicalSpine).toContain("ON CONFLICT (source_hash) DO UPDATE");
    expect(canonicalSpine).toContain("RETURNING id");
    expect(canonicalSpine).not.toContain("ON DUPLICATE KEY");
    expect(canonicalSpine).not.toContain("LAST_INSERT_ID");
    expect(timeTravel).toContain(
      "gte(ingestedRecords.ingestedAt, dateRange.from)",
    );
    expect(timeTravel).toContain(
      "lte(ingestedRecords.ingestedAt, dateRange.to)",
    );
    expect(timeTravel).not.toContain("new Date(dateRange");
  });
});
