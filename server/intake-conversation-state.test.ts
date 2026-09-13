import { describe, expect, it } from "vitest";
import { autoDetect } from "./intake-autodetect";
import { build_deterministic_intake_turn } from "./intake-conversation-state";

describe("deterministic intake conversation", () => {
  it("always offers the general intake after enough unmatched context", () => {
    const result = build_deterministic_intake_turn("other", [
      "Something happened that does not fit the menu.",
      "A few people and an organization were involved.",
      "I have a note but I am still figuring it out.",
    ]);

    expect(result.stage).toBe("plan_ready");
    expect(result.plan).toMatchObject({
      pipelineType: "other",
      selectionBasis: "general_fallback",
      caseName: "General Investigation",
      ready: true,
    });
    expect(result.reply).toContain("do not need to force this into a category");
  });

  it("keeps an explicitly selected pipeline instead of letting text reroute it", () => {
    const result = build_deterministic_intake_turn("tenant_rights", [
      "My insurance claim was denied.",
      "The insurer sent a letter.",
      "I have the policy and denial notice.",
    ]);

    expect(result.plan).toMatchObject({
      pipelineType: "tenant_rights",
      selectionBasis: "explicit_pipeline",
    });
  });

  it("returns a general suggestion for every non-empty unmatched intake", () => {
    const result = autoDetect({ combined_text: "quizzical zephyrs orbit mauve lanterns" });

    expect(result.suggestions[0]).toMatchObject({
      pipeline_id: "other",
      category: "general",
      label: "General Investigation",
      confidence: 0,
    });
  });
});
