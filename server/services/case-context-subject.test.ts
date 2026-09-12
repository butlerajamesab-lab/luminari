import { TRPCError } from "@trpc/server";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ access: vi.fn(), query: vi.fn() }));
vi.mock("../db", () => ({ verifyCaseOwnership: state.access, getPool: () => ({ query: state.query }) }));
import { read_case_context_subject } from "./case-context-subject";

beforeEach(() => {
  state.access.mockReset().mockResolvedValue({ id: 41, userId: 7, _accessLevel: "OWNER" });
  state.query.mockReset().mockResolvedValue({ rows: [{ id: 41, user_id: 7, name: "Workspace case", domain: "housing", claim_type: "wage_theft", jurisdiction: "Washington", status: "open", created_at: 100, updated_at: 200 }] });
});

it("reads the authorized workspace namespace and recorded jurisdiction without inventing registry IDs", async () => {
  const subject = await read_case_context_subject(41, 7);
  expect(state.access).toHaveBeenCalledWith(41, 7);
  expect(state.query.mock.calls[0][0]).toContain("from public.cases c");
  expect(state.query.mock.calls[0][0]).not.toContain("luminari_cases");
  expect(subject).toMatchObject({ id: 41, case_namespace: "public.cases", jurisdiction_code: "WA", jurisdiction_id: null, selected_workflow_id: null });
});

it.each(["FORBIDDEN", "NOT_FOUND"] as const)("stops before data joins when case access returns %s", async code => {
  state.access.mockRejectedValueOnce(new TRPCError({ code }));
  await expect(read_case_context_subject(41, 9)).rejects.toMatchObject({ code });
  expect(state.query).not.toHaveBeenCalled();
});

it("supports existing collaborator authorization without rewriting the case owner", async () => {
  state.access.mockResolvedValue({ id: 41, userId: 7, _accessLevel: "READ_ONLY" });
  expect((await read_case_context_subject(41, 9)).user_id).toBe(7);
});

it("recovers recorded intake jurisdiction through the UUID bridge and rejects conflicts", async () => {
  state.query.mockResolvedValueOnce({ rows: [{ id: 41, user_id: 7, jurisdiction: null,
    case_uuid: "canonical-case-uuid", intake_session_ids: ["intake-1"], intake_jurisdictions: ["WA"] }] });
  expect(await read_case_context_subject(41, 7)).toMatchObject({ id: 41, case_uuid: "canonical-case-uuid",
    jurisdiction_code: "WA", jurisdiction_resolution: "resolved", intake_session_ids: ["intake-1"] });
  state.query.mockResolvedValueOnce({ rows: [{ id: 41, user_id: 7, jurisdiction: "OR", intake_jurisdictions: ["WA"] }] });
  expect(await read_case_context_subject(41, 7)).toMatchObject({ jurisdiction_code: null, jurisdiction_resolution: "conflict" });
});

it("rejects foreign numeric IDs, owner changes, and missing workspace rows", async () => {
  state.access.mockResolvedValueOnce({ id: 99, userId: 7 });
  await expect(read_case_context_subject(41, 7)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(state.query).not.toHaveBeenCalled();
  state.query.mockResolvedValueOnce({ rows: [{ id: 41, user_id: 8 }] });
  await expect(read_case_context_subject(41, 7)).rejects.toMatchObject({ code: "FORBIDDEN" });
  state.query.mockResolvedValueOnce({ rows: [] });
  await expect(read_case_context_subject(41, 7)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("requires authenticated identity and leaves unrecognized jurisdiction unresolved", async () => {
  await expect(read_case_context_subject(41, NaN)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect(state.access).not.toHaveBeenCalled();
  state.query.mockResolvedValueOnce({ rows: [{ id: 41, user_id: 7, jurisdiction: "unknown region" }] });
  expect((await read_case_context_subject(41, 7)).jurisdiction_code).toBeNull();
});
