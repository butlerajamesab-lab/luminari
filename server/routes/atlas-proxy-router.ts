import { Router, type Response } from "express";
import { requireExpressAdmin } from "../_core/express-admin-middleware";

export const atlasProxyRouter = Router();

const ATLAS_API_BASE_URL = (
  process.env.ATLAS_API_BASE_URL ||
  process.env.ATLAS_BASE_URL ||
  "https://atlas-streaming-engine.onrender.com"
).replace(/\/$/, "");
const ATLAS_REQUEST_TIMEOUT_MS = 15_000;

type ProxyOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  require_control?: boolean;
};

function readAtlasControlToken(): string | null {
  const token = process.env.ATLAS_CONTROL_TOKEN?.trim();
  return token || null;
}

async function proxyAtlas(path: string, options: ProxyOptions = {}) {
  const method = options.method ?? "GET";
  const headers = new Headers({ Accept: "application/json" });

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (options.require_control) {
    const controlToken = readAtlasControlToken();
    if (!controlToken) {
      return {
        ok: false,
        status: 503,
        status_text: "Service Unavailable",
        data: { error: "atlas_control_credential_unavailable" },
      };
    }
    headers.set("Authorization", `Bearer ${controlToken}`);
  }

  const response = await fetch(`${ATLAS_API_BASE_URL}${path}`, {
    method,
    signal: AbortSignal.timeout(ATLAS_REQUEST_TIMEOUT_MS),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  let data: unknown = null;

  if (text && contentType.includes("application/json")) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: "atlas_invalid_json_response" };
    }
  } else if (text) {
    data = { error: "atlas_non_json_response" };
  }

  return {
    ok: response.ok,
    status: response.status,
    status_text: response.statusText,
    data,
  };
}

async function sendAtlas(
  res: Response,
  path: string,
  options: ProxyOptions = {},
): Promise<void> {
  try {
    const result = await proxyAtlas(path, options);
    res.status(result.status).json(
      result.ok
        ? result.data ?? {}
        : {
            ok: false,
            error: "atlas_request_failed",
            atlas_status: result.status,
            atlas_status_text: result.status_text,
            atlas_response: result.data,
          },
    );
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: "atlas_proxy_request_failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

atlasProxyRouter.get("/health", (_req, res) => {
  void sendAtlas(res, "/health");
});

atlasProxyRouter.get("/catalog", requireExpressAdmin, (_req, res) => {
  void sendAtlas(res, "/v1/population/catalog", { require_control: true });
});

atlasProxyRouter.post("/populate", requireExpressAdmin, (req, res) => {
  void sendAtlas(res, "/v1/population/streams", {
    method: "POST",
    body: req.body ?? {},
    require_control: true,
  });
});

atlasProxyRouter.post("/bridge-drain", requireExpressAdmin, (_req, res) => {
  void sendAtlas(res, "/scheduler/live-data-signals", {
    method: "POST",
    require_control: true,
  });
});
