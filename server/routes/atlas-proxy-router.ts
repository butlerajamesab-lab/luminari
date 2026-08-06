import { Router } from "express";

export const atlasProxyRouter = Router();

const ATLAS_API_BASE_URL = (
  process.env.ATLAS_API_BASE_URL ||
  process.env.ATLAS_BASE_URL ||
  "https://atlas-streaming-engine.onrender.com"
).replace(/\/$/, "");
const ATLAS_REQUEST_TIMEOUT_MS = 5_000;

type ProxyOptions = {
  method?: "GET" | "POST";
  body?: unknown;
};

async function proxyAtlas(path: string, options: ProxyOptions = {}) {
  const method = options.method ?? "GET";
  const response = await fetch(`${ATLAS_API_BASE_URL}${path}`, {
    method,
    signal: AbortSignal.timeout(ATLAS_REQUEST_TIMEOUT_MS),
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  let data: unknown = null;

  if (text && contentType.includes("application/json")) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  } else if (text) {
    data = { raw: text.slice(0, 500) };
  }

  return {
    ok: response.ok,
    status: response.status,
    status_text: response.statusText,
    data,
  };
}

async function sendAtlas(res: any, path: string, options: ProxyOptions = {}) {
  try {
    const result = await proxyAtlas(path, options);
    res.status(result.status).json(result.ok ? result.data ?? {} : {
      ok: false,
      error: "Atlas request failed",
      atlas_status: result.status,
      atlas_status_text: result.status_text,
      atlas_response: result.data,
    });
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: "Atlas proxy request failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

atlasProxyRouter.get("/health", (_req, res) => {
  sendAtlas(res, "/health");
});

atlasProxyRouter.get("/catalog", (_req, res) => {
  sendAtlas(res, "/v1/population/catalog");
});

atlasProxyRouter.post("/populate", (req, res) => {
  sendAtlas(res, "/v1/population/streams", { method: "POST", body: req.body ?? {} });
});

atlasProxyRouter.post("/bridge-drain", (_req, res) => {
  sendAtlas(res, "/scheduler/bridge-drain", { method: "POST" });
});
