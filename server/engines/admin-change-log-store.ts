import { query_with_diagnostics } from "../db";

export type admin_change_log_write = {
  adminId: string;
  adminName?: string | null;
  actionType: string;
  targetSystem: string;
  targetId?: string | null;
  previousState?: unknown;
  newState?: unknown;
  description?: string | null;
  timestamp?: Date | string | number;
  rollbackAvailable?: boolean;
  rolledBack?: boolean;
  rollbackData?: unknown;
};

export type admin_change_log_record = {
  id: number;
  adminId: string;
  adminName: string | null;
  actionType: string;
  targetSystem: string;
  targetId: string | null;
  previousState: unknown;
  newState: unknown;
  description: string | null;
  timestamp: number;
  rollbackAvailable: boolean;
  rolledBack: boolean;
  rollbackData: unknown;
};

type admin_change_log_sql_row = {
  id: number | string;
  admin_id: string | null;
  admin_name: string | null;
  action_type: string | null;
  target_system: string | null;
  target_id: string | null;
  previous_state: string | null;
  new_state: string | null;
  description: string | null;
  timestamp_ms: number | string | null;
  rollback_available: number | string | null;
  rolled_back: number | string | null;
  rollback_data: string | null;
};

export function stringify_admin_change_log_value(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? item.toString() : item,
  );
}

export function parse_admin_change_log_value(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function normalize_admin_change_log_timestamp(
  value: Date | string | number | undefined,
): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value === "string" && value.trim().length > 0) {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

function map_admin_change_log_row(
  row: admin_change_log_sql_row,
): admin_change_log_record {
  return {
    id: Number(row.id),
    adminId: row.admin_id ?? "unknown",
    adminName: row.admin_name,
    actionType: row.action_type ?? "unknown",
    targetSystem: row.target_system ?? "unknown",
    targetId: row.target_id,
    previousState: parse_admin_change_log_value(row.previous_state),
    newState: parse_admin_change_log_value(row.new_state),
    description: row.description,
    timestamp: Number(row.timestamp_ms ?? 0),
    rollbackAvailable: Number(row.rollback_available ?? 0) === 1,
    rolledBack: Number(row.rolled_back ?? 0) === 1,
    rollbackData: parse_admin_change_log_value(row.rollback_data),
  };
}

const ADMIN_CHANGE_LOG_SELECT = `
  select
    id,
    admin_id_acl as admin_id,
    admin_name_acl as admin_name,
    action_type_acl as action_type,
    target_system_acl as target_system,
    target_id_acl as target_id,
    previous_state_acl as previous_state,
    new_state_acl as new_state,
    description_acl as description,
    extract(epoch from timestamp_acl) * 1000 as timestamp_ms,
    coalesce(rollback_available_acl, 0) as rollback_available,
    coalesce(rolled_back_acl, 0) as rolled_back,
    rollback_data_acl as rollback_data
  from public.admin_change_log
`;

export async function write_admin_change_log(
  input: admin_change_log_write,
): Promise<{ id: number }> {
  const result = await query_with_diagnostics<{ id: number | string }>(
    `insert into public.admin_change_log (
       admin_id_acl,
       admin_name_acl,
       action_type_acl,
       target_system_acl,
       target_id_acl,
       previous_state_acl,
       new_state_acl,
       description_acl,
       timestamp_acl,
       rollback_available_acl,
       rolled_back_acl,
       rollback_data_acl
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10, $11, $12
     ) returning id`,
    [
      input.adminId,
      input.adminName ?? null,
      input.actionType,
      input.targetSystem,
      input.targetId ?? null,
      stringify_admin_change_log_value(input.previousState),
      stringify_admin_change_log_value(input.newState),
      input.description ?? null,
      normalize_admin_change_log_timestamp(input.timestamp),
      input.rollbackAvailable ? 1 : 0,
      input.rolledBack ? 1 : 0,
      stringify_admin_change_log_value(input.rollbackData),
    ],
    {
      label: "admin_change_log_insert",
      pool_acquire_timeout_ms: 2_000,
      query_timeout_ms: 5_000,
    },
  );

  const id = Number(result.rows[0]?.id);
  if (!Number.isFinite(id)) {
    throw new Error("Admin change log insert did not return an id");
  }
  return { id };
}

export async function list_admin_change_log(
  limit = 50,
): Promise<admin_change_log_record[]> {
  const bounded_limit = Math.min(200, Math.max(1, Math.floor(limit)));
  const result = await query_with_diagnostics<admin_change_log_sql_row>(
    `${ADMIN_CHANGE_LOG_SELECT}
     order by timestamp_acl desc, id desc
     limit ${bounded_limit}`,
    [],
    {
      label: "admin_change_log_list",
      pool_acquire_timeout_ms: 2_000,
      query_timeout_ms: 5_000,
    },
  );
  return result.rows.map(map_admin_change_log_row);
}

export async function get_admin_change_log_entry(
  id: number,
): Promise<admin_change_log_record | null> {
  const result = await query_with_diagnostics<admin_change_log_sql_row>(
    `${ADMIN_CHANGE_LOG_SELECT}
     where id = $1
     limit 1`,
    [id],
    {
      label: "admin_change_log_get",
      pool_acquire_timeout_ms: 2_000,
      query_timeout_ms: 5_000,
    },
  );
  return result.rows[0] ? map_admin_change_log_row(result.rows[0]) : null;
}

export async function mark_admin_change_rolled_back(id: number): Promise<void> {
  await query_with_diagnostics(
    `update public.admin_change_log
     set rolled_back_acl = 1
     where id = $1`,
    [id],
    {
      label: "admin_change_log_mark_rolled_back",
      pool_acquire_timeout_ms: 2_000,
      query_timeout_ms: 5_000,
    },
  );
}
