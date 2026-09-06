import { afterEach, describe, expect, it, vi } from "vitest";

const contextMocks = vi.hoisted(() => ({
  createContext: vi.fn(),
  resolveUser: vi.fn(),
}));

vi.mock("./context", () => ({
  createContext: contextMocks.createContext,
  resolve_user_for_procedure: contextMocks.resolveUser,
}));

import {
  requireExpressAdmin,
  requireExpressAdminOrSystemReadToken,
} from "./express-admin-middleware";

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

function makeRequest(
  originalUrl = "/schema",
  method = "GET",
  headers: Record<string, string> = {}
) {
  return {
    method,
    path: "/schema",
    originalUrl,
    headers,
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

describe("requireExpressAdminOrSystemReadToken", () => {
  const originalToken = process.env.LIGHTHOUSE_SYSTEM_READ_TOKEN;
  const token = "system-read-test-token-that-is-longer-than-32-bytes";

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    if (originalToken === undefined) delete process.env.LIGHTHOUSE_SYSTEM_READ_TOKEN;
    else process.env.LIGHTHOUSE_SYSTEM_READ_TOKEN = originalToken;
  });

  it.each(["/api/system/health", "/api/system/routes?fresh=1"])(
    "accepts the scoped service token for GET %s",
    async originalUrl => {
      process.env.LIGHTHOUSE_SYSTEM_READ_TOKEN = token;
      const req = makeRequest(originalUrl, "GET", {
        "x-lighthouse-system-read-token": token,
      });
      const res = makeResponse();
      const next = vi.fn();

      await requireExpressAdminOrSystemReadToken(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.locals.system_read_authorized).toBe(true);
      expect(contextMocks.createContext).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["/api/system/schema", "GET"],
    ["/api/system/health", "POST"],
  ])("does not authorize %s with method %s", async (originalUrl, method) => {
    process.env.LIGHTHOUSE_SYSTEM_READ_TOKEN = token;
    contextMocks.createContext.mockResolvedValue({});
    contextMocks.resolveUser.mockResolvedValue(null);
    const req = makeRequest(originalUrl, method, {
      "x-lighthouse-system-read-token": token,
    });
    const res = makeResponse();
    const next = vi.fn();

    await requireExpressAdminOrSystemReadToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("fails closed when the configured token is absent or too short", async () => {
    process.env.LIGHTHOUSE_SYSTEM_READ_TOKEN = "short";
    contextMocks.createContext.mockResolvedValue({});
    contextMocks.resolveUser.mockResolvedValue(null);
    const req = makeRequest("/api/system/health", "GET", {
      "x-lighthouse-system-read-token": "short",
    });
    const res = makeResponse();
    const next = vi.fn();

    await requireExpressAdminOrSystemReadToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("still accepts canonical administrator authentication", async () => {
    process.env.LIGHTHOUSE_SYSTEM_READ_TOKEN = token;
    contextMocks.createContext.mockResolvedValue({});
    const admin = { id: 1, role: "admin" };
    contextMocks.resolveUser.mockResolvedValue(admin);
    const req = makeRequest("/api/system/schema");
    const res = makeResponse();
    const next = vi.fn();

    await requireExpressAdminOrSystemReadToken(req, res, next);

    expect(res.locals.runtime_user).toBe(admin);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
