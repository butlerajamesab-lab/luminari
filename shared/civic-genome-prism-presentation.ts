export type CivicGenomeProofEntry = Record<string, unknown>;

export type CivicGenomePrismPresentationTrait = {
  prism_verification_status?: string | null;
  prism_supported_findings?: unknown[] | null;
  prism_contradictions?: unknown[] | null;
  prism_missing_evidence?: unknown[] | null;
  prism_unresolved_conditions?: unknown[] | null;
};

export type CivicGenomePrismDisplay = {
  token:
    | "official_legislative_source_verified"
    | "amendment_not_adopted"
    | "amendment_disposition_conflict"
    | "technical_verification_finding"
    | "verification_incomplete"
    | "verification_unresolved"
    | "verification_not_observed";
  label: string;
  tone: "supported" | "finding" | "open" | "neutral";
};

const NO_SECOND_SOURCE_CONDITION = "independent_authoritative_source_not_supplied";

export function civic_genome_proof_entries(value: unknown): CivicGenomeProofEntry[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is CivicGenomeProofEntry =>
      Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

export function civic_genome_proof_item_label(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as CivicGenomeProofEntry;
  for (const field of [entry.check, entry.finding, entry.requirement, entry.condition]) {
    if (typeof field === "string" && field.length > 0) return field;
  }
  return null;
}

function string_field(entry: CivicGenomeProofEntry, field: string): string | null {
  const value = entry[field];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function check_is(entry: CivicGenomeProofEntry, check: string): boolean {
  return string_field(entry, "check") === check;
}

function amendment_disposition_display(
  supported: CivicGenomeProofEntry[],
  contradictions: CivicGenomeProofEntry[],
): CivicGenomePrismDisplay | null {
  // In Prism v2.3 amendment_disposition_matches_source mismatches use
  // `expected` for the disposition observed in the official amendment source
  // and `observed` for the Docket/context disposition. The official source wins
  // the human presentation, while the conflicting receipt remains preserved.
  const source_mismatch = contradictions.find(entry =>
    check_is(entry, "amendment_disposition_matches_source"));
  if (source_mismatch) {
    if (string_field(source_mismatch, "expected") === "not_adopted") {
      return {
        token: "amendment_not_adopted",
        label: "Amendment not adopted",
        tone: "finding",
      };
    }
    return {
      token: "amendment_disposition_conflict",
      label: "Amendment disposition conflict",
      tone: "finding",
    };
  }

  const source_pass = supported.find(entry =>
    check_is(entry, "amendment_disposition_matches_source"));
  if (source_pass) {
    const source_disposition = string_field(source_pass, "source_disposition");
    const resolved_disposition = source_disposition && source_disposition !== "not_explicit"
      ? source_disposition
      : string_field(source_pass, "observed");
    if (resolved_disposition === "not_adopted") {
      return {
        token: "amendment_not_adopted",
        label: "Amendment not adopted",
        tone: "finding",
      };
    }
  }

  const trait_mismatch = contradictions.find(entry =>
    check_is(entry, "amendment_disposition_matches_trait"));
  if (trait_mismatch) {
    if (string_field(trait_mismatch, "expected") === "not_adopted") {
      return {
        token: "amendment_not_adopted",
        label: "Amendment not adopted",
        tone: "finding",
      };
    }
    return {
      token: "amendment_disposition_conflict",
      label: "Amendment disposition conflict",
      tone: "finding",
    };
  }

  return null;
}

export function civic_genome_meaningful_unresolved(value: unknown): CivicGenomeProofEntry[] {
  return civic_genome_proof_entries(value)
    .filter(entry => civic_genome_proof_item_label(entry) !== NO_SECOND_SOURCE_CONDITION);
}

export function civic_genome_prism_display(
  trait: CivicGenomePrismPresentationTrait,
): CivicGenomePrismDisplay {
  const supported = civic_genome_proof_entries(trait.prism_supported_findings);
  const contradictions = civic_genome_proof_entries(trait.prism_contradictions);
  const missing = civic_genome_proof_entries(trait.prism_missing_evidence);
  const unresolved = civic_genome_meaningful_unresolved(trait.prism_unresolved_conditions);
  const status = trait.prism_verification_status ?? null;

  const amendment_display = amendment_disposition_display(supported, contradictions);
  if (amendment_display) return amendment_display;

  if (contradictions.length > 0 || status === "contradicted") {
    return {
      token: "technical_verification_finding",
      label: "Technical verification finding",
      tone: "finding",
    };
  }

  if (missing.length > 0 || status === "incomplete") {
    return {
      token: "verification_incomplete",
      label: "Verification incomplete",
      tone: "open",
    };
  }

  if (unresolved.length > 0 || status === "unresolved") {
    return {
      token: "verification_unresolved",
      label: "Verification unresolved",
      tone: "open",
    };
  }

  if (status === "supported_by_one_source"
      || status === "independent_authoritative_source_not_supplied") {
    return {
      token: "official_legislative_source_verified",
      label: "Official legislative source verified",
      tone: "supported",
    };
  }

  if (status) {
    return {
      token: "verification_unresolved",
      label: status.replace(/[_-]+/g, " "),
      tone: "neutral",
    };
  }

  return {
    token: "verification_not_observed",
    label: "Prism receipt not observed",
    tone: "neutral",
  };
}
