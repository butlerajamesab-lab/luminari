#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  asArray,
  createPool,
  extractCitations,
  inferDomainTags,
  inferPipelineContext,
  normalizeIdentifier,
  normalizeName,
  normalizeText,
  parseArgs,
  quoteIdent,
  repoRoot,
  stringifyCsv,
  tableExists,
  uniqueBy,
  getTableColumns,
} from "./lib/corpus-audit-utils.mjs";

const args = parseArgs();

const doctrinePhraseRules = [
  { phrase: /\bqualified immunity\b/i, doctrineName: "Sovereign Immunity", notes: "High-confidence phrase rule: qualified immunity maps to sovereign-immunity barrier/doctrine review." },
  { phrase: /\bbrady\b/i, doctrineName: "Due Process", notes: "High-confidence phrase rule: Brady disclosure issues map to due process." },
  { phrase: /\b(foia|freedom of information).*(delay|non[- ]?compliance)|\b(delay|non[- ]?compliance).*(foia|freedom of information)\b/i, doctrineName: "Exhaustion", notes: "High-confidence phrase rule: FOIA delay/non-compliance maps to exhaustion review." },
  { phrase: /\b(deadlines?|one[- ]year bar|statute of limitations|limitations period)\b/i, doctrineName: "Statute of Limitations", notes: "High-confidence phrase rule: deadline and one-year-bar language maps to limitations doctrine." },
  { phrase: /\b(discrimination|burden)\b/i, doctrineName: "Burden Shifting", notes: "High-confidence phrase rule: discrimination/burden language maps to burden shifting." },
];

async function readRows(pool, tableName, fallbackColumns = ["*"]) {
  if (!pool || !(await tableExists(pool, tableName))) return { exists: false, columns: [], rows: [] };
  const columns = await getTableColumns(pool, tableName);
  const selected = fallbackColumns[0] === "*" ? "*" : fallbackColumns.filter((column) => columns.includes(column)).map(quoteIdent).join(", ");
  if (!selected) return { exists: true, columns, rows: [] };
  const result = await pool.query(`select ${selected} from public.${quoteIdent(tableName)}`);
  return { exists: true, columns, rows: result.rows };
}

function getAny(row, names) {
  for (const name of names) {
    if (row?.[name] !== undefined && row?.[name] !== null) return row[name];
  }
  return undefined;
}

function idOf(row, preferred = []) {
  return normalizeText(getAny(row, [...preferred, "id", "citation", "weak_joint_id", "weakJointId", "name", "title"]));
}

function numericConfidence(value) {
  if (typeof value === "number") return value;
  const text = String(value ?? "").toLowerCase();
  if (text === "high") return 0.9;
  if (text === "medium") return 0.65;
  if (text === "low") return 0.35;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeArrayField(value) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean);
  if (value === null || value === undefined || value === "") return [];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        return normalizeArrayField(JSON.parse(trimmed));
      } catch {
        // Fall through to comma splitting.
      }
    }
    return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return asArray(value).map(normalizeText).filter(Boolean);
}

function citationKeys(...values) {
  return extractCitations(...values).map(normalizeIdentifier).filter(Boolean);
}

function statuteForCitation(statutesByCitation, citation) {
  const key = normalizeIdentifier(citation);
  if (statutesByCitation.has(key)) return statutesByCitation.get(key);
  for (const [statuteKey, statute] of statutesByCitation.entries()) {
    if (statuteKey && key && (statuteKey.includes(key) || key.includes(statuteKey))) return statute;
  }
  return null;
}

