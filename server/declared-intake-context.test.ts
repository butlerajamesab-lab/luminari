import { describe, expect, it } from "vitest";
import { build_declared_intake_context } from "./declared-intake-context";

describe("declared intake context", () => {
  it("preserves exact user statements, selection basis, origin, and model boundary", () => {
    const declaration = build_declared_intake_context({
      entry_surface: "conversation_intake",
      selection_basis: "existing_case_context",
      selected_pipeline: "other",
      statements: [
        { prompt_id: "context_statement_1", text: "These are my exact words." },
      ],
      origin_context: {
        case_id: 42,
        case_uuid: "11111111-1111-4111-8111-111111111111",
        originating_route: "/timeline?caseId=42",
        originating_surface: "timeline",
        user_intent: "adds_context",
        related_subject: {
          type: "event",
          id: "event-7",
          label: "June meeting",
        },
      },
      language_assistance: {
        requested: true,
        scope: "wording_only",
        user_content_shared_with_model: false,
      },
    }, "2026-09-12T00:00:00.000Z");

    expect(declaration).toMatchObject({
      contract_version: "luminari.declared_intake_context.v1.0.0",
      captured_at: "2026-09-12T00:00:00.000Z",
      selection: {
        basis: "existing_case_context",
        selected_pipeline: "other",
      },
      declarations: [
        { prompt_id: "context_statement_1", text: "These are my exact words." },
      ],
      origin_context: {
        case_id: 42,
        user_intent: "adds_context",
      },
      language_assistance: {
        requested: true,
        scope: "wording_only",
        user_content_shared_with_model: false,
      },
    });
  });
});
