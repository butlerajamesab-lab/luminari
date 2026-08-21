import { describe, expect, it } from "vitest";
import { resolveFamily } from "./civic-genome/assembly-engine";
import type { CivicGenomeFamily, CivicGenomeTrait } from "./civic-genome/assembly-contract";
import {
  materialize_civic_genome_family_candidates,
  type CivicGenomeCandidateFamilyRow,
  type CivicGenomeCandidateTraitRow,
} from "./civic-genome-family-resolution";

function trait(
  trait_id: string,
  genome_bill_id: string,
  trait_class: CivicGenomeTrait["traitClass"],
  trait_key: string,
  normalized_value_json: unknown,
): CivicGenomeTrait {
  return {
    traitId: trait_id,
    genomeBillId: genome_bill_id,
    traitClass: trait_class,
    traitKey: trait_key,
    normalizedValue: normalized_value_json,
    sourceObjectType: "rosetta_law_object",
    sourceObjectId: `${genome_bill_id}:${trait_id}`,
    sourceBlockId: null,
    extractionRunId: "run-1",
    confidence: 0.95,
    signalStatus: "confirmed",
    traitFingerprint: `${genome_bill_id}:${trait_id}`,
  };
}

function candidate_row(
  family_id: string,
  family_key: string,
  source: CivicGenomeTrait,
): CivicGenomeCandidateTraitRow {
  return {
    family_id,
    family_key,
    policy_domain: "housing",
    trait_id: source.traitId,
    genome_bill_id: source.genomeBillId,
    trait_class: source.traitClass,
    trait_key: source.traitKey,
    normalized_value_json: source.normalizedValue,
    source_object_type: source.sourceObjectType,
    source_object_id: source.sourceObjectId,
    source_block_id: source.sourceBlockId,
    extraction_run_id: source.extractionRunId,
    confidence_score: source.confidence,
    signal_status: source.signalStatus,
    trait_fingerprint: source.traitFingerprint,
  };
}

function family(
  familyId: string,
  familyKey: string,
  confirmedTraits: CivicGenomeTrait[],
): CivicGenomeFamily {
  return { familyId, familyKey, policyDomain: "housing", confirmedTraits };
}

describe("Civic Genome family candidate materialization", () => {
  it("preserves resolver output while leaving zero-overlap families as deterministic placeholders", () => {
    const input_traits = [
      trait("input-1", "input-bill", "actor", "agency", "housing agency"),
      trait("input-2", "input-bill", "workflow", "application_path", ["tenant", "agency"]),
      trait("input-3", "input-bill", "accountability", "review_actor", "housing agency"),
    ];
    const exact_match_family_traits = input_traits.map((item, index) =>
      trait(`exact-${index}`, "exact-bill", item.traitClass, item.traitKey, item.normalizedValue),
    );
    const zero_overlap_family_traits = [
      trait("zero-1", "zero-bill", "actor", "agency", "another agency"),
      trait("zero-2", "zero-bill", "workflow", "application_path", ["agency", "court"]),
    ];
    const full_candidates = [
      family("family-exact", "exact", exact_match_family_traits),
      family("family-zero", "zero", zero_overlap_family_traits),
    ];
    const family_rows: CivicGenomeCandidateFamilyRow[] = full_candidates.map((item) => ({
      family_id: item.familyId,
      family_key: item.familyKey,
      policy_domain: item.policyDomain,
    }));
    const matched_trait_rows = exact_match_family_traits.map((item) =>
      candidate_row("family-exact", "exact", item),
    );

    const materialized = materialize_civic_genome_family_candidates(family_rows, matched_trait_rows);

    expect(materialized).toEqual([
      family("family-exact", "exact", exact_match_family_traits),
      family("family-zero", "zero", []),
    ]);
    expect(resolveFamily("housing", input_traits, materialized, 0.7, 3)).toEqual(
      resolveFamily("housing", input_traits, full_candidates, 0.7, 3),
    );
  });

  it("retains a one-overlap candidate because it can still determine an unresolved receipt", () => {
    const input_traits = [
      trait("input-1", "input-bill", "actor", "agency", "housing agency"),
      trait("input-2", "input-bill", "workflow", "application_path", ["tenant", "agency"]),
    ];
    const one_overlap_traits = [
      trait("one-1", "one-bill", "actor", "agency", "housing agency"),
      trait("one-2", "one-bill", "workflow", "application_path", ["court", "agency"]),
    ];
    const zero_overlap_traits = [
      trait("zero-1", "zero-bill", "actor", "agency", "another agency"),
    ];
    const full_candidates = [
      family("family-one", "one", one_overlap_traits),
      family("family-zero", "zero", zero_overlap_traits),
    ];
    const family_rows: CivicGenomeCandidateFamilyRow[] = full_candidates.map((item) => ({
      family_id: item.familyId,
      family_key: item.familyKey,
      policy_domain: item.policyDomain,
    }));
    const materialized = materialize_civic_genome_family_candidates(
      family_rows,
      one_overlap_traits.map((item) => candidate_row("family-one", "one", item)),
    );

    expect(resolveFamily("housing", input_traits, materialized, 0.7, 3)).toEqual(
      resolveFamily("housing", input_traits, full_candidates, 0.7, 3),
    );
  });
});
