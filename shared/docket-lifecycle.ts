/** Presentation of provider procedure only; never an extraction or legal-effect gate. */
export type docket_lifecycle_state =
  | "live"
  | "action_approaching"
  | "completed"
  | "stalled"
  | "unknown";

export type docket_source_freshness_state =
  | "fresh"
  | "stale"
  | "unknown"
  | "refresh_paused";

export type docket_effective_status_state =
  | "effective_immediately"
  | "effective_now"
  | "effective_future"
  | "effective_date_unknown";

export type docket_lifecycle_input = {
  status?: unknown;
  status_text?: unknown;
  current_status?: unknown;
  completed?: unknown;
  last_action?: unknown;
  last_action_date?: string | null;
  status_date?: string | null;
  effective_date?: unknown;
  radar?: {
    next_event_date?: string | null;
    velocity_score?: unknown;
    events_14d?: unknown;
    amended_7d?: unknown;
  } | null;
  session?: {
    is_current?: boolean | null;
  } | null;
  freshness?: {
    is_fresh?: boolean | null;
    state?: docket_source_freshness_state | null;
    source?: string | null;
    last_observed_at?: string | null;
  } | null;
};

export type docket_lifecycle_resolution = {
  procedural_state: docket_lifecycle_state;
  is_terminal: boolean;
  is_changeable: boolean;
  live_feed_eligible: boolean;
  effective_state: docket_effective_status_state;
  effective_date: string | null;
  freshness_state: docket_source_freshness_state;
  next_event_date: string | null;
  status_date: string | null;
  last_action_date: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const STALLED_AFTER_MS = 90 * DAY_MS;
const ACTIVE_MOVEMENT_WINDOW_MS = 45 * DAY_MS;
const immediate_effective_pattern =
  /\b(?:effective\s+immediately|immediately\s+effective|upon\s+signature|upon\s+approval|upon\s+enactment|upon\s+becoming\s+law)\b/i;
const terminal_status_pattern =
  /\b(?:enacted|signed|approved|chaptered|chapter\s+number(?:ed)?|became law|vetoed|failed|withdrawn|expired|dead|adopted|passed)\b/i;

const as_text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const as_number = (value: unknown): number | null => {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
};

const as_bool = (value: unknown): boolean | null => {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "y"].includes(normalized)) return true;
    if (["false", "no", "n"].includes(normalized)) return false;
  }
  return null;
};

const parse_date_ms = (value: unknown): number | null => {
  if (typeof value !== "string" || !value || value.startsWith("0000-00-00")) return null;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : null;
};

const date_only = (value: unknown): string | null =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

