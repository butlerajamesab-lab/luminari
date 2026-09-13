type intake_wording_result = {
  reply: string;
  mode: "language_model" | "deterministic";
  reason?: string;
};

type fetch_like = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const UNSAFE_WORDING = [
  /https?:\/\//i,
  /\b(?:legal advice|guaranteed|definitely entitled|deadline is|must appeal|must file)\b/i,
];

function model_endpoint(base_url: string) {
  const normalized = base_url.replace(/\/+$/, "");
  if (normalized.endsWith("/chat/completions")) return normalized;
  if (normalized.endsWith("/v1")) return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
}

function parse_model_reply(payload: unknown): string | null {
  const content = (payload as any)?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return null;
  const trimmed = content.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  if (!trimmed || trimmed.length > 1_200) return null;
  if (UNSAFE_WORDING.some(pattern => pattern.test(trimmed))) return null;
  return trimmed;
}

/**
 * Optional, tightly bounded language assistance for the intake shell.
 *
 * The model receives only a deterministic follow-up sentence and a coarse
 * conversation stage. It never receives the person's statement, selects a
 * pipeline, creates a plan, establishes a fact, or advances an intake gate.
 */
export async function soften_intake_wording(args: {
  deterministic_reply: string;
  stage: "first_follow_up" | "documents" | "plan_ready" | "more_context";
  requested: boolean;
  fetch_impl?: fetch_like;
}): Promise<intake_wording_result> {
  // A plan-ready reply may contain a deterministically selected intake label.
  // Keep that governed routing result completely outside the model boundary.
  if (args.stage === "plan_ready") {
    return {
      reply: args.deterministic_reply,
      mode: "deterministic",
      reason: "governed_plan",
    };
  }

  if (!args.requested) {
    return { reply: args.deterministic_reply, mode: "deterministic", reason: "not_requested" };
  }

  if (process.env.INTAKE_CONVERSATION_MODEL_ENABLED !== "true") {
    return { reply: args.deterministic_reply, mode: "deterministic", reason: "disabled" };
  }

  const base_url = (
    process.env.INTAKE_CONVERSATION_MODEL_BASE_URL
    ?? process.env.OPENAI_BASE_URL
    ?? process.env.BUILT_IN_FORGE_API_URL
    ?? ""
  ).trim();
  const api_key = (
    process.env.INTAKE_CONVERSATION_MODEL_API_KEY
    ?? process.env.OPENAI_API_KEY
    ?? process.env.BUILT_IN_FORGE_API_KEY
    ?? ""
  ).trim();
  const model = (process.env.INTAKE_CONVERSATION_MODEL ?? "").trim();

  if (!base_url || !api_key || !model) {
    return { reply: args.deterministic_reply, mode: "deterministic", reason: "not_configured" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await (args.fetch_impl ?? fetch)(model_endpoint(base_url), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${api_key}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 180,
        messages: [
          {
            role: "system",
            content: [
              "You rewrite one already-approved intake follow-up in warm, plain language.",
              "Do not add facts, legal advice, legal conclusions, deadlines, diagnoses, links, promises, or new questions.",
              "Do not choose or name an intake pipeline.",
              "Return only the rewritten sentence or short paragraph.",
            ].join(" "),
          },
          {
            role: "user",
            content: `Stage: ${args.stage}\nApproved text: ${args.deterministic_reply}`,
          },
        ],
      }),
    });
    if (!response.ok) {
      return { reply: args.deterministic_reply, mode: "deterministic", reason: `provider_${response.status}` };
    }
    const reply = parse_model_reply(await response.json());
    if (!reply) {
      return { reply: args.deterministic_reply, mode: "deterministic", reason: "invalid_output" };
    }
    return { reply, mode: "language_model" };
  } catch {
    return { reply: args.deterministic_reply, mode: "deterministic", reason: "provider_unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}
