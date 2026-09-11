import { spawnSync as spawn_sync } from "node:child_process";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("preserves exact source records and enforces governed reconciliation", () => {
  const result = spawn_sync("python3", [resolve("scripts/seed_pipeline_test.py"), "-v"], { encoding: "utf8" });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
}, 30_000);