const local_day_string = (value: number): string => {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parse_effective_date = (
  value: unknown,
): {
  date: string | null;
  state: docket_effective_status_state | null;
  timestamp_ms: number | null;
  is_date_only: boolean;
} => {
  const text = as_text(value);
  if (!text) return { date: null, state: null, timestamp_ms: null, is_date_only: false };
  if (immediate_effective_pattern.test(text)) {
    return { date: text, state: "effective_immediately", timestamp_ms: null, is_date_only: false };
  }
  const timestamp_ms = parse_date_ms(text);
  return timestamp_ms === null
    ? { date: text, state: null, timestamp_ms: null, is_date_only: false }
    : { date: text, state: "effective_now", timestamp_ms, is_date_only: Boolean(date_only(text)) };
};

const terminal_clause_patterns = [
  /\b(?:bill|measure|resolution)\s+(?:has\s+)?(?:enacted|failed(?:\s+(?:final passage|to pass))?|withdrawn|vetoed|expired|died|dead|(?:been\s+)?postponed\s+indefinitely|indefinitely\s+postponed)\b/,
  /^\s*(?:chapter(?:ed)?|enacted|withdrawn|dead|vetoed|expired|approved|signed|became law|postponed indefinitely|indefinitely postponed)\b/,
  /^\s*failed(?:\s+(?:final passage|to pass))?\s*[.;]?\s*$/,
  /\b(?:signed|approved) by (?:the )?(?:governor|president)\b|\b(?:governor|president) signed\b|\bbecame law\b/,
] as const;

const clause_is_terminal = (clause: string): boolean => {
  const mentions_subsidiary = /\b(?:amendments?|motions?)\b/.test(clause);
  const mentions_whole_measure = /\b(?:bill|measure|resolution)\b/.test(clause);
  if (mentions_subsidiary && !mentions_whole_measure) return false;
  return terminal_clause_patterns.some(pattern => pattern.test(clause));
};

export function docket_terminal_action(status: unknown, ...evidence: unknown[]): boolean {
  if ([5, 6].includes(Number(status))) return true;
  return evidence
    .flatMap(value => as_text(value) ? as_text(value)!.split(/[;.\n]/) : [])
    .some(clause => clause_is_terminal(clause.toLowerCase()));
}

export function resolve_docket_lifecycle(
  bill: docket_lifecycle_input,
  now = Date.now(),
): docket_lifecycle_resolution {
  const next_event_ms = parse_date_ms(bill.radar?.next_event_date ?? null);
  const last_action_ms = parse_date_ms(bill.last_action_date ?? null);
  const status_ms = parse_date_ms(bill.status_date ?? null);
  const completed = as_bool(bill.completed);
  const session_is_current = bill.session?.is_current;
  const freshness_state = resolve_docket_source_freshness(bill);
  const terminal = completed === true || docket_terminal_action(
    bill.status,
    bill.status_text,
    bill.current_status,
    bill.last_action,
  );

  const effective = parse_effective_date(bill.effective_date);
  let effective_state = effective.state ?? "effective_date_unknown";
  if (effective.state === "effective_now" && effective.timestamp_ms !== null) {
    if (effective.is_date_only) {
      const current_day_ms = parse_date_ms(local_day_string(now));
      if (
        current_day_ms !== null
        && effective.timestamp_ms > current_day_ms
      ) {
        effective_state = "effective_future";
      }
    } else if (effective.timestamp_ms > now) {
      effective_state = "effective_future";
    }
  }

  if (terminal) {
    return {
      procedural_state: "completed",
      is_terminal: true,
      is_changeable: false,
      live_feed_eligible: false,
      effective_state,
      effective_date: effective.date,
      freshness_state,
      next_event_date: as_text(bill.radar?.next_event_date) ?? null,
      status_date: as_text(bill.status_date) ?? null,
      last_action_date: as_text(bill.last_action_date) ?? null,
    };
  }

  let procedural_state: docket_lifecycle_state;
  if (next_event_ms !== null && next_event_ms >= now) {
    procedural_state = "action_approaching";
  } else {
    const recent_movement = [last_action_ms, status_ms].some(
      value => value !== null && value <= now && now - value <= ACTIVE_MOVEMENT_WINDOW_MS,
    );
    const radar_activity = [
      as_number(bill.radar?.velocity_score),
      as_number(bill.radar?.events_14d),
      as_number(bill.radar?.amended_7d),
    ].some(value => value !== null && value > 0);

    if (recent_movement || radar_activity) {
      procedural_state = "live";
    } else {
      const last_known_activity_ms = [last_action_ms, status_ms].reduce<number | null>(
        (latest, value) => value !== null && (latest === null || value > latest) ? value : latest,
        null,
      );
      procedural_state =
        last_known_activity_ms !== null && last_known_activity_ms <= now && now - last_known_activity_ms > STALLED_AFTER_MS
          ? "stalled"
          : session_is_current === false
            ? "stalled"
            : "unknown";
    }
  }

  const live_feed_eligible =
    session_is_current === true
    && (procedural_state === "live" || procedural_state === "action_approaching");

  return {
    procedural_state,
    is_terminal: false,
    is_changeable: live_feed_eligible,
    live_feed_eligible,
    effective_state,
    effective_date: effective.date,
    freshness_state,
    next_event_date: as_text(bill.radar?.next_event_date) ?? null,
    status_date: as_text(bill.status_date) ?? null,
    last_action_date: as_text(bill.last_action_date) ?? null,
  };
}

export function docket_lifecycle(
  bill: docket_lifecycle_input,
  cache_fresh_or_now?: boolean | number,
  now = Date.now(),
): docket_lifecycle_state {
  if (typeof cache_fresh_or_now === "number") {
    now = cache_fresh_or_now;
  }
  const resolution = resolve_docket_lifecycle(
    typeof cache_fresh_or_now === "boolean"
      ? {
          ...bill,
          freshness: { ...(bill.freshness ?? {}), is_fresh: cache_fresh_or_now },
        }
      : bill,
    now,
  );
  return resolution.procedural_state;
}

export function docket_live_feed_eligible(
  bill: docket_lifecycle_input,
  now = Date.now(),
): boolean {
  return resolve_docket_lifecycle(bill, now).live_feed_eligible;
}

export function resolve_docket_source_freshness(
  bill: Pick<docket_lifecycle_input, "freshness">,
): docket_source_freshness_state {
  const explicit = bill.freshness?.state;
  if (explicit) return explicit;

  const source = as_text(bill.freshness?.source)?.toLowerCase() ?? "";
  if (source.includes("worker_paused")) return "refresh_paused";
  if (source.includes("stale")) return "stale";

  const is_fresh = bill.freshness?.is_fresh;
  if (is_fresh === true) return "fresh";
  if (is_fresh === false) return "stale";
  return "unknown";
}

export function docket_status_text_is_terminal(value: unknown): boolean {
  return Boolean(as_text(value) && terminal_status_pattern.test(as_text(value)!));
}
