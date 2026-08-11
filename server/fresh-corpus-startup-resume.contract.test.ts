import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const worker = readFileSync(join(process.cwd(), "server/workers/corpus-import-queue-worker.ts"), "utf8");
const route = readFileSync(join(process.cwd(), "server/routes/ingestion_control_router.ts"), "utf8");
const index = readFileSync(join(process.cwd(), "server/_core/index.ts"), "utf8");

describe("fresh corpus startup resume", () => {
  it("hangs the resume hook from the mounted production ingestion-control import chain", () => {
    expect(index).toContain('from "../routes/ingestion_control_router"');
    expect(route).toContain('from "../workers/corpus-import-queue-worker"');
    expect(worker).toContain("resumeFreshCorpusRebuildFromDatabase");
    expect(worker).toContain("mounted_worker_resume");
  });

  it("does not start the historical infinite worker loop inside the server bundle", () => {
    expect(worker).toContain('process.env.NODE_ENV === "production" && !is_direct_worker_entry()');
    expect(worker).toContain("if (is_direct_worker_entry())");
  });

  it("only resumes database-declared work", () => {
    const tail = worker.slice(worker.indexOf("The mounted ingestion-control REST router"));
    expect(tail).not.toContain("queueFreshCorpusRebuild");
    expect(tail).toContain("resumeFreshCorpusRebuildFromDatabase");
  });
});
