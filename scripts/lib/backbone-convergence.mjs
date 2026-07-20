const ROLE_PATTERNS = {
  PA: /(protection\s*(?:and|&)\s*advocacy|disability\s*rights|\bp\s*&\s*a\b)/i,
  DDC: /(developmental\s+disabilit(?:y|ies)\s+council|\bddc\b)/i,
  VR: /(vocational\s+rehabilitation|division\s+of\s+rehabilitation|rehabilitation\s+services|rehabilitation\s+commission|\bdvr\b|\bvr\b)/i,
};

const STATE_ALIASES = new Map([
  ["DISTRICTOFCOLUMBIA", "DC"], ["WASHINGTONDC", "DC"], ["DC", "DC"],
  ["AMERICANSAMOA", "AS"], ["GUAM", "GU"], ["NORTHERNMARIANAISLANDS", "MP"],
  ["COMMONWEALTHOFTHENORTHERNMARIANAISLANDS", "MP"], ["PUERTORICO", "PR"],
  ["USVIRGINISLANDS", "VI"], ["UNITEDSTATESVIRGINISLANDS", "VI"],
]);

const STATE_NAMES = {
  AL:"ALABAMA", AK:"ALASKA", AZ:"ARIZONA", AR:"ARKANSAS", CA:"CALIFORNIA", CO:"COLORADO",
  CT:"CONNECTICUT", DE:"DELAWARE", FL:"FLORIDA", GA:"GEORGIA", HI:"HAWAII", ID:"IDAHO",
  IL:"ILLINOIS", IN:"INDIANA", IA:"IOWA", KS:"KANSAS", KY:"KENTUCKY", LA:"LOUISIANA",
  ME:"MAINE", MD:"MARYLAND", MA:"MASSACHUSETTS", MI:"MICHIGAN", MN:"MINNESOTA",
  MS:"MISSISSIPPI", MO:"MISSOURI", MT:"MONTANA", NE:"NEBRASKA", NV:"NEVADA",
  NH:"NEWHAMPSHIRE", NJ:"NEWJERSEY", NM:"NEWMEXICO", NY:"NEWYORK", NC:"NORTHCAROLINA",
  ND:"NORTHDAKOTA", OH:"OHIO", OK:"OKLAHOMA", OR:"OREGON", PA:"PENNSYLVANIA",
  RI:"RHODEISLAND", SC:"SOUTHCAROLINA", SD:"SOUTHDAKOTA", TN:"TENNESSEE", TX:"TEXAS",
  UT:"UTAH", VT:"VERMONT", VA:"VIRGINIA", WA:"WASHINGTON", WV:"WESTVIRGINIA",
  WI:"WISCONSIN", WY:"WYOMING", DC:"DISTRICTOFCOLUMBIA", AS:"AMERICANSAMOA",
  GU:"GUAM", MP:"NORTHERNMARIANAISLANDS", PR:"PUERTORICO", VI:"USVIRGINISLANDS",
};
for (const [code, name] of Object.entries(STATE_NAMES)) STATE_ALIASES.set(name, code);

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .trim();
}

export function normalizeJurisdiction(value) {
  const normalized = normalizeText(value).replace(/^J/, "");
  if (/^[A-Z]{2}$/.test(normalized) && STATE_NAMES[normalized]) return normalized;
  return STATE_ALIASES.get(normalized) ?? null;
}

export function detectAgencyRole(...values) {
  const text = values.filter(Boolean).join(" ");
  for (const role of ["PA", "DDC", "VR"]) {
    if (ROLE_PATTERNS[role].test(text)) return role;
  }
  return null;
}

function tokenSet(value) {
  return new Set(String(value ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

export function tokenSimilarity(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / new Set([...a, ...b]).size;
}

export function scoreCandidateMatch(candidate, record) {
  const candidateRole = candidate.agency_role ?? detectAgencyRole(candidate.agency_id, candidate.name);
  const recordRole = record.agency_role ?? detectAgencyRole(record.resource_name, record.name, record.agency, record.resource_type);
  if (!candidateRole || candidateRole !== recordRole) return { score: 0, reasons: ["role_mismatch"] };

  const candidateState = normalizeJurisdiction(candidate.state_code ?? candidate.jurisdiction);
  const recordState = normalizeJurisdiction(record.state ?? record.jurisdiction ?? record.jurisdiction_id);
  const reasons = ["role_match"];
  let score = 35;

  if (candidateState && recordState && candidateState === recordState) {
    score += 35;
    reasons.push("jurisdiction_match");
  } else if (candidateState && recordState && candidateState !== recordState) {
    return { score: 0, reasons: ["jurisdiction_conflict"] };
  }

  const expectedId = candidate.agency_id;
  if (expectedId && record.canonical_id === expectedId) {
    score += 30;
    reasons.push("canonical_id_match");
  }

  const similarity = tokenSimilarity(candidate.official_name ?? candidate.name ?? candidate.agency_role_name, record.resource_name ?? record.name ?? record.agency);
  score += Math.round(similarity * 25);
  if (similarity >= 0.6) reasons.push("strong_name_match");
  else if (similarity >= 0.3) reasons.push("partial_name_match");

  if (candidate.official_url && record.website && normalizeText(candidate.official_url) === normalizeText(record.website)) {
    score += 20;
    reasons.push("website_match");
  }

  return { score: Math.min(score, 100), reasons };
}

export function recommendDisposition(candidate, matches) {
  const ranked = matches
    .map((record) => ({ record, ...scoreCandidateMatch(candidate, record) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0] ?? null;
  const second = ranked[1] ?? null;
  if (!best) return { disposition: "insert", confidence: "bounded", best_match: null, reasons: ["no_existing_match"] };
  if (second && best.score - second.score < 10 && second.score >= 65) {
    return { disposition: "hold", confidence: "ambiguous", best_match: best, alternatives: ranked.slice(1, 4), reasons: ["multiple_close_matches"] };
  }
  if (best.score >= 90 && best.record.verification_status === "verified" && best.record.promotion_status === "promoted") {
    return { disposition: "duplicate", confidence: "high", best_match: best, reasons: best.reasons };
  }
  if (best.score >= 65) {
    return { disposition: "enrich", confidence: best.score >= 80 ? "high" : "medium", best_match: best, reasons: best.reasons };
  }
  return { disposition: "hold", confidence: "low", best_match: best, reasons: ["weak_existing_match", ...best.reasons] };
}

export function buildConvergenceReport(candidates, entityRecords, registryRecords) {
  const records = [
    ...entityRecords.map((record) => ({ ...record, source_lane: "luminari_resource_entities" })),
    ...registryRecords.map((record) => ({ ...record, source_lane: "registry_programs" })),
  ];
  const recommendations = candidates.map((candidate) => ({
    candidate,
    recommendation: recommendDisposition(candidate, records),
  }));
  const counts = recommendations.reduce((acc, item) => {
    const key = item.recommendation.disposition;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  return { generated_at: new Date().toISOString(), mode: "read_only", counts, recommendations };
}
