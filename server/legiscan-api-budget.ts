import { query_with_diagnostics } from "./db";

export type legiscan_budget_operation =
  | "get_session_list"
  | "get_master_list"
  | "get_bill"
  | "get_bill_text"
  | "get_amendment";

export type legiscan_budget_receipt = {
  month_start: string;
  request_ordinal: number;
  remaining: number;
};

export const DEFAULT_LEGISCAN_MONTHLY_REQUEST_BUDGET = 9_000;
export const MAX_LEGISCAN_MONTHLY_REQUEST_BUDGET = 10_000;

export function configured_legiscan_monthly_request_budget(
  environment: Record<string, string | undefined> = process.env,
): number {
  const raw = environment.LEGISCAN_MONTHLY_REQUEST_BUDGET?.trim();
  if (!raw) return DEFAULT_LEGISCAN_MONTHLY_REQUEST_BUDGET;
  if (!/^\d+$/.test(raw)) {
    throw new Error("legiscan_invalid_monthly_request_budget");
  }
  const value = Number(raw);
  if (
    !Number.isSafeInteger(value)
    || value < 1
    || value > MAX_LEGISCAN_MONTHLY_REQUEST_BUDGET
  ) {
    throw new Error("legiscan_invalid_monthly_request_budget");
  }
  return value;
}

function service_identity(
  environment: Record<string, string | undefined> = process.env,
): string {
  return [
    environment.RENDER_SERVICE_ID?.trim() || "local",
    String(process.pid),
  ].join(":");
}

export const LEGISCAN_PAID_FALLBACK_RESERVE_REACHED_ERROR =
  "legiscan_paid_fallback_reserve_reached";

export type legiscan_reserve_options = {
  /**
   * Requests that must stay free for live-session refreshes. When > 0 the
   * reservation is refused inside the database, under the same lock as the
   * insert, once this month's count reaches budget - protected_reserve.
   */
  protected_reserve?: number;
};

export async function reserve_legiscan_api_request(
  operation: legiscan_budget_operation,
  options: legiscan_reserve_options = {},
): Promise<legiscan_budget_receipt | null> {
  // Provider transport tests stub fetch and should not require a production
  // database. The budget function has its own contract tests.
  if (process.env.NODE_ENV === "test") return null;

  const monthly_budget = configured_legiscan_monthly_request_budget();
  const protected_reserve = options.protected_reserve ?? 0;
  if (!Number.isSafeInteger(protected_reserve) || protected_reserve < 0) {
    throw new Error("legiscan_invalid_protected_reserve");
  }
  let result;
  try {
    // Without a protected reserve the original v1 reservation is used, so
    // every non-fallback caller behaves exactly as before.
    result = await query_with_diagnostics<legiscan_budget_receipt>(
      protected_reserve > 0
        ? `select month_start::text,
                  request_ordinal,
                  remaining
             from public.reserve_legiscan_api_request_v2(
               $1::text,
               $2::integer,
               $3::text,
               $4::integer
             )`
        : `select month_start::text,
                  request_ordinal,
                  remaining
             from public.reserve_legiscan_api_request_v1(
               $1::text,
               $2::integer,
               $3::text
             )`,
      protected_reserve > 0
        ? [operation, monthly_budget, service_identity(), protected_reserve]
        : [operation, monthly_budget, service_identity()],
      {
        label: "legiscan_api_request_budget_reserve",
        pool_acquire_timeout_ms: 1_000,
        query_timeout_ms: 5_000,
      },
    );
  } catch (error) {
    if (
      error instanceof Error
      && error.message.includes(LEGISCAN_PAID_FALLBACK_RESERVE_REACHED_ERROR)
    ) {
      throw new Error(LEGISCAN_PAID_FALLBACK_RESERVE_REACHED_ERROR);
    }
    if (
      error instanceof Error
      && error.message.includes("legiscan_local_monthly_budget_exhausted")
    ) {
      throw new Error("legiscan_local_monthly_budget_exhausted");
    }
    throw new Error("legiscan_budget_guard_unavailable");
  }

  const receipt = result.rows[0];
  if (
    !receipt
    || !/^\d{4}-\d{2}-\d{2}$/.test(String(receipt.month_start))
    || !Number.isSafeInteger(Number(receipt.request_ordinal))
    || Number(receipt.request_ordinal) < 1
    || !Number.isSafeInteger(Number(receipt.remaining))
    || Number(receipt.remaining) < 0
  ) {
    throw new Error("legiscan_budget_receipt_invalid");
  }

  return {
    month_start: String(receipt.month_start),
    request_ordinal: Number(receipt.request_ordinal),
    remaining: Number(receipt.remaining),
  };
}
