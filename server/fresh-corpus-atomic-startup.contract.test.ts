import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const startup = readFileSync(new URL("./services/fresh-corpus-atomic-startup.ts", import.meta.url), "utf8");
const core = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("fresh atomic corpus startup", () => {
  it("only resumes explicitly queued/running database work", () => {
    expect(startup).toContain("resumeFreshAtomicCorpusPassFromDatabase");
    expect(startup).not.toContain("queueFreshAtomicCorpusPass");
    expect(service).toContain("status in ('queued','running')");
  });

  it("is mounted by the production server and never executes SQL artifacts", () => {
    expect(core).toContain('import "../services/fresh-corpus-atomic-startup"');
    expect(service).toContain('sourceKind: "sql_copy_row"');
    expect(service).toContain('sourceKind: "sql_insert_row"');
    expect(service).not.toContain("execFile");
    expect(service).not.toMatch(/pool\.query\([^)]*INSERT INTO public\.registry_programs/i);
  });
});
