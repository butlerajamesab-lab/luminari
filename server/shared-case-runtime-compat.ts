import { getPool } from "./db-legacy";

function number_or_null(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Public read-only case projection used only after the share token has been
 * validated by the router. Keep the SQL explicit so legacy Drizzle aliases do
 * not ask PostgreSQL for columns that no longer exist in the live schema.
 */
export async function getSharedCaseData(caseId: number) {
  const pool = getPool();
  const caseResult = await pool.query(
    `select id, name, description, status, domain, container, pipeline_type
       from public.cases
      where id = $1
      limit 1`,
    [caseId],
  );
  if (!caseResult.rows[0]) return null;

  const [documents, entities, quotes, claims, findings, events, signals, correlations] = await Promise.all([
    pool.query(`select id, filename, page_count, created_at, document_type from public.documents where case_id = $1 order by id`, [caseId]),
    pool.query(`select id, name, type, description from public.entities where case_id = $1 order by id`, [caseId]),
    pool.query(`select id, quote_text, page_number, document_id, context from public.quotes where case_id = $1 order by id`, [caseId]),
    pool.query(`select id, claim_text, claim_type, evidentiary_weight from public.claims where case_id = $1 order by id`, [caseId]),
    pool.query(`select id, title, description, finding_evidentiary_weight from public.findings where case_id = $1 order by id`, [caseId]),
    pool.query(`select id, event_type, event_date, description from public.events where case_id = $1 order by event_date nulls last, id`, [caseId]),
    pool.query(`select id, flag_type, description from public.signal_flags where case_id = $1 order by id`, [caseId]),
    pool.query(`select id, correlation_type from public.document_correlations where case_id = $1 order by id`, [caseId]),
  ]);

  return {
    case: {
      id: Number(caseResult.rows[0].id),
      name: caseResult.rows[0].name,
      description: caseResult.rows[0].description,
      status: caseResult.rows[0].status,
      domain: caseResult.rows[0].domain,
      container: caseResult.rows[0].container,
      pipelineType: caseResult.rows[0].pipeline_type,
    },
    documents: documents.rows.map(row => ({
      id: Number(row.id), filename: row.filename, pageCount: number_or_null(row.page_count),
      createdAt: number_or_null(row.created_at), documentType: row.document_type,
    })),
    entities: entities.rows.map(row => ({ id: Number(row.id), name: row.name, type: row.type, description: row.description })),
    quotes: quotes.rows.map(row => ({
      id: Number(row.id), text: row.quote_text, pageNumber: number_or_null(row.page_number),
      documentId: number_or_null(row.document_id), context: row.context,
    })),
    claims: claims.rows.map(row => ({
      id: Number(row.id), claimText: row.claim_text, claimType: row.claim_type,
      evidentiaryWeight: row.evidentiary_weight,
    })),
    findings: findings.rows.map(row => ({
      id: Number(row.id), title: row.title, description: row.description,
      evidentiaryWeight: row.finding_evidentiary_weight,
    })),
    events: events.rows.map(row => ({
      id: Number(row.id), title: null, description: row.description,
      dateOccurred: row.event_date, eventType: row.event_type,
    })),
    signalFlags: signals.rows.map(row => ({
      id: Number(row.id), flagType: row.flag_type, description: row.description,
    })),
    correlations: correlations.rows.map(row => ({
      id: Number(row.id), correlationType: row.correlation_type,
    })),
  };
}
