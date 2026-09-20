import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const startup = readFileSync(new URL("./services/fresh-corpus-atomic-startup.ts", import.meta.url), "utf8");
const core = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const worker = readFileSync(new URL("./prism-rosetta-worker.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");
const storage = readFileSync(new URL("./services/corpus-storage-download.ts", import.meta.url), "utf8");

describe("fresh atomic corpus startup", () => {
  it("only resumes explicitly queued/running database work", () => {
    expect(startup).toContain("resume_fresh_atomic_corpus_pass_from_database");
    expect(startup).toContain('background_feature_enabled("FRESH_ATOMIC_CORPUS_RESUME_ENABLED")');
    expect(startup).not.toContain("queue_fresh_atomic_corpus_pass");
    expect(service).toContain("status in ('queued','running')");
  });

  it("resolves public/private Storage policy per object without disabling public replay", () => {
    expect(startup).toContain("schedule_atomic_resume(30_000)");
    expect(startup).not.toContain("private_storage_credential_available");
    expect(storage).toContain('"public"');
    expect(storage).toContain('"authenticated"');
    expect(storage).toContain("if (public_response.ok)");
    expect(storage).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(storage).toContain("LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY");
  });

  it("is mounted by the long-lived worker so explicitly queued work can advance", () => {
    expect(worker).toContain('import "./services/fresh-corpus-atomic-startup"');
    expect(worker).toContain('import "./workers/corpus-import-queue-worker"');
  });

  it("is mounted inertly by the web server and never executes SQL artifacts", () => {
    expect(core).toContain('import "../services/fresh-corpus-atomic-startup"');
    expect(service).toContain('sourceKind: "sql_copy_row"');
    expect(service).toContain('sourceKind: "sql_insert_row"');
    expect(service).not.toContain("execFile");
    expect(service).not.toMatch(/pool\.query\([^)]*INSERT INTO public\.registry_programs/i);
  });
});
