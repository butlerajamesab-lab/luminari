import { getPool } from "./db-legacy";

const asNumber = (value: unknown): number => Number(value ?? 0) || 0;

function mapPresentation(row: any) {
  if (!row) return null;
  return {
    id: asNumber(row.id),
    caseId: asNumber(row.case_id),
    userId: asNumber(row.user_id),
    title: row.title,
    description: row.description,
    snapshotId: row.snapshot_id == null ? null : asNumber(row.snapshot_id),
    slideCount: asNumber(row.slide_count),
    theme: row.theme || "courtroom",
    createdAt: asNumber(row.created_at),
    updatedAt: asNumber(row.updated_at),
  };
}

function mapSlide(row: any) {
  if (!row) return null;
  return {
    id: asNumber(row.id),
    presentationId: asNumber(row.presentation_id),
    orderIndex: asNumber(row.order_index),
    slideType: row.slide_type,
    title: row.title,
    content: row.content,
    sourceCitations: row.source_citations,
    notes: row.notes,
    layout: row.layout || "default",
    metadata: row.metadata,
  };
}

export async function createPresentation(p: {
  caseId: number;
  userId: number;
  title: string;
  description?: string;
  snapshotId?: number;
  theme?: string;
}) {
  const now = Date.now();
  const result = await getPool().query<{ id: number }>(
    `insert into public.presentations
       (case_id,user_id,title,description,snapshot_id,slide_count,theme,created_at,updated_at)
     values ($1,$2,$3,$4,$5,0,$6,$7,$7)
     returning id`,
    [p.caseId, p.userId, p.title, p.description ?? null, p.snapshotId ?? null, p.theme ?? "courtroom", now],
  );
  return asNumber(result.rows[0]?.id);
}

export async function getPresentation(id: number) {
  const result = await getPool().query(
    `select * from public.presentations where id=$1 limit 1`,
    [id],
  );
  return mapPresentation(result.rows[0]);
}

export async function listPresentations(caseId: number) {
  const result = await getPool().query(
    `select * from public.presentations where case_id=$1 order by updated_at desc nulls last,id desc`,
    [caseId],
  );
  return result.rows.map(mapPresentation);
}

export async function updatePresentation(
  id: number,
  updates: { title?: string; description?: string; theme?: string },
) {
  const current = await getPresentation(id);
  if (!current) return;
  await getPool().query(
    `update public.presentations
        set title=$2,description=$3,theme=$4,updated_at=$5
      where id=$1`,
    [
      id,
      updates.title ?? current.title,
      updates.description ?? current.description,
      updates.theme ?? current.theme,
      Date.now(),
    ],
  );
}

export async function deletePresentation(id: number) {
  const pool = getPool();
  await pool.query(`delete from public.presentation_slides where presentation_id=$1`, [id]);
  await pool.query(`delete from public.presentations where id=$1`, [id]);
}

export async function updatePresentationSlideCount(presentationId: number) {
  await getPool().query(
    `update public.presentations p
        set slide_count=(select count(*)::int from public.presentation_slides s where s.presentation_id=p.id),
            updated_at=$2
      where p.id=$1`,
    [presentationId, Date.now()],
  );
}

export async function addSlide(s: {
  presentationId: number;
  orderIndex: number;
  slideType: string;
  title?: string;
  content?: string;
  sourceCitations?: unknown[];
  notes?: string;
  layout?: string;
  metadata?: unknown;
}) {
  const result = await getPool().query<{ id: number }>(
    `insert into public.presentation_slides
       (presentation_id,order_index,slide_type,title,content,source_citations,notes,layout,metadata)
     values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9::jsonb)
     returning id`,
    [
      s.presentationId,
      s.orderIndex,
      s.slideType,
      s.title ?? null,
      s.content ?? null,
      JSON.stringify(s.sourceCitations ?? null),
      s.notes ?? null,
      s.layout ?? "default",
      JSON.stringify(s.metadata ?? null),
    ],
  );
  await updatePresentationSlideCount(s.presentationId);
  return asNumber(result.rows[0]?.id);
}

export async function updateSlide(
  id: number,
  updates: { title?: string; content?: string; notes?: string; layout?: string; metadata?: unknown; sourceCitations?: unknown[] },
) {
  const current = await getSlide(id);
  if (!current) return;
  await getPool().query(
    `update public.presentation_slides
        set title=$2,content=$3,notes=$4,layout=$5,metadata=$6::jsonb,source_citations=$7::jsonb
      where id=$1`,
    [
      id,
      updates.title ?? current.title,
      updates.content ?? current.content,
      updates.notes ?? current.notes,
      updates.layout ?? current.layout,
      JSON.stringify(updates.metadata ?? current.metadata),
      JSON.stringify(updates.sourceCitations ?? current.sourceCitations),
    ],
  );
}

export async function deleteSlide(id: number, presentationId: number) {
  await getPool().query(`delete from public.presentation_slides where id=$1`, [id]);
  await reorderSlides(
    presentationId,
    (await getSlides(presentationId)).map((slide: any) => slide.id),
  );
  await updatePresentationSlideCount(presentationId);
}

