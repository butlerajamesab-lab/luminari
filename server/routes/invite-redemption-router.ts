import { Router } from "express";
import { createContext } from "../_core/context";
import { getPool } from "../db";

export const invite_redemption_router = Router();

type InviteRow = {
  id: number;
  target_role: string;
  target_plan: string;
  max_uses: number;
  use_count: number;
  expires_at: number | null;
  invite_status: string;
};

function client_error(status: number, message: string) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

invite_redemption_router.post("/redeem", async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (!token) {
    return res.status(400).json({ ok: false, error: "Invite token is required." });
  }

  const context = await createContext({ req, res } as any);
  if (!context.user) {
    return res.status(401).json({ ok: false, error: "Sign in before redeeming this invite." });
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const invite_result = await client.query<InviteRow>(
      `select id, target_role, target_plan, max_uses, use_count, expires_at, invite_status
       from public.admin_invites
       where token = $1
       for update`,
      [token],
    );
    const invite = invite_result.rows[0];

    if (!invite) throw client_error(404, "Invite not found.");
    if (invite.invite_status !== "active") throw client_error(409, "Invite is not active.");
    if (invite.expires_at != null && Number(invite.expires_at) <= Date.now()) {
      throw client_error(409, "Invite has expired.");
    }

    const max_uses = Number(invite.max_uses || 1);
    const use_count = Number(invite.use_count || 0);
    if (use_count >= max_uses) throw client_error(409, "Invite has already been fully used.");

    const existing_redemption = await client.query(
      `select 1
       from public.invite_redemptions
       where invite_id = $1 and user_id = $2
       limit 1`,
      [invite.id, context.user.id],
    );
    if (existing_redemption.rowCount) {
      throw client_error(409, "This account has already redeemed this invite.");
    }

    const now = Date.now();
    const user_update = await client.query(
      `update public.users
       set role = $1,
           plan = $2,
           updated_at = $3
       where id = $4
       returning id`,
      [invite.target_role, invite.target_plan, now, context.user.id],
    );
    if (user_update.rowCount !== 1) {
      throw new Error("Authenticated user profile was not updated.");
    }

    await client.query(
      `insert into public.invite_redemptions (invite_id, user_id, redeemed_at)
       values ($1, $2, $3)`,
      [invite.id, context.user.id, now],
    );

    const new_use_count = use_count + 1;
    const new_status = new_use_count >= max_uses ? "exhausted" : "active";
    await client.query(
      `update public.admin_invites
       set use_count = $1,
           invite_status = $2
       where id = $3`,
      [new_use_count, new_status, invite.id],
    );

    await client.query("COMMIT");
    return res.json({
      ok: true,
      target_role: invite.target_role,
      target_plan: invite.target_plan,
      invite_status: new_status,
      use_count: new_use_count,
      max_uses,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    const status = Number((error as any)?.status) || 500;
    const message = status < 500 ? (error as Error).message : "Invite redemption failed.";
    console.error("[INVITES] transactional redemption failed", {
      user_id: context.user.id,
      status,
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(status).json({ ok: false, error: message });
  } finally {
    client.release();
  }
});
