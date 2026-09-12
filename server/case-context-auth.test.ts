import { TRPCError } from "@trpc/server";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ action: vi.fn(), context: vi.fn() }));
vi.mock("./services/luminariContextService", () => ({ get_case_action_context: state.action, get_case_context: state.context }));
vi.mock("./services/registryService", () => ({}));
vi.mock("./services/caseService", () => ({}));
vi.mock("./services/matchingService", () => ({}));
vi.mock("./services/civic-object-service", () => ({}));
vi.mock("./unified-queries", () => ({}));
import { luminariRouter } from "./routers/luminari-router";
import { dispatchServiceTool } from "./engines/sunam-service-dispatcher";

beforeEach(() => {
  state.action.mockReset().mockResolvedValue({ case_id: 41 });
  state.context.mockReset().mockResolvedValue({ case: { id: 41 } });
});

it("carries authenticated tRPC identity to both case-context readers", async () => {
  const caller = luminariRouter.createCaller({ user: { id: 7 }, auth: { auth_status: "authenticated" } } as any);
  await caller.getActionContext({ case_id: 41, user_id: 999 } as any);
  expect(state.action.mock.calls[0][0]).toMatchObject({ case_id: 41, user_id: 7 });
  await caller.getContext({ case_id: 41 });
  expect(state.context).toHaveBeenCalledWith(41, 7);
});

it.each(["FORBIDDEN", "NOT_FOUND"] as const)("retains %s from the established access helper", async code => {
  const caller = luminariRouter.createCaller({ user: { id: 7 }, auth: {} } as any);
  state.action.mockRejectedValueOnce(new TRPCError({ code, message: "Case access denied" }));
  await expect(caller.getActionContext({ case_id: 41 })).rejects.toMatchObject({ code });
});

it("denies unauthenticated callers before context loading", async () => {
  const caller = luminariRouter.createCaller({ user: null, auth: { auth_status: "unauthenticated" } } as any);
  await expect(caller.getActionContext({ case_id: 41 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect(state.action).not.toHaveBeenCalled();
});

it("takes Sunam case identity from the authenticated operator, ignoring tool argument user IDs", async () => {
  await dispatchServiceTool("get_case_action_context", { case_id: 41, user_id: 999 }, 7);
  expect(state.action.mock.calls[0][0]).toMatchObject({ case_id: 41, user_id: 7 });
  await dispatchServiceTool("get_case_context", { case_id: 41, user_id: 999 }, 7);
  expect(state.context).toHaveBeenCalledWith(41, 7);
});

it.each(["get_action_context", "getActionContext"] as const)("normalizes legacy inputs at the %s HTTP boundary", async route => {
  const caller = luminariRouter.createCaller({ user: { id: 7 }, auth: {} } as any);
  await caller[route]({ caseId: 41, problemContext: "Housing", incidentDate: "2026-03-01",
    asOfDate: "2026-09-12", limitPerSurface: 4, user_id: 999 } as any);
  expect(state.action).toHaveBeenCalledWith({ case_id: 41, user_id: 7, problem_context: "Housing",
    incident_date: "2026-03-01", as_of_date: "2026-09-12", limit_per_surface: 4 });
});

it("accepts the canonical HTTP contract and gives explicit canonical fields precedence over legacy aliases", async () => {
  const caller = luminariRouter.createCaller({ user: { id: 7 }, auth: {} } as any);
  await caller.get_action_context({ case_id: 41, caseId: 99, problem_context: "Housing", problemContext: "Legacy",
    limit_per_surface: 4, limitPerSurface: 6 });
  expect(state.action).toHaveBeenCalledWith({ case_id: 41, user_id: 7, problem_context: "Housing",
    incident_date: undefined, as_of_date: undefined, limit_per_surface: 4 });
  await caller.get_context({ caseId: 41 });
  expect(state.context).toHaveBeenCalledWith(41, 7);
});

it("normalizes legacy Sunam arguments before the owned context service", async () => {
  await dispatchServiceTool("get_case_action_context", { caseId: 41, problemContext: "Housing",
    incidentDate: "2026-03-01", asOfDate: "2026-09-12", limitPerSurface: 4, user_id: 999 }, 7);
  expect(state.action).toHaveBeenCalledWith({ case_id: 41, user_id: 7, problem_context: "Housing",
    incident_date: "2026-03-01", as_of_date: "2026-09-12", limit_per_surface: 4 });
  await dispatchServiceTool("get_case_context", { caseId: 41, user_id: 999 }, 7);
  expect(state.context).toHaveBeenCalledWith(41, 7);
});

it("rejects invalid IDs and windows at both boundaries before any context read", async () => {
  const caller = luminariRouter.createCaller({ user: { id: 7 }, auth: {} } as any);
  await expect(caller.get_action_context({ caseId: -1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(caller.get_action_context({ case_id: 41, limitPerSurface: 26 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(await dispatchServiceTool("get_case_action_context", { caseId: 41, limitPerSurface: 0 }, 7)).toMatchObject({ success: false });
  expect(state.action).not.toHaveBeenCalled();
});
