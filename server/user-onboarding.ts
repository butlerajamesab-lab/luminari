import { getPool } from "./db";

/**
 * Provision the application profile after Supabase has verified a session.
 * Never accept role, plan, or identity from browser-supplied form fields.
 * Each new account starts as a free, non-admin user.
 */
export async function ensure_supabase_user_profile(
  open_id: string,
  email: string | null,
): Promise<{ role: string; created: boolean }> {
  const client = await getPool().connect();
  let in_transaction = false;
  try {
    await client.query("BEGIN");
    in_transaction = true;

    // public.users has no open_id unique constraint. Serialize concurrent
    // first-login requests for the same verified Supabase identity.
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [open_id]);

    const existing = await client.query<{ role: string | null }>(
      "select role from public.users where open_id = $1 order by id limit 1",
      [open_id],
    );
    if (existing.rows.length) {
      await client.query("COMMIT");
      in_transaction = false;
      return { role: existing.rows[0].role ?? "user", created: false };
    }

    const now_ms = Date.now();
    const normalized_email = email?.trim().toLowerCase() || null;
    const display_name = normalized_email?.split("@")[0] ?? null;
    await client.query(
      `insert into public.users
         (open_id, email, name, login_method, role, plan, created_at, updated_at, last_signed_in)
       values ($1, $2, $3, 'supabase', 'user', 'free', $4, $4, $4)`,
      [open_id, normalized_email, display_name, now_ms],
    );
    await client.query("COMMIT");
    in_transaction = false;
    return { role: "user", created: true };
  } catch (error) {
    if (in_transaction) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
