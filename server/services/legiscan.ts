const legiscan_base_url = "https://api.legiscan.com/";

export const LEGISCAN_ROLLOUT_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC",
] as const;

const required_env = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

type legiscan_status = "OK" | "ERROR";
type legiscan_operation_key = "get_session_list" | "get_master_list" | "get_bill";

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

const redact_api_key = (message: string): string => message.replace(/key=[^&\s]+/gi, "key=[redacted]");

const legiscan_request = async <payload>(
  op: legiscan_operation_key,
  params: Record<string, string | number>,
): Promise<payload> => {
  const url = new URL(legiscan_base_url);

  url.searchParams.set("key", required_env("LEGISCAN_API_KEY"));
  url.searchParams.set("op", outbound_operation(op));

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`legiscan_http_${response.status}_while_calling_${op}`);
  }

  const data = (await response.json()) as legiscan_envelope<payload>;

  if (data.status === "ERROR") {
    throw new Error(redact_api_key(data.alert?.message ?? `legiscan_api_error_while_calling_${op}`));
  }

  return data as payload;
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