export async function reorderSlides(presentationId: number, slideIds: number[]) {
  const pool = getPool();
  for (const [index, id] of slideIds.entries()) {
    await pool.query(
      `update public.presentation_slides set order_index=$3 where id=$1 and presentation_id=$2`,
      [id, presentationId, index],
    );
  }
}

export async function getSlides(presentationId: number) {
  const result = await getPool().query(
    `select * from public.presentation_slides where presentation_id=$1 order by order_index,id`,
    [presentationId],
  );
  return result.rows.map(mapSlide);
}

export async function getSlide(id: number) {
  const result = await getPool().query(
    `select * from public.presentation_slides where id=$1 limit 1`,
    [id],
  );
  return mapSlide(result.rows[0]);
}

function mapMergeSuggestion(row: any) {
  if (!row) return null;
  return {
    id: asNumber(row.id),
    caseId: asNumber(row.case_id),
    sourceEntityId: asNumber(row.source_entity_id),
    targetEntityId: asNumber(row.target_entity_id),
    confidence: Number(row.confidence) || 0,
    reason: row.reason,
    status: row.status || "pending",
    reviewedAt: row.reviewed_at == null ? null : asNumber(row.reviewed_at),
    reviewedBy: row.reviewed_by == null ? null : asNumber(row.reviewed_by),
    createdAt: asNumber(row.created_at),
  };
}

export async function createMergeSuggestion(s: {
  caseId: number;
  sourceEntityId: number;
  targetEntityId: number;
  confidence: number;
  reason: string;
}) {
  const pool = getPool();
  const existing = await pool.query<{ id: number }>(
    `select id from public.entity_merge_suggestions
      where case_id=$1 and ((source_entity_id=$2 and target_entity_id=$3) or (source_entity_id=$3 and target_entity_id=$2))
      limit 1`,
    [s.caseId, s.sourceEntityId, s.targetEntityId],
  );
  if (existing.rows[0]) return asNumber(existing.rows[0].id);
  const inserted = await pool.query<{ id: number }>(
    `insert into public.entity_merge_suggestions
       (case_id,source_entity_id,target_entity_id,confidence,reason,status,created_at)
     values ($1,$2,$3,$4,$5,'pending',$6) returning id`,
    [s.caseId, s.sourceEntityId, s.targetEntityId, s.confidence, s.reason, Date.now()],
  );
  return asNumber(inserted.rows[0]?.id);
}

export async function listMergeSuggestions(caseId: number, status?: "pending" | "approved" | "rejected") {
  const values: unknown[] = [caseId];
  const statusClause = status ? `and status=$2` : "";
  if (status) values.push(status);
  const result = await getPool().query(
    `select * from public.entity_merge_suggestions where case_id=$1 ${statusClause}
      order by confidence desc,id desc`,
    values,
  );
  return result.rows.map(mapMergeSuggestion);
}

export async function updateMergeSuggestionStatus(
  id: number,
  status: "approved" | "rejected",
  userId: number,
) {
  await getPool().query(
    `update public.entity_merge_suggestions set status=$2,reviewed_at=$3,reviewed_by=$4 where id=$1`,
    [id, status, Date.now(), userId],
  );
}

export async function getMergeSuggestion(id: number) {
  const result = await getPool().query(
    `select * from public.entity_merge_suggestions where id=$1 limit 1`,
    [id],
  );
  return mapMergeSuggestion(result.rows[0]);
}

function mapFeedback(row: any) {
  return {
    id: asNumber(row.id),
    userId: asNumber(row.user_id),
    caseId: row.case_id == null ? null : asNumber(row.case_id),
    feedbackType: row.feedback_type || "suggestion",
    message: row.message,
    currentPage: row.current_page,
    pipelineType: row.pipeline_type,
    status: row.status || "new",
    createdAt: asNumber(row.created_at),
  };
}

export async function createFeedback(
  userId: number,
  data: {
    feedbackType: "suggestion" | "question" | "bug_report" | "praise" | "other";
    message: string;
    currentPage?: string;
    caseId?: number;
    pipelineType?: string;
  },
) {
  const result = await getPool().query<{ id: number }>(
    `insert into public.user_feedback
       (user_id,case_id,feedback_type,message,current_page,pipeline_type,status,created_at)
     values ($1,$2,$3,$4,$5,$6,'new',$7) returning id`,
    [userId, data.caseId ?? null, data.feedbackType, data.message, data.currentPage ?? null, data.pipelineType ?? null, Date.now()],
  );
  return { id: asNumber(result.rows[0]?.id) };
}

export async function listFeedback(limit = 50) {
  const result = await getPool().query(
    `select * from public.user_feedback order by created_at desc nulls last,id desc limit $1`,
    [limit],
  );
  return result.rows.map(mapFeedback);
}

export async function updateFeedbackStatus(
  feedbackId: number,
  status: "new" | "reviewed" | "resolved",
) {
  await getPool().query(`update public.user_feedback set status=$2 where id=$1`, [feedbackId, status]);
  return { success: true };
}
