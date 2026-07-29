import crypto from "node:crypto";

export const TYPED_PROVENANCE_EXTRACTOR_VERSION =
  "candidate_field_binding_v4_typed_provenance";

export const TYPED_CANDIDATE_TARGETS = Object.freeze({
  policy_alert: {
    object_class: "layer0_policy_flags",
    intended_target_table: "registry_policy_alerts",
  },
  agency: {
    object_class: "oversight_bodies",
    intended_target_table: "agencies_registry",
  },
  legal_aid: {
    object_class: "resource_cards",
    intended_target_table: "legal_aid_organizations",
  },
  court: {
    object_class: "jurisdiction_overlays",
    intended_target_table: "court_directory",
  },
  tribal_entity: {
    object_class: "tribal_context",
    intended_target_table: "jurisdiction_hierarchy",
  },
  benefit_program: {
    object_class: "resource_cards",
    intended_target_table: "registry_programs",
  },
  workflow: {
    object_class: "workflow_bindings",
    intended_target_table: "workflow_registry",
  },
  deadline: {
    object_class: "deadline_rules",
    intended_target_table: "registry_deadline_rules",
  },
  statute: {
    object_class: "legal_authorities",
    intended_target_table: "legal_statutes",
  },
  contact: {
    object_class: "contact_points",
    intended_target_table: "registry_contacts",
  },
  resource: {
    object_class: "resource_cards",
    intended_target_table: "luminari_resource_entities",
  },
});

const URL_PATTERN =
  /(?:https?:\/\/|www\.)[^\s),;]+|(?<!@)\b(?:[a-z0-9-]+\.)+(?:gov|org|com|net|edu|us|info|health|care|io)(?:\/[^\s),;]*)?/gi;
const PHONE_PATTERN = /(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const STATUTE_PATTERN =
  /(?:\d+\s+U\.S\.C\.\s+§?\s*[\w.-]+|\d+\s+C\.F\.R\.\s+§?\s*[\w.-]+|(?:Utah|Minnesota|Minn\.|Minnesota Statutes?|Utah Code)\s+(?:Code\s+)?§+?\s*[\w.-]+(?:\([^)]+\))*|§+\s*[\w.-]+(?:\([^)]+\))*)/gi;
const DEADLINE_PATTERN =
  /(?:within\s+\d+\s+(?:day|days|month|months|year|years)|\b\d+\s*(?:-|–|—)?\s*(?:day|days|month|months|year|years)\b|deadline[^.\n|]*|\bSOL\b[^.\n|]*|due\s+(?:by|date)?[^.\n|]*)/gi;

function unique(values) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

export function sha256(value) {
  return crypto.createHash("sha256").update(String(value ?? "")).digest("hex");
}

export function extract_typed_values(excerpt) {
  const text = String(excerpt ?? "");
  return {
    phones: unique(text.match(PHONE_PATTERN) ?? []),
    emails: unique(text.match(EMAIL_PATTERN) ?? []),
    urls: unique(
      (text.match(URL_PATTERN) ?? []).map((value) =>
        value.replace(/[.,;:]+$/g, ""),
      ),
    ),
    statutes: unique(text.match(STATUTE_PATTERN) ?? []),
    deadlines: unique(text.match(DEADLINE_PATTERN) ?? []),
  };
}

export function detect_typed_candidate_types(excerpt) {
  const text = String(excerpt ?? "");
  const lower = text.toLowerCase();
  const types = new Set();

  if (
    /policy alert|critical policy|key operational facts|advisory|warning|emergency notice/.test(
      lower,
    )
  ) {
    types.add("policy_alert");
  }
  if (
    /\b(?:agency|department|division|commission|bureau|office of|authority|inspector general|ombudsperson|ombudsman)\b/.test(
      lower,
    )
  ) {
    types.add("agency");
  }
  if (/\b(?:legal aid|legal services|pro bono|law center|public defender)\b/.test(lower)) {
    types.add("legal_aid");
  }
  if (/\b(?:court|tribunal|clerk|judicial|circuit)\b/.test(lower)) {
    types.add("court");
  }
  if (
    /\b(?:tribal|tribe|native nation|indian affairs|reservation|icwa|ihs|bureau of indian affairs)\b/.test(
      lower,
    )
  ) {
    types.add("tribal_entity");
  }
  if (
    /\b(?:benefit|snap|medicaid|tanf|ssi|ssdi|program|assistance|liheap|wic|unemployment insurance)\b/.test(
      lower,
    )
  ) {
    types.add("benefit_program");
  }
  if (
    /\b(?:workflow|process|steps?|intake|appeal pathway|application pathway|filing route|complaint path|how to file|how to apply)\b/.test(
      lower,
    )
  ) {
    types.add("workflow");
  }
  if (DEADLINE_PATTERN.test(text)) types.add("deadline");
  DEADLINE_PATTERN.lastIndex = 0;
  if (STATUTE_PATTERN.test(text)) types.add("statute");
  STATUTE_PATTERN.lastIndex = 0;
  if (EMAIL_PATTERN.test(text) || PHONE_PATTERN.test(text)) types.add("contact");
  EMAIL_PATTERN.lastIndex = 0;
  PHONE_PATTERN.lastIndex = 0;
  if (
    URL_PATTERN.test(text) ||
    /\b(?:resource|directory|hotline|website|portal|clinic|center|services?)\b/.test(
      lower,
    )
  ) {
    types.add("resource");
  }
  URL_PATTERN.lastIndex = 0;

  return [...types].filter((type) => TYPED_CANDIDATE_TARGETS[type]);
}

