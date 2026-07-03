# GPT Website Renderer Toolkit

This is an isolated renderer API for custom GPT Actions. It accepts HTML, CSS, and JavaScript, renders the page with Playwright Chromium, captures a screenshot, and returns URLs for a live preview shell, screenshot, and generated HTML artifact.

It is intentionally contained under `tools/gpt-website-renderer/` so it does not modify the main Luminari runtime, Vite build, server entrypoint, or database path.

## Endpoints

- `GET /health`
- `GET /openapi.json`
- `POST /v1/render`
- `GET /v1/renders/:id`
- `GET /previews/:id`
- `GET /screenshots/:id.png`
- `GET /artifacts/:id.html`

## Local run

```bash
cd tools/gpt-website-renderer
npm install
npm run install:browsers
cp .env.example .env
npm run dev
```

Then open:

```text
http://localhost:8787/health
http://localhost:8787/openapi.json
```

## Required environment variables

```text
PORT=8787
HOST=0.0.0.0
PUBLIC_BASE_URL=https://your-renderer.example.com
API_KEY=replace-with-a-long-random-value
DATA_DIR=./data
RENDER_TTL_HOURS=24
PLAYWRIGHT_CHROMIUM_NO_SANDBOX=0
```

For Render or another container host, `PLAYWRIGHT_CHROMIUM_NO_SANDBOX=1` may be required depending on the runtime sandbox.

## Docker run

```bash
cd tools/gpt-website-renderer
docker build -t gpt-website-renderer .
docker run --rm -p 8787:8787 \
  -e PUBLIC_BASE_URL=http://localhost:8787 \
  -e API_KEY=local-test-key \
  -e PLAYWRIGHT_CHROMIUM_NO_SANDBOX=1 \
  gpt-website-renderer
```

## Test render

```bash
curl -X POST http://localhost:8787/v1/render \
  -H 'content-type: application/json' \
  -H 'x-api-key: local-test-key' \
  -d '{
    "title": "Smoke Test",
    "html": "<main><h1>Hello renderer</h1><p>This came from GPT HTML.</p></main>",
    "css": "body{font-family:system-ui;padding:48px;}main{max-width:720px;margin:auto;}",
    "javascript": "",
    "viewport": {"width": 1440, "height": 1000, "deviceScaleFactor": 1, "isMobile": false},
    "fullPage": true,
    "waitMs": 300,
    "allowExternalRequests": false
  }'
```

## GPT Builder wiring

In GPT Builder:

1. Create an Action.
2. Import `https://your-renderer.example.com/openapi.json`.
3. Use API key authentication.
4. Set the header name to `x-api-key`.
5. Set the key value to the same `API_KEY` configured on the renderer host.

The main operation is:

```text
operationId: renderWebsitePreview
POST /v1/render
```

The GPT should send:

```json
{
  "title": "Homepage Preview",
  "html": "<main><h1>Hello</h1></main>",
  "css": "body { font-family: system-ui; }",
  "javascript": "",
  "viewport": {
    "width": 1440,
    "height": 1000,
    "deviceScaleFactor": 1,
    "isMobile": false
  },
  "fullPage": true,
  "waitMs": 300,
  "allowExternalRequests": false
}
```

The renderer returns:

```json
{
  "id": "...",
  "title": "Homepage Preview",
  "previewUrl": "https://.../previews/...",
  "screenshotUrl": "https://.../screenshots/....png",
  "htmlUrl": "https://.../artifacts/....html",
  "createdAt": "...",
  "expiresAt": "...",
  "viewport": {
    "width": 1440,
    "height": 1000,
    "deviceScaleFactor": 1,
    "isMobile": false
  },
  "warnings": []
}
```

## Security posture

By default, external requests are blocked. The renderer also blocks localhost, loopback, private network ranges, and metadata IP access. The public preview uses a sandboxed iframe without `allow-same-origin`.

This is suitable as a first production path for a GPT Action preview renderer. For durable preview storage across deploys, move artifacts from local disk to S3, R2, or Supabase Storage.
