import { afterEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("./db", () => ({
  query_with_diagnostics: dbMocks.query,
}));

import {
  createNotificationRuntime,
  getUnreadNotificationCountRuntime,
  listNotificationsRuntime,
  markAllNotificationsReadRuntime,
  markNotificationReadRuntime,
} from "./notifications-runtime-store";

describe("notification PostgreSQL runtime store", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("maps snake_case database rows to the existing frontend contract", async () => {
    dbMocks.query.mockResolvedValue({
      rows: [
        {
          id: 7,
          user_id: 3,
          type: "case_status",
          title: "Case updated",
          message: "A case status changed.",
          metadata: { case_id: 11 },
          link_url: "/case/11",
          read_at: null,
          created_at: 1785531000000,
        },
      ],
      rowCount: 1,
    });

    const rows = await listNotificationsRuntime(3, { unreadOnly: true });

    expect(rows).toEqual([
      {
        id: 7,
        userId: 3,
        type: "case_status",
        title: "Case updated",
        message: "A case status changed.",
        metadata: { case_id: 11 },
        linkUrl: "/case/11",
        readAt: null,
        createdAt: 1785531000000,
      },
    ]);
    expect(dbMocks.query.mock.calls[0][0]).toContain("from public.notifications");
    expect(dbMocks.query.mock.calls[0][0]).toContain("user_id = $1");
    expect(dbMocks.query.mock.calls[0][0]).toContain("read_at is null");
    expect(dbMocks.query.mock.calls[0][1]).toEqual([3, true, 50]);
  });

  it("returns a numeric unread count from PostgreSQL", async () => {
    dbMocks.query.mockResolvedValue({ rows: [{ count: "4" }], rowCount: 1 });

    await expect(getUnreadNotificationCountRuntime(9)).resolves.toBe(4);
    expect(dbMocks.query.mock.calls[0][0]).toContain("count(*)::int");
    expect(dbMocks.query.mock.calls[0][1]).toEqual([9]);
  });

  it("creates a notification with parameterized snake_case SQL and RETURNING", async () => {
    dbMocks.query.mockResolvedValue({
      rows: [
        {
          id: 12,
          user_id: 9,
          type: "new_findings",
          title: "New findings",
          message: "Two findings are ready.",
          metadata: { finding_count: 2 },
          link_url: "/findings",
          read_at: null,
          created_at: 1785531000000,
        },
      ],
      rowCount: 1,
    });

    const created = await createNotificationRuntime({
      userId: 9,
      type: "new_findings",
      title: "New findings",
      message: "Two findings are ready.",
      metadata: { finding_count: 2 },
      linkUrl: "/findings",
    });

    expect(created.id).toBe(12);
    expect(dbMocks.query.mock.calls[0][0]).toContain("insert into public.notifications");
    expect(dbMocks.query.mock.calls[0][0]).toContain("returning");
    expect(dbMocks.query.mock.calls[0][0]).not.toContain("insertId");
  });

  it("enforces notification ownership when marking one row read", async () => {
    dbMocks.query.mockResolvedValue({ rows: [], rowCount: 1 });

    await expect(markNotificationReadRuntime(5, 9)).resolves.toBe(true);
    expect(dbMocks.query.mock.calls[0][0]).toContain("where id = $1");
    expect(dbMocks.query.mock.calls[0][0]).toContain("and user_id = $2");
    expect(dbMocks.query.mock.calls[0][1][0]).toBe(5);
    expect(dbMocks.query.mock.calls[0][1][1]).toBe(9);
  });

  it("marks only the resolved user's unread rows", async () => {
    dbMocks.query.mockResolvedValue({ rows: [], rowCount: 3 });

    await expect(markAllNotificationsReadRuntime(9)).resolves.toBe(3);
    expect(dbMocks.query.mock.calls[0][0]).toContain("where user_id = $1");
    expect(dbMocks.query.mock.calls[0][0]).toContain("and read_at is null");
  });

  it("rejects invalid identifier inputs before querying", async () => {
    await expect(getUnreadNotificationCountRuntime(0)).rejects.toThrow(
      "user_id must be a positive integer"
    );
    expect(dbMocks.query).not.toHaveBeenCalled();
  });
});
