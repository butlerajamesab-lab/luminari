export const CURRENT_LAW_PRESENTATION_CONTRACT_VERSION = "current-law-presentation-v1" as const;

export type current_law_owner =
  | "docket"
  | "rosetta"
  | "prism"
  | "civic_genome"
  | "atlas"
  | "kaleidoscope";

export type current_law_availability_state =
  | "available"
  | "stale"
  | "held"
  | "not_decomposable"
  | "unverified"
  | "not_bound"
  | "bound_not_projected"
  | "not_observed"
  | "unavailable"
  | "error";

export type current_law_source_identity = {
  source_document_key: string;
  source_content_hash: string;
};

export type current_law_human_identity = {
  jurisdiction: string | null;
  bill_number: string | null;
  session: string | null;
  version: string | null;
  status: string | null;
};

export type current_law_authority_envelope<T = unknown> = {
  owner: current_law_owner;
  state: current_law_availability_state;
  observed_at: string | null;
  effective_at: string | null;
  source_identity: current_law_source_identity | null;
  data: T | null;
  detail: string | null;
};

export type current_law_alignment_state = "exact" | "gap" | "mismatch";

export type current_law_alignment = {
  owner: current_law_owner;
  state: current_law_alignment_state;
  expected: current_law_source_identity;
  observed: current_law_source_identity | null;
};

export type current_law_presentation = {
  contract_version: typeof CURRENT_LAW_PRESENTATION_CONTRACT_VERSION;
  generated_at: string;
  identity: current_law_human_identity;
  source: current_law_authority_envelope;
  rosetta: current_law_authority_envelope;
  prism: current_law_authority_envelope;
  civic_genome: current_law_authority_envelope;
  atlas: current_law_authority_envelope;
  kaleidoscope: current_law_authority_envelope;
  alignment: current_law_alignment[];
};

function normalized_hash(value: string): string {
  return value.toLowerCase();
}

export function compare_current_law_source_identity(
  expected: current_law_source_identity,
  owner: current_law_owner,
  observed: current_law_source_identity | null,
): current_law_alignment {
  if (!observed) {
    return { owner, state: "gap", expected, observed: null };
  }
  const exact = observed.source_document_key === expected.source_document_key
    && normalized_hash(observed.source_content_hash) === normalized_hash(expected.source_content_hash);
  return {
    owner,
    state: exact ? "exact" : "mismatch",
    expected,
    observed,
  };
}

export function build_current_law_presentation(input: {
  generated_at: string;
  identity: current_law_human_identity;
  source: current_law_authority_envelope;
  rosetta: current_law_authority_envelope;
  prism: current_law_authority_envelope;
  civic_genome: current_law_authority_envelope;
  atlas: current_law_authority_envelope;
  kaleidoscope: current_law_authority_envelope;
}): current_law_presentation {
  if (input.source.owner !== "docket") {
    throw new Error("current_law_presentation_source_owner_must_be_docket");
  }
  if (!input.source.source_identity) {
    throw new Error("current_law_presentation_source_identity_required");
  }

  const expected = input.source.source_identity;
  const downstream = [
    input.rosetta,
    input.prism,
    input.civic_genome,
    input.atlas,
    input.kaleidoscope,
  ];

  return {
    contract_version: CURRENT_LAW_PRESENTATION_CONTRACT_VERSION,
    generated_at: input.generated_at,
    identity: input.identity,
    source: input.source,
    rosetta: input.rosetta,
    prism: input.prism,
    civic_genome: input.civic_genome,
    atlas: input.atlas,
    kaleidoscope: input.kaleidoscope,
    alignment: downstream.map(envelope =>
      compare_current_law_source_identity(expected, envelope.owner, envelope.source_identity)
    ),
  };
}
