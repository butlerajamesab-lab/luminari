import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const recovery = readFileSync(
  join(process.cwd(), "server", "civic-genome-current-authoritative-timeout-reconciliation.ts"),
  "utf8",
);
const startup = readFileSync(
  join(process.cwd(), "server", "services", "prism-rosetta-startup-activation.ts"),
  "utf8",
);

describe("current authoritative legacy Rosetta timeout recovery", () => {
  it("reopens only current-session enacted Enrolled or Chaptered legacy 60-second failures", () => {
    expect(recovery).toContain("bill.current_state_position = 'enacted'");
    expect(recovery).toContain("current_session.session_key = bill.session_key");
    expect(recovery).toContain("lower(version.version_type) in ('chaptered', 'enrolled')");
    expect(recovery).toContain("queue.queue_state = 'permanent_failure'");
    expect(recovery).toContain("legislative_version_rosetta_extraction_timeout:60000");
    expect(recovery).toContain("version.processing_state = 'failed'");
    expect(recovery).toContain("version.failure_code = $1");
  });

  it("uses the queue monotonicity guard's explicit intentional-replay signal without erasing history", () => {
    expect(recovery).toContain("last_failure_class = null");
    expect(recovery).toContain("last_error_code = null");
    expect(recovery).toContain("queue_state = 'eligible'");
    expect(recovery).not.toContain("attempt_count = 0");
    expect(recovery).not.toMatch(/delete\s+from/i);
    expect(recovery).not.toMatch(/truncate/i);
    expect(recovery).not.toContain("update public.civic_genome_bill_version");
  });

  it("runs recovery before the legislative-version worker begins claiming jobs", () => {
    const recoveryCall = startup.indexOf("await reconcile_current_authoritative_legacy_rosetta_timeouts()");
    const workerStart = startup.indexOf("start_legislative_version_queue_worker()");
    expect(startup).toContain(
      'background_feature_enabled("ROSETTA_LEGACY_TIMEOUT_RECONCILIATION_ENABLED")',
    );
    expect(recoveryCall).toBeGreaterThanOrEqual(0);
    expect(workerStart).toBeGreaterThan(recoveryCall);
  });
});
