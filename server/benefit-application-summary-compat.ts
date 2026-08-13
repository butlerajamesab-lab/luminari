import { getPool } from "./db-legacy";

export type benefit_application_summary = {
  total: number;
  byStatus: Record<string, number>;
};

/**
 * Read-only compatibility projection for the existing My Applications UI.
 * The underlying table remains canonical snake_case. `byStatus` is retained
 * only at this legacy UI boundary until that page contract is migrated.
 */
export async function get_benefit_application_summary(
  user_id: number,
): Promise<benefit_application_summary> {
  const { rows } = await getPool().query(
    `select benefit_app_status as status, count(*)::int as count
       from public.benefit_applications
      where user_id = $1
      group by benefit_app_status`,
    [user_id],
  );

  const by_status = Object.fromEntries(
    rows.map(row => [String(row.status), Number(row.count)]),
  );
  const total = Object.values(by_status).reduce(
    (sum, count) => sum + count,
    0,
  );

  return {
    total,
    byStatus: by_status,
  };
}
