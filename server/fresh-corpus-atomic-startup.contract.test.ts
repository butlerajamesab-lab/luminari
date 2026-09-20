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

  it("continues public-corpus replay without weakening the private Batch boundary", () => {
    expect(startup).toContain("private_storage_credential_available");
    expect(startup).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(startup).toContain("LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY");
    expect(startup).toContain("private_batch_unavailable_missing_storage_credential");
    expect(startup).toContain("schedule_atomic_resume(30_000)");
    expect(storage).toContain('const private_bucket = artifact.bucket_id === "Batch"');
    expect(storage).toContain('if (private_bucket && !service_key) throw new Error("private_storage_server_credential_unavailable")');
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
