import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const read = (path: string) => readFileSync(resolve(repo, path), "utf8");
const occurrences = (source: string, value: string) =>
  source.split(value).length - 1;

describe("authoritative Intake projection hotfix", () => {
  const projectionReaders = [
    "server/intake-case-layer-reader.ts",
    "server/intake-case-runtime-projection.ts",
    "server/case-runtime-chronology-compat.ts",
    "server/intake-case-integrity-projection.ts",
  ];

  it.each(projectionReaders)(
    "scopes every case Intake query in %s to the primary projection",
    (path) => {
      const source = read(path);
      const linkJoins = occurrences(
        source,
        "join public.case_intake_links cil",
      );

      expect(
        linkJoins,
        `${path} must contain a case Intake authority join`,
      ).toBeGreaterThan(0);
      expect(occurrences(source, "cil.is_primary = true")).toBe(linkJoins);
      expect(occurrences(source, "cil.link_type = 'primary_projection'")).toBe(
        linkJoins,
      );
    },
  );

  it("invalidates the governed session when a document is physically deleted", () => {
    const deletionMigration = read(
      "supabase/migrations/20260809051313_invalidate_intake_projection_on_document_delete.sql",
    );
    const authorityMigration = read(
      "supabase/migrations/20260808231628_promote_live_upload_intake_authority.sql",
    );

    expect(deletionMigration).toContain("if tg_op = 'DELETE' then");
    expect(deletionMigration).toContain(
      "perform public.promote_live_upload_intake_authority_v1(old.case_id, true)",
    );
    expect(deletionMigration).toContain("after delete on public.documents");
    expect(deletionMigration).toContain("when (old.case_id is not null)");
    expect(authorityMigration).toContain(
      "perform pg_advisory_xact_lock(76004002, p_legacy_case_id)",
    );
    expect(authorityMigration).toContain(
      "set completion_state = 'evidence_registered'",
    );
  });
});
