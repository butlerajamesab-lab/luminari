import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest
} from "fastify";
import { chromium, type Browser } from "playwright";
import { createReadStream } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { randomUUID, timingSafeEqual } from "node:crypto";

type ViewportInput = {
  width?: number;
  height?: number;
  deviceScaleFactor?: number;
  isMobile?: boolean;
};

type Viewport = {
  width: number;
  height: number;
  deviceScaleFactor: number;
  isMobile: boolean;
};

type RenderRequestBody = {
  title?: string;
  html: string;
  css?: string;
  javascript?: string;
  viewport?: ViewportInput;
  fullPage?: boolean;
  waitMs?: number;
  allowExternalRequests?: boolean;
};

type NormalizedRenderInput = {
  title: string;
  html: string;
  css: string;
  javascript: string;
  viewport: Viewport;
  fullPage: boolean;
  waitMs: number;
  allowExternalRequests: boolean;
};

type RenderRecord = {
  id: string;
  title: string;
  html: string;
  viewport: Viewport;
  fullPage: boolean;
  allowExternalRequests: boolean;
  screenshotPath: string;
  warnings: string[];
  createdAt: string;
  expiresAt: string;
};

type RenderResponseBody = {
  id: string;
  title: string;
  previewUrl: string;
  screenshotUrl: string;
  htmlUrl: string;
  createdAt: string;
  expiresAt: string;
  viewport: Viewport;
  warnings: string[];
};

type ErrorResponseBody = {
  error: string;
};

class PublicError extends Error {
  public readonly statusCode: number;

  public constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const config = {
  port: numberFromEnv("PORT", 8787, 1, 65535),
  host: process.env.HOST ?? "0.0.0.0",
  publicBaseUrl: trimTrailingSlash(
    process.env.PUBLIC_BASE_URL ?? "http://localhost:8787"
  ),
  apiKey: process.env.API_KEY ?? "dev-local-key",
  dataDir: path.resolve(process.env.DATA_DIR ?? "./data"),
  renderTtlHours: numberFromEnv("RENDER_TTL_HOURS", 24, 1, 168),
  bodyLimitBytes: 1_500_000,
  maxHtmlBytes: 500_000,
  maxCssBytes: 300_000,
  maxJavascriptBytes: 300_000,
  chromiumNoSandbox: process.env.PLAYWRIGHT_CHROMIUM_NO_SANDBOX === "1"
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const renderRequestBodyJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["html"],
  properties: {
    title: {
      type: "string",
      minLength: 1,
      maxLength: 120,
      description: "Human-friendly preview title."
    },
    html: {
      type: "string",
      minLength: 1,
      description: "HTML fragment or full HTML document to render."
    },
    css: {
      type: "string",
      description: "Optional CSS to inject into the page."
    },
    javascript: {
      type: "string",
      description: "Optional JavaScript to inject before the closing body tag."
    },
    viewport: {
      type: "object",
      additionalProperties: false,
      properties: {
        width: {
          type: "integer",
          minimum: 320,
          maximum: 3840,
          default: 1440
        },
        height: {
          type: "integer",
          minimum: 320,
          maximum: 2160,
          default: 1000
        },
        deviceScaleFactor: {
          type: "number",
          minimum: 1,
          maximum: 3,
          default: 1
        },
        isMobile: {
          type: "boolean",
          default: false
        }
      }
    },
    fullPage: {
      type: "boolean",
      default: true,
      description: "Capture the full scrollable page when true."
    },
    waitMs: {
      type: "integer",
      minimum: 0,
      maximum: 3000,
      default: 300,
      description: "Extra wait time before screenshot capture."
    },
    allowExternalRequests: {
      type: "boolean",
      default: false,
      description:
        "Allow external HTTP/HTTPS assets during rendering. Private/local hosts remain blocked."
    }
  }
} as const;

const renderResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "title",
    "previewUrl",
    "screenshotUrl",
    "htmlUrl",
    "createdAt",
    "expiresAt",
    "viewport",
    "warnings"
  ],
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    previewUrl: { type: "string", format: "uri" },
    screenshotUrl: { type: "string", format: "uri" },
    htmlUrl: { type: "string", format: "uri" },
    createdAt: { type: "string" },
    expiresAt: { type: "string" },
    viewport: {
      type: "object",
      additionalProperties: false,
      required: ["width", "height", "deviceScaleFactor", "isMobile"],
      properties: {
        width: { type: "integer" },
        height: { type: "integer" },
        deviceScaleFactor: { type: "number" },
        isMobile: { type: "boolean" }
      }
    },
    warnings: {
      type: "array",
      items: { type: "string" }
    }
  }
} as const;

const errorResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["error"],
  properties: {
    error: { type: "string" }
  }
} as const;

let browserPromise: Promise<Browser> | null = null;

function numberFromEnv(
  key: string,
  fallback: number,
  min: number,
  max: number
): number {
  const raw = process.env[key];

  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function renderRoot(): string {
  return path.join(config.dataDir, "renders");
}

function renderDir(id: string): string {
  return path.join(renderRoot(), id);
}

function recordPath(id: string): string {
  return path.join(renderDir(id), "record.json");
}

function screenshotPath(id: string): string {
  return path.join(renderDir(id), "screenshot.png");
}

async function ensureDataDirs(): Promise<void> {
  await mkdir(renderRoot(), { recursive: true });
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

async function requireApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void | FastifyReply> {
  const header = request.headers["x-api-key"];
  const suppliedKey = Array.isArray(header) ? header[0] : header;

  if (!suppliedKey || !safeEqual(suppliedKey, config.apiKey)) {
    return reply.code(401).send({ error: "Unauthorized" });
  }
}

function clampInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

  return Math.min(max, Math.max(min, parsed));
}

function assertTextSize(fieldName: string, value: string, maxBytes: number): void {
  const byteLength = Buffer.byteLength(value, "utf8");

  if (byteLength > maxBytes) {
    throw new PublicError(
      413,
      `${fieldName} is too large. Max allowed size is ${maxBytes} bytes.`
    );
  }
}

function normalizeViewport(input?: ViewportInput): Viewport {
  return {
    width: clampInteger(input?.width, 1440, 320, 3840),
    height: clampInteger(input?.height, 1000, 320, 2160),
    deviceScaleFactor: clampNumber(input?.deviceScaleFactor, 1, 1, 3),
    isMobile: input?.isMobile ?? false
  };
}

function normalizeRenderInput(body: RenderRequestBody): NormalizedRenderInput {
  const html = body.html;
  const css = body.css ?? "";
  const javascript = body.javascript ?? "";

  if (!html.trim()) {
    throw new PublicError(400, "html cannot be empty.");
  }

  assertTextSize("html", html, config.maxHtmlBytes);
  assertTextSize("css", css, config.maxCssBytes);
  assertTextSize("javascript", javascript, config.maxJavascriptBytes);

  return {
    title: body.title?.trim() || "GPT Website Preview",
    html,
    css,
    javascript,
    viewport: normalizeViewport(body.viewport),
    fullPage: body.fullPage ?? true,
    waitMs: clampInteger(body.waitMs, 300, 0, 3000),
    allowExternalRequests: body.allowExternalRequests ?? false
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeStyleBody(value: string): string {
  return value.replace(/<\/style/gi, "<\\/style");
}

function escapeScriptBody(value: string): string {
  return value.replace(/<\/script/gi, "<\\/script");
}

function safeJsonForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function buildCspMeta(allowExternalRequests: boolean): string {
  const csp = allowExternalRequests
    ? [
        "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'",
        "img-src * data: blob:",
        "style-src * data: 'unsafe-inline'",
        "script-src * 'unsafe-inline' 'unsafe-eval'",
        "connect-src *",
        "font-src * data:",
        "media-src * data: blob:",
        "frame-src *",
        "object-src 'none'"
      ].join("; ")
    : [
        "default-src 'none'",
        "img-src data: blob:",
        "style-src data: 'unsafe-inline'",
        "script-src 'unsafe-inline'",
        "connect-src 'none'",
        "font-src data:",
        "media-src data: blob:",
        "frame-src 'none'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'"
      ].join("; ");

  return `<meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">`;
}

function injectBeforeClosingTag(
  documentHtml: string,
  closingTagPattern: RegExp,
  injection: string
): string {
  if (!injection) {
    return documentHtml;
  }

  if (closingTagPattern.test(documentHtml)) {
    return documentHtml.replace(closingTagPattern, `${injection}\n$&`);
  }

  return `${documentHtml}\n${injection}`;
}

function composeHtml(input: NormalizedRenderInput): string {
  const csp = buildCspMeta(input.allowExternalRequests);
  const style = input.css
    ? `<style data-gpt-renderer="user-css">\n${escapeStyleBody(input.css)}\n</style>`
    : "";
  const script = input.javascript
    ? `<script data-gpt-renderer="user-js">\n${escapeScriptBody(
        input.javascript
      )}\n</script>`
    : "";

  const headInjection = [csp, style].filter(Boolean).join("\n");

  if (/<html[\s>]/i.test(input.html) || /<!doctype/i.test(input.html)) {
    const withHead = injectBeforeClosingTag(
      input.html,
      /<\/head>/i,
      headInjection
    );

    return injectBeforeClosingTag(withHead, /<\/body>/i, script);
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.title)}</title>
${headInjection}
</head>
<body>
${input.html}
${script}
</body>
</html>`;
}

function detectWarnings(input: NormalizedRenderInput): string[] {
  const warnings: string[] = [];
  const combinedSource = `${input.html}\n${input.css}\n${input.javascript}`;

  if (
    !input.allowExternalRequests &&
    /\b(?:src|href)=["']https?:\/\//i.test(combinedSource)
  ) {
    warnings.push(
      "External requests are blocked, so remote images, fonts, scripts, and stylesheets may not appear."
    );
  }

  if (
    !input.allowExternalRequests &&
    /url\(\s*["']?https?:\/\//i.test(combinedSource)
  ) {
    warnings.push(
      "External CSS url() assets are blocked by the default renderer policy."
    );
  }

  if (/\b(localStorage|sessionStorage|indexedDB)\b/i.test(input.javascript)) {
    warnings.push(
      "The public preview runs inside a sandboxed iframe, so browser storage APIs may behave differently."
    );
  }

  if (input.allowExternalRequests) {
    warnings.push(
      "External requests are enabled for this render. Private and local network hosts are still blocked."
    );
  }

  return warnings;
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");

  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host === "127.0.0.1" ||
    host.startsWith("127.") ||
    host === "169.254.169.254" ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

function shouldBlockRequestUrl(
  rawUrl: string,
  allowExternalRequests: boolean
): boolean {
  try {
    const url = new URL(rawUrl);

    if (["about:", "blob:", "data:"].includes(url.protocol)) {
      return false;
    }

    if (!["http:", "https:"].includes(url.protocol)) {
      return true;
    }

    if (isBlockedHost(url.hostname)) {
      return true;
    }

    return !allowExternalRequests;
  } catch {
    return true;
  }
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      args: config.chromiumNoSandbox ? ["--no-sandbox"] : []
    });
  }

  try {
    return await browserPromise;
  } catch (error) {
    browserPromise = null;
    throw error;
  }
}

async function closeBrowser(): Promise<void> {
  const browser = await browserPromise?.catch(() => null);

  browserPromise = null;

  if (browser) {
    await browser.close();
  }
}

async function renderScreenshot(params: {
  html: string;
  viewport: Viewport;
  fullPage: boolean;
  waitMs: number;
  allowExternalRequests: boolean;
  destinationPath: string;
}): Promise<void> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: {
      width: params.viewport.width,
      height: params.viewport.height
    },
    deviceScaleFactor: params.viewport.deviceScaleFactor,
    isMobile: params.viewport.isMobile
  });

  try {
    await context.route("**/*", async (route) => {
      const blocked = shouldBlockRequestUrl(
        route.request().url(),
        params.allowExternalRequests
      );

      if (blocked) {
        await route.abort("blockedbyclient");
        return;
      }

      await route.continue();
    });

    const page = await context.newPage();

    page.setDefaultTimeout(10_000);

    await page.setContent(params.html, {
      waitUntil: "domcontentloaded",
      timeout: 10_000
    });

    if (params.waitMs > 0) {
      await page.waitForTimeout(params.waitMs);
    }

    await page.screenshot({
      path: params.destinationPath,
      fullPage: params.fullPage
    });
  } finally {
    await context.close();
  }
}

async function createRender(input: NormalizedRenderInput): Promise<RenderRecord> {
  const id = randomUUID();
  const directory = renderDir(id);
  const destinationPath = screenshotPath(id);
  const html = composeHtml(input);
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + config.renderTtlHours * 60 * 60 * 1000
  );

  await mkdir(directory, { recursive: true });

  try {
    await renderScreenshot({
      html,
      viewport: input.viewport,
      fullPage: input.fullPage,
      waitMs: input.waitMs,
      allowExternalRequests: input.allowExternalRequests,
      destinationPath
    });

    const record: RenderRecord = {
      id,
      title: input.title,
      html,
      viewport: input.viewport,
      fullPage: input.fullPage,
      allowExternalRequests: input.allowExternalRequests,
      screenshotPath: destinationPath,
      warnings: detectWarnings(input),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    };

    await writeFile(recordPath(id), JSON.stringify(record, null, 2), "utf8");

    return record;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function loadRecord(id: string): Promise<RenderRecord | null> {
  if (!UUID_RE.test(id)) {
    return null;
  }

  try {
    const raw = await readFile(recordPath(id), "utf8");
    const record = JSON.parse(raw) as RenderRecord;

    if (Date.parse(record.expiresAt) <= Date.now()) {
      await rm(renderDir(id), { recursive: true, force: true });
      return null;
    }

    return record;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function cleanupExpiredRenders(): Promise<void> {
  let entries;

  try {
    entries = await readdir(renderRoot(), { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    try {
      await loadRecord(entry.name);
    } catch {
      await rm(renderDir(entry.name), { recursive: true, force: true });
    }
  }
}

function recordToResponse(record: RenderRecord): RenderResponseBody {
  const encodedId = encodeURIComponent(record.id);

  return {
    id: record.id,
    title: record.title,
    previewUrl: `${config.publicBaseUrl}/previews/${encodedId}`,
    screenshotUrl: `${config.publicBaseUrl}/screenshots/${encodedId}.png`,
    htmlUrl: `${config.publicBaseUrl}/artifacts/${encodedId}.html`,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    viewport: record.viewport,
    warnings: record.warnings
  };
}

function buildPreviewShell(record: RenderRecord): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(record.title)}</title>
<style>
:root {
  color-scheme: light dark;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  min-height: 100vh;
  background: Canvas;
  color: CanvasText;
}
.toolbar {
  height: 48px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  border-bottom: 1px solid color-mix(in srgb, CanvasText 16%, transparent);
}
.toolbar strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.toolbar a {
  color: LinkText;
  text-decoration: none;
}
.frame-wrap {
  height: calc(100vh - 48px);
  background:
    linear-gradient(45deg, color-mix(in srgb, CanvasText 6%, transparent) 25%, transparent 25%),
    linear-gradient(-45deg, color-mix(in srgb, CanvasText 6%, transparent) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, color-mix(in srgb, CanvasText 6%, transparent) 75%),
    linear-gradient(-45deg, transparent 75%, color-mix(in srgb, CanvasText 6%, transparent) 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0;
}
iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: white;
}
</style>
</head>
<body>
<header class="toolbar">
  <strong>${escapeHtml(record.title)}</strong>
  <a href="/screenshots/${encodeURIComponent(record.id)}.png" target="_blank" rel="noreferrer">Screenshot</a>
  <a href="/artifacts/${encodeURIComponent(record.id)}.html" target="_blank" rel="noreferrer">Download HTML</a>
</header>
<main class="frame-wrap">
  <iframe
    id="preview"
    title="${escapeHtml(record.title)}"
    sandbox="allow-scripts allow-forms allow-modals allow-popups-by-user-activation allow-downloads"
    referrerpolicy="no-referrer"
  ></iframe>
</main>
<script type="application/json" id="payload">${safeJsonForHtml(record.html)}</script>
<script>
const payload = document.getElementById("payload");
const iframe = document.getElementById("preview");
iframe.srcdoc = JSON.parse(payload.textContent || '\"\"');
</script>
</body>
</html>`;
}

function buildOpenApiDocument(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "GPT Website Renderer Toolkit",
      version: "1.0.0",
      description:
        "Render HTML, CSS, and JavaScript into a preview URL and screenshot for a custom GPT."
    },
    servers: [
      {
        url: config.publicBaseUrl
      }
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key"
        }
      },
      schemas: {
        RenderRequest: renderRequestBodyJsonSchema,
        RenderResponse: renderResponseJsonSchema,
        ErrorResponse: errorResponseJsonSchema
      }
    },
    paths: {
      "/v1/render": {
        post: {
          operationId: "renderWebsitePreview",
          summary: "Render a website preview from HTML, CSS, and JavaScript.",
          description:
            "Call this whenever the user asks to render, preview, inspect, or screenshot a generated webpage.",
          security: [{ ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RenderRequest"
                }
              }
            }
          },
          responses: {
            "200": {
              description: "Rendered preview metadata.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/RenderResponse"
                  }
                }
              }
            },
            "400": {
              description: "Invalid render request.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse"
                  }
                }
              }
            },
            "401": {
              description: "Missing or invalid API key.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse"
                  }
                }
              }
            },
            "413": {
              description: "Payload too large.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse"
                  }
                }
              }
            },
            "500": {
              description: "Renderer failure.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse"
                  }
                }
              }
            }
          }
        }
      },
      "/v1/renders/{id}": {
        get: {
          operationId: "getWebsiteRender",
          summary: "Get an existing website render by id.",
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: {
                type: "string"
              }
            }
          ],
          responses: {
            "200": {
              description: "Rendered preview metadata.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/RenderResponse"
                  }
                }
              }
            },
            "401": {
              description: "Missing or invalid API key.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse"
                  }
                }
              }
            },
            "404": {
              description: "Render not found or expired.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse"
                  }
                }
              }
            }
          }
        }
      }
    }
  };
}

