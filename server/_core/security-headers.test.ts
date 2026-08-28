import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  LIGHTHOUSE_CONTENT_SECURITY_POLICY,
  registerSecurityHeaders,
} from "./security-headers";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "production");
  const app = express();
  registerSecurityHeaders(app);
  app.get("/health", (_req, res) => res.json({ ok: true }));

  server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("missing_test_server_address");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  vi.unstubAllEnvs();
});

describe("Lighthouse security headers", () => {
  it("removes framework disclosure and emits the baseline browser policy", async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-powered-by")).toBeNull();
    expect(response.headers.get("content-security-policy")).toBe(
      LIGHTHOUSE_CONTENT_SECURITY_POLICY,
    );
    expect(response.headers.get("strict-transport-security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'self'",
    );
    expect(response.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(response.headers.get("permissions-policy")).toBe(
      "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
    );
    expect(response.headers.get("x-permitted-cross-domain-policies")).toBe(
      "none",
    );
  });
});
