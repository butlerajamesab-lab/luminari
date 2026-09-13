import { autoDetect } from "./intake-autodetect";

export type intake_conversation_plan = {
  caseName: string;
  caseDescription: string;
  domain: string;
  pipelineType: string;
  selectionBasis: "explicit_pipeline" | "deterministic_rules" | "general_fallback";
  documentChecklist: Array<{
    label: string;
    description: string;
    priority: "essential" | "helpful" | "optional";
  }>;
  nextSteps: string[];
  ready: true;
};

export type deterministic_intake_turn = {
  reply: string;
  stage: "first_follow_up" | "documents" | "plan_ready" | "more_context";
  plan: intake_conversation_plan | null;
};

function readable_pipeline(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function normalized_requested_pipeline(situation_type: string) {
  const normalized = situation_type.trim().toLowerCase();
  return normalized === "general_investigation" ? "other" : normalized || "other";
}

export function build_deterministic_intake_turn(
  situation_type: string,
  user_messages: string[],
): deterministic_intake_turn {
  if (user_messages.length <= 1) {
    return {
      reply: "Thank you for sharing that. What happened, and when did it begin? Share only what you are comfortable putting in the case record.",
      stage: "first_follow_up",
      plan: null,
    };
  }

  if (user_messages.length <= 2) {
    return {
      reply: "Do you have any related letters, messages, contracts, notices, or other records? Also, which people or organizations are involved?",
      stage: "documents",
      plan: null,
    };
  }

  const combined_text = user_messages.join("\n\n");
  const detection = autoDetect({ combined_text });
  const requested_pipeline = normalized_requested_pipeline(situation_type);
  const matched = detection.ready_to_recommend
    ? detection.suggestions.find(suggestion => suggestion.pipeline_id !== "other")
    : undefined;
  const explicitly_selected = requested_pipeline !== "other";
  const pipeline_type = explicitly_selected
    ? requested_pipeline
    : matched?.pipeline_id ?? "other";
  const selection_basis = explicitly_selected
    ? "explicit_pipeline" as const
    : matched
      ? "deterministic_rules" as const
      : "general_fallback" as const;
  const label = explicitly_selected
    ? readable_pipeline(pipeline_type)
    : matched?.label ?? "General Investigation";
  const domain = explicitly_selected
    ? "other"
    : matched?.category ?? "general";

  return {
    reply: selection_basis === "general_fallback"
      ? "You do not need to force this into a category. I can preserve what you shared in a General Investigation intake, and you can refine it later."
      : `I have enough to prepare an intake for ${label}. You can review the description and change the intake path later.`,
    stage: "plan_ready",
    plan: {
      caseName: label,
      caseDescription: combined_text.slice(0, 2_000),
      domain,
      pipelineType: pipeline_type,
      selectionBasis: selection_basis,
      documentChecklist: [
        {
          label: "Key correspondence",
          description: "Letters, emails, messages, or notices related to what happened",
          priority: "essential",
        },
        {
          label: "Official records",
          description: "Contracts, agreements, orders, decisions, bills, or reports",
          priority: "essential",
        },
        {
          label: "Timeline support",
          description: "Anything that helps establish when events occurred",
          priority: "helpful",
        },
      ],
      nextSteps: [
        "Review the intake statement before creating the case",
        "Add source documents when you are ready",
        "Run governed analysis explicitly from the case workspace",
      ],
      ready: true,
    },
  };
}
