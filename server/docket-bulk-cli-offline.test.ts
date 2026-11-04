import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";

const sha256 = (buffer: Buffer): string => createHash("sha256").update(buffer).digest("hex");
const runner = join(process.cwd(), "node_modules", ".bin", "tsx");
const script = join(process.cwd(), "scripts", "legiscan-bulk-docket-intake.ts");
const root = "MT/2025-2025_Regular_Session";

async function make_fixture(dir: string, withSourceDate = true) {
  const zip = new JSZip();
  zip.file(root + "/bill/HB1.json", JSON.stringify({
    bill: { bill_id: 1895956, state: "MT", session_id: 2159, bill_number: "HB1", texts: [],
      ...(withSourceDate ? { status_date: "2026-06-01" } : {}),
    },
  }));
  zip.file(root + "/people/7855.json", JSON.stringify({ person: { people_id: 7855, name: "Fixture Legislator" } }));
  zip.file(root + "/vote/1481116.json", JSON.stringify({ roll_call: { roll_call_id: 1481116, bill_id: 1895956 } }));
  const bytes = await zip.generateAsync({ type: "nodebuffer" });
  const archive = "MT_2025-2025_Regular_Session_JSON_20260101_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.zip";
  const archivePath = join(dir, archive);
  const manifestPath = join(dir, "manifest.json");
  const reportPath = join(dir, "report.json");
  writeFileSync(archivePath, bytes);
  writeFileSync(manifestPath, JSON.stringify({ archives: [{
    archive, sha256: sha256(bytes), bytes: bytes.length, jurisdiction: "MT", session_ids: "2159",
  }] }));
  return { archivePath, manifestPath, reportPath };
}

describe("LegiScan bulk CLI offline provider-parity", () => {
  it("processes bill/person/roll-call wrappers without any DB or provider credentials", async () => {
    const dir = mkdtempSync(join(tmpdir(), "docket-bulk-offline-"));
    try {
      const paths = await make_fixture(dir);
      const output = execFileSync(runner, [
        script, "--manifest=" + paths.manifestPath, "--archive=" + paths.archivePath,
        "--report=" + paths.reportPath,
      ], {
        cwd: process.cwd(), encoding: "utf8",
        env: { PATH: process.env.PATH || "", NODE_ENV: "test" },
        timeout: 25_000,
      });
      const report = JSON.parse(readFileSync(paths.reportPath, "utf8"));
      expect(report.mode).toBe("dry_run");
      expect(report.totals).toMatchObject({ bill: 1, person: 1, roll_call: 1, invalid: 0 });
      expect(output).toContain('"mode":"dry_run"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("reports missing source chronology as a hold and exits nonzero before any DB import", async () => {
    const dir = mkdtempSync(join(tmpdir(), "docket-bulk-held-"));
    try {
      const paths = await make_fixture(dir, false);
      const result = spawnSync(runner, [
        script, "--manifest=" + paths.manifestPath, "--archive=" + paths.archivePath,
        "--report=" + paths.reportPath,
      ], {
        cwd: process.cwd(), encoding: "utf8",
        env: { PATH: process.env.PATH || "", NODE_ENV: "test" },
        timeout: 25_000,
      });
      const report = JSON.parse(readFileSync(paths.reportPath, "utf8"));
      expect(result.status).toBe(1);
      expect(report.totals).toMatchObject({ bill: 1, held: 1, invalid: 0 });
      expect(report.archives[0].holds).toEqual([{
        bill_id: 1895956,
        member_path: root + "/bill/HB1.json",
        reason: "missing_source_event_date",
      }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("rejects --apply without the exact manifest approval before loading writers", async () => {
    const dir = mkdtempSync(join(tmpdir(), "docket-bulk-no-approval-"));
    try {
      const paths = await make_fixture(dir);
      const result = spawnSync(runner, [
        script, "--manifest=" + paths.manifestPath, "--archive=" + paths.archivePath,
        "--report=" + paths.reportPath, "--apply", "--acknowledge-docket-triggers",
      ], {
        cwd: process.cwd(), encoding: "utf8",
        env: { PATH: process.env.PATH || "", NODE_ENV: "test" },
        timeout: 25_000,
      });
      expect(result.status).not.toBe(0);
      expect(String(result.stderr)).toContain("docket_bulk_apply_requires_exact_manifest_approval");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
