const legiscan_base_url = "https://api.legiscan.com/";

const required_env = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

type legiscan_status = "OK" | "ERROR";

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

  if (!/^[A-Z]{2}$/.test(normalized) && normalized !== "DC") {
    throw new Error(`Invalid LegiScan state code: ${state}`);
  }

  return normalized;
};

const legiscan_request = async <payload>(
  op: string,
  params: Record<string, string | number>,
): Promise<payload> => {
  const url = new URL(legiscan_base_url);

  url.searchParams.set("key", required_env("LEGISCAN_API_KEY"));
  url.searchParams.set("op", op);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`LegiScan HTTP ${response.status} while calling ${op}`);
  }

  const data = (await response.json()) as legiscan_envelope<payload>;

  if (data.status === "ERROR") {
    throw new Error(data.alert?.message ?? `LegiScan API error while calling ${op}`);
  }

  return data as payload;
};

export const get_session_list = async (state: string): Promise<legiscan_session[]> => {
  const data = await legiscan_request<{
    status: "OK";
    sessions: legiscan_session[];
  }>("getSessionList", {
    state: normalize_state_code(state),
  });

  return data.sessions;
};

export const get_master_list = async (session_id: number): Promise<legiscan_master_bill[]> => {
  const data = await legiscan_request<{
    status: "OK";
    masterlist: Record<string, legiscan_master_bill | { session?: unknown }>;
  }>("getMasterList", {
    id: session_id,
  });

  return Object.values(data.masterlist).filter(
    (entry): entry is legiscan_master_bill =>
      typeof entry === "object" &&
      entry !== null &&
      "bill_id" in entry &&
      "number" in entry,
  );
};

export const get_bill = async (bill_id: number): Promise<legiscan_bill_detail> => {
  const data = await legiscan_request<{
    status: "OK";
    bill: legiscan_bill_detail;
  }>("getBill", {
    id: bill_id,
  });

  return data.bill;
};
