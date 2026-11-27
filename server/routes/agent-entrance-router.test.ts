import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  inserts: [] as unknown[][],
  query: vi.fn(),
}));

vi.mock("../db", () => ({
  getPool: () => ({ query: state.query }),
}));

import { parse_agent_declaration, record_agent_entrance } from "./agent-entrance-router";

const TOKEN = "test-agent-token";
const ENV = { AGENT_ENTRANCE_TOKEN: TOKEN } as NodeJS.ProcessEnv;
const VALID_BODY = { agent_system: "muse-wonder", principal: "Alexander", purpose: "civic research" };

beforeEach(() => {
  state.inserts.length = 0;
  state.query.mockReset();
  state.query.mockImplementation(async (_sql: string, params: unknown[]) => {
    state.inserts.push(params);
    return { rows: [], rowCount: 1 };
  });
});

describe("agent entrance door", () => {
  it("is closed when no token is configured", async () => {
    const result = await record_agent_entrance({ token: TOKEN, body: VALID_BODY, environment: {} as NodeJS.ProcessEnv });
    expect(result.status).toBe(503);
    expect(result.payload).toEqual({ ok: false, error: "agent_door_closed" });
    expect(state.inserts).toHaveLength(0);
  });

  it("refuses a missing token", async () => {
    const result = await record_agent_entrance({ token: undefined, body: VALID_BODY, environment: ENV });
    expect(result.status).toBe(401);
    expect(state.inserts).toHaveLength(0);
  });

  it("refuses a wrong token", async () => {
    const result = await record_agent_entrance({ token: "not-the-token", body: VALID_BODY, environment: ENV });
    expect(result.status).toBe(401);
    expect(result.payload.ok).toBe(false);
    expect(state.inserts).toHaveLength(0);
  });

  it("refuses a declaration with a missing field", async () => {
    const result = await record_agent_entrance({
      token: TOKEN,
      body: { agent_system: "muse-wonder", principal: "Alexander" },
      environment: ENV,
    });
    expect(result.status).toBe(400);
    expect(state.inserts).toHaveLength(0);
  });

  it("refuses blank, non-string, and over-long fields", () => {
    expect(parse_agent_declaration({ ...VALID_BODY, purpose: "   " })).toBeNull();
    expect(parse_agent_declaration({ ...VALID_BODY, principal: 42 })).toBeNull();
    expect(parse_agent_declaration({ ...VALID_BODY, agent_system: "x".repeat(201) })).toBeNull();
    expect(parse_agent_declaration(null)).toBeNull();
    expect(parse_agent_declaration("a string body")).toBeNull();
  });

  it("records a valid declaration and returns its receipt", async () => {
    const result = await record_agent_entrance({
      token: TOKEN,
      body: { agent_system: "  muse-wonder ", principal: " Alexander", purpose: "civic research  " },
      environment: ENV,
    });
    expect(result.status).toBe(201);
    expect(result.payload.ok).toBe(true);
    expect(String(result.payload.receipt_id)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(typeof result.payload.recorded_at).toBe("number");
    // The insert carries the receipt and the trimmed declaration, in order.
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toEqual([
      result.payload.receipt_id,
      "muse-wonder",
      "Alexander",
      "civic research",
      result.payload.recorded_at,
    ]);
  });

  it("issues a distinct receipt per entrance", async () => {
    const first = await record_agent_entrance({ token: TOKEN, body: VALID_BODY, environment: ENV });
    const second = await record_agent_entrance({ token: TOKEN, body: VALID_BODY, environment: ENV });
    expect(first.payload.receipt_id).not.toBe(second.payload.receipt_id);
    expect(state.inserts).toHaveLength(2);
  });
});
