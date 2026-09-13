import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { soften_intake_wording } from "./intake-conversation-assistant";

const ENVIRONMENT_KEYS = [
  "INTAKE_CONVERSATION_MODEL_ENABLED",
  "INTAKE_CONVERSATION_MODEL_BASE_URL",
  "INTAKE_CONVERSATION_MODEL_API_KEY",
  "INTAKE_CONVERSATION_MODEL",
] as const;

const original_environment = Object.fromEntries(
  ENVIRONMENT_KEYS.map(key => [key, process.env[key]]),
) as Record<(typeof ENVIRONMENT_KEYS)[number], string | undefined>;

describe("bounded intake wording assistance", () => {
  beforeEach(() => {
    for (const key of ENVIRONMENT_KEYS) delete process.env[key];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of ENVIRONMENT_KEYS) {
      const value = original_environment[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("uses the deterministic reply when the optional model is disabled", async () => {
    await expect(soften_intake_wording({
      deterministic_reply: "Approved follow-up.",
      stage: "first_follow_up",
      requested: true,
    })).resolves.toEqual({
      reply: "Approved follow-up.",
      mode: "deterministic",
      reason: "disabled",
    });
  });

  it("never sends a governed plan or selected intake label to the model", async () => {
    process.env.INTAKE_CONVERSATION_MODEL_ENABLED = "true";
    process.env.INTAKE_CONVERSATION_MODEL_BASE_URL = "https://model.example/v1";
    process.env.INTAKE_CONVERSATION_MODEL_API_KEY = "test-key";
    process.env.INTAKE_CONVERSATION_MODEL = "wording-model";
    const fetch_impl = vi.fn();

    await expect(soften_intake_wording({
      deterministic_reply: "I have enough to prepare an intake for Tenant Rights.",
      stage: "plan_ready",
      requested: true,
      fetch_impl,
    })).resolves.toEqual({
      reply: "I have enough to prepare an intake for Tenant Rights.",
      mode: "deterministic",
      reason: "governed_plan",
    });
    expect(fetch_impl).not.toHaveBeenCalled();
  });

  it("sends only the approved wording and coarse stage to the model", async () => {
    process.env.INTAKE_CONVERSATION_MODEL_ENABLED = "true";
    process.env.INTAKE_CONVERSATION_MODEL_BASE_URL = "https://model.example/v1";
    process.env.INTAKE_CONVERSATION_MODEL_API_KEY = "test-key";
    process.env.INTAKE_CONVERSATION_MODEL = "wording-model";
    const fetch_impl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.messages[1].content).toBe(
        "Stage: documents\nApproved text: Approved follow-up.",
      );
      expect(String(init?.body)).not.toContain("private user statement");
      return new Response(JSON.stringify({
        choices: [{ message: { content: "Could you tell me what records you have?" } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });

    await expect(soften_intake_wording({
      deterministic_reply: "Approved follow-up.",
      stage: "documents",
      requested: true,
      fetch_impl,
    })).resolves.toEqual({
      reply: "Could you tell me what records you have?",
      mode: "language_model",
    });
    expect(fetch_impl).toHaveBeenCalledOnce();
  });

  it("rejects model wording that introduces prohibited legal certainty", async () => {
    process.env.INTAKE_CONVERSATION_MODEL_ENABLED = "true";
    process.env.INTAKE_CONVERSATION_MODEL_BASE_URL = "https://model.example";
    process.env.INTAKE_CONVERSATION_MODEL_API_KEY = "test-key";
    process.env.INTAKE_CONVERSATION_MODEL = "wording-model";
    const fetch_impl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "You are definitely entitled to payment." } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await expect(soften_intake_wording({
      deterministic_reply: "Approved follow-up.",
      stage: "documents",
      requested: true,
      fetch_impl,
    })).resolves.toEqual({
      reply: "Approved follow-up.",
      mode: "deterministic",
      reason: "invalid_output",
    });
  });
});
