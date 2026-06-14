const LEGISCAN_BASE_URL = "https://api.legiscan.com/";

const requiredEnv = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

type LegiScanStatus = "OK" | "ERROR";

type LegiScanEnvelope<TPayload> = TPayload & {
  status: LegiScanStatus;
  alert?: {
    message?: string;
  };
};

export type LegiScanSession = {
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

export type LegiScanMasterBill = {
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

export type LegiScanBillDetail = Record<string, unknown>;

const normalizeStateCode = (state: string): string => {
  const normalized = state.trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(normalized) && normalized !== "DC") {
    throw new Error(`Invalid LegiScan state code: ${state}`);
  }

  return normalized;
};

const legiscanRequest = async <TPayload>(
  op: string,
  params: Record<string, string | number>,
): Promise<TPayload> => {
  const url = new URL(LEGISCAN_BASE_URL);

  url.searchParams.set("key", requiredEnv("LEGISCAN_API_KEY"));
  url.searchParams.set("op", op);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`LegiScan HTTP ${response.status} while calling ${op}`);
  }

  const data = (await response.json()) as LegiScanEnvelope<TPayload>;

  if (data.status === "ERROR") {
    throw new Error(data.alert?.message ?? `LegiScan API error while calling ${op}`);
  }

  return data as TPayload;
};

export const getSessionList = async (state: string): Promise<LegiScanSession[]> => {
  const data = await legiscanRequest<{
    status: "OK";
    sessions: LegiScanSession[];
  }>("getSessionList", {
    state: normalizeStateCode(state),
  });

  return data.sessions;
};

export const getMasterList = async (sessionId: number): Promise<LegiScanMasterBill[]> => {
  const data = await legiscanRequest<{
    status: "OK";
    masterlist: Record<string, LegiScanMasterBill | { session?: unknown }>;
  }>("getMasterList", {
    id: sessionId,
  });

  return Object.values(data.masterlist).filter(
    (entry): entry is LegiScanMasterBill =>
      typeof entry === "object" &&
      entry !== null &&
      "bill_id" in entry &&
      "number" in entry,
  );
};

export const getBill = async (billId: number): Promise<LegiScanBillDetail> => {
  const data = await legiscanRequest<{
    status: "OK";
    bill: LegiScanBillDetail;
  }>("getBill", {
    id: billId,
  });

  return data.bill;
};
