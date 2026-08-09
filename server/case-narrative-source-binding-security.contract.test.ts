import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(here, path), "utf8");

function source_document_join(
  source: string,
  document_alias: string,
  case_alias: string,
): string {
  const start = source.indexOf("join public.documents d");
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("where ", start);
  expect(end).toBeGreaterThan(start);
  const join = source.slice(start, end);
  expect(join).toContain(
    `d.id = (${document_alias}.metadata ->> 'legacy_document_id')::integer`,
  );
  expect(join).toContain(`d.case_id = ${case_alias}.legacy_case_id`);
  return join;
}

describe("case narrative mutation authorization", () => {
  it("uses the write-access gate and therefore rejects read-only collaborators", () => {
    const routers = read("routers.ts");
    const narrative_start = routers.indexOf(
      "const caseNarrativeRouter = router({",
    );
    const narrative_end = routers.indexOf(
      "// ─── Lenses Router",
      narrative_start,
    );
    const narrative_router = routers.slice(narrative_start, narrative_end);
    const generate_start = narrative_router.indexOf(
      "generate: protectedProcedure",
    );
    const generate = narrative_router.slice(generate_start);

    expect(generate).toContain(
      "await db_helpers.verifyCaseWriteAccess(input.caseId, ctx.user.id)",
    );
    expect(generate).not.toContain(
      "await db_helpers.verifyCaseOwnership(input.caseId, ctx.user.id)",
    );

    const db_legacy = read("db-legacy.ts");
    const write_gate_start = db_legacy.indexOf(
      "export async function verifyCaseWriteAccess(",
    );
    const write_gate_end = db_legacy.indexOf("\n}\n", write_gate_start) + 3;
    const write_gate = db_legacy.slice(write_gate_start, write_gate_end);
    expect(write_gate).toContain("result._accessLevel === 'READ_ONLY'");
    expect(write_gate).toContain('code: "FORBIDDEN"');
  });
});

describe("canonical source-document same-case binding", () => {
  it("case-binds runtime entity and relationship source artifacts", () => {
    source_document_join(read("intake-case-runtime-projection.ts"), "a", "cib");
  });

  it("case-binds chronology source artifacts", () => {
    source_document_join(read("case-runtime-chronology-compat.ts"), "a", "cib");
  });

  it("carries the bridged case into the integrity source-artifact join", () => {
    const integrity = read("intake-case-integrity-projection.ts");
    expect(integrity).toContain(
      "select cil.intake_session_id, cib.legacy_case_id",
    );
    source_document_join(integrity, "ia", "ls");
  });

  it("case-binds analyze status source artifacts", () => {
    source_document_join(read("routers/analyze.ts"), "ia", "cib");
  });
});
