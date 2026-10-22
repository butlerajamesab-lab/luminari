import { createHash } from "node:crypto";

export type amendment_base_candidate = {
  bill_version_id: string;
  source_document_key: string;
  version_type: string;
  provider_document_type: string;
  provider_sequence: number;
  source_url: string;
  source_content_hash: string | null;
};

export type amendment_target_reference = {
  exact_phrase: string;
  target_form: "original" | "engrossed" | "reengrossed" | "enrolled" | "reenrolled";
  chamber: "H" | "S";
  bill_number: string;
  expected_version_type: "introduced" | "engrossed" | "enrolled";
};

export type amendment_base_resolution =
  | {
      status: "resolved";
      target: amendment_target_reference;
      base: amendment_base_candidate & { source_content_hash: string };
      relationship_basis: "official_explicit_reference";
      evidence_method: "unique_explicit_target_version_v1" | "louisiana_official_document_sequence_v1";
      attachment_evidence_hash: string;
      evidence: Record<string, unknown>;
    }
  | {
      status: "awaiting_base_content";
      target: amendment_target_reference;
      base: amendment_base_candidate;
      reason: "exact_base_content_not_preserved";
    }
  | {
      status: "unresolved";
      target: amendment_target_reference | null;
      reason:
        | "explicit_target_reference_missing"
        | "explicit_target_bill_mismatch"
        | "exact_target_version_missing"
        | "exact_target_version_ambiguous"
        | "official_chronology_unavailable";
    };

const TARGET = /\b(Original|Engrossed|Re-?engrossed|Enrolled|Re-?enrolled)\s+(House|Senate)\s+Bill(?:\s+No\.)?\s*(\d+)\b/i;
const HASH = /^[0-9a-f]{64}$/;

function normalize_bill_number(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function target_form(value: string): amendment_target_reference["target_form"] {
  const compact = value.toLowerCase().replace("-", "");
  if (compact === "original") return "original";
  if (compact === "engrossed") return "engrossed";
  if (compact === "reengrossed") return "reengrossed";
  if (compact === "enrolled") return "enrolled";
  return "reenrolled";
}

function expected_version_type(
  form: amendment_target_reference["target_form"],
): amendment_target_reference["expected_version_type"] {
  if (form === "original") return "introduced";
  if (form === "enrolled" || form === "reenrolled") return "enrolled";
  return "engrossed";
}

export function parse_amendment_target_reference(
  source_text: string,
): amendment_target_reference | null {
  const match = source_text.slice(0, 12_000).match(TARGET);
  if (!match) return null;
  const form = target_form(match[1]);
  const chamber: "H" | "S" = match[2].toLowerCase() === "house" ? "H" : "S";
  const numeric = String(Number.parseInt(match[3], 10));
  if (!/^\d+$/.test(numeric) || numeric === "NaN") return null;
  return {
    exact_phrase: match[0],
    target_form: form,
    chamber,
    bill_number: `${chamber}B${numeric}`,
    expected_version_type: expected_version_type(form),
  };
}

export function louisiana_official_document_sequence(url: string): number | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase() !== "www.legis.la.gov"
      && parsed.hostname.toLowerCase() !== "legis.la.gov") return null;
    if (parsed.pathname.toLowerCase() !== "/legis/viewdocument.aspx") return null;
    const value = parsed.searchParams.get("d");
    if (!value || !/^\d+$/.test(value)) return null;
    const sequence = Number(value);
    return Number.isSafeInteger(sequence) && sequence > 0 ? sequence : null;
  } catch {
    return null;
  }
}

function canonical_evidence_hash(value: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function resolve_amendment_base(input: {
  source_text: string;
  source_bill_number: string;
  state_code: string | null | undefined;
  amendment_source_document_key: string;
  amendment_source_content_hash: string;
  amendment_source_url: string;
  candidates: amendment_base_candidate[];
}): amendment_base_resolution {
  const target = parse_amendment_target_reference(input.source_text);
  if (!target) {
    return { status: "unresolved", target: null, reason: "explicit_target_reference_missing" };
  }
  if (normalize_bill_number(target.bill_number) !== normalize_bill_number(input.source_bill_number)) {
    return { status: "unresolved", target, reason: "explicit_target_bill_mismatch" };
  }

  const matching = input.candidates.filter(candidate =>
    candidate.version_type.toLowerCase() === target.expected_version_type,
  );
  if (matching.length === 0) {
    return { status: "unresolved", target, reason: "exact_target_version_missing" };
  }

  let selected: amendment_base_candidate | null = null;
  let evidence_method: "unique_explicit_target_version_v1" | "louisiana_official_document_sequence_v1";

  if (matching.length === 1) {
    selected = matching[0];
    evidence_method = "unique_explicit_target_version_v1";
  } else {
    const amendment_sequence = louisiana_official_document_sequence(input.amendment_source_url);
    const is_louisiana = String(input.state_code ?? "").toUpperCase() === "LA"
      || amendment_sequence !== null;
    if (!is_louisiana || amendment_sequence === null) {
      return { status: "unresolved", target, reason: "exact_target_version_ambiguous" };
    }
    const sequenced = matching
      .map(candidate => ({
        candidate,
        sequence: louisiana_official_document_sequence(candidate.source_url),
      }))
      .filter((item): item is { candidate: amendment_base_candidate; sequence: number } =>
        item.sequence !== null && item.sequence < amendment_sequence,
      )
      .sort((a, b) => b.sequence - a.sequence);
    if (sequenced.length === 0) {
      return { status: "unresolved", target, reason: "official_chronology_unavailable" };
    }
    selected = sequenced[0].candidate;
    evidence_method = "louisiana_official_document_sequence_v1";
  }

  if (!selected.source_content_hash || !HASH.test(selected.source_content_hash)) {
    return {
      status: "awaiting_base_content",
      target,
      base: selected,
      reason: "exact_base_content_not_preserved",
    };
  }

  const evidence: Record<string, unknown> = {
    contract: "lighthouse-amendment-attachment-evidence-v1",
    amendment_source_document_key: input.amendment_source_document_key,
    amendment_source_content_hash: input.amendment_source_content_hash,
    amendment_source_url: input.amendment_source_url,
    target_phrase: target.exact_phrase,
    target_form: target.target_form,
    target_bill_number: target.bill_number,
    base_source_document_key: selected.source_document_key,
    base_source_content_hash: selected.source_content_hash,
    base_source_url: selected.source_url,
    relationship_basis: "official_explicit_reference",
    evidence_method,
  };
  if (evidence_method === "louisiana_official_document_sequence_v1") {
    evidence.amendment_official_sequence =
      louisiana_official_document_sequence(input.amendment_source_url);
    evidence.base_official_sequence =
      louisiana_official_document_sequence(selected.source_url);
  }

  return {
    status: "resolved",
    target,
    base: selected as amendment_base_candidate & { source_content_hash: string },
    relationship_basis: "official_explicit_reference",
    evidence_method,
    attachment_evidence_hash: canonical_evidence_hash(evidence),
    evidence,
  };
}
