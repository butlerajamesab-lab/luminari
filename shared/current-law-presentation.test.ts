import { describe, expect, it } from "vitest";
import {
  build_current_law_presentation,
  compare_current_law_source_identity,
  type current_law_authority_envelope,
  type current_law_source_identity,
} from "./current-law-presentation";

const source_identity: current_law_source_identity = {
  source_document_key: "legiscan:WA:HB1234:3387816",
  source_content_hash: "a".repeat(64),
};

function envelope(
  owner: current_law_authority_envelope["owner"],
  source_identity_override: current_law_source_identity | null = source_identity,
  state: current_law_authority_envelope["state"] = "available",
): current_law_authority_envelope {
  return {
    owner,
    state,
    observed_at: "2026-10-07T00:00:00.000Z",
    effective_at: null,
    source_identity: source_identity_override,
    data: null,
    detail: null,
  };
}

describe("CurrentLawPresentation", () => {
  it("preserves exact deterministic identity across owners", () => {
    const alignment = compare_current_law_source_identity(
      source_identity,
      "rosetta",
      { ...source_identity, source_content_hash: source_identity.source_content_hash.toUpperCase() },
    );
    expect(alignment.state).toBe("exact");
  });

  it("renders a missing binding as a gap instead of inferring a relationship", () => {
    const alignment = compare_current_law_source_identity(source_identity, "atlas", null);
    expect(alignment.state).toBe("gap");
    expect(alignment.observed).toBeNull();
  });

  it("renders a conflicting deterministic identity as a mismatch", () => {
    const alignment = compare_current_law_source_identity(
      source_identity,
      "civic_genome",
      { ...source_identity, source_content_hash: "b".repeat(64) },
    );
    expect(alignment.state).toBe("mismatch");
  });

  it("does not collapse subsystem availability into one overall status", () => {
    const presentation = build_current_law_presentation({
      generated_at: "2026-10-07T00:00:00.000Z",
      identity: {
        jurisdiction: "WA",
        bill_number: "HB 1234",
        session: "2026",
        version: "enrolled",
        status: "chaptered",
      },
      source: envelope("docket"),
      rosetta: envelope("rosetta", source_identity, "available"),
      prism: envelope("prism", source_identity, "unverified"),
      civic_genome: envelope("civic_genome", null, "not_bound"),
      atlas: envelope("atlas", null, "stale"),
      kaleidoscope: envelope("kaleidoscope", source_identity, "bound_not_projected"),
    });

    expect(presentation.rosetta.state).toBe("available");
    expect(presentation.prism.state).toBe("unverified");
    expect(presentation.civic_genome.state).toBe("not_bound");
    expect(presentation.atlas.state).toBe("stale");
    expect(presentation.kaleidoscope.state).toBe("bound_not_projected");
    expect(presentation.alignment.map(item => [item.owner, item.state])).toEqual([
      ["rosetta", "exact"],
      ["prism", "exact"],
      ["civic_genome", "gap"],
      ["atlas", "gap"],
      ["kaleidoscope", "exact"],
    ]);
  });

  it("requires Docket to remain the explicit source authority", () => {
    expect(() => build_current_law_presentation({
      generated_at: "2026-10-07T00:00:00.000Z",
      identity: {
        jurisdiction: "WA",
        bill_number: "HB 1234",
        session: "2026",
        version: "enrolled",
        status: "chaptered",
      },
      source: envelope("rosetta"),
      rosetta: envelope("rosetta"),
      prism: envelope("prism"),
      civic_genome: envelope("civic_genome"),
      atlas: envelope("atlas"),
      kaleidoscope: envelope("kaleidoscope"),
    })).toThrow("current_law_presentation_source_owner_must_be_docket");
  });
});
