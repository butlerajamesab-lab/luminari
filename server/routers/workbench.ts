/**
 * Workbench Dashboard Router
 *
 * Aggregates all case data into a unified view:
 *   - Case Summary (what is known)
 *   - Parts Checklist (what is present / missing)
 *   - Evidence Panel (documents, proof links, timeline)
 *   - Tools Drawer (available tools for this case)
 *   - Next Steps (what comes next based on case state)
 *
 * Every query here targets the live public schema directly, in the same way
 * server/case-runtime-read-compat.ts does, because the Drizzle declarations
 * for several of these tables still disagree with the database (camelCase
 * physical column names, uuid case_id on integer tables, projected columns
 * that were never migrated). Column names below were verified against
 * information_schema.columns on 2026-09-17.
 *
 * Case identity: the live case spine is public.cases.id (serial/integer).
 * Two satellite tables — events and evidence_items — are uuid-keyed and the
 * evidence link tables key on an integer evidence_id, so those comparisons go
 * through ::text. They are valid against either type and simply match nothing
 * until those tables are re-keyed to the integer spine.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getPool, verifyCaseOwnership } from "../db";

// ─── Helpers ───

type Row = Record<string, unknown>;

async function query(text: string, params: unknown[] = []): Promise<Row[]> {
  const result = await getPool().query(text, params);
  return result.rows as Row[];
}

async function count(text: string, params: unknown[]): Promise<number> {
  const rows = await query(text, params);
  return Number(rows[0]?.c ?? 0);
}

const num = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

/** Number if the value parses as a finite number, otherwise null (never NaN). */
const numeric = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function mapCase(row: Row | undefined) {
  if (!row) return undefined;
  return {
    id: Number(row.id),
    userId: num(row.user_id),
    name: row.name as string | null,
    description: row.description as string | null,
    status: row.status as string | null,
    domain: row.domain as string | null,
    container: row.container as string | null,
    pipelineType: row.pipeline_type as string | null,
    manualLensOverrides: row.manual_lens_overrides ?? null,
    createdAt: num(row.created_at),
    updatedAt: num(row.updated_at),
  };
}

const COUNT_BY_CASE = (table: string) =>
  `SELECT COUNT(*)::bigint AS c FROM public.${table} WHERE case_id = $1`;
const COUNT_BY_CASE_TEXT = (table: string) =>
  `SELECT COUNT(*)::bigint AS c FROM public.${table} WHERE case_id::text = $1::text`;

async function caseCounts(caseId: number) {
  const [
    documents,
    entities,
    claims,
    events,
    findings,
    signals,
    quotes,
    relationships,
    evidence,
    proofLinks,
    eventLinks,
    checklistTotal,
    checklistDone,
    missingRecords,
    foiaRequests,
  ] = await Promise.all([
    count(COUNT_BY_CASE("documents"), [caseId]),
    count(COUNT_BY_CASE("entities"), [caseId]),
    count(COUNT_BY_CASE("claims"), [caseId]),
    count(COUNT_BY_CASE_TEXT("events"), [caseId]),
    count(COUNT_BY_CASE("findings"), [caseId]),
    count(COUNT_BY_CASE("signal_flags"), [caseId]),
    count(COUNT_BY_CASE("quotes"), [caseId]),
    count(COUNT_BY_CASE("relationships"), [caseId]),
    count(COUNT_BY_CASE_TEXT("evidence_items"), [caseId]),
    count(
      `SELECT COUNT(*)::bigint AS c
         FROM public.evidence_proof_links epl
         JOIN public.evidence_items ei ON ei.id::text = epl.evidence_id::text
        WHERE ei.case_id::text = $1::text`,
      [caseId],
    ),
    count(
      `SELECT COUNT(*)::bigint AS c
         FROM public.evidence_event_links eel
         JOIN public.evidence_items ei ON ei.id::text = eel.evidence_id::text
        WHERE ei.case_id::text = $1::text`,
      [caseId],
    ),
    count(COUNT_BY_CASE("checklist_items"), [caseId]),
    count(
      `SELECT COUNT(*)::bigint AS c FROM public.checklist_items WHERE case_id = $1 AND checked <> 0`,
      [caseId],
    ),
    count(COUNT_BY_CASE("missing_records"), [caseId]),
    count(COUNT_BY_CASE("foia_requests"), [caseId]),
  ]);

  return {
    documents,
    entities,
    claims,
    events,
    findings,
    signals,
    quotes,
    relationships,
    evidence,
    // snake_case keys are the documented contract; camelCase mirrors are what
    // WorkbenchDashboard.tsx reads today. Both are served until the client is
    // consolidated on one.
    proof_links: proofLinks,
    proofLinks,
    event_links: eventLinks,
    eventLinks,
    checklist_total: checklistTotal,
    checklistTotal,
    checklist_done: checklistDone,
    checklistDone,
    missing_records: missingRecords,
    missingRecords,
    foia_requests: foiaRequests,
    foiaRequests,
  };
}

