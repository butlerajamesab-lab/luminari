import type { BenefitApplication } from "../drizzle/schema";
import { getPool } from "./db-legacy";

type BenefitApplicationInput = {
  userId: number;
  caseId?: number;
  programId: string;
  programName: string;
  stateCode?: string;
  applicationUrl?: string;
  documentsNeeded?: string[];
};

const BENEFIT_APPLICATION_COLUMNS = `
  id,
  user_id as "userId",
  case_id as "caseId",
  program_id as "programId",
  program_name as "programName",
  benefit_app_status as status,
  state_code as "stateCode",
  applied_at as "appliedAt",
  decision_at as "decisionAt",
  next_deadline as "nextDeadline",
  deadline_label as "deadlineLabel",
  notes,
  denial_reason as "denialReason",
  application_url as "applicationUrl",
  confirmation_number as "confirmationNumber",
  documents_needed as "documentsNeeded",
  documents_submitted as "documentsSubmitted",
  created_at as "createdAt",
  updated_at as "updatedAt"
`;

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBenefitApplication(row: Record<string, unknown>): BenefitApplication {
  return {
    ...row,
    caseId: parseNullableNumber(row.caseId),
    appliedAt: parseNullableNumber(row.appliedAt),
    decisionAt: parseNullableNumber(row.decisionAt),
    nextDeadline: parseNullableNumber(row.nextDeadline),
    documentsNeeded: parseStringArray(row.documentsNeeded),
    documentsSubmitted: parseStringArray(row.documentsSubmitted),
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  } as BenefitApplication;
}

async function selectOne(id: number, userId: number): Promise<BenefitApplication | null> {
  const { rows } = await getPool().query(
    `select ${BENEFIT_APPLICATION_COLUMNS}
       from public.benefit_applications
      where id = $1 and user_id = $2
      limit 1`,
    [id, userId],
  );
  return rows[0] ? normalizeBenefitApplication(rows[0]) : null;
}

export async function createBenefitApplication(data: BenefitApplicationInput): Promise<BenefitApplication> {
  const now = Date.now();
  const { rows } = await getPool().query(
    `insert into public.benefit_applications (
       user_id, case_id, program_id, program_name, benefit_app_status,
       state_code, application_url, documents_needed, documents_submitted,
       created_at, updated_at
     ) values ($1, $2, $3, $4, 'not_started', $5, $6, $7, $8, $9, $9)
     returning ${BENEFIT_APPLICATION_COLUMNS}`,
    [
      data.userId,
      data.caseId === undefined ? null : String(data.caseId),
      data.programId,
      data.programName,
      data.stateCode ?? null,
      data.applicationUrl ?? null,
      JSON.stringify(data.documentsNeeded ?? []),
      JSON.stringify([]),
      now,
    ],
  );
  return normalizeBenefitApplication(rows[0]);
}

export async function listBenefitApplications(userId: number, caseId?: number): Promise<BenefitApplication[]> {
  const params: unknown[] = [userId];
  const caseFilter = caseId === undefined ? "" : `and case_id = $${params.push(String(caseId))}`;
  const { rows } = await getPool().query(
    `select ${BENEFIT_APPLICATION_COLUMNS}
       from public.benefit_applications
      where user_id = $1 ${caseFilter}
      order by updated_at desc`,
    params,
  );
  return rows.map(normalizeBenefitApplication);
}

export async function getBenefitApplication(id: number, userId: number): Promise<BenefitApplication | null> {
  return selectOne(id, userId);
}

export async function updateBenefitApplicationStatus(
  id: number,
  userId: number,
  status: BenefitApplication["status"],
  extra?: { appliedAt?: number; decisionAt?: number; denialReason?: string; confirmationNumber?: string },
): Promise<BenefitApplication | null> {
  const now = Date.now();
  const appliedAt = extra?.appliedAt ?? (status === "applied" ? now : null);
  const decisionAt = extra?.decisionAt ?? (status === "approved" || status === "denied" ? now : null);
  await getPool().query(
    `update public.benefit_applications
        set benefit_app_status = $3,
            applied_at = coalesce($4, applied_at),
            decision_at = coalesce($5, decision_at),
            denial_reason = coalesce($6, denial_reason),
            confirmation_number = coalesce($7, confirmation_number),
            updated_at = $8
      where id = $1 and user_id = $2`,
    [id, userId, status, appliedAt === null ? null : String(appliedAt), decisionAt === null ? null : String(decisionAt), extra?.denialReason ?? null, extra?.confirmationNumber ?? null, now],
  );
  return selectOne(id, userId);
}

export async function updateBenefitApplicationNotes(id: number, userId: number, notes: string): Promise<BenefitApplication | null> {
  await getPool().query(
    `update public.benefit_applications set notes = $3, updated_at = $4 where id = $1 and user_id = $2`,
    [id, userId, notes, Date.now()],
  );
  return selectOne(id, userId);
}

export async function updateBenefitApplicationDeadline(
  id: number,
  userId: number,
  nextDeadline: number | null,
  deadlineLabel?: string,
): Promise<BenefitApplication | null> {
  await getPool().query(
    `update public.benefit_applications
        set next_deadline = $3, deadline_label = $4, updated_at = $5
      where id = $1 and user_id = $2`,
    [id, userId, nextDeadline === null ? null : String(nextDeadline), deadlineLabel ?? null, Date.now()],
  );
  return selectOne(id, userId);
}

export async function markDocumentSubmitted(id: number, userId: number, document: string): Promise<BenefitApplication | null> {
  const application = await selectOne(id, userId);
  if (!application) return null;
  const submitted = [...((application.documentsSubmitted as string[] | null) ?? [])];
  if (!submitted.includes(document)) submitted.push(document);
  const needed = ((application.documentsNeeded as string[] | null) ?? []).filter((item) => item !== document);
  await getPool().query(
    `update public.benefit_applications
        set documents_submitted = $3, documents_needed = $4, updated_at = $5
      where id = $1 and user_id = $2`,
    [id, userId, JSON.stringify(submitted), JSON.stringify(needed), Date.now()],
  );
  return selectOne(id, userId);
}

export async function deleteBenefitApplication(id: number, userId: number): Promise<boolean> {
  const result = await getPool().query(
    `delete from public.benefit_applications where id = $1 and user_id = $2 returning id`,
    [id, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getUpcomingBenefitDeadlines(userId: number): Promise<BenefitApplication[]> {
  const { rows } = await getPool().query(
    `select ${BENEFIT_APPLICATION_COLUMNS}
       from public.benefit_applications
      where user_id = $1
        and case when next_deadline ~ '^[0-9]+$' then next_deadline::bigint end > $2
      order by next_deadline::bigint asc`,
    [userId, Date.now()],
  );
  return rows.map(normalizeBenefitApplication);
}

export async function getBenefitApplicationSummary(userId: number): Promise<Record<string, number>> {
  const { rows } = await getPool().query(
    `select benefit_app_status as status, count(*)::int as count
       from public.benefit_applications
      where user_id = $1
      group by benefit_app_status`,
    [userId],
  );
  return Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));
}
