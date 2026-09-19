import { describe, expect, it } from "vitest";
import { crossDomainCaregivingIntakeFixtureV1 as fixture } from "./cross_domain_caregiving_intake_fixture.v1";

export interface IntakeSpineFixtureResult {
  stabilization?: unknown[];
  artifacts?: Array<Record<string, unknown>>;
  chronology?: Array<Record<string, unknown>>;
  entities?: Array<Record<string, unknown>>;
  relationships?: Array<Record<string, unknown>>;
  power_dynamics?: Array<Record<string, unknown>>;
  state_timeline?: Array<Record<string, unknown>>;
  patterns?: Array<Record<string, unknown>>;
  cascades?: Array<Record<string, unknown>>;
  rights_and_duties?: Array<Record<string, unknown>>;
  translations?: Array<Record<string, unknown>>;
  action_paths?: Array<Record<string, unknown>>;
  warnings?: string[];
  deterministic_fingerprint?: string;
}

export interface IntakeSpineFixtureAdapter {
  run(input: unknown): Promise<IntakeSpineFixtureResult>;
}

/**
 * Registers the golden-fixture contract against the implementation adapter.
 * The fixture is implementation-neutral and does not execute until imported
 * by the intake-spine implementation's own test file.
 */
export function registerCrossDomainCaregivingFixtureContract(
  adapter: IntakeSpineFixtureAdapter,
) {
  describe("universal intake spine — de-identified cross-domain caregiving fixture", () => {
    it("stabilizes before requiring a complete chronology", async () => {
      const result = await adapter.run({
        fixture_id: fixture.fixture_metadata.fixture_id,
        slice: fixture.test_slices.find(
          (slice) => slice.slice_id === "slice_00_stabilization_first",
        ),
      });
      expect(result.stabilization?.length ?? 0).toBeGreaterThan(0);
    });

    it("preserves primary-versus-derivative evidence status", async () => {
      const result = await adapter.run(fixture);
      const sms = result.artifacts?.find(
        (artifact) => artifact.artifact_id === "artifact_sms_export",
      );
      expect(sms?.availability).toBe("referenced_not_bundled");
      expect(sms?.evidence_tier).toBe("primary_source_referenced_not_bundled");
    });

    it("keeps chronology free of legal conclusions", async () => {
      const result = await adapter.run(fixture);
      for (const event of result.chronology ?? []) {
        expect(event.legal_conclusion ?? null).toBeNull();
      }
    });

    it("does not activate authority-dependent duties without the authority document", async () => {
      const result = await adapter.run(fixture);
      const authority = result.rights_and_duties?.find(
        (row) => row.rights_duties_id === "rd_001",
      );
      expect(authority?.activation_state).toBe(
        "pending_missing_authority_document",
      );
    });

    it("requires every cascade to reference chronology", async () => {
      const result = await adapter.run(fixture);
      for (const cascade of result.cascades ?? []) {
        expect(Array.isArray(cascade.related_chronology_ids)).toBe(true);
        expect(
          (cascade.related_chronology_ids as unknown[]).length,
        ).toBeGreaterThan(0);
      }
    });

    it("offers multiple capacity-aware action paths", async () => {
      const result = await adapter.run(fixture);
      expect(result.action_paths?.length ?? 0).toBeGreaterThanOrEqual(3);
      expect(
        result.action_paths?.some(
          (path) => path.path_type === "stabilization_and_capacity",
        ),
      ).toBe(true);
    });

    it("reopens stabilization when a later urgent event arrives", async () => {
      const slice = fixture.test_slices.find(
        (candidate) => candidate.slice_id === "slice_06_reassessment_loop",
      );
      const result = await adapter.run({ fixture, slice });
      expect(result.stabilization?.length ?? 0).toBeGreaterThan(0);
    });

    it("is deterministic for identical fixture input", async () => {
      const first = await adapter.run(fixture);
      const second = await adapter.run(fixture);
      expect(first.deterministic_fingerprint).toBeTruthy();
      expect(second.deterministic_fingerprint).toBe(
        first.deterministic_fingerprint,
      );
    });
  });
}
