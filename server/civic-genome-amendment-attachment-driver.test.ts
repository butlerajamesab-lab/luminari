import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CLAIM_ATTACHMENT_CANDIDATES_SQL,
  RECORD_ATTACHMENT_EVALUATION_SQL,
  content_hash_matches,
  plan_attachment_cycle,
  plan_evaluation_failure,
  select_content_by_hash,
  type preserved_content,
} from "./civic-genome-amendment-attachment-driver";
import type {
  admitted_generation_target,
  live_generation_target,
} from "./civic-genome-version-admission-driver";

const driver = readFileSync(
  new URL("./civic-genome-amendment-attachment-driver.ts", import.meta.url),
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

describe("amendment attachment target agreement", () => {
  it("evaluates when the live selected target exactly matches the admitted target", () => {
    expect(plan_attachment_cycle(admitted, live)).toEqual({ action: "evaluate" });
  });

  it("stands down when no target has been admitted", () => {
    expect(plan_attachment_cycle(null, live)).toEqual({
      action: "stand_down",
      reason: "no_admitted_target",
    });
  });

  it("stands down when the live target cannot be read", () => {
    expect(plan_attachment_cycle(admitted, null)).toEqual({
      action: "stand_down",
      reason: "live_target_unreadable",
    });
  });

  it("stands down when the targets disagree", () => {
    expect(
      plan_attachment_cycle(admitted, { ...live, ruleset_version: "rosetta-rule-ref-v98" }).action,
    ).toBe("stand_down");
  });
});

describe("attachment candidate claim", () => {
  it("selects only unevaluated, ingested, unbased amendments with preserved content", () => {
    expect(CLAIM_ATTACHMENT_CANDIDATES_SQL).toContain("document_family = 'amendment'");
    expect(CLAIM_ATTACHMENT_CANDIDATES_SQL).toContain("base_bill_version_id is null");
    expect(CLAIM_ATTACHMENT_CANDIDATES_SQL).toContain("processing_state = 'source_ingested'");
    expect(CLAIM_ATTACHMENT_CANDIDATES_SQL).toContain("rosetta_source_document_id is not null");
    expect(CLAIM_ATTACHMENT_CANDIDATES_SQL).toContain("source_content_hash");
    expect(CLAIM_ATTACHMENT_CANDIDATES_SQL).toContain(
      "not (version.receipt_json ? 'amendment_attachment_evaluation_v1')",
    );
  });

  it("also claims stem-linked amendments that still lack their attachment receipt, so a registration-time link is verified instead of stranding the receipt", () => {
    expect(CLAIM_ATTACHMENT_CANDIDATES_SQL).toContain("base_bill_version_id is not null");
    expect(CLAIM_ATTACHMENT_CANDIDATES_SQL).toContain(
      "not (version.receipt_json ? 'amendment_attachment_v1')",
    );
  });

  it("resumes stale evaluating markers so partial completions are never stranded", () => {
    expect(CLAIM_ATTACHMENT_CANDIDATES_SQL).toContain("->>'status'");
    expect(CLAIM_ATTACHMENT_CANDIDATES_SQL).toMatch(/=\s*'evaluating'/);
    expect(CLAIM_ATTACHMENT_CANDIDATES_SQL).toContain("make_interval(mins =>");
    expect(driver).toContain('"evaluating"');
  });

  it("never touches queue rows", () => {
    expect(CLAIM_ATTACHMENT_CANDIDATES_SQL).not.toContain("legislative_version_queue");
    expect(driver).not.toContain("civic_genome_legislative_version_queue");
  });
});

describe("evaluation record", () => {
  it("writes the evaluation receipt key outside the derivative namespaces", () => {
    expect(RECORD_ATTACHMENT_EVALUATION_SQL).toContain("amendment_attachment_evaluation_v1");
    expect(RECORD_ATTACHMENT_EVALUATION_SQL).not.toMatch(/'(rosetta|assembly|prism)_/);
    expect(RECORD_ATTACHMENT_EVALUATION_SQL).toContain(
      "lighthouse-amendment-attachment-evaluation-v1",
    );
  });
});

describe("content hash verification", () => {
  it("matches case-insensitively and rejects missing or differing hashes", () => {
    expect(content_hash_matches("AB".repeat(32), "ab".repeat(32))).toBe(true);
    expect(content_hash_matches("ab".repeat(32), "cd".repeat(32))).toBe(false);
    expect(content_hash_matches(null, "ab".repeat(32))).toBe(false);
    expect(content_hash_matches("ab".repeat(32), undefined)).toBe(false);
  });
});

describe("preserved content selection", () => {
  const rows: preserved_content[] = [
    {
      source_content_id: "11",
      source_text: "older registration",
      source_content_hash: "cd".repeat(32),
      source_url: "https://example.test/a",
    },
    {
      source_content_id: "12",
      source_text: "the recorded registration",
      source_content_hash: "AB".repeat(32),
      source_url: "https://example.test/b",
    },
  ];

  it("selects the row whose hash matches the recorded hash, not the first row", () => {
    expect(select_content_by_hash(rows, "ab".repeat(32))?.source_content_id).toBe("12");
  });

  it("returns null when no preserved row matches", () => {
    expect(select_content_by_hash(rows, "ef".repeat(32))).toBeNull();
    expect(select_content_by_hash([], "ab".repeat(32))).toBeNull();
  });
});

describe("evaluation failure retry cap", () => {
  it("retries below the cap and parks at the cap", () => {
    expect(plan_evaluation_failure(0, 5)).toEqual({
      action: "retry",
      failure_count: 1,
    });
    expect(plan_evaluation_failure(3, 5)).toEqual({
      action: "retry",
      failure_count: 4,
    });
    expect(plan_evaluation_failure(4, 5)).toEqual({
      action: "park",
      failure_count: 5,
    });
    expect(plan_evaluation_failure(9, 5)).toEqual({
      action: "park",
      failure_count: 10,
    });
  });

  it("stops a repeatedly failing candidate at the cap instead of re-evaluating forever (regression)", () => {
    // Drive one candidate through the plan the way the cycle does, feeding
    // each recorded count back in. On the uncapped driver this loop never
    // parks: a candidate whose evaluation always throws was re-claimed on
    // every staleness interval, without limit.
    let recorded = 0;
    let retries = 0;
    let parked_at: number | null = null;
    for (let failure = 0; failure < 50; failure += 1) {
      const plan = plan_evaluation_failure(recorded, 5);
      recorded = plan.failure_count;
      if (plan.action === "park") {
        parked_at = plan.failure_count;
        break;
      }
      retries += 1;
    }
    expect(parked_at).toBe(5);
    expect(retries).toBe(4);
  });

  it("claims failed evaluations only while their count is below the cap", () => {
    expect(CLAIM_ATTACHMENT_CANDIDATES_SQL).toContain("'evaluation_failed'");
    expect(CLAIM_ATTACHMENT_CANDIDATES_SQL).toContain(
      "'failure_count')::int",
    );
    expect(CLAIM_ATTACHMENT_CANDIDATES_SQL).toContain("< $2::int");
    expect(CLAIM_ATTACHMENT_CANDIDATES_SQL).toContain("as failure_count");
  });

  it("records the failure count inside the evaluation marker", () => {
    expect(RECORD_ATTACHMENT_EVALUATION_SQL).toContain(
      "'failure_count', $4::int",
    );
    expect(driver).toContain('"evaluation_failed"');
    expect(driver).toContain("plan_evaluation_failure(");
  });
});

describe("attachment driver wiring", () => {
  it("evaluates only through the governed pipeline functions", () => {
    expect(driver).toContain("resolve_current_amendment_attachment");
    expect(driver).toContain("register_rosetta_amendment_attachment");
    expect(driver).toContain("record_amendment_attachment");
    expect(driver).not.toMatch(/update public\.civic_genome_bill_version\s+set base_bill_version_id/);
    expect(driver).not.toMatch(/v\d{2}|rosetta-rule-ref-v\d+/);
  });

  it("is started and stopped by the worker entry behind its own flag", () => {
    expect(entry).toContain("start_genome_amendment_attachment_driver()");
    expect(entry).toContain("stop_genome_amendment_attachment_driver()");
    expect(driver).toContain('background_feature_enabled("GENOME_AMENDMENT_ATTACHMENT_ENABLED")');
    expect(worker_yaml).toContain("GENOME_AMENDMENT_ATTACHMENT_ENABLED");
    expect(worker_yaml).toMatch(/GENOME_AMENDMENT_ATTACHMENT_ENABLED\s*\n\s*value: "false"/);
  });
});
