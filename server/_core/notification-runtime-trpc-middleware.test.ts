import { afterEach, describe, expect, it, vi } from "vitest";

const adapter = vi.hoisted(() => vi.fn());

vi.mock("@trpc/server/adapters/express", () => ({
  createExpressMiddleware: vi.fn(() => adapter),
}));

vi.mock("../routers/notifications-runtime-router", () => ({
  notificationRuntimeAppRouter: {},
}));

vi.mock("./context", () => ({
  createContext: vi.fn(),
}));

import { notificationRuntimeTrpcMiddleware } from "./notification-runtime-trpc-middleware";

describe("notification runtime tRPC middleware", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("intercepts a notification query before the legacy router", () => {
    const req = { path: "/notifications.unreadCount" } as any;
    const res = {} as any;
    const next = vi.fn();

    notificationRuntimeTrpcMiddleware(req, res, next);

    expect(adapter).toHaveBeenCalledWith(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  it("intercepts notification-only encoded batches", () => {
    const req = {
      path: "/notifications.unreadCount%2Cnotifications.list",
    } as any;
    const res = {} as any;
    const next = vi.fn();

    notificationRuntimeTrpcMiddleware(req, res, next);

    expect(adapter).toHaveBeenCalledWith(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  it("passes unrelated procedures to the canonical application router", () => {
    const req = { path: "/docket.jurisdictions" } as any;
    const res = {} as any;
    const next = vi.fn();

    notificationRuntimeTrpcMiddleware(req, res, next);

    expect(adapter).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("does not partially execute mixed tRPC batches", () => {
    const req = {
      path: "/notifications.unreadCount,system.stats",
    } as any;
    const res = {} as any;
    const next = vi.fn();

    notificationRuntimeTrpcMiddleware(req, res, next);

    expect(adapter).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
