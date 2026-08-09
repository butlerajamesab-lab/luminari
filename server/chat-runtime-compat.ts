import { getPool } from "./db-legacy";

function parse_citations(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function map_chat_message(row: any) {
  return {
    id: Number(row.id),
    caseId: Number(row.case_id),
    userId: Number(row.user_id),
    role: String(row.chat_role ?? "user") as "user" | "assistant",
    content: String(row.content ?? ""),
    citations: parse_citations(row.citations),
    createdAt: Number(row.created_at ?? 0),
  };
}

export async function getChatHistory(caseId: number, limit = 50) {
  const safe_limit = Math.max(1, Math.min(200, Math.trunc(limit)));
  const result = await getPool().query(
    `select id, case_id, user_id, chat_role, content, citations, created_at
       from public.chat_messages
      where case_id = $1
      order by created_at desc, id desc
      limit $2`,
    [caseId, safe_limit],
  );
  return result.rows.map(map_chat_message);
}

export async function addChatMessage(message: {
  caseId: number;
  userId: number;
  role: "user" | "assistant";
  content: string;
  citations?: unknown[];
}) {
  const result = await getPool().query(
    `insert into public.chat_messages
       (case_id, user_id, chat_role, content, citations, created_at)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [
      message.caseId,
      message.userId,
      message.role,
      message.content,
      JSON.stringify(message.citations ?? []),
      Date.now(),
    ],
  );
  return Number(result.rows[0]?.id ?? 0);
}
