const legiscan_base_url = "https://api.legiscan.com/";
const LEGISCAN_REQUEST_TIMEOUT_MS = 30_000;

export const LEGISCAN_ROLLOUT_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC",
] as const;

const required_env = (name: string): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

type legiscan_status = "OK" | "ERROR";
type legiscan_operation_key =
  | "get_session_list"
  | "get_master_list"
  | "get_bill"
  | "get_bill_text"
  | "get_amendment";

type legiscan_envelope<payload> = payload & {
  status: legiscan_status;
  alert?: {
    message?: string;
  };
};

export type legiscan_session = {
  session_id: number;
  state_id?: number;
  year_start?: number;
  year_end?: number;
  prefile?: number;
  sine_die?: number;
  prior?: number;
  special?: number;
  session_tag?: string;
  session_title?: string;
  session_name?: string;
  name?: string;
};

export type legiscan_master_bill = {
  bill_id: number;
  number: string;
  change_hash?: string;
  url?: string;
  status?: number;
  status_date?: string;
  title?: string;
  description?: string;
  last_action_date?: string;
  last_action?: string;
};

export type legiscan_bill_detail = Record<string, unknown>;

export type legiscan_bill_text = {
  doc: string;
  doc_id: number | string;
  bill_id?: number | string;
  date?: string;
  type?: string;
  type_id?: number | string;
  mime?: string;
  mime_id?: number | string;
  url?: string;
  state_link?: string;
  text_size?: number | string;
  text_hash?: string;
};

export type legiscan_amendment = {
  doc: string;
  amendment_id: number | string;
  bill_id?: number | string;
  chamber?: string;
  chamber_id?: number | string;
  adopted?: number | string | boolean;
  date?: string;
  title?: string;
  description?: string;
  mime?: string;
  mime_id?: number | string;
  amendment_size?: number | string;
  amendment_hash?: string;
};

const require_positive_safe_integer = (
  value: number,
  failure_code: string,
): number => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(failure_code);
  }
  return value;
};

const normalize_state_code = (state: string): string => {
  const normalized = state.trim().toUpperCase();

  if (!LEGISCAN_ROLLOUT_STATES.includes(normalized as (typeof LEGISCAN_ROLLOUT_STATES)[number])) {
    throw new Error(`invalid_legiscan_state_code: ${state}`);
  }

  return normalized;
};

const outbound_operation = (op: legiscan_operation_key): string => {
  const [verb, ...rest] = op.split("_");
  return `${verb}${rest.map(part => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join("")}`;
};

