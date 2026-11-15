import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CLAIM_INGESTION_JOBS_SQL,
  COMPLETE_INGESTION_JOB_SQL,
  DEFER_INGESTION_JOB_SQL,
  PARK_INGESTION_JOB_SQL,
  RECORD_INGESTION_SQL,
  RECOVER_STRANDED_INGESTED_SQL,
  is_deterministic_ingestion_failure,
  plan_ingestion_cycle,
} from "./civic-genome-rosetta-ingestion-driver";
import type {
  admitted_generation_target,
  live_generation_target,
} from "./civic-genome-version-admission-driver";

const driver = readFileSync(
  new URL("./civic-genome-rosetta-ingestion-driver.ts", import.meta.url),
  "utf8",
);
const entry = readFileSync(
  new URL("./prism-rosetta-worker.ts", import.meta.url),
  "utf8",
);
const worker_yaml = readFileSync(
  new URL("../render.prism-worker.yaml", import.meta.url),
  "utf8",
);

const admitted: admitted_generation_target = {
  rule_set_version: "rosetta-rule-ref-v99",
  rule_manifest_hash: "a".repeat(64),
  promoted_epoch_ms: Date.parse("2026-11-15T02:36:34.701Z"),
};

const live: live_generation_target = {
  ruleset_version: "rosetta-rule-ref-v99",
  ruleset_sha256: "A".repeat(64),
  selected_at: "2026-11-15T02:36:34.701Z",
  identity_valid: true,
  engine_identity_valid: true,
  read_identity_valid: true,
};

describe("genome rosetta ingestion target agreement", () => {
  it("ingests when the live selected target exactly matches the admitted target", () => {
    expect(plan_ingestion_cycle(admitted, live)).toEqual({ action: "ingest" });
  });

  it("stands down when no target has been admitted", () => {
    expect(plan_ingestion_cycle(null, live)).toEqual({
      action: "stand_down",
      reason: "no_admitted_target",
    });
  });

  it("stands down when the live target cannot be read", () => {
    expect(plan_ingestion_cycle(admitted, null)).toEqual({
      action: "stand_down",
      reason: "live_target_unreadable",
    });
  });

  it("stands down when the live ruleset version differs from the admitted target", () => {
    expect(
      plan_ingestion_cycle(admitted, {
        ...live,
        ruleset_version: "rosetta-rule-ref-v98",
      }),
    ).toEqual({ action: "stand_down", reason: "ruleset_version_mismatch" });
  });

  it("stands down when the live ruleset fingerprint differs", () => {
    expect(
      plan_ingestion_cycle(admitted, {
        ...live,
        ruleset_sha256: "b".repeat(64),
      }),
    ).toEqual({ action: "stand_down", reason: "ruleset_sha256_mismatch" });
  });
});

describe("genome rosetta ingestion failure classification", () => {
  it("treats source-shape failures as deterministic parks", () => {
    for (const code of [
      "legislative_version_non_legislative_document:fiscal_note",
      "legislative_version_source_url_invalid",
      "legislative_version_reference_date_unavailable",
      "legislative_amendment_attachment_unresolved:no_base",
      "legislative_amendment_base_content_unavailable",
      "legislative_amendment_attachment_state_unresolved",
      "legislative_amendment_attachment_not_resolved",
    ]) {
      expect(is_deterministic_ingestion_failure(new Error(code))).toBe(true);
    }
  });

  it("treats transport and database failures as transient", () => {
    expect(
      is_deterministic_ingestion_failure(new Error("fetch failed")),
    ).toBe(false);
    expect(
      is_deterministic_ingestion_failure(
        new Error("DbTimeoutDiagnosticError: pool acquire timeout"),
      ),
    ).toBe(false);
  });
});

