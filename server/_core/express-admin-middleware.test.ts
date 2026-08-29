import { afterEach, describe, expect, it, vi } from "vitest";

const contextMocks = vi.hoisted(() => ({
  createContext: vi.fn(),
  resolveUser: vi.fn(),
}));

vi.mock("./context", () => ({
  createContext: contextMocks.createContext,
  resolve_user_for_procedure: contextMocks.resolveUser,
}));

import { requireExpressAdmin } from "./express-admin-middleware";

function makeResponse() {
  const res: any = {
    locals: {},
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

function makeRequest() {
  return {
    method: "GET",
    path: "/schema",
    originalUrl: "/schema",
  } as any;
}

describe("requireExpressAdmin", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("returns 401 when no authenticated profile resolves", async () => {
    const req = makeRequest();
    const res = makeResponse();
    const next = vi.fn();
    contextMocks.createContext.mockResolvedValue({});
    contextMocks.resolveUser.mockResolvedValue(null);

    await requireExpressAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "authentication_required" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 for an authenticated non-administrator", async () => {
    const req = makeRequest();
    const res = makeResponse();
    const next = vi.fn();
    contextMocks.createContext.mockResolvedValue({});
    contextMocks.resolveUser.mockResolvedValue({ id: 2, role: "user" });

    await requireExpressAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "administrator_required" });
    expect(next).not.toHaveBeenCalled();
  });

  it("continues only for a resolved administrator", async () => {
    const req = makeRequest();
    const res = makeResponse();
    const next = vi.fn();
    const admin = { id: 1, role: "admin" };
    contextMocks.createContext.mockResolvedValue({});
    contextMocks.resolveUser.mockResolvedValue(admin);

    await requireExpressAdmin(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.locals.runtime_user).toBe(admin);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("fails closed when authentication infrastructure throws", async () => {
    const req = makeRequest();
    const res = makeResponse();
    const next = vi.fn();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    contextMocks.createContext.mockRejectedValue(new Error("database unavailable"));

    await requireExpressAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "authentication_temporarily_unavailable",
    });
    expect(next).not.toHaveBeenCalled();
  });
});
