import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  REGISTER_VERSION_SPINE_SQL,
  SELECT_UNREGISTERED_BILLS_SQL,
  plan_admission_cycle,
  validate_target_agreement,
  type admitted_generation_target,
  type live_generation_target,
} from "./civic-genome-version-admission-driver";

const driver = readFileSync(
  new URL("./civic-genome-version-admission-driver.ts", import.meta.url),
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

describe("genome version admission target agreement", () => {
  it("admits when the live selected target exactly matches the admitted target", () => {
    expect(validate_target_agreement(admitted, live)).toEqual({ ok: true });
    expect(plan_admission_cycle(admitted, live)).toEqual({ action: "register" });
  });

  it("admits a microsecond-resolution promotion instant converted identically on both sides", () => {
    const admitted_micro: admitted_generation_target = {
      rule_set_version: "rosetta-rule-ref-v99",
      rule_manifest_hash: "a".repeat(64),
      promoted_epoch_ms: 1791786024697,
    };
    const live_micro: live_generation_target = {
      ...live,
      selected_at: "2026-10-12T06:20:24.697643+00:00",
    };
    expect(validate_target_agreement(admitted_micro, live_micro)).toEqual({ ok: true });
    expect(plan_admission_cycle(admitted_micro, live_micro)).toEqual({ action: "register" });
  });

  it("stands down when no target has been admitted", () => {
    expect(plan_admission_cycle(null, live)).toEqual({
      action: "stand_down",
      reason: "no_admitted_target",
    });
  });

  it("stands down when the live target cannot be read", () => {
    expect(plan_admission_cycle(admitted, null)).toEqual({
      action: "stand_down",
      reason: "live_target_unreadable",
    });
  });

  it("stands down when any live identity flag is not true", () => {
    for (const flag of ["identity_valid", "engine_identity_valid", "read_identity_valid"] as const) {
      const broken = { ...live, [flag]: false };
      const agreement = validate_target_agreement(admitted, broken);
      expect(agreement.ok).toBe(false);
      expect(plan_admission_cycle(admitted, broken).action).toBe("stand_down");
    }
  });

  it("stands down when the live rule set version differs", () => {
    const agreement = validate_target_agreement(admitted, {
      ...live,
      ruleset_version: "rosetta-rule-ref-v98",
    });
    expect(agreement).toEqual({ ok: false, reason: "ruleset_version_mismatch" });
  });

  it("stands down when the live rule manifest hash differs", () => {
    const agreement = validate_target_agreement(admitted, {
      ...live,
      ruleset_sha256: "b".repeat(64),
    });
    expect(agreement).toEqual({ ok: false, reason: "ruleset_sha256_mismatch" });
  });

  it("stands down when the live selection instant differs from admission", () => {
    const agreement = validate_target_agreement(admitted, {
      ...live,
      selected_at: "2026-11-15T02:36:35.701Z",
    });
    expect(agreement).toEqual({ ok: false, reason: "promoted_at_mismatch" });
  });
});

describe("genome version admission driver contract", () => {
  it("names no engine generation anywhere in the driver", () => {
    expect(driver).not.toMatch(/rosetta-rule-ref-v\d+/);
    expect(driver).not.toMatch(/rosetta_rule_v\d+/);
    expect(driver).not.toMatch(/\bv1[0-9]\b|\bv2[0-9]\b/);
  });

  it("does not import the retired conveyor, the version pipeline, or the proposal module", () => {
    expect(driver).not.toContain("civic-genome-legacy-decomposition-retirement");
    expect(driver).not.toContain("civic-genome-legislative-version-pipeline");
    expect(driver).not.toContain("civic-genome-rosetta-v12-admission");
    expect(driver).not.toContain("assert_legacy_genome_decomposition_conveyor_available");
  });

  it("registers only through the governed spine door, enqueueing as eligible", () => {
    expect(REGISTER_VERSION_SPINE_SQL).toContain(
      "register_docket_legislative_version_spine($1::int, true)",
    );
  });

  it("selects only bills whose versions hold no queue row, from landed detail only", () => {
    expect(SELECT_UNREGISTERED_BILLS_SQL).toContain("docket_bill_detail_cache");
    expect(SELECT_UNREGISTERED_BILLS_SQL).toContain(
      "not exists (\n       select 1\n         from public.civic_genome_legislative_version_queue queue",
    );
    expect(SELECT_UNREGISTERED_BILLS_SQL).toContain("jsonb_array_elements");
    expect(SELECT_UNREGISTERED_BILLS_SQL).toContain("amendment_id");
    expect(driver).toContain("floor(extract(epoch from promoted_at) * 1000)::bigint");
    expect(SELECT_UNREGISTERED_BILLS_SQL).not.toContain("legiscan");
  });

  it("is wired into the canary worker entry, start and stop", () => {
    expect(entry).toContain("start_genome_version_admission_driver()");
    expect(entry).toContain("stop_genome_version_admission_driver()");
  });

  it("is declared opt-in in the worker contract, default off", () => {
    expect(worker_yaml).toContain("GENOME_VERSION_ADMISSION_ENABLED");
    const flag_index = worker_yaml.indexOf("GENOME_VERSION_ADMISSION_ENABLED");
    expect(worker_yaml.slice(flag_index, flag_index + 120)).toContain('value: "false"');
  });
});