function makeCandidate(fields) {
  const pipelineContext = fields.pipelineContext?.length ? fields.pipelineContext : inferPipelineContext(fields.notes, fields.evidenceText);
  const domainTags = fields.domainTags?.length ? fields.domainTags : inferDomainTags(fields.notes, fields.evidenceText);
  const confidence = fields.confidence ?? (fields.strength === "strong" ? "high" : fields.strength === "moderate" ? "medium" : "low");
  return {
    fromType: fields.fromType,
    fromId: normalizeText(fields.fromId),
    edgeType: fields.edgeType,
    toType: fields.toType,
    toId: normalizeText(fields.toId),
    strength: fields.strength,
    notes: fields.notes,
    sourceRule: fields.sourceRule,
    sourceTable: fields.sourceTable,
    sourceId: normalizeText(fields.sourceId),
    evidenceText: normalizeText(fields.evidenceText).slice(0, 1000),
    evidenceBasis: fields.evidenceBasis ?? "exact_or_high_confidence_text_match",
    pipelineContext,
    userLens: fields.userLens ?? ["advocate", "admin"],
    domainTags,
    jurisdiction: fields.jurisdiction ?? null,
    confidence,
    reviewBucket: Boolean(fields.reviewBucket),
    // Architecture-preserving snake_case aliases for downstream dry-run review.
    source_table: fields.sourceTable,
    source_id: normalizeText(fields.sourceId),
    from_type: fields.fromType,
    from_id: normalizeText(fields.fromId),
    edge_type: fields.edgeType,
    to_type: fields.toType,
    to_id: normalizeText(fields.toId),
    evidence_basis: fields.evidenceBasis ?? "exact_or_high_confidence_text_match",
    pipeline_context: pipelineContext,
    user_lens: fields.userLens ?? ["advocate", "admin"],
    domain_tags: domainTags,
  };
}

function findDoctrine(doctrines, wantedName) {
  const wanted = normalizeName(wantedName);
  return doctrines.find((doctrine) => normalizeName(doctrine.name) === wanted)
    ?? doctrines.find((doctrine) => normalizeName(doctrine.name).includes(wanted) || wanted.includes(normalizeName(doctrine.name)));
}

