import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  create_live_docket_entry_mock,
  delete_live_docket_entry_mock,
  get_live_docket_entry_mock,
  get_live_docket_entry_by_slug_mock,
  get_live_docket_stats_mock,
  list_live_docket_entries_mock,
  update_live_docket_entry_mock,
} = vi.hoisted(() => ({
  create_live_docket_entry_mock: vi.fn(),
  delete_live_docket_entry_mock: vi.fn(),
  get_live_docket_entry_mock: vi.fn(),
  get_live_docket_entry_by_slug_mock: vi.fn(),
  get_live_docket_stats_mock: vi.fn(),
  list_live_docket_entries_mock: vi.fn(),
  update_live_docket_entry_mock: vi.fn(),
}));

vi.mock("./docket-live-read-compat", () => ({
  create_live_docket_entry: create_live_docket_entry_mock,
  delete_live_docket_entry: delete_live_docket_entry_mock,
  get_live_docket_entry: get_live_docket_entry_mock,
  get_live_docket_entry_by_slug: get_live_docket_entry_by_slug_mock,
  get_live_docket_stats: get_live_docket_stats_mock,
  list_live_docket_entries: list_live_docket_entries_mock,
  update_live_docket_entry: update_live_docket_entry_mock,
}));

vi.mock("./docket-db", () => ({}));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn() }));

import { docketRouter } from "./routers/docket";

const docket_id = "131f9f1e-b953-4f71-9df3-729d37fb7dbf";

const projected_entry = {
  id: docket_id,
  title: "Observed ordinance",
  status: "enacted",
};

const docket_entry_input = {
  slug: "observed-ordinance",
  title: "Observed ordinance",
  jurisdiction: "Seattle",
  jurisdictionLevel: "city" as const,
  lawType: "ordinance" as const,
  status: "enacted" as const,
};

const admin_context = {
  auth: { auth_status: "authenticated" },
  user: { id: 1, role: "admin", name: "Admin" },
} as never;

describe("docket router UUID identity contract", () => {
  beforeEach(() => {
    create_live_docket_entry_mock.mockReset();
    delete_live_docket_entry_mock.mockReset();
    get_live_docket_entry_mock.mockReset();
    get_live_docket_entry_by_slug_mock.mockReset();
    get_live_docket_stats_mock.mockReset();
    list_live_docket_entries_mock.mockReset();
    update_live_docket_entry_mock.mockReset();
  });

  it("accepts a UUID string for detail and preserves it at the reader boundary", async () => {
    get_live_docket_entry_mock.mockResolvedValue(projected_entry);
    const caller = docketRouter.createCaller({} as never);

    const entry = await caller.getById({ id: docket_id });

    expect(entry.id).toBe(docket_id);
    expect(get_live_docket_entry_mock).toHaveBeenCalledWith(docket_id);
  });

  it("rejects the legacy numeric detail identity before any database read", async () => {
    const caller = docketRouter.createCaller({} as never);

    await expect(caller.getById({ id: 42 } as never)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(get_live_docket_entry_mock).not.toHaveBeenCalled();
  });

  it("uses the UUID for full analysis and reports absent child tables truthfully", async () => {
    get_live_docket_entry_mock.mockResolvedValue(projected_entry);
    const caller = docketRouter.createCaller({} as never);

    const analysis = await caller.getFullAnalysis({ id: docket_id });

    expect(analysis.entry.id).toBe(docket_id);
    expect(analysis.actors).toEqual([]);
    expect(analysis.impacts).toEqual([]);
    expect(analysis.sources).toEqual([]);
    expect(analysis.componentAvailability).toEqual({
      actors: false,
      impacts: false,
      sources: false,
    });
  });

  it("validates UUID identity on explicit absent-child list routes", async () => {
    const caller = docketRouter.createCaller({} as never);

    await expect(caller.actors.list({ docketId: docket_id })).resolves.toEqual([]);
    await expect(
      caller.actors.list({ docketId: 42 } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("routes admin create, update, and delete through exact live writers", async () => {
    create_live_docket_entry_mock.mockResolvedValue(docket_id);
    update_live_docket_entry_mock.mockResolvedValue(true);
    delete_live_docket_entry_mock.mockResolvedValue(true);
    const caller = docketRouter.createCaller(admin_context);

    await expect(caller.create(docket_entry_input)).resolves.toEqual({
      id: docket_id,
    });
    await expect(
      caller.update({ id: docket_id, title: "Updated title" }),
    ).resolves.toEqual({ success: true });
    await expect(caller.delete({ id: docket_id })).resolves.toEqual({
      success: true,
    });

    expect(create_live_docket_entry_mock).toHaveBeenCalledWith(
      docket_entry_input,
    );
    expect(update_live_docket_entry_mock).toHaveBeenCalledWith(docket_id, {
      title: "Updated title",
    });
    expect(delete_live_docket_entry_mock).toHaveBeenCalledWith(docket_id);
  });

  it("exposes unavailable submission storage and rejects writes truthfully", async () => {
    const public_caller = docketRouter.createCaller({} as never);
    const admin_caller = docketRouter.createCaller(admin_context);

    await expect(public_caller.submissions.availability()).resolves.toMatchObject({
      available: false,
      tableEstablished: false,
      canSubmit: false,
      canReview: false,
      reason: "docket_submissions_table_not_established",
    });
    await expect(
      admin_caller.submissions.create({
        lawTitle: "Observed ordinance",
        jurisdiction: "Seattle",
        jurisdictionLevel: "city",
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(
      admin_caller.submissions.updateStatus({ id: 1, status: "pending" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
