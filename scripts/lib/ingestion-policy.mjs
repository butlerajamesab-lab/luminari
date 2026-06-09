const ENTITY_ENRICHMENT_TARGETS = new Set([
  "advocacy_organizations",
  "advocacy_targets",
  "coalition_advocacy_orgs",
  "coalition_agencies",
  "coalition_legislators",
  "coalition_media",
  "court_directory",
  "government_benefits_registry",
  "legislator_contacts",
  "legislator_registry",
  "registry_contacts",
  "registry_oversight_bodies",
  "registry_programs",
  "resource_directory",
]);

const STRICT_AUTHORITY_TARGETS = new Set([
  "agency_authority_map",
  "claim_validation_rules",
  "deadline_rules",
  "doctrine_registry",
  "escalation_routes",
  "legal_case_law",
  "legal_enforcement_records",
  "legal_statutes",
  "legal_weak_joints",
  "policy_change_registry",
  "procedural_paths",
  "proof_frameworks",
  "remedy_feasibility_rules",
  "settlement_formulas",
  "strategy_claim_catalog",
  "workflow_master",
]);

function normalizeTarget(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseSurfaces(value) {
  if (Array.isArray(value)) return value.map(normalizeTarget).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(normalizeTarget).filter(Boolean);
  } catch {
    // fall through
  }
  return value.split(",").map(normalizeTarget).filter(Boolean);
}

function classifyIngestionPolicy(row = {}) {
  const candidates = [normalizeTarget(row.target_hint), ...parseSurfaces(row.target_surfaces)].filter(Boolean);
  const authorityTarget = candidates.find((candidate) => STRICT_AUTHORITY_TARGETS.has(candidate));
  if (authorityTarget) {
    return {
      policyClass: "strict_authority",
      dedupeBehavior: "strict_insert_or_review",
      promotionAllowed: false,
      policyTarget: authorityTarget,
      policyReason: "Authority-bearing bucket material must be validated by source-bound rules before canonical promotion. Duplicates require review or supersession, not silent merge.",
    };
  }

  const entityTarget = candidates.find((candidate) => ENTITY_ENRICHMENT_TARGETS.has(candidate));
  if (entityTarget) {
    return {
      policyClass: "entity_enrichment",
      dedupeBehavior: "fill_blank_fields_only",
      promotionAllowed: true,
      policyTarget: entityTarget,
      policyReason: "Entity/contact material may enrich existing records non-destructively after validation. Populated fields must not be overwritten.",
    };
  }

  return {
    policyClass: "review_required",
    dedupeBehavior: "no_action_without_mapping",
    promotionAllowed: false,
    policyTarget: candidates[0] ?? null,
    policyReason: "Bucket row does not map to a governed ingestion class yet.",
  };
}

export {
  ENTITY_ENRICHMENT_TARGETS,
  STRICT_AUTHORITY_TARGETS,
  classifyIngestionPolicy,
  normalizeTarget,
};