const SHARED_PROVIDER_ALERT_PATTERN = /\b(?:api\s*key|access\s*key|api\s*request|account|auth(?:entication|orization)?|unauthori[sz]ed|credential|quota|rate\s*limit|request\s*limit|daily\s*limit|credit|subscription|permission|denied|forbidden|service|maintenance|temporar(?:y|ily)|server|internal\s+error|busy|connection|timed?\s*out|timeout|transport|network|upstream|gateway|proxy|dns|socket|reset|refused|unreachable|malformed|parse|json|response)\b/i;
const COMMON_RECORD_PROVIDER_ALERT_PATTERNS = [
  /^\s*(?:invalid|unknown|missing)\s+(?:(?:document|record)\s+)?id(?:\s*[:#]?\s*\d+)?\s*[.!]?\s*$/i,
  /^\s*(?:document|record)(?:\s+id)?(?:\s*[:#]?\s*\d+)?\s+(?:is\s+)?(?:invalid|unknown|missing|not\s+(?:found|available)|unavailable|does(?:\s+not|n't)\s+exist)\s*[.!]?\s*$/i,
  /^\s*id(?:\s*[:#]?\s*\d+)?\s+(?:is\s+)?(?:invalid|unknown|missing|not\s+(?:found|available)|unavailable|does(?:\s+not|n't)\s+exist)\s*[.!]?\s*$/i,
  /^\s*no\s+(?:document|record)(?:\s+was)?\s+found(?:\s+for\s+id(?:\s*[:#]?\s*\d+)?)?\s*[.!]?\s*$/i,
  /^\s*(?:could\s+not|unable\s+to)\s+(?:find|locate|retrieve)\s+(?:the\s+)?(?:document|record)(?:\s+id)?(?:\s*[:#]?\s*\d+)?\s*[.!]?\s*$/i,
] as const;
const BILL_TEXT_RECORD_PROVIDER_ALERT_PATTERNS = [
  /^\s*(?:invalid|unknown|missing)\s+bill\s+text(?:\s+id)?(?:\s*[:#]?\s*\d+)?\s*[.!]?\s*$/i,
  /^\s*bill\s+text(?:\s+id)?(?:\s*[:#]?\s*\d+)?\s+(?:is\s+)?(?:invalid|unknown|missing|not\s+(?:found|available)|unavailable|does(?:\s+not|n't)\s+exist)\s*[.!]?\s*$/i,
  /^\s*no\s+bill\s+text(?:\s+was)?\s+found(?:\s+for\s+id(?:\s*[:#]?\s*\d+)?)?\s*[.!]?\s*$/i,
  /^\s*(?:could\s+not|unable\s+to)\s+(?:find|locate|retrieve)\s+(?:the\s+)?bill\s+text(?:\s+id)?(?:\s*[:#]?\s*\d+)?\s*[.!]?\s*$/i,
] as const;
const AMENDMENT_RECORD_PROVIDER_ALERT_PATTERNS = [
  /^\s*(?:invalid|unknown|missing)\s+amendment(?:\s+id)?(?:\s*[:#]?\s*\d+)?\s*[.!]?\s*$/i,
  /^\s*amendment(?:\s+id)?(?:\s*[:#]?\s*\d+)?\s+(?:is\s+)?(?:invalid|unknown|missing|not\s+(?:found|available)|unavailable|does(?:\s+not|n't)\s+exist)\s*[.!]?\s*$/i,
  /^\s*no\s+amendment(?:\s+was)?\s+found(?:\s+for\s+id(?:\s*[:#]?\s*\d+)?)?\s*[.!]?\s*$/i,
  /^\s*(?:could\s+not|unable\s+to)\s+(?:find|locate|retrieve)\s+(?:the\s+)?amendment(?:\s+id)?(?:\s*[:#]?\s*\d+)?\s*[.!]?\s*$/i,
] as const;

const classify_provider_alert_scope = (
  op: legiscan_operation_key,
  message: unknown,
): "record" | "shared" => {
  if (op !== "get_bill_text" && op !== "get_amendment") return "shared";
  if (typeof message !== "string") return "shared";
  if (SHARED_PROVIDER_ALERT_PATTERN.test(message)) return "shared";

  const family_patterns = op === "get_bill_text"
    ? BILL_TEXT_RECORD_PROVIDER_ALERT_PATTERNS
    : AMENDMENT_RECORD_PROVIDER_ALERT_PATTERNS;
  return (
    COMMON_RECORD_PROVIDER_ALERT_PATTERNS.some(pattern => pattern.test(message))
    || family_patterns.some(pattern => pattern.test(message))
  )
    ? "record"
    : "shared";
};

const legiscan_request = async <payload>(
  op: legiscan_operation_key,
  params: Record<string, string | number>,
): Promise<payload> => {
  const url = new URL(legiscan_base_url);
  const api_key = required_env("LEGISCAN_API_KEY");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LEGISCAN_REQUEST_TIMEOUT_MS);

  url.searchParams.set("key", api_key);
  url.searchParams.set("op", outbound_operation(op));

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`legiscan_http_${response.status}_while_calling_${op}`);
    }

    let data: legiscan_envelope<payload>;
    try {
      data = (await response.json()) as legiscan_envelope<payload>;
    } catch {
      throw new Error(`legiscan_invalid_json_while_calling_${op}`);
    }

    if (data.status === "ERROR") {
      const scope = classify_provider_alert_scope(op, data.alert?.message);
      // Provider alert text is untrusted and can echo credentials or other
      // request details. Expose only a stable, non-sensitive error category.
      throw new Error(`legiscan_${scope}_api_error_while_calling_${op}`);
    }
    if (data.status !== "OK") {
      throw new Error(`legiscan_invalid_status_while_calling_${op}`);
    }

    return data as payload;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`legiscan_request_timeout_while_calling_${op}`);
    }
    if (error instanceof Error && error.message.startsWith("legiscan_")) {
      throw error;
    }
    const cause = error instanceof Error && error.cause && typeof error.cause === "object"
      && "code" in error.cause
      ? String(error.cause.code)
      : error instanceof Error
        ? error.name
        : "unknown";
    throw new Error(`legiscan_network_${cause}_while_calling_${op}`);
  } finally {
    clearTimeout(timeout);
  }
};

export const get_session_list = async (state: string): Promise<legiscan_session[]> => {
  const data = await legiscan_request<{
    status: "OK";
    sessions: legiscan_session[];
  }>("get_session_list", {
    state: normalize_state_code(state),
  });

  return data.sessions;
};

export const get_master_list = async (session_id: number): Promise<legiscan_master_bill[]> => {
  const data = await legiscan_request<{
    status: "OK";
    masterlist: Record<string, legiscan_master_bill | { session?: unknown }>;
  }>("get_master_list", {
    id: session_id,
  });

  return Object.values(data.masterlist)
    .filter(
      (entry): entry is legiscan_master_bill =>
        typeof entry === "object" &&
        entry !== null &&
        "bill_id" in entry &&
        "number" in entry,
    )
    .sort((a, b) => {
      const a_date = a.last_action_date ?? a.status_date ?? "";
      const b_date = b.last_action_date ?? b.status_date ?? "";
      return b_date.localeCompare(a_date);
    })
    .slice(0, 100);
};

export const get_bill = async (bill_id: number): Promise<legiscan_bill_detail> => {
  const data = await legiscan_request<{
    status: "OK";
    bill: legiscan_bill_detail;
  }>("get_bill", {
    id: bill_id,
  });

  return data.bill;
};

export const get_bill_text = async (
  document_id: number,
): Promise<legiscan_bill_text> => {
  const data = await legiscan_request<{
    status: "OK";
    text?: unknown;
  }>("get_bill_text", {
    id: require_positive_safe_integer(
      document_id,
      "invalid_legiscan_bill_text_document_id",
    ),
  });

  if (
    !data.text
    || typeof data.text !== "object"
    || Array.isArray(data.text)
    || typeof (data.text as Record<string, unknown>).doc !== "string"
  ) {
    throw new Error("invalid_legiscan_bill_text_payload");
  }

  const response_document_id = Number(
    (data.text as Record<string, unknown>).doc_id,
  );
  if (
    !Number.isSafeInteger(response_document_id)
    || response_document_id !== document_id
  ) {
    throw new Error("invalid_legiscan_bill_text_response_document_id");
  }

  return data.text as legiscan_bill_text;
};

export const get_amendment = async (
  amendment_id: number,
): Promise<legiscan_amendment> => {
  const data = await legiscan_request<{
    status: "OK";
    amendment?: unknown;
  }>("get_amendment", {
    id: require_positive_safe_integer(
      amendment_id,
      "invalid_legiscan_amendment_id",
    ),
  });

  if (
    !data.amendment
    || typeof data.amendment !== "object"
    || Array.isArray(data.amendment)
    || typeof (data.amendment as Record<string, unknown>).doc !== "string"
  ) {
    throw new Error("invalid_legiscan_amendment_payload");
  }

  const response_amendment_id = Number(
    (data.amendment as Record<string, unknown>).amendment_id,
  );
  if (
    !Number.isSafeInteger(response_amendment_id)
    || response_amendment_id !== amendment_id
  ) {
    throw new Error("invalid_legiscan_amendment_response_id");
  }

  return data.amendment as legiscan_amendment;
};
