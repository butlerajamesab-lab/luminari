import { getPool } from "./db-legacy";

function as_number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function as_nullable_number(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function as_timestamp_ms(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function parse_json<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

function map_snapshot(row: any) {
  if (!row) return null;
  return {
    id: as_number(row.id),
    caseId: as_number(row.case_id),
    version: as_number(row.version),
    engineVersion: String(row.engine_version ?? ""),
    documentIds: parse_json<number[]>(row.document_ids, []).map(Number).filter(Number.isFinite),
    documentHashes: parse_json<Record<string, string>>(row.document_hashes, {}),
    createdAt: as_number(row.created_at),
    sealedAt: as_timestamp_ms(row.sealed_at),
    status: String(row.snapshot_status ?? "open") as "open" | "sealed",
    signature: row.signature ?? null,
    signatureAlgorithm: row.signature_algorithm ?? null,
    publicKeyFingerprint: row.public_key_fingerprint ?? null,
  };
}

export async function getSnapshot(snapshotId: number) {
  const result = await getPool().query(
    `select id, case_id, version, engine_version, document_ids, document_hashes,
            created_at, sealed_at, snapshot_status, signature,
            signature_algorithm, public_key_fingerprint
       from public.corpus_snapshots
      where id = $1
      limit 1`,
    [snapshotId],
  );
  return map_snapshot(result.rows[0]);
}

export async function getOpenSnapshot(caseId: number) {
  const result = await getPool().query(
    `select id, case_id, version, engine_version, document_ids, document_hashes,
            created_at, sealed_at, snapshot_status, signature,
            signature_algorithm, public_key_fingerprint
       from public.corpus_snapshots
      where case_id = $1 and snapshot_status = 'open'
      order by version desc, id desc
      limit 1`,
    [caseId],
  );
  return map_snapshot(result.rows[0]);
}

export async function getLatestSnapshot(caseId: number) {
  const result = await getPool().query(
    `select id, case_id, version, engine_version, document_ids, document_hashes,
            created_at, sealed_at, snapshot_status, signature,
            signature_algorithm, public_key_fingerprint
       from public.corpus_snapshots
      where case_id = $1
      order by version desc, id desc
      limit 1`,
    [caseId],
  );
  return map_snapshot(result.rows[0]);
}

function map_entity(row: any) {
  return {
    id: as_number(row.id),
    caseId: as_nullable_number(row.case_id),
    name: row.name ?? "",
    type: row.type ?? null,
    description: row.description ?? null,
    aliases: parse_json<unknown>(row.aliases, row.aliases ?? null),
    engineVersion: row.engine_version ?? null,
    laneId: row.lane_id ?? null,
    snapshotId: as_nullable_number(row.snapshot_id),
    createdAt: as_nullable_number(row.created_at),
    updatedAt: as_nullable_number(row.updated_at),
    legacyRelationId: row.legacy_relation_id ?? null,
  };
}

export async function listEntities(caseId: number) {
  const result = await getPool().query(
    `select id, case_id, name, type, description, aliases, engine_version,
            lane_id, snapshot_id, created_at, updated_at, legacy_relation_id
       from public.entities
      where case_id = $1
      order by lower(coalesce(name, '')), id`,
    [caseId],
  );
  return result.rows.map(map_entity);
}

export async function getEntity(id: number) {
  const result = await getPool().query(
    `select id, case_id, name, type, description, aliases, engine_version,
            lane_id, snapshot_id, created_at, updated_at, legacy_relation_id
       from public.entities
      where id = $1
      limit 1`,
    [id],
  );
  return result.rows[0] ? map_entity(result.rows[0]) : null;
}

function map_quote(row: any) {
  const pageNumber = as_nullable_number(row.page_number);
  return {
    id: as_number(row.id),
    caseId: as_nullable_number(row.case_id),
    documentId: as_nullable_number(row.document_id),
    text: row.quote_text ?? "",
    quoteText: row.quote_text ?? "",
    pageNumber,
    timestampStart: row.timestamp_start ?? null,
    timestampEnd: row.timestamp_end ?? null,
    context: row.context ?? null,
    statementOrigin: row.statement_origin ?? "unknown",
    engineVersion: row.engine_version ?? null,
    laneId: row.lane_id ?? null,
    snapshotId: as_nullable_number(row.snapshot_id),
  };
}

export async function getQuotesForDocument(documentId: number) {
  const result = await getPool().query(
    `select id, case_id, document_id, quote_text, page_number,
            timestamp_start, timestamp_end, context, statement_origin,
            engine_version, lane_id, snapshot_id
       from public.quotes
      where document_id = $1
      order by id`,
    [documentId],
  );
  return result.rows.map(map_quote);
}

export async function getQuotesForCase(caseId: number) {
  const result = await getPool().query(
    `select id, case_id, document_id, quote_text, page_number,
            timestamp_start, timestamp_end, context, statement_origin,
            engine_version, lane_id, snapshot_id
       from public.quotes
      where case_id = $1
      order by id`,
    [caseId],
  );
  return result.rows.map(map_quote);
}

function map_claim(row: any) {
  return {
    id: as_number(row.id),
    caseId: as_nullable_number(row.case_id),
    documentId: as_nullable_number(row.document_id),
    quoteId: as_nullable_number(row.quote_id),
    claimText: row.claim_text ?? "",
    claimType: row.claim_type ?? null,
    dateReferenced: row.date_referenced ?? null,
    entitiesInvolved: parse_json<unknown>(row.entities_involved, row.entities_involved ?? null),
    claimStatementOrigin: row.claim_statement_origin ?? null,
    evidentiaryWeight: row.evidentiary_weight ?? null,
    engineVersion: row.engine_version ?? null,
    laneId: row.lane_id ?? null,
    snapshotId: as_nullable_number(row.snapshot_id),
  };
}

export async function listClaims(caseId: number) {
  const result = await getPool().query(
    `select id, case_id, document_id, quote_id, claim_text, claim_type,
            date_referenced, entities_involved, claim_statement_origin,
            evidentiary_weight, engine_version, lane_id, snapshot_id
       from public.claims
      where case_id = $1
      order by id`,
    [caseId],
  );
  return result.rows.map(map_claim);
}

export async function getClaimsForDocument(documentId: number) {
  const result = await getPool().query(
    `select id, case_id, document_id, quote_id, claim_text, claim_type,
            date_referenced, entities_involved, claim_statement_origin,
            evidentiary_weight, engine_version, lane_id, snapshot_id
       from public.claims
      where document_id = $1
      order by id`,
    [documentId],
  );
  return result.rows.map(map_claim);
}

export async function getEntityRolesForDocument(documentId: number) {
  const result = await getPool().query(
    `select er.id, er.entity_id, er.document_id, er.role,
            e.name as entity_name, e.type as entity_type
       from public.entity_roles er
       left join public.entities e on e.id = er.entity_id
      where er.document_id = $1
      order by er.id`,
    [documentId],
  );
  return result.rows.map((row: any) => ({
    id: as_number(row.id),
    entityId: as_number(row.entity_id),
    documentId: as_number(row.document_id),
    role: row.role ?? null,
    entityName: row.entity_name ?? null,
    entityType: row.entity_type ?? null,
  }));
}

function map_relationship(row: any) {
  return {
    id: as_number(row.id),
    caseId: as_nullable_number(row.case_id),
    sourceEntityId: as_nullable_number(row.source_entity_id),
    targetEntityId: as_nullable_number(row.target_entity_id),
    relationshipType: row.relationship_type ?? null,
    description: row.description ?? null,
    evidenceCount: as_number(row.evidence_count),
    engineVersion: row.engine_version ?? null,
    laneId: row.lane_id ?? null,
    snapshotId: as_nullable_number(row.snapshot_id),
  };
}

export async function listRelationships(caseId: number) {
  const result = await getPool().query(
    `select id, case_id, source_entity_id, target_entity_id,
            relationship_type, description, evidence_count,
            engine_version, lane_id, snapshot_id
       from public.relationships
      where case_id = $1
      order by id`,
    [caseId],
  );
  return result.rows.map(map_relationship);
}

export async function getRelationshipsForEntity(entityId: number) {
  const result = await getPool().query(
    `select id, case_id, source_entity_id, target_entity_id,
            relationship_type, description, evidence_count,
            engine_version, lane_id, snapshot_id
       from public.relationships
      where source_entity_id = $1 or target_entity_id = $1
      order by id`,
    [entityId],
  );
  return result.rows.map(map_relationship);
}

export async function listRelationshipsEnriched(caseId: number) {
  const relationships = await listRelationships(caseId);
  if (relationships.length === 0) return [];
  const ids = relationships.map(row => row.id);
  const result = await getPool().query(
    `select re.relationship_id, re.id as relationship_evidence_id, re.explanation,
            q.id as quote_id, q.quote_text, q.page_number, q.statement_origin,
            q.document_id, d.filename as document_filename
       from public.relationship_evidence re
       left join public.quotes q on q.id = re.quote_id
       left join public.documents d on d.id = q.document_id
      where re.relationship_id = any($1::integer[])
      order by re.relationship_id, re.id`,
    [ids],
  );
  const evidence = new Map<number, any[]>();
  for (const row of result.rows) {
    const relationshipId = as_number(row.relationship_id);
    const list = evidence.get(relationshipId) ?? [];
    list.push({
      id: as_number(row.relationship_evidence_id),
      explanation: row.explanation ?? null,
      quoteId: as_nullable_number(row.quote_id),
      quoteText: row.quote_text ?? null,
      pageNumber: as_nullable_number(row.page_number),
      statementOrigin: row.statement_origin ?? "unknown",
      documentId: as_nullable_number(row.document_id),
      documentFilename: row.document_filename ?? null,
    });
    evidence.set(relationshipId, list);
  }
  return relationships.map(row => ({ ...row, backingEvidence: evidence.get(row.id) ?? [] }));
}

function map_correlation(row: any) {
  return {
    id: as_number(row.id),
    caseId: as_number(row.case_id),
    sourceDocumentId: as_number(row.source_document_id),
    targetDocumentId: as_number(row.target_document_id),
    correlationType: row.correlation_type ?? null,
    sharedIdentifiers: [] as string[],
  };
}

export async function listCorrelations(caseId: number) {
  const result = await getPool().query(
    `select id, case_id, source_document_id, target_document_id, correlation_type
       from public.document_correlations
      where case_id = $1
      order by id`,
    [caseId],
  );
  return result.rows.map(map_correlation);
}

export async function listCorrelationsEnriched(caseId: number) {
  const result = await getPool().query(
    `select c.id, c.case_id, c.source_document_id, c.target_document_id, c.correlation_type,
            sd.filename as source_filename, sd.file_type as source_file_type,
            td.filename as target_filename, td.file_type as target_file_type
       from public.document_correlations c
       left join public.documents sd on sd.id = c.source_document_id
       left join public.documents td on td.id = c.target_document_id
      where c.case_id = $1
      order by c.id`,
    [caseId],
  );
  return result.rows.map((row: any) => ({
    ...map_correlation(row),
    sourceDocument: row.source_document_id ? {
      id: as_number(row.source_document_id),
      filename: row.source_filename ?? null,
      fileType: row.source_file_type ?? null,
    } : null,
    targetDocument: row.target_document_id ? {
      id: as_number(row.target_document_id),
      filename: row.target_filename ?? null,
      fileType: row.target_file_type ?? null,
    } : null,
  }));
}

function map_finding(row: any) {
  const claimIds = parse_json<number[]>(row.claim_ids, []).map(Number).filter(Number.isFinite);
  const evidentiaryWeight = row.finding_evidentiary_weight ?? "note_signal";
  return {
    id: as_number(row.id),
    caseId: as_nullable_number(row.case_id),
    findingType: row.finding_type ?? "unknown",
    title: row.title ?? "",
    description: row.description ?? "",
    significance: row.significance ?? null,
    claimIds,
    confidence: row.confidence ?? "unresolved",
    createdAt: as_nullable_number(row.created_at),
    findingEvidentiaryWeight: evidentiaryWeight,
    evidentiaryWeight,
    provenanceStatus: row.provenance_status ?? "unsupported",
    provenanceAttempted: Boolean(row.provenance_attempted),
    candidateClaimCount: as_number(row.candidate_claim_count),
    fallbackTriggered: Boolean(row.fallback_triggered),
    matchAttemptTimestamp: as_nullable_number(row.match_attempt_timestamp),
    matchMetadata: parse_json<unknown>(row.match_metadata, row.match_metadata ?? null),
    laneId: row.lane_id ?? null,
    snapshotId: as_nullable_number(row.snapshot_id),
  };
}

export async function listFindings(caseId: number) {
  const result = await getPool().query(
    `select id, case_id, finding_type, title, description, significance,
            claim_ids, confidence, created_at, finding_evidentiary_weight,
            provenance_status, provenance_attempted, candidate_claim_count,
            fallback_triggered, match_attempt_timestamp, match_metadata,
            lane_id, snapshot_id
       from public.findings
      where case_id = $1
      order by created_at desc nulls last, id desc`,
    [caseId],
  );
  return result.rows.map(map_finding);
}

export async function listFindingsEnriched(caseId: number) {
  const findings = await listFindings(caseId);
  if (findings.length === 0) return [];
  const claimIds = Array.from(new Set(findings.flatMap(finding => finding.claimIds)));
  if (claimIds.length === 0) return findings.map(finding => ({ ...finding, backingEvidence: [] }));

  const result = await getPool().query(
    `select c.id as claim_id, c.claim_text, c.claim_statement_origin,
            q.id as quote_id, q.quote_text, q.page_number, q.statement_origin,
            q.document_id, d.filename as document_filename
       from public.claims c
       left join public.quotes q on q.id = c.quote_id
       left join public.documents d on d.id = q.document_id
      where c.id = any($1::integer[])
      order by c.id`,
    [claimIds],
  );
  const evidence = new Map<number, any>();
  for (const row of result.rows) {
    evidence.set(as_number(row.claim_id), {
      documentDisplayLabel: row.document_filename ?? "Unknown source",
      documentId: as_nullable_number(row.document_id),
      pageNumber: as_nullable_number(row.page_number),
      verbatimQuote: row.quote_text ?? null,
      statementOrigin: row.statement_origin ?? row.claim_statement_origin ?? "unknown",
      claimText: row.claim_text ?? "",
    });
  }
  return findings.map(finding => ({
    ...finding,
    backingEvidence: finding.claimIds.map(id => evidence.get(id)).filter(Boolean),
  }));
}

function map_signal_flag(row: any) {
  return {
    id: as_number(row.id),
    caseId: as_nullable_number(row.case_id),
    documentId: as_nullable_number(row.document_id),
    flagType: row.flag_type ?? "unknown",
    description: row.description ?? null,
    quoteId: as_nullable_number(row.quote_id),
    engineVersion: row.engine_version ?? null,
    laneId: row.lane_id ?? null,
    snapshotId: as_nullable_number(row.snapshot_id),
    sunamStatus: row.sunam_status ?? null,
    confidenceScore: row.confidence_score ?? null,
  };
}

export async function listSignalFlags(caseId: number) {
  const result = await getPool().query(
    `select id, case_id, document_id, flag_type, description, quote_id,
            engine_version, lane_id, snapshot_id, sunam_status, confidence_score
       from public.signal_flags
      where case_id = $1
      order by id`,
    [caseId],
  );
  return result.rows.map(map_signal_flag);
}

export async function listSignalFlagsEnriched(caseId: number) {
  const flags = await listSignalFlags(caseId);
  if (flags.length === 0) return [];
  const quoteIds = Array.from(new Set(flags.map(flag => flag.quoteId).filter((id): id is number => id !== null)));
  const documentIds = Array.from(new Set(flags.map(flag => flag.documentId).filter((id): id is number => id !== null)));

  const quotes = quoteIds.length > 0
    ? await getPool().query(
        `select id, case_id, document_id, quote_text, page_number,
                timestamp_start, timestamp_end, context, statement_origin,
                engine_version, lane_id, snapshot_id
           from public.quotes where id = any($1::integer[])`,
        [quoteIds],
      )
    : { rows: [] as any[] };
  const documents = documentIds.length > 0
    ? await getPool().query(
        `select id, filename, file_type, mime_type, sha256_hash, status
           from public.documents where id = any($1::integer[])`,
        [documentIds],
      )
    : { rows: [] as any[] };

  const quoteMap = new Map(quotes.rows.map((row: any) => [as_number(row.id), map_quote(row)]));
  const documentMap = new Map(documents.rows.map((row: any) => [as_number(row.id), {
    id: as_number(row.id),
    filename: row.filename ?? null,
    fileType: row.file_type ?? null,
    mimeType: row.mime_type ?? null,
    sha256Hash: row.sha256_hash ?? null,
    status: row.status ?? null,
  }]));

  return flags.map(flag => ({
    ...flag,
    quote: flag.quoteId ? quoteMap.get(flag.quoteId) ?? null : null,
    document: flag.documentId ? documentMap.get(flag.documentId) ?? null : null,
  }));
}
