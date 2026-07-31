import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db_mock = vi.hoisted(() => ({
  connect: vi.fn(),
  query_with_diagnostics: vi.fn(),
}));

vi.mock("../db", () => ({
  getPool: () => ({ connect: db_mock.connect }),
  query_with_diagnostics: db_mock.query_with_diagnostics,
}));

const { promote_registry_entity_candidates_apply } = await import("./ingestion_control");

const promotion_flag = "ENABLE_CANONICAL_PROMOTION_FOR_STATE_ENRICHED_REGISTRY_DOCX_REVIEW";
const original_flag = process.env[promotion_flag];

describe("registry promotion pool safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env[promotion_flag];
  });

  afterEach(() => {
    if (original_flag === undefined) delete process.env[promotion_flag];
    else process.env[promotion_flag] = original_flag;
  });

  it("does not acquire a client when apply is disabled by policy", async () => {
    const result = await promote_registry_entity_candidates_apply({
      dry_run: false,
      target_hint: "state_enriched_registry_docx_review",
    });

    expect(result).toMatchObject({
      success: false,
      error: "canonical_promotion_feature_flag_disabled",
    });
    expect(db_mock.connect).not.toHaveBeenCalled();
  });

  it("does not acquire a client for an unsupported promotion lane", async () => {
    const result = await promote_registry_entity_candidates_apply({
      dry_run: true,
      target_hint: "unsupported_lane",
    });

    expect(result).toMatchObject({
      success: false,
      error: "unsupported_promotion_lane",
    });
    expect(db_mock.connect).not.toHaveBeenCalled();
  });
});
