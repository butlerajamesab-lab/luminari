import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run_rosetta_control_repair_from_environment } from "./civic-genome-rosetta-control-repair";

const EXTRACTION_FILE = join(process.cwd(), "server", "civic-genome-rosetta-extraction.ts");
const SOURCE_HANDOFF_FILE = join(process.cwd(), "server", "civic-genome-rosetta-source-ingestion.ts");
const ROUTER_FILE = join(process.cwd(), "server", "routers", "civic-genome-router.ts");
const CONFIG_NAME = "ROSETTA_CONTROL_REPAIR_SOURCE_BILL_ID";
const priorValue = process.env[CONFIG_NAME];

afterEach(() => {
  if (priorValue === undefined) delete process.env[CONFIG_NAME];
  else process.env[CONFIG_NAME] = priorValue;
});

describe("retired historical Rosetta V3 path", () => {
  it("has no surviving executable V3 extraction RPC in the Docket pipeline", () => {
    const extraction = readFileSync(EXTRACTION_FILE, "utf8");
    expect(extraction).not.toContain("/rest/v1/rpc/run_rosetta_v3_extraction");
    expect(extraction).toContain("rosetta_legacy_v3_extraction_retired_use_current_runtime");
    expect(extraction).toContain("rosetta_legacy_v3_pipeline_retired_use_current_runtime");
    const processBody = extraction.split(
      "export async function process_docket_bill_through_rosetta_and_genome(",
    )[1];
    expect(processBody).toContain("throw new Error");
    expect(processBody).not.toContain("await run_docket_bill_through_rosetta");
  });

  it("retains source-only Docket handoff separately from legacy extraction", () => {
    const router = readFileSync(ROUTER_FILE, "utf8");
    const handoff = readFileSync(SOURCE_HANDOFF_FILE, "utf8");
    expect(router).toContain("ingest_docket_bill_to_rosetta_source: workerAdminProcedure");
    expect(router).toContain("create_rosetta_source_handoff(input.source_bill_id)");
    expect(handoff).toContain("export async function ingest_docket_bill_to_rosetta_source(");
  });

  it("does not execute startup replay when unset", async () => {
    delete process.env[CONFIG_NAME];
    await expect(run_rosetta_control_repair_from_environment()).resolves.toBeUndefined();
  });

  it("refuses any configured legacy startup replay", async () => {
    process.env[CONFIG_NAME] = "2067507";
    await expect(run_rosetta_control_repair_from_environment())
      .rejects.toThrow("rosetta_legacy_control_repair_retired_use_current_runtime");
  });
});