function line_number(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function build_typed_provenance_candidate(input) {
  const source_excerpt = String(input.source_excerpt ?? "").trim();
  const candidate_type = String(input.candidate_type ?? "").trim();
  const target = TYPED_CANDIDATE_TARGETS[candidate_type];
  if (!target) throw new Error(`unsupported candidate type: ${candidate_type}`);
  if (!source_excerpt) throw new Error("source excerpt is required");

  const source_queue_id = Number(input.source_queue_id);
  if (!Number.isInteger(source_queue_id) || source_queue_id <= 0) {
    throw new Error("positive source_queue_id is required");
  }

  const source_candidate_id = String(input.source_candidate_id ?? "").trim();
  if (!source_candidate_id) throw new Error("source_candidate_id is required");

  const source_text_hash = String(input.source_text_hash ?? "").trim();
  if (!/^[a-f0-9]{64}$/i.test(source_text_hash)) {
    throw new Error("source_text_hash must be a SHA-256 hex digest");
  }

  const values = extract_typed_values(source_excerpt);
  const source_line_start = line_number(input.source_line_start);
  const source_line_end = line_number(input.source_line_end);
  const content_hash = sha256(
    [
      TYPED_PROVENANCE_EXTRACTOR_VERSION,
      source_queue_id,
      source_text_hash,
      source_candidate_id,
      candidate_type,
      source_line_start ?? "",
      source_line_end ?? "",
      source_excerpt,
    ].join("|"),
  );
  const unresolved_name = [
    "unresolved_typed_fragment",
    candidate_type,
    source_queue_id,
    source_line_start ?? "unknown_line",
    content_hash.slice(0, 12),
  ].join(":");

  const field_metadata = {
    phones: values.phones,
    emails: values.emails,
    urls: values.urls,
    statutes: values.statutes,
    deadlines: values.deadlines,
  };

  return {
    source_file: input.source_file ?? null,
    jurisdiction: input.jurisdiction ?? null,
    extraction_version: TYPED_PROVENANCE_EXTRACTOR_VERSION,
    program_id: `v4:${source_queue_id}:${candidate_type}:${content_hash.slice(0, 16)}`,
    name: unresolved_name,
    promotion_ready: {
      ready: false,
      status: "typed_candidate_pending_verification",
      candidate_type,
      document_family: "general_state_registry",
      source_lane: "state_enriched_registry_docx_review",
      promotion_lane: "human_review_lane",
      target_table: null,
      intended_target_table: target.intended_target_table,
      object_class: target.object_class,
      identity_state: "unresolved",
    },
    forensic_provenance: {
      action: "reconcile_typed_provenance_candidates_v4",
      extractor_version: TYPED_PROVENANCE_EXTRACTOR_VERSION,
      source_queue_id,
      source_file: input.source_file ?? null,
      storage_path: input.storage_path ?? null,
      source_text_hash,
      source_candidate_id,
      source_candidate_extraction_version:
        input.source_candidate_extraction_version ??
        "candidate_field_binding_v3_fragment_classification",
      source_excerpt,
      source_line_start,
      source_line_end,
      field_metadata,
      detected_candidate_types: input.detected_candidate_types ?? [candidate_type],
      candidate_type,
      object_class: target.object_class,
      intended_target_table: target.intended_target_table,
      document_family: "general_state_registry",
      source_lane: "state_enriched_registry_docx_review",
      identity_state: "unresolved",
      verification_status: "pending_verification",
      deterministic_rules: true,
      canonical_promotion: false,
      lineage: {
        preserves: [
          "candidate_conveyor_v1_typed_classification",
          "candidate_field_binding_v3_exact_provenance",
        ],
        supersedes_nothing: true,
      },
    },
    forensic_hash: content_hash,
    confidence_scores: {
      overall: 0.45,
      deterministic_candidate: true,
      promotion_ready: false,
      candidate_type,
      classification_outcome: "typed_candidate_pending_verification",
      review_reason: "typed_identity_requires_verification",
      source_backed: true,
      value_bearing:
        values.phones.length > 0 ||
        values.emails.length > 0 ||
        values.urls.length > 0 ||
        values.statutes.length > 0 ||
        values.deadlines.length > 0,
    },
    geocoding_hints: {
      jurisdiction: input.jurisdiction ?? null,
      source_queue_id,
    },
    content_hash,
  };
}