describe("genome rosetta ingestion driver contract", () => {
  it("claims only eligible, due rows whose version is still registered", () => {
    expect(CLAIM_INGESTION_JOBS_SQL).toContain("queue_state = 'eligible'");
    expect(CLAIM_INGESTION_JOBS_SQL).toContain(
      "version.processing_state = 'registered'",
    );
    expect(CLAIM_INGESTION_JOBS_SQL).toContain("queue.next_attempt_at <= now()");
    expect(CLAIM_INGESTION_JOBS_SQL).toContain("skip locked");
    expect(CLAIM_INGESTION_JOBS_SQL).not.toContain("'degraded'");
    expect(CLAIM_INGESTION_JOBS_SQL).not.toContain("'permanent_failure'");
  });

  it("never mutates attempt_count, so result observation can still claim completed rows", () => {
    for (const sql of [
      CLAIM_INGESTION_JOBS_SQL,
      COMPLETE_INGESTION_JOB_SQL,
      PARK_INGESTION_JOB_SQL,
      DEFER_INGESTION_JOB_SQL,
    ]) {
      expect(sql).not.toContain("attempt_count");
    }
  });

  it("recovers stale leases stranded after the source-ingested transition", () => {
    expect(RECOVER_STRANDED_INGESTED_SQL).toContain("queue.locked_at is not null");
    expect(RECOVER_STRANDED_INGESTED_SQL).toContain(
      "version.processing_state <> 'registered'",
    );
    expect(RECOVER_STRANDED_INGESTED_SQL).toContain("locked_at = null");
    expect(RECOVER_STRANDED_INGESTED_SQL).not.toContain("attempt_count");
    expect(driver.indexOf("recover_stranded_ingested_jobs()")).toBeLessThan(
      driver.indexOf("claim_ingestion_jobs(bounded_batch_size())"),
    );
  });

  it("records ingestion as raw evidence the receipt quarantine accepts", () => {
    expect(RECORD_INGESTION_SQL).toContain("processing_state = 'source_ingested'");
    expect(RECORD_INGESTION_SQL).toContain("rosetta_source_document_id = $2::bigint");
    expect(RECORD_INGESTION_SQL).toContain("'source_content_hash'");
    expect(RECORD_INGESTION_SQL).toContain("'source_byte_hash'");
    expect(RECORD_INGESTION_SQL).not.toContain("rosetta_source_content_id");
    expect(RECORD_INGESTION_SQL).not.toContain("rosetta_source_identity_hash");
    expect(RECORD_INGESTION_SQL).not.toContain("current_rosetta_status");
    expect(RECORD_INGESTION_SQL).not.toContain("family_resolution_status");
    expect(driver).not.toContain("record_source_ingested(");
  });

  it("parks deterministic failures as degraded evidence with the exact reason", () => {
    expect(PARK_INGESTION_JOB_SQL).toContain("queue_state = 'degraded'");
    expect(PARK_INGESTION_JOB_SQL).toContain(
      "next_attempt_at = 'infinity'::timestamptz",
    );
    expect(PARK_INGESTION_JOB_SQL).toContain("last_failure_class = 'ingestion_parked'");
  });

  it("carries no generation name of its own", () => {
    expect(driver).not.toMatch(/rosetta-rule-ref-v\d+/);
    expect(driver).not.toMatch(/rosetta_rule_v\d+/);
    expect(driver).not.toMatch(/\bv1[0-9]\b|\bv2[0-9]\b/);
  });

  it("never reaches for the retired conveyor, the binding admission, or decomposition", () => {
    expect(driver).not.toContain("process_legislative_version");
    expect(driver).not.toContain("attach_completed_current_result");
    expect(driver).not.toContain("require_v12_admission");
    expect(driver).not.toContain("assert_legacy_genome_decomposition_conveyor");
    expect(driver).not.toContain("LEGACY_GENOME_DECOMPOSITION_CONVEYOR");
    expect(driver).not.toContain("civic-genome-legislative-version-queue-worker");
    expect(driver).not.toContain("decompose_current");
    expect(driver).not.toContain("civic_genome_rosetta_generation_binding");
    expect(driver).not.toContain("civic_genome_source_binding");
    expect(driver).not.toContain("assembly_run");
  });

  it("is wired into the worker entry start and shutdown", () => {
    expect(entry).toContain("start_genome_rosetta_ingestion_driver();");
    expect(entry).toContain("stop_genome_rosetta_ingestion_driver()");
  });

  it("ships disabled in the worker contract", () => {
    expect(worker_yaml).toContain("GENOME_ROSETTA_INGESTION_ENABLED");
    expect(worker_yaml).toMatch(
      /GENOME_ROSETTA_INGESTION_ENABLED\s*\n\s*value: "false"/,
    );
  });
});