function getErrorStatusCode(error: unknown): number {
  if (error instanceof PublicError) {
    return error.statusCode;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof (error as { statusCode: unknown }).statusCode === "number"
  ) {
    return (error as { statusCode: number }).statusCode;
  }

  return 500;
}

function getErrorMessage(error: unknown, statusCode: number): string {
  if (statusCode >= 500) {
    return "Internal server error";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Request failed";
}

function buildServer(): FastifyInstance {
  const app = Fastify({
    logger: true,
    bodyLimit: config.bodyLimitBytes
  });

  app.setErrorHandler((error: unknown, request, reply) => {
    const statusCode = getErrorStatusCode(error);
    const message = getErrorMessage(error, statusCode);

    if (statusCode >= 500) {
      request.log.error({ err: error }, "Unhandled renderer error");
    }

    reply.code(statusCode).send({ error: message } satisfies ErrorResponseBody);
  });

  app.get("/health", async () => ({
    ok: true,
    service: "gpt-website-renderer"
  }));

  app.get("/openapi.json", async () => buildOpenApiDocument());

  app.post<{ Body: RenderRequestBody; Reply: RenderResponseBody }>(
    "/v1/render",
    {
      preHandler: requireApiKey,
      schema: {
        body: renderRequestBodyJsonSchema,
        response: {
          200: renderResponseJsonSchema,
          400: errorResponseJsonSchema,
          401: errorResponseJsonSchema,
          413: errorResponseJsonSchema,
          500: errorResponseJsonSchema
        }
      }
    },
    async (request) => {
      const input = normalizeRenderInput(request.body);
      const record = await createRender(input);

      return recordToResponse(record);
    }
  );

  app.get<{ Params: { id: string }; Reply: RenderResponseBody | ErrorResponseBody }>(
    "/v1/renders/:id",
    {
      preHandler: requireApiKey,
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" }
          }
        },
        response: {
          200: renderResponseJsonSchema,
          401: errorResponseJsonSchema,
          404: errorResponseJsonSchema,
          500: errorResponseJsonSchema
        }
      }
    },
    async (request, reply) => {
      const record = await loadRecord(request.params.id);

      if (!record) {
        return reply.code(404).send({ error: "Render not found or expired." });
      }

      return recordToResponse(record);
    }
  );

  app.get<{ Params: { id: string } }>("/previews/:id", async (request, reply) => {
    const record = await loadRecord(request.params.id);

    if (!record) {
      return reply.code(404).type("text/plain").send("Render not found or expired.");
    }

    return reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .type("text/html; charset=utf-8")
      .send(buildPreviewShell(record));
  });

  app.get<{ Params: { id: string } }>(
    "/screenshots/:id.png",
    async (request, reply) => {
      const record = await loadRecord(request.params.id);

      if (!record) {
        return reply.code(404).send({ error: "Render not found or expired." });
      }

      try {
        await stat(record.screenshotPath);
      } catch {
        return reply.code(404).send({ error: "Screenshot not found." });
      }

      return reply
        .header("Content-Type", "image/png")
        .header("Cache-Control", "public, max-age=3600")
        .send(createReadStream(record.screenshotPath));
    }
  );

  app.get<{ Params: { id: string } }>(
    "/artifacts/:id.html",
    async (request, reply) => {
      const record = await loadRecord(request.params.id);

      if (!record) {
        return reply.code(404).send({ error: "Render not found or expired." });
      }

      return reply
        .header("X-Content-Type-Options", "nosniff")
        .header(
          "Content-Disposition",
          `attachment; filename="${record.id}.html"`
        )
        .type("text/html; charset=utf-8")
        .send(record.html);
    }
  );

  return app;
}

async function main(): Promise<void> {
  await ensureDataDirs();
  await cleanupExpiredRenders();

  const app = buildServer();

  if (config.apiKey === "dev-local-key") {
    app.log.warn(
      "Using default API_KEY=dev-local-key. Set a strong API_KEY before exposing this service."
    );
  }

  const cleanupTimer = setInterval(() => {
    cleanupExpiredRenders().catch((error) => {
      app.log.error({ err: error }, "Expired render cleanup failed");
    });
  }, 15 * 60 * 1000);

  cleanupTimer.unref();

  const shutdown = async (): Promise<void> => {
    clearInterval(cleanupTimer);
    await app.close();
    await closeBrowser();
  };

  process.once("SIGINT", () => {
    shutdown()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });

  process.once("SIGTERM", () => {
    shutdown()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });

  await app.listen({
    port: config.port,
    host: config.host
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