async function generate() {
  const { pool, databaseStatus } = createPool("doctrine-graph-candidate-generator");
  if (!pool) {
    console.warn(databaseStatus);
    const output = {
      dryRun: args.dryRun,
      generatedAt: new Date().toISOString(),
      databaseStatus,
      targetTablesRead: [],
      candidateCount: 0,
      reviewBucketCount: 0,
      countsByFromToEdgeStrength: {},
      stagedCandidateEdgeCount: 0,
      stagedCountsByFromToEdgeStrength: {},
      candidates: [],
      reviewBucket: [],
    };
    fs.mkdirSync(args.outDir, { recursive: true });
    fs.writeFileSync(path.join(args.outDir, "doctrine-graph-candidates.json"), JSON.stringify(output, null, 2));
    fs.writeFileSync(path.join(args.outDir, "doctrine-graph-candidates.csv"), "");
    fs.writeFileSync(path.join(args.outDir, "doctrine-graph-review-bucket.json"), JSON.stringify([], null, 2));
    return { pool, output };
  }

  const [doctrines, weakJoints, statutes, agencyAuthority, enforcement, claimElements, agencies, oversightBodies, escalationRegistry, escalationRoutes, stagedCandidateEdges] = await Promise.all([
    readRows(pool, "doctrine_registry"),
    readRows(pool, "legal_weak_joints"),
    readRows(pool, "legal_statutes"),
    readRows(pool, "agency_authority_map"),
    readRows(pool, "legal_enforcement_records"),
    readRows(pool, "claim_element_matrix"),
    readRows(pool, "agencies_registry"),
    readRows(pool, "registry_oversight_bodies"),
    readRows(pool, "escalation_registry"),
    readRows(pool, "escalation_routes"),
    readRows(pool, "corpus_graph_candidate_edges"),
  ]);

  const candidates = [];
  const reviewBucket = [];

  for (const edge of stagedCandidateEdges.rows) {
    const candidate = makeCandidate({
      fromType: edge.from_type,
      fromId: edge.from_id,
      edgeType: edge.edge_type,
      toType: edge.to_type,
      toId: edge.to_id,
      strength: edge.strength,
      notes: `Staged manual curated edge from corpus_graph_candidate_edges with review_status=${edge.review_status ?? "pending_review"}.`,
      sourceRule: "staged_manual_curated_candidate_edge",
      sourceTable: "public.corpus_graph_candidate_edges",
      sourceId: edge.id ?? edge.source_id,
      evidenceText: edge.evidence_basis,
      evidenceBasis: edge.evidence_basis,
      pipelineContext: normalizeArrayField(edge.pipeline_context),
      userLens: normalizeArrayField(edge.user_lens),
      domainTags: normalizeArrayField(edge.domain_tags),
      jurisdiction: edge.jurisdiction,
      confidence: edge.confidence ?? "low",
      reviewBucket: !["approved", "ready_for_promotion", "promote"].includes(String(edge.review_status ?? "pending_review").toLowerCase())
        || String(edge.strength ?? "").toLowerCase() !== "strong"
        || numericConfidence(edge.confidence) < 0.85,
    });
    if (candidate.reviewBucket) reviewBucket.push(candidate);
    else candidates.push(candidate);
  }

  for (const weakJoint of weakJoints.rows) {
    const evidence = [weakJoint.title, weakJoint.description, weakJoint.metadata].map(normalizeText).join("\n");
    for (const rule of doctrinePhraseRules) {
      if (!rule.phrase.test(evidence)) continue;
      const doctrine = findDoctrine(doctrines.rows, rule.doctrineName);
      if (!doctrine) {
        reviewBucket.push(makeCandidate({
          fromType: "doctrine",
          fromId: rule.doctrineName,
          edgeType: "associated_with",
          toType: "weak_joint",
          toId: idOf(weakJoint, ["weak_joint_id", "title"]),
          strength: "contextual",
          notes: `Doctrine '${rule.doctrineName}' not found in doctrine_registry; keep out of first-pass candidates.`,
          sourceRule: "doctrine_phrase_missing_target_review",
          sourceTable: "public.legal_weak_joints",
          sourceId: idOf(weakJoint),
          evidenceText: evidence,
          confidence: "low",
          reviewBucket: true,
        }));
        continue;
      }
      candidates.push(makeCandidate({
        fromType: "doctrine",
        fromId: idOf(doctrine, ["id", "name"]),
        edgeType: "associated_with",
        toType: "weak_joint",
        toId: idOf(weakJoint, ["id", "weak_joint_id", "title"]),
        strength: "strong",
        notes: rule.notes,
        sourceRule: "doctrine_to_weak_joint_high_confidence_phrase",
        sourceTable: "public.legal_weak_joints",
        sourceId: idOf(weakJoint),
        evidenceText: evidence,
        jurisdiction: weakJoint.jurisdiction ?? null,
        confidence: "high",
      }));
    }
  }

  const statutesByCitation = new Map();
  const statutesByShortTitle = new Map();
  for (const statute of statutes.rows) {
    for (const citationKey of citationKeys(statute.citation, statute.statutory_authority, statute.authority)) {
      statutesByCitation.set(citationKey, statute);
    }
    const directCitation = normalizeIdentifier(statute.citation);
    const shortTitle = normalizeName(statute.short_title ?? statute.shortTitle ?? statute.title);
    if (directCitation) statutesByCitation.set(directCitation, statute);
    if (shortTitle) statutesByShortTitle.set(shortTitle, statute);
  }

  for (const row of agencyAuthority.rows) {
    const authorityValue = getAny(row, ["statutoryAuthority", "statutory_authority", "statutory_authorities", "statute", "authority"]);
    const authorities = [...asArray(authorityValue), row.statute].filter(Boolean);
    const citations = extractCitations(...authorities);
    for (const citation of citations) {
      const statute = statuteForCitation(statutesByCitation, citation);
      if (!statute) continue;
      candidates.push(makeCandidate({
        fromType: "agency",
        fromId: normalizeText(getAny(row, ["agencyShort", "agency_short", "agency", "agency_name", "agencyName"])),
        edgeType: "enforced_by",
        toType: "statute",
        toId: idOf(statute, ["id", "citation"]),
        strength: "strong",
        notes: `Exact citation '${citation}' appears in agency authority map statutory authority.`,
        sourceRule: "agency_to_statute_exact_citation",
        sourceTable: "public.agency_authority_map",
        sourceId: idOf(row),
        evidenceText: authorities.join("; "),
        jurisdiction: row.jurisdiction ?? null,
        pipelineContext: inferPipelineContext(row.domain, row.domains, row.complaintTypes, row.complaint_types, authorities),
        domainTags: inferDomainTags(row.domain, row.domains, row.complaintTypes, row.complaint_types, authorities),
        confidence: "high",
      }));
    }
  }

  for (const row of enforcement.rows) {
    const citations = extractCitations(row.statuteCitation, row.statute_citation, row.statutoryRequirement, row.statutory_requirement, row.statutory_authority);
    for (const citation of citations) {
      const statute = statuteForCitation(statutesByCitation, citation);
      const agencyName = getAny(row, ["agencyName", "agency_name", "agency"]);
      if (!statute || !agencyName) continue;
      candidates.push(makeCandidate({
        fromType: "agency",
        fromId: agencyName,
        edgeType: "enforced_by",
        toType: "statute",
        toId: idOf(statute, ["id", "citation"]),
        strength: "strong",
        notes: `Exact citation '${citation}' appears in legal enforcement record.`,
        sourceRule: "agency_to_statute_enforcement_exact_citation",
        sourceTable: "public.legal_enforcement_records",
        sourceId: idOf(row),
        evidenceText: [row.statuteCitation, row.statute_citation, row.statutoryRequirement, row.statutory_requirement, row.statutory_authority, row.patternDescription, row.pattern_description].filter(Boolean).join("; "),
        jurisdiction: row.jurisdiction ?? null,
        pipelineContext: inferPipelineContext(row.domains, row.complaintType, row.complaint_type, row.patternDescription, row.pattern_description),
        domainTags: inferDomainTags(row.domains, row.complaintType, row.complaint_type, row.patternDescription, row.pattern_description),
        confidence: "high",
      }));
    }
  }

  for (const weakJoint of weakJoints.rows) {
    const evidence = [weakJoint.title, weakJoint.description, weakJoint.metadata].map(normalizeText).join("\n");
    const citations = extractCitations(evidence);
    for (const citation of citations) {
      const statute = statuteForCitation(statutesByCitation, citation);
      if (!statute) continue;
      candidates.push(makeCandidate({
        fromType: "weak_joint",
        fromId: idOf(weakJoint, ["id", "weak_joint_id", "title"]),
        edgeType: "fails_at",
        toType: "statute",
        toId: idOf(statute, ["id", "citation"]),
        strength: "strong",
        notes: `Exact citation '${citation}' appears in weak-joint text or metadata.`,
        sourceRule: "weak_joint_to_statute_exact_citation",
        sourceTable: "public.legal_weak_joints",
        sourceId: idOf(weakJoint),
        evidenceText: evidence,
        jurisdiction: weakJoint.jurisdiction ?? statute.jurisdiction ?? null,
        confidence: "high",
      }));
    }
    for (const [shortTitle, statute] of statutesByShortTitle.entries()) {
      if (!shortTitle || shortTitle.length < 5) continue;
      if (!normalizeName(evidence).includes(shortTitle)) continue;
      candidates.push(makeCandidate({
        fromType: "weak_joint",
        fromId: idOf(weakJoint, ["id", "weak_joint_id", "title"]),
        edgeType: "fails_at",
        toType: "statute",
        toId: idOf(statute, ["id", "citation"]),
        strength: "strong",
        notes: `Exact short-title reference '${statute.short_title ?? statute.shortTitle ?? statute.title}' appears in weak-joint text or metadata.`,
        sourceRule: "weak_joint_to_statute_exact_short_title",
        sourceTable: "public.legal_weak_joints",
        sourceId: idOf(weakJoint),
        evidenceText: evidence,
        jurisdiction: weakJoint.jurisdiction ?? statute.jurisdiction ?? null,
        confidence: "high",
      }));
    }
  }

  for (const claim of claimElements.rows) {
    const evidence = Object.fromEntries(Object.entries(claim).filter(([key]) => /statute|citation|authority|metadata|description|claim|domain/i.test(key)));
    const citations = extractCitations(evidence);
    for (const citation of citations) {
      const statute = statuteForCitation(statutesByCitation, citation);
      if (!statute) continue;
      candidates.push(makeCandidate({
        fromType: "claim_type",
        fromId: normalizeText(claim.claimType ?? claim.claim_type),
        edgeType: "creates",
        toType: "statute",
        toId: idOf(statute, ["id", "citation"]),
        strength: "strong",
        notes: `Exact citation '${citation}' appears in claim-element statute/metadata field.`,
        sourceRule: "claim_type_to_statute_exact_claim_element_statute",
        sourceTable: "public.claim_element_matrix",
        sourceId: idOf(claim),
        evidenceText: evidence,
        jurisdiction: claim.jurisdiction ?? statute.jurisdiction ?? null,
        pipelineContext: inferPipelineContext(claim.domain, claim.claimType, evidence),
        domainTags: inferDomainTags(claim.domain, claim.claimType, evidence),
        confidence: "high",
      }));
    }
  }

  const agencyNames = new Map();
  for (const agency of agencies.rows) agencyNames.set(normalizeName(getAny(agency, ["agency_name", "agencyName", "agency", "name"])), agency);
  for (const agency of agencyAuthority.rows) agencyNames.set(normalizeName(getAny(agency, ["agency", "agency_name", "agencyName", "agencyShort", "agency_short"])), agency);
  for (const agency of enforcement.rows) agencyNames.set(normalizeName(getAny(agency, ["agencyName", "agency_name", "agency"])), agency);

  const routeSources = [
    ["public.registry_oversight_bodies", oversightBodies.rows],
    ["public.escalation_registry", escalationRegistry.rows],
    ["public.escalation_routes", escalationRoutes.rows],
  ];
  for (const [sourceTable, rows] of routeSources) {
    for (const route of rows) {
      const evidence = normalizeText(route);
      const explicitNames = [route.oversight_body, route.oversightBody, route.agency_name_rob, route.agencyName, route.agency_name, route.escalation_name, route.escalationName]
        .filter(Boolean)
        .map(normalizeText);
      for (const name of explicitNames) {
        const agency = agencyNames.get(normalizeName(name));
        if (!agency) continue;
        candidates.push(makeCandidate({
          fromType: "accountability_route",
          fromId: idOf(route, ["id", "title", "escalation_name", "agency_name_rob"]),
          edgeType: "routes_to",
          toType: "agency",
          toId: idOf(agency, ["id", "agency_name", "agencyName", "agency", "agencyShort"]),
          strength: "strong",
          notes: `Exact oversight body/agency-name match '${name}'.`,
          sourceRule: "accountability_route_to_agency_exact_name",
          sourceTable,
          sourceId: idOf(route),
          evidenceText: evidence,
          jurisdiction: route.jurisdiction ?? route.jurisdiction_id_rob ?? agency.jurisdiction ?? null,
          pipelineContext: inferPipelineContext(evidence, name),
          domainTags: inferDomainTags(evidence, name),
          confidence: "high",
        }));
      }
    }
  }

  // Deliberately isolated low-confidence review bucket: shared domains only, no exact citation/name/phrase.
  for (const statute of statutes.rows) {
    for (const weakJoint of weakJoints.rows) {
      const domains = new Set(inferDomainTags(statute.domains, statute.summary, statute.title));
      const weakDomains = inferDomainTags(weakJoint.metadata, weakJoint.description, weakJoint.title);
      if (!weakDomains.some((domain) => domains.has(domain))) continue;
      reviewBucket.push(makeCandidate({
        fromType: "weak_joint",
        fromId: idOf(weakJoint, ["id", "weak_joint_id", "title"]),
        edgeType: "associated_with",
        toType: "statute",
        toId: idOf(statute, ["id", "citation"]),
        strength: "contextual",
        notes: "Shared domain only; intentionally excluded from first-pass candidate edges.",
        sourceRule: "domain_only_review_bucket",
        sourceTable: "public.legal_weak_joints+public.legal_statutes",
        sourceId: `${idOf(weakJoint)}::${idOf(statute)}`,
        evidenceText: `${weakJoint.title ?? ""}\n${statute.citation ?? ""} ${statute.short_title ?? statute.title ?? ""}`,
        jurisdiction: weakJoint.jurisdiction ?? statute.jurisdiction ?? null,
        confidence: "low",
        reviewBucket: true,
      }));
    }
  }

  const dedupedCandidates = uniqueBy(candidates, (candidate) => [candidate.fromType, candidate.fromId, candidate.edgeType, candidate.toType, candidate.toId, candidate.sourceRule].join("|"));
  const dedupedReview = uniqueBy(reviewBucket, (candidate) => [candidate.fromType, candidate.fromId, candidate.edgeType, candidate.toType, candidate.toId, candidate.sourceRule].join("|"));

  const counts = dedupedCandidates.reduce((acc, candidate) => {
    const key = `${candidate.fromType}->${candidate.toType}/${candidate.edgeType}/${candidate.strength}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const stagedPromotionGroups = stagedCandidateEdges.rows.reduce((acc, edge) => {
    const key = `${edge.from_type}->${edge.to_type}/${edge.edge_type}/${edge.strength}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const targetTablesRead = [doctrines, weakJoints, statutes, agencyAuthority, enforcement, claimElements, agencies, oversightBodies, escalationRegistry, escalationRoutes, stagedCandidateEdges]
    .map((result, index) => [
      "public.doctrine_registry",
      "public.legal_weak_joints",
      "public.legal_statutes",
      "public.agency_authority_map",
      "public.legal_enforcement_records",
      "public.claim_element_matrix",
      "public.agencies_registry",
      "public.registry_oversight_bodies",
      "public.escalation_registry",
      "public.escalation_routes",
      "public.corpus_graph_candidate_edges",
    ][index] + `:${result.exists ? result.rows.length : "missing"}`);

  const output = {
    dryRun: args.dryRun,
    generatedAt: new Date().toISOString(),
    databaseStatus,
    targetTablesRead,
    candidateCount: dedupedCandidates.length,
    reviewBucketCount: dedupedReview.length,
    countsByFromToEdgeStrength: counts,
    stagedCandidateEdgeCount: stagedCandidateEdges.rows.length,
    stagedCountsByFromToEdgeStrength: stagedPromotionGroups,
    candidates: dedupedCandidates,
    reviewBucket: dedupedReview,
  };

  fs.mkdirSync(args.outDir, { recursive: true });
  fs.writeFileSync(path.join(args.outDir, "doctrine-graph-candidates.json"), JSON.stringify(output, null, 2));
  fs.writeFileSync(path.join(args.outDir, "doctrine-graph-candidates.csv"), stringifyCsv(dedupedCandidates));
  fs.writeFileSync(path.join(args.outDir, "doctrine-graph-review-bucket.json"), JSON.stringify(dedupedReview, null, 2));

  return { pool, output };
}

const { pool, output } = await generate();
console.table(Object.entries(output.countsByFromToEdgeStrength ?? {}).map(([bucket, count]) => ({ bucket, count })));
console.log(JSON.stringify({
  dryRun: output.dryRun,
  targetTablesRead: output.targetTablesRead,
  candidateCount: output.candidateCount,
  reviewBucketCount: output.reviewBucketCount,
  countsByFromToEdgeStrength: output.countsByFromToEdgeStrength,
  stagedCandidateEdgeCount: output.stagedCandidateEdgeCount,
  stagedCountsByFromToEdgeStrength: output.stagedCountsByFromToEdgeStrength,
  outputDir: path.relative(repoRoot, args.outDir),
}, null, 2));
if (pool) await pool.end();
