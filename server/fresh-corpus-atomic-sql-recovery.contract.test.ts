import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const recovery = readFileSync(new URL("./services/fresh-corpus-atomic-sql-recovery-v1.ts", import.meta.url), "utf8");
const startup = readFileSync(new URL("./services/fresh-corpus-atomic-sql-recovery-startup.ts", import.meta.url), "utf8");
const core = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");

describe("bounded atomic SQL recovery", () => {
  it("targets only the isolated 19MB source and never executes historical SQL", () => {
    expect(recovery).toContain('TARGET_OBJECT = "luminari_full_substrate_handoff.sql"');
    expect(recovery).toContain('sourceKind: "sql_copy_row"');
    expect(recovery).toContain('sourceKind: "sql_insert_row"');
    expect(recovery).not.toContain("execFile(");
    expect(recovery).not.toContain("spawn(");
    expect(recovery).not.toContain("psql");
  });

  it("flushes bounded row batches instead of materializing the whole parsed corpus", () => {
    expect(recovery).toContain("INSERT_BATCH_SIZE = 250");
    expect(recovery).toContain("await flush(runId, artifact.artifact_key, batch)");
    expect(recovery).toContain("setImmediate");
    expect(recovery).not.toContain("matchAll(copyPattern)");
    expect(recovery).not.toContain("matchAll(insertPattern)");
  });

  it("uses a separate receipted recovery run and only resumes explicitly queued work", () => {
    expect(recovery).toContain('fresh_atomic_sql_recovery_v1.0.0');
    expect(recovery).toContain("status in ('queued','running')");
    expect(startup).toContain("resumeAtomicSqlRecoveryFromDatabase");
    expect(startup).not.toContain("queueAtomicSqlRecovery");
    expect(core).toContain('import "../services/fresh-corpus-atomic-sql-recovery-startup"');
  });
});
