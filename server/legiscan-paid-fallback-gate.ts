import { getPool } from "./db";
import { configured_legiscan_monthly_request_budget } from "./legiscan-api-budget";

/**
 * Paid LegiScan fallback gate (Harvest Ledger guard 11).
 *
 * A paid LegiScan copy (get_bill_text / get_amendment) is bought only when
 *   1. the bill is in a current session with no terminal outcome, decided by
 *      bill state through the same source-blind classifier the queue uses
 *      (public.docket_bill_deliberation_class_v1), never by intake source; and
 *   2. this month's ledger usage is still below the monthly budget minus a
 *      reserve kept for the live-session refresh path.
 * Otherwise the fallback is refused before any provider call is reserved.
 *
 * The ledger read here is an early, advisory refusal (it saves a rate-limit
 * slot and parks the row sooner). The binding enforcement of the reserve is
 * atomic: fetch_provider_copy reserves through
 * public.reserve_legiscan_api_request_v2 with a protected reserve, which
 * refuses under the same advisory lock as the insert, so a concurrent
 * reservation cannot slip between this read and the paid call.
 */
export const PAID_FALLBACK_BUDGET_RESERVE = 500;

export const PAID_FALLBACK_NOT_ELIGIBLE_ERROR_PREFIX =
  "legislative_version_provider_fallback_not_eligible";
export const PAID_FALLBACK_BUDGET_RESERVE_ERROR_PREFIX =
  "legislative_version_provider_fallback_budget_reserve";
export const PAID_FALLBACK_GATE_UNAVAILABLE_ERROR =
  "legislative_version_provider_fallback_gate_unavailable";

export type paid_fallback_decision =
  | { allowed: true }
  | { allowed: false; error_code: string };

/**
 * Pure decision, total over its inputs. Anything that is not exactly
 * "current" (including null/unknown/unverified) is refused; an unreadable
 * usage figure is refused too, so the gate fails closed.
 */
export function decide_paid_fallback(input: {
  deliberation_class: string | null | undefined;
  month_used: number | null | undefined;
  monthly_budget: number;
  reserve?: number;
}): paid_fallback_decision {
  const deliberation_class = input.deliberation_class ?? "unverified";
  if (deliberation_class !== "current") {
    return {
      allowed: false,
      error_code: `${PAID_FALLBACK_NOT_ELIGIBLE_ERROR_PREFIX}:${deliberation_class}`,
    };
  }
  const reserve = input.reserve ?? PAID_FALLBACK_BUDGET_RESERVE;
  const used = input.month_used;
  if (
    typeof used !== "number"
    || !Number.isSafeInteger(used)
    || used < 0
    || !Number.isSafeInteger(input.monthly_budget)
    || input.monthly_budget < 1
  ) {
    return { allowed: false, error_code: PAID_FALLBACK_GATE_UNAVAILABLE_ERROR };
  }
  const ceiling = input.monthly_budget - reserve;
  if (used >= ceiling) {
    return {
      allowed: false,
      error_code: `${PAID_FALLBACK_BUDGET_RESERVE_ERROR_PREFIX}:${used}/${input.monthly_budget}`,
    };
  }
  return { allowed: true };
}

// Same month key the budget function uses: the UTC calendar month.
const READ_GATE_STATE_SQL = `
  select public.docket_bill_deliberation_class_v1($1::integer) as deliberation_class,
         (select count(*)::integer
            from public.legiscan_api_request_ledger l
           where l.month_start = date_trunc('month', current_timestamp at time zone 'UTC')::date
         ) as month_used`;

export async function assert_paid_provider_fallback_allowed(
  source_bill_id: number,
): Promise<void> {
  let row: { deliberation_class: string | null; month_used: number | string | null } | undefined;
  let monthly_budget: number;
  try {
    monthly_budget = configured_legiscan_monthly_request_budget();
    const result = await getPool().query<{
      deliberation_class: string | null;
      month_used: number | string | null;
    }>(READ_GATE_STATE_SQL, [source_bill_id]);
    row = result.rows[0];
  } catch {
    throw new Error(PAID_FALLBACK_GATE_UNAVAILABLE_ERROR);
  }
  const decision = decide_paid_fallback({
    deliberation_class: row?.deliberation_class,
    month_used: row?.month_used === null || row?.month_used === undefined
      ? null
      : Number(row.month_used),
    monthly_budget,
  });
  if (!decision.allowed) throw new Error(decision.error_code);
}
