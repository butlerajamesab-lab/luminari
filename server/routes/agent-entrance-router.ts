import { Router } from "express";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { getPool } from "../db";

// The disembodied door (2026-11-27): AI agents enter as what they are —
// system, principal (whose agent), purpose — never at the human form and
// never anonymously. The door is token-checked here, on its own, the same
// way the Stripe webhook is signature-checked on its own; that is why the
// invite-only gate leaves /api/agents/ open. Every accepted declaration is
// recorded in public.agent_entrances and answered with a receipt.

export const agent_entrance_router = Router();

const MAX_FIELD_LENGTH = 200;

export interface AgentDeclaration {
  agent_system: string;
  principal: string;
  purpose: string;
}

export interface AgentEntranceResult {
  status: number;
  payload: Record<string, unknown>;
}

function token_matches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function clean_field(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_FIELD_LENGTH) return null;
  return trimmed;
}

export function parse_agent_declaration(body: unknown): AgentDeclaration | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const agent_system = clean_field(record.agent_system);
  const principal = clean_field(record.principal);
  const purpose = clean_field(record.purpose);
  if (!agent_system || !principal || !purpose) return null;
  return { agent_system, principal, purpose };
}

export async function record_agent_entrance(input: {
  token: string | undefined;
  body: unknown;
  environment?: NodeJS.ProcessEnv;
}): Promise<AgentEntranceResult> {
  const expected = (input.environment ?? process.env).AGENT_ENTRANCE_TOKEN;
  if (!expected) {
    // No token configured: the door is closed, not open.
    return { status: 503, payload: { ok: false, error: "agent_door_closed" } };
  }
  if (!token_matches(input.token, expected)) {
    return { status: 401, payload: { ok: false, error: "agent_token_invalid" } };
  }
  const declaration = parse_agent_declaration(input.body);
  if (!declaration) {
    return { status: 400, payload: { ok: false, error: "agent_declaration_invalid" } };
  }

  const receipt_id = randomUUID();
  const recorded_at = Date.now();
  await getPool().query(
    `insert into public.agent_entrances (receipt_id, agent_system, principal, purpose, created_at)
     values ($1, $2, $3, $4, $5)`,
    [receipt_id, declaration.agent_system, declaration.principal, declaration.purpose, recorded_at],
  );
  return { status: 201, payload: { ok: true, receipt_id, recorded_at } };
}

agent_entrance_router.post("/enter", async (req, res) => {
  try {
    const { status, payload } = await record_agent_entrance({
      token: req.get("x-agent-entrance-token"),
      body: req.body,
    });
    return res.status(status).json(payload);
  } catch (error) {
    console.error("[AGENTS] entrance recording failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "agent_entrance_failed" });
  }
});
