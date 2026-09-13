import { describe, expect, it, vi } from "vitest";
import {
  create_intake_case_with_compensation,
  type IntakeCaseCreationInput,
} from "./intake-case-creation";

const input: IntakeCaseCreationInput = {
  user_id: 7,
  name: "A case",
  pipeline_type: "other",
  declaration: {
    entry_surface: "conversation_intake",
    selection_basis: "explicit_pipeline",
    selected_pipeline: "other",
    statements: [{ prompt_id: "statement_1", text: "Exact statement" }],
  },
};

describe("intake case creation with compensation", () => {
  it("returns the case only after its declared context is registered", async () => {
    const rollback_case = vi.fn();
    const result = await create_intake_case_with_compensation({
      input,
      create_case: vi.fn().mockResolvedValue(41),
      register_context: vi.fn().mockResolvedValue({
        document_id: 9,
        intake_session_id: "session-1",
      }),
      rollback_case,
    });

    expect(result).toEqual({
      case_id: 41,
      registered: { document_id: 9, intake_session_id: "session-1" },
    });
    expect(rollback_case).not.toHaveBeenCalled();
  });

  it("rolls back the new case before propagating a registration failure", async () => {
    const failure = new Error("registration failed");
    const rollback_case = vi.fn().mockResolvedValue(undefined);

    await expect(
      create_intake_case_with_compensation({
        input,
        create_case: vi.fn().mockResolvedValue(42),
        register_context: vi.fn().mockRejectedValue(failure),
        rollback_case,
      }),
    ).rejects.toBe(failure);

    expect(rollback_case).toHaveBeenCalledOnce();
    expect(rollback_case).toHaveBeenCalledWith(42, 7);
  });

  it("surfaces both failures when compensating rollback cannot complete", async () => {
    const registration_failure = new Error("registration failed");
    const rollback_failure = new Error("rollback failed");

    await expect(
      create_intake_case_with_compensation({
        input,
        create_case: vi.fn().mockResolvedValue(43),
        register_context: vi.fn().mockRejectedValue(registration_failure),
        rollback_case: vi.fn().mockRejectedValue(rollback_failure),
      }),
    ).rejects.toMatchObject({
      name: "AggregateError",
      message: "intake_case_creation_failed_and_rollback_failed",
      errors: [registration_failure, rollback_failure],
    });
  });
});
