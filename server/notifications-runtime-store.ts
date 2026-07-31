import { query_with_diagnostics } from "./db";

export type NotificationRuntimeRow = {
  id: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  linkUrl: string | null;
  readAt: number | null;
  createdAt: number;
};

type NotificationDatabaseRow = {
  id: number | string;
  user_id: number | string;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  link_url: string | null;
  read_at: number | string | null;
  created_at: number | string;
};

export type CreateNotificationRuntimeInput = {
  userId: number;
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown> | null;
  linkUrl?: string | null;
};

function mapNotificationRow(row: NotificationDatabaseRow): NotificationRuntimeRow {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    type: row.type,
    title: row.title,
    message: row.message,
    metadata: row.metadata ?? null,
    linkUrl: row.link_url ?? null,
    readAt: row.read_at === null ? null : Number(row.read_at),
    createdAt: Number(row.created_at),
  };
}

function assertPositiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

export async function createNotificationRuntime(
  input: CreateNotificationRuntimeInput
): Promise<NotificationRuntimeRow> {
  const userId = assertPositiveInteger(input.userId, "user_id");
  const type = input.type.trim().slice(0, 50);
  const title = input.title.trim().slice(0, 255);
  const message = input.message.trim();
  const linkUrl = input.linkUrl?.trim().slice(0, 500) || null;

  if (!type || !title || !message) {
    throw new Error("notification type, title, and message are required");
  }

  const { rows } = await query_with_diagnostics<NotificationDatabaseRow>(
    `
      insert into public.notifications (
        user_id,
        type,
        title,
        message,
        metadata,
        link_url,
        read_at,
        created_at
      )
      values ($1, $2, $3, $4, $5::jsonb, $6, null, $7)
      returning
        id,
        user_id,
        type,
        title,
        message,
        metadata,
        link_url,
        read_at,
        created_at
    `,
    [
      userId,
      type,
      title,
      message,
      JSON.stringify(input.metadata ?? null),
      linkUrl,
      Date.now(),
    ],
    {
      label: "notification_create",
      pool_acquire_timeout_ms: 1000,
      query_timeout_ms: 4000,
    }
  );

  if (!rows[0]) throw new Error("notification insert returned no row");
  return mapNotificationRow(rows[0]);
}

export async function listNotificationsRuntime(
  userIdInput: number,
  options: { unreadOnly?: boolean; limit?: number } = {}
): Promise<NotificationRuntimeRow[]> {
  const userId = assertPositiveInteger(userIdInput, "user_id");
  const limit = Math.min(
    100,
    Math.max(1, Number.isSafeInteger(options.limit) ? Number(options.limit) : 50)
  );

  const { rows } = await query_with_diagnostics<NotificationDatabaseRow>(
    `
      select
        id,
        user_id,
        type,
        title,
        message,
        metadata,
        link_url,
        read_at,
        created_at
      from public.notifications
      where user_id = $1
        and ($2::boolean is false or read_at is null)
      order by created_at desc, id desc
      limit $3
    `,
    [userId, Boolean(options.unreadOnly), limit],
    {
      label: "notification_list",
      pool_acquire_timeout_ms: 1000,
      query_timeout_ms: 4000,
    }
  );

  return rows.map(mapNotificationRow);
}

export async function getUnreadNotificationCountRuntime(
  userIdInput: number
): Promise<number> {
  const userId = assertPositiveInteger(userIdInput, "user_id");
  const { rows } = await query_with_diagnostics<{ count: number | string }>(
    `
      select count(*)::int as count
      from public.notifications
      where user_id = $1
        and read_at is null
    `,
    [userId],
    {
      label: "notification_unread_count",
      pool_acquire_timeout_ms: 750,
      query_timeout_ms: 2500,
    }
  );

  return Number(rows[0]?.count ?? 0);
}

export async function markNotificationReadRuntime(
  notificationIdInput: number,
  userIdInput: number
): Promise<boolean> {
  const notificationId = assertPositiveInteger(notificationIdInput, "notification_id");
  const userId = assertPositiveInteger(userIdInput, "user_id");

  const { rowCount } = await query_with_diagnostics(
    `
      update public.notifications
      set read_at = coalesce(read_at, $3)
      where id = $1
        and user_id = $2
    `,
    [notificationId, userId, Date.now()],
    {
      label: "notification_mark_read",
      pool_acquire_timeout_ms: 1000,
      query_timeout_ms: 4000,
    }
  );

  return Number(rowCount ?? 0) > 0;
}

export async function markAllNotificationsReadRuntime(
  userIdInput: number
): Promise<number> {
  const userId = assertPositiveInteger(userIdInput, "user_id");

  const { rowCount } = await query_with_diagnostics(
    `
      update public.notifications
      set read_at = $2
      where user_id = $1
        and read_at is null
    `,
    [userId, Date.now()],
    {
      label: "notification_mark_all_read",
      pool_acquire_timeout_ms: 1000,
      query_timeout_ms: 4000,
    }
  );

  return Number(rowCount ?? 0);
}
