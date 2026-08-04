import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { PrismBoundaryError } from "./prism-verification-client";
import {
  classify_prism_queue_failure,
  prism_queue_retry_delay_seconds,
} from "./prism-rosetta-queue-worker";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260804122500_civic_genome_prism_verification_queue.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Prism Rosetta verification queue", () => {
  it("uses bounded deterministic retry delays", () => {
    expect(prism_queue_retry_delay_seconds(1)).toBe(30);
    expect(prism_queue_retry_delay_seconds(2)).toBe(60);
    expect(prism_queue_retry_delay_seconds(3)).toBe(120);
    expect(prism_queue_retry_delay_seconds(20)).toBe(3_600);
  });

  it("preserves partial receipts across transient failures", () => {
    const decision = classify_prism_queue_failure({
      error: new PrismBoundaryError(
        "transient_upstream",
        503,
        "prism_request_failed",
      ),
      prior_attempt_count: 1,
      receipt_count: 7,
    });
    expect(decision).toMatchObject({
      queue_state: "receipt_partial",
      failure_class: "transient_upstream",
      terminal: false,
      retry_delay_seconds: 60,
    });
  });

  it("fails closed for receipt validation and identity conflicts", () => {
    const validation = classify_prism_queue_failure({
      error: new PrismBoundaryError(
        "validation",
        502,
        "prism_receipt_integrity_failure",
      ),
      prior_attempt_count: 0,
      receipt_count: 0,
    });
    const identity = classify_prism_queue_failure({
      error: new Error(
        "prism_rosetta_identity_mismatch:trait-1:source_content",
      ),
      prior_attempt_count: 0,
      receipt_count: 0,
    });
    expect(validation.queue_state).toBe("permanent_failure");
    expect(validation.terminal).toBe(true);
    expect(identity.queue_state).toBe("permanent_failure");
    expect(identity.terminal).toBe(true);
  });

  it("bounds unknown failures instead of retrying forever", () => {
    const retry = classify_prism_queue_failure({
      error: new Error("database_connection_interrupted"),
      prior_attempt_count: 2,
      receipt_count: 0,
    });
    const terminal = classify_prism_queue_failure({
      error: new Error("database_connection_interrupted"),
      prior_attempt_count: 4,
      receipt_count: 0,
    });
    expect(retry.queue_state).toBe("degraded");
    expect(retry.terminal).toBe(false);
    expect(terminal.queue_state).toBe("permanent_failure");
    expect(terminal.terminal).toBe(true);
  });

  it("backfills, transactionally enqueues, and denies browser access", () => {
    expect(migration).toContain(
      "insert into public.civic_genome_prism_verification_queue",
    );
    expect(migration).toContain(
      "create trigger civic_genome_assembly_enqueue_prism_verification",
    );
    expect(migration).toContain(
      "after insert or update of run_status, verification_state, trait_count, completed_at",
    );
    expect(migration).toContain(
      "alter table public.civic_genome_prism_verification_queue force row level security",
    );
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).not.toMatch(/https?:\/\//);
  });
});
