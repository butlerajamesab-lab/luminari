import { getPool } from "./db-legacy";

export type ProvenanceAlertType = "PROVENANCE_DRIFT" | "PROVENANCE_COVERAGE_DROP";

export type ProvenanceAlertMetrics = {
  coverage: number;
  unsupportedRate: number;
  fallbackRate: number;
  totalFindings: number;
  unsupportedCount: number;
  batchId?: number;
};

export type ProvenanceAlertEventCompat = {
  id: number;
  alertType: ProvenanceAlertType;
  metrics: ProvenanceAlertMetrics;
  cooldownUntil: number;
  notificationSent: boolean;
  createdAt: number;
};

function as_number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parse_metrics(value: unknown): ProvenanceAlertMetrics {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("provenance_alert_metrics_invalid");
  }
  const row = value as Record<string, unknown>;
  const required = [
    "coverage",
    "unsupportedRate",
    "fallbackRate",
    "totalFindings",
    "unsupportedCount",
  ] as const;
  for (const key of required) {
    if (!Number.isFinite(Number(row[key]))) {
      throw new Error(`provenance_alert_metrics_invalid:${key}`);
    }
  }
  const batchId = row.batchId === undefined || row.batchId === null
    ? undefined
    : as_number(row.batchId);
  return {
    coverage: Number(row.coverage),
    unsupportedRate: Number(row.unsupportedRate),
    fallbackRate: Number(row.fallbackRate),
    totalFindings: Number(row.totalFindings),
    unsupportedCount: Number(row.unsupportedCount),
    ...(batchId === undefined ? {} : { batchId }),
  };
}

function map_alert_event(row: any): ProvenanceAlertEventCompat {
  const alertType = String(row.alert_type ?? "") as ProvenanceAlertType;
  if (alertType !== "PROVENANCE_DRIFT" && alertType !== "PROVENANCE_COVERAGE_DROP") {
    throw new Error(`provenance_alert_type_invalid:${alertType}`);
  }
  return {
    id: as_number(row.id),
    alertType,
    metrics: parse_metrics(row.metrics),
    cooldownUntil: as_number(row.cooldown_until),
    notificationSent: row.notification_sent === true,
    createdAt: as_number(row.created_at),
  };
}

/**
 * Live Postgres compatibility boundary for provenance alert persistence.
 *
 * The table is a current snake_case Postgres table. Alerting used to depend on
 * a MySQL-style insert result (`result.insertId`), which is not a valid Postgres
 * insert identity contract. These helpers use explicit RETURNING and map the
 * physical snake_case rows back to the established camelCase tRPC/UI shape.
 */
export async function isProvenanceAlertInCooldown(
  alertType: ProvenanceAlertType,
  now = Date.now(),
): Promise<boolean> {
  const result = await getPool().query(
    `select 1
       from public.provenance_alert_events
      where alert_type = $1
        and cooldown_until > $2
      order by cooldown_until desc, id desc
      limit 1`,
    [alertType, now],
  );
  return result.rows.length > 0;
}

export async function createProvenanceAlertEvent(input: {
  alertType: ProvenanceAlertType;
  metrics: ProvenanceAlertMetrics;
  cooldownUntil: number;
  notificationSent: boolean;
  createdAt?: number;
}): Promise<number> {
  const createdAt = input.createdAt ?? Date.now();
  const result = await getPool().query<{ id: number }>(
    `insert into public.provenance_alert_events (
       alert_type,
       metrics,
       cooldown_until,
       notification_sent,
       created_at
     ) values ($1, $2::jsonb, $3, $4, $5)
     returning id`,
    [
      input.alertType,
      JSON.stringify(input.metrics),
      input.cooldownUntil,
      input.notificationSent,
      createdAt,
    ],
  );
  const id = as_number(result.rows[0]?.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error("provenance_alert_event_not_persisted");
  }
  return id;
}

export async function listProvenanceAlertEvents(
  limit = 20,
): Promise<ProvenanceAlertEventCompat[]> {
  const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const result = await getPool().query(
    `select id, alert_type, metrics, cooldown_until, notification_sent, created_at
       from public.provenance_alert_events
      order by created_at desc, id desc
      limit $1`,
    [boundedLimit],
  );
  return result.rows.map(map_alert_event);
}