async function loadCase(caseId: number) {
  const rows = await query(
    `SELECT id, user_id, name, description, status, domain, container,
            pipeline_type, manual_lens_overrides, created_at, updated_at
       FROM public.cases WHERE id = $1 LIMIT 1`,
    [caseId],
  );
  return mapCase(rows[0]);
}

// ─── Router ───

export const workbenchRouter = router({
  /**
   * Full workbench overview — aggregates counts and recent items
   */
  overview: protectedProcedure
    .input(z.object({ caseId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);
      const [caseRow, counts] = await Promise.all([
        loadCase(input.caseId),
        caseCounts(input.caseId),
      ]);
      return { case: caseRow, counts };
    }),

  /**
   * Parts Checklist — what is present, what is missing
   */
  checklist: protectedProcedure
    .input(z.object({ caseId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);

      const [itemRows, missingRows] = await Promise.all([
        query(
          `SELECT id, case_id, label, description, checked, checked_at, priority, sort_order, created_at
             FROM public.checklist_items
            WHERE case_id = $1
            ORDER BY sort_order ASC NULLS LAST, id ASC`,
          [input.caseId],
        ),
        query(
          `SELECT id, case_id, label, description, record_type, agency_type, domain, severity,
                  foia_eligible, legal_basis, missing_record_status, detected_at, updated_at
             FROM public.missing_records
            WHERE case_id = $1
            ORDER BY detected_at DESC NULLS LAST, id DESC`,
          [input.caseId],
        ),
      ]);

      const items = itemRows.map(r => ({
        id: Number(r.id),
        caseId: Number(r.case_id),
        label: r.label as string,
        description: (r.description as string | null) ?? null,
        notes: (r.description as string | null) ?? null,
        checked: Number(r.checked ?? 0) !== 0,
        completed: Number(r.checked ?? 0) !== 0,
        checkedAt: num(r.checked_at),
        priority: (r.priority as string | null) ?? null,
        category: (r.priority as string | null) ?? null,
        sortOrder: num(r.sort_order),
        createdAt: num(r.created_at),
      }));

      const missing = missingRows.map(r => ({
        id: Number(r.id),
        caseId: Number(r.case_id),
        label: r.label as string | null,
        description: (r.description as string | null) ?? null,
        recordType: (r.record_type as string | null) ?? null,
        agencyType: (r.agency_type as string | null) ?? null,
        suggestedSource: (r.agency_type as string | null) ?? null,
        domain: (r.domain as string | null) ?? null,
        severity: (r.severity as string | null) ?? null,
        foiaEligible: r.foia_eligible ?? null,
        legalBasis: (r.legal_basis as string | null) ?? null,
        status: (r.missing_record_status as string | null) ?? null,
        detectedAt: num(r.detected_at),
        updatedAt: num(r.updated_at),
      }));

      return { items, missing };
    }),

  /**
   * Evidence summary — recent evidence items with proof/event link counts
   */
  evidenceSummary: protectedProcedure
    .input(
      z.object({ caseId: z.number().int().positive(), limit: z.number().int().min(1).max(200).default(20) }),
    )
    .query(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);

      const rows = await query(
        `SELECT ei.id, ei.case_id, ei.document_id, ei.evidence_type, ei.label, ei.content_ref,
                ei.metadata, ei.normalized_record_id, ei.created_at,
                (SELECT COUNT(*)::bigint FROM public.evidence_proof_links epl WHERE epl.evidence_id::text = ei.id::text) AS proof_link_count,
                (SELECT COUNT(*)::bigint FROM public.evidence_event_links eel WHERE eel.evidence_id::text = ei.id::text) AS event_link_count
           FROM public.evidence_items ei
          WHERE ei.case_id::text = $1::text
          ORDER BY ei.created_at DESC NULLS LAST
          LIMIT $2`,
        [input.caseId, input.limit],
      );

      return rows.map(r => ({
        id: r.id as string,
        caseId: r.case_id as string,
        documentId: r.document_id ?? null,
        evidenceType: (r.evidence_type as string | null) ?? null,
        label: (r.label as string | null) ?? null,
        title: (r.label as string | null) ?? null,
        contentRef: (r.content_ref as string | null) ?? null,
        sourceName: (r.content_ref as string | null) ?? null,
        sourceDate: r.created_at ?? null,
        metadata: r.metadata ?? null,
        normalizedRecordId: r.normalized_record_id ?? null,
        createdAt: r.created_at ?? null,
        proof_link_count: Number(r.proof_link_count ?? 0),
        proofLinkCount: Number(r.proof_link_count ?? 0),
        event_link_count: Number(r.event_link_count ?? 0),
        eventLinkCount: Number(r.event_link_count ?? 0),
      }));
    }),

  /**
   * Recent activity — latest events, findings, signals
   */
  recentActivity: protectedProcedure
    .input(
      z.object({ caseId: z.number().int().positive(), limit: z.number().int().min(1).max(200).default(15) }),
    )
    .query(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);

      const [eventRows, findingRows, signalRows] = await Promise.all([
        query(
          `SELECT id, description, event_date, event_type, created_at
             FROM public.events
            WHERE case_id::text = $1::text
            ORDER BY created_at DESC NULLS LAST
            LIMIT $2`,
          [input.caseId, input.limit],
        ),
        query(
          `SELECT id, title, description, confidence, finding_type, significance, snapshot_id, created_at
             FROM public.findings
            WHERE case_id = $1
            ORDER BY created_at DESC NULLS LAST, id DESC
            LIMIT $2`,
          [input.caseId, input.limit],
        ),
        query(
          `SELECT id, flag_type, confidence_score, description, snapshot_id, sunam_status
             FROM public.signal_flags
            WHERE case_id = $1
            ORDER BY snapshot_id DESC NULLS LAST, id DESC
            LIMIT $2`,
          [input.caseId, input.limit],
        ),
      ]);

      return {
        events: eventRows.map(r => ({
          id: r.id as string,
          description: (r.description as string | null) ?? null,
          event_date: r.event_date ?? null,
          eventDate: r.event_date ?? null,
          event_type: (r.event_type as string | null) ?? null,
          eventType: (r.event_type as string | null) ?? null,
          created_at: r.created_at ?? null,
        })),
        findings: findingRows.map(r => ({
          id: Number(r.id),
          title: (r.title as string | null) ?? null,
          description: (r.description as string | null) ?? null,
          // Legacy keys the previous contract promised, now sourced from live columns.
          finding_text: (r.description as string | null) ?? (r.title as string | null) ?? null,
          finding_summary: (r.title as string | null) ?? null,
          summary: (r.description as string | null) ?? (r.title as string | null) ?? null,
          confidence: (r.confidence as string | null) ?? null,
          confidence_label: (r.confidence as string | null) ?? null,
          finding_type: (r.finding_type as string | null) ?? null,
          findingType: (r.finding_type as string | null) ?? null,
          // Live `significance` is a free-text sentence; the short badge the
          // dashboard renders as `severity` is the confidence label.
          severity: (r.confidence as string | null) ?? null,
          significance: (r.significance as string | null) ?? null,
          snapshot_id: num(r.snapshot_id),
          created_at: num(r.created_at),
        })),
        signals: signalRows.map(r => ({
          id: Number(r.id),
          flag_type: (r.flag_type as string | null) ?? null,
          signalType: (r.flag_type as string | null) ?? null,
          confidence_score: (r.confidence_score as string | null) ?? null,
          description: (r.description as string | null) ?? null,
          severity: (r.sunam_status as string | null) ?? null,
          snapshot_id: num(r.snapshot_id),
          // No created_at on live signal_flags; snapshot order is the timeline.
          created_at: num(r.snapshot_id),
        })),
      };
    }),

  /**
   * Next steps — computed from case state
   * Returns prioritized list of recommended actions
   */
  nextSteps: protectedProcedure
    .input(z.object({ caseId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);
      const [caseRow, counts] = await Promise.all([
        loadCase(input.caseId),
        caseCounts(input.caseId),
      ]);

      const steps: {
        priority: number;
        action: string;
        description: string;
        href: string;
        category: string;
      }[] = [];

      // No documents yet — upload first
      if (counts.documents === 0) {
        steps.push({
          priority: 1,
          action: "Upload Documents",
          description:
            "Upload your first documents so the engine can extract entities, events, and claims.",
          href: "/upload",
          category: "evidence",
        });
      }

      // Has documents but no claims — run analysis
      if (counts.documents > 0 && counts.claims === 0) {
        steps.push({
          priority: 2,
          action: "Run Case Analysis",
          description:
            "Documents are uploaded. Run the analysis engine to extract claims, events, and entities.",
          href: "/control-room",
          category: "analysis",
        });
      }

      // Has claims but no evidence items mapped
      if (counts.claims > 0 && counts.evidence === 0) {
        steps.push({
          priority: 3,
          action: "Map Evidence to Claims",
          description:
            "Claims have been identified. Map your evidence to proof elements to strengthen your case.",
          href: "/proof-frameworks",
          category: "evidence",
        });
      }

      // Has missing records
      if (counts.missing_records > 0) {
        steps.push({
          priority: 4,
          action: `Address ${counts.missing_records} Missing Record${counts.missing_records > 1 ? "s" : ""}`,
          description:
            "The engine identified records that should exist but weren't found. Consider filing FOIA requests.",
          href: "/foia",
          category: "records",
        });
      }

      // Checklist incomplete
      if (counts.checklist_total > 0 && counts.checklist_done < counts.checklist_total) {
        const remaining = counts.checklist_total - counts.checklist_done;
        steps.push({
          priority: 5,
          action: `Complete ${remaining} Checklist Item${remaining > 1 ? "s" : ""}`,
          description: `${counts.checklist_done} of ${counts.checklist_total} items done. Review and complete remaining items.`,
          href: "/repair",
          category: "checklist",
        });
      }

      // Has findings — review them
      if (counts.findings > 0) {
        steps.push({
          priority: 6,
          action: "Review Findings",
          description: `${counts.findings} finding${counts.findings > 1 ? "s" : ""} detected. Review contradictions, patterns, and anomalies.`,
          href: "/findings",
          category: "analysis",
        });
      }

      // Has events — build timeline
      if (counts.events > 0) {
        steps.push({
          priority: 7,
          action: "Review Timeline",
          description: `${counts.events} event${counts.events > 1 ? "s" : ""} extracted. Review the chronological timeline for accuracy.`,
          href: "/timeline",
          category: "evidence",
        });
      }

      // Suggest generating statement of facts if enough data
      if (counts.documents >= 2 && counts.events >= 3) {
        steps.push({
          priority: 8,
          action: "Generate Statement of Facts",
          description:
            "Enough evidence to generate a formal Statement of Facts document.",
          href: "/narrative",
          category: "paperwork",
        });
      }

      // Suggest filing generator if claims exist
      if (counts.claims > 0) {
        steps.push({
          priority: 9,
          action: "Generate Filing Documents",
          description:
            "Use the Filing Generator to create complaint letters, appeals, or formal filings.",
          href: "/filing-generator",
          category: "paperwork",
        });
      }

      // Suggest benefits check
      if (caseRow && caseRow.domain) {
        steps.push({
          priority: 10,
          action: "Check Available Benefits",
          description:
            "Browse benefits and programs that may apply to your situation.",
          href: "/benefits",
          category: "resources",
        });
      }

      return steps.sort((a, b) => a.priority - b.priority);
    }),

  /**
   * Claims breakdown — grouped by type with status
   */
  claimsBreakdown: protectedProcedure
    .input(z.object({ caseId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);

      // Live public.claims has no created_at or pipeline_run_id; snapshot_id is
      // the run marker and id is insertion order.
      const rows = await query(
        `SELECT id, claim_type, claim_text, claim_statement_origin, evidentiary_weight,
                document_id, quote_id, snapshot_id, lane_id, engine_version
           FROM public.claims
          WHERE case_id = $1
          ORDER BY snapshot_id DESC NULLS LAST, id DESC`,
        [input.caseId],
      );

      return rows.map(r => ({
        id: Number(r.id),
        claim_type: (r.claim_type as string | null) ?? null,
        claimType: (r.claim_type as string | null) ?? null,
        claim_text: (r.claim_text as string | null) ?? null,
        description: (r.claim_text as string | null) ?? null,
        claim_statement_origin: (r.claim_statement_origin as string | null) ?? null,
        evidentiary_weight: (r.evidentiary_weight as string | null) ?? null,
        // Rendered as a percentage by the dashboard, so only a real number is
        // safe here; live evidentiary_weight is text and usually a label.
        confidence: numeric(r.evidentiary_weight),
        severity: (r.evidentiary_weight as string | null) ?? null,
        document_id: num(r.document_id),
        quote_id: num(r.quote_id),
        snapshot_id: num(r.snapshot_id),
        pipeline_run_id: num(r.snapshot_id),
        lane_id: (r.lane_id as string | null) ?? null,
        engine_version: (r.engine_version as string | null) ?? null,
        created_at: null as number | null,
      }));
    }),
});
