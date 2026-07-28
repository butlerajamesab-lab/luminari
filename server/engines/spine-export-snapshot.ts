import type { PoolClient } from "pg";
import { getPool } from "../db";

/**
 * Execute every database read used to construct a signed Spine bundle inside
 * one repeatable-read, read-only PostgreSQL transaction.
 */
export async function with_spine_export_snapshot<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin transaction isolation level repeatable read read only");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
