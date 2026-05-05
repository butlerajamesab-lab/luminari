# Render MCP Server Specification

## 1. Purpose

This document defines a custom MCP server for Render operations used by the Lighthouse/Luminari deployment workflow.

The MCP server should let ChatGPT inspect and operate Render safely for the full Lighthouse/Luminari application.

Current deployment lock:

```text
Full app repo = butlerajamesab-lab/luminari
Temporary proof repo = butlerajamesab-lab/Lighthouse-clean
Permanent target = Render/custom domain
Original full Manus = product blueprint/reference
Atlas backfill = paused
```

The MCP server must not modify Atlas or trigger Atlas backfill.

---

## 2. Non-goals

The Render MCP server must not:

- modify Atlas
- continue Atlas backfill
- expose service-role keys to the browser
- treat `Lighthouse-clean` as the full app
- treat the 30-row strict-chain proof page as the full Lighthouse/Luminari product
- rebuild the app from scratch
- deploy from the wrong repo

---

## 3. Authentication model

Recommended options, in order:

### Option A — Local/private MCP server with bearer token

Use a private HTTPS endpoint protected by a bearer token.

Required env vars on the MCP server:

```text
RENDER_API_KEY=<Render API key>
MCP_SERVER_TOKEN=<private token used by ChatGPT connector>
ALLOWED_RENDER_OWNER=<optional account/workspace guard>
ALLOWED_REPO=butlerajamesab-lab/luminari
```

The ChatGPT Custom MCP setup should use:

```text
Authentication = OAuth or bearer-compatible gateway, depending on implementation
MCP Server URL = https://<your-mcp-host>/sse
```

### Option B — OAuth MCP server

Use OAuth if the MCP host supports OAuth. This is safer for multi-user/team access, but more setup.

---

## 4. Render API scope

The MCP server should wrap only the Render API operations needed for Lighthouse deployment.

Minimum required capabilities:

1. list services
2. get service
3. create web service from GitHub repo / blueprint
4. get environment variables metadata, never values
5. set or update environment variables
6. trigger deploy
7. list deploys
8. get deploy logs/status
9. get service URL
10. manage custom domains
11. check health endpoint

---

## 5. Required safety guards

Every mutating operation must enforce:

```text
repo == butlerajamesab-lab/luminari
```

Allowed service name pattern:

```text
luminari-lighthouse*
```

Blocked service names:

```text
*atlas*
Lighthouse-clean as full app target
```

Blocked operations:

```text
modifying Atlas
triggering Atlas backfill
setting service-role keys as public/client env vars
using VITE_* prefix for service-role secrets
```

Service-role key rule:

```text
SUPABASE_SERVICE_ROLE_KEY must be server-only.
Never set VITE_SUPABASE_SERVICE_ROLE_KEY.
Never expose service-role key in frontend build variables.
```

---

## 6. Tool definitions

### Tool: list_render_services

Purpose:

List Render services visible to the API key.

Input:

```json
{}
```

Output:

```json
{
  "services": [
    {
      "id": "srv_xxx",
      "name": "luminari-lighthouse",
      "type": "web_service",
      "repo": "butlerajamesab-lab/luminari",
      "branch": "main",
      "url": "https://...onrender.com"
    }
  ]
}
```

### Tool: get_render_service

Purpose:

Fetch one Render service by ID or name.

Input:

```json
{
  "service_id_or_name": "luminari-lighthouse"
}
```

Output:

```json
{
  "id": "srv_xxx",
  "name": "luminari-lighthouse",
  "repo": "butlerajamesab-lab/luminari",
  "branch": "main",
  "buildCommand": "corepack enable && pnpm install --frozen-lockfile && pnpm build",
  "startCommand": "NODE_ENV=production node dist/index.js",
  "healthCheckPath": "/api/health",
  "url": "https://...onrender.com"
}
```

### Tool: create_luminari_render_service

Purpose:

Create the full Lighthouse/Luminari Render web service from `butlerajamesab-lab/luminari`.

Input:

```json
{
  "repo": "butlerajamesab-lab/luminari",
  "branch": "main",
  "service_name": "luminari-lighthouse",
  "build_command": "corepack enable && pnpm install --frozen-lockfile && pnpm build",
  "start_command": "NODE_ENV=production node dist/index.js",
  "health_check_path": "/api/health"
}
```

Hard validation:

- `repo` must equal `butlerajamesab-lab/luminari`
- reject `butlerajamesab-lab/Lighthouse-clean` as full app target

Output:

```json
{
  "ok": true,
  "service_id": "srv_xxx",
  "service_url": "https://...onrender.com"
}
```

### Tool: set_luminari_render_env

Purpose:

Set server-side Render environment variables.

Input:

```json
{
  "service_id": "srv_xxx",
  "env": {
    "DATABASE_URL": "...",
    "SUPABASE_URL": "https://wepxlinwbjrkqdzkqpar.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "...",
    "SUPABASE_ANON_KEY": "...",
    "VITE_SUPABASE_ANON_KEY": "...",
    "NODE_ENV": "production"
  }
}
```

Validation:

- reject any key named `VITE_SUPABASE_SERVICE_ROLE_KEY`
- reject any client-prefixed key containing a service-role value
- allow `SUPABASE_SERVICE_ROLE_KEY` only as server-side env
- require `SUPABASE_URL=https://wepxlinwbjrkqdzkqpar.supabase.co`

Output:

```json
{
  "ok": true,
  "updated_keys": [
    "DATABASE_URL",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_ANON_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "NODE_ENV"
  ]
}
```

Never return env var values.

### Tool: trigger_luminari_deploy

Purpose:

Trigger a Render deploy for the full Luminari service.

Input:

```json
{
  "service_id": "srv_xxx",
  "clear_cache": false
}
```

Output:

```json
{
  "ok": true,
  "deploy_id": "dep_xxx",
  "status": "pending"
}
```

### Tool: get_render_deploy_status

Purpose:

Get status for a Render deploy.

Input:

```json
{
  "service_id": "srv_xxx",
  "deploy_id": "dep_xxx"
}
```

Output:

```json
{
  "deploy_id": "dep_xxx",
  "status": "live",
  "commit": "...",
  "started_at": "...",
  "finished_at": "..."
}
```

### Tool: get_render_deploy_logs

Purpose:

Fetch deploy logs for troubleshooting.

Input:

```json
{
  "service_id": "srv_xxx",
  "deploy_id": "dep_xxx",
  "tail_lines": 200
}
```

Output:

```json
{
  "logs": "..."
}
```

Secrets must be redacted.

### Tool: verify_luminari_health

Purpose:

Call the deployed service health endpoint.

Input:

```json
{
  "base_url": "https://...onrender.com"
}
```

Behavior:

Call:

```text
GET /api/health
```

Expected:

- response is HTTP 200
- response indicates app health
- Lighthouse Supabase project ref is visible or confirmed

Output:

```json
{
  "ok": true,
  "status": 200,
  "health": {}
}
```

### Tool: verify_luminari_app_shell

Purpose:

Verify the full app shell loads, not the temporary 30-row proof page.

Input:

```json
{
  "base_url": "https://...onrender.com"
}
```

Checks:

- root route returns HTML
- page title or content indicates Luminari/Lighthouse app shell
- does not only display the temporary strict-chain proof page

Output:

```json
{
  "ok": true,
  "root_status": 200,
  "looks_like_full_app": true,
  "evidence": ["..."]
}
```

### Tool: verify_trpc_mount

Purpose:

Verify the tRPC API mount exists.

Input:

```json
{
  "base_url": "https://...onrender.com"
}
```

Checks:

```text
/api/trpc
/api/trpc/*
```

Output:

```json
{
  "ok": true,
  "trpc_mounted": true,
  "status": 200
}
```

### Tool: verify_no_service_role_in_client_bundle

Purpose:

Fetch client HTML/JS bundle references and search for forbidden secret exposure.

Input:

```json
{
  "base_url": "https://...onrender.com"
}
```

Search targets:

```text
SUPABASE_SERVICE_ROLE_KEY
service_role
<actual known service role prefix/hash if available>
```

Output:

```json
{
  "ok": true,
  "service_role_exposed": false,
  "checked_assets": ["..."]
}
```

### Tool: verify_custom_domain

Purpose:

Verify the external custom domain points to the Render service.

Input:

```json
{
  "domain": "columbiacitycustomllc.com",
  "expected_service_id": "srv_xxx"
}
```

Output:

```json
{
  "ok": true,
  "domain": "columbiacitycustomllc.com",
  "status": "verified",
  "service_id": "srv_xxx"
}
```

---

## 7. Deployment sequence enforced by MCP

The MCP server should enforce this order:

1. `list_render_services`
2. `create_luminari_render_service` if no service exists
3. `set_luminari_render_env`
4. `trigger_luminari_deploy`
5. `get_render_deploy_status`
6. `get_render_deploy_logs` if failed
7. `verify_luminari_health`
8. `verify_luminari_app_shell`
9. `verify_trpc_mount`
10. `verify_no_service_role_in_client_bundle`
11. only after full app healthy: port strict Atlas-chain display into `luminari`

---

## 8. Required Render environment variables

Required:

```text
DATABASE_URL
SUPABASE_URL=https://wepxlinwbjrkqdzkqpar.supabase.co
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY
VITE_SUPABASE_ANON_KEY
NODE_ENV=production
```

Optional:

```text
VITE_APP_ID
PORT
```

Render usually supplies `PORT` automatically.

---

## 9. MCP connection form values

In the ChatGPT Custom MCP form:

Name:

```text
Render Deploy Controller
```

Description:

```text
Controls Render deployment for the full Lighthouse/Luminari application.
```

MCP Server URL:

```text
https://<your-render-mcp-host>/sse
```

Authentication:

Use OAuth if the MCP server implements OAuth.

If using a private gateway/token model, use the auth mode supported by the Custom MCP setup and validate `MCP_SERVER_TOKEN` on every request.

---

## 10. Minimum implementation architecture

Recommended server stack:

```text
Node.js / TypeScript
MCP SDK
Render REST API client wrapper
HTTPS/SSE transport
Bearer or OAuth auth
```

Suggested files:

```text
render-mcp/
  package.json
  src/index.ts
  src/render-client.ts
  src/tools/list-services.ts
  src/tools/create-service.ts
  src/tools/set-env.ts
  src/tools/deploy.ts
  src/tools/verify-health.ts
  src/tools/verify-security.ts
  README.md
```

---

## 11. Final rule

The Render MCP server exists to deploy the full `butlerajamesab-lab/luminari` application to Render/custom domain.

It must not shift work back to `Lighthouse-clean`, except as a reference/proof source for the strict Atlas-chain pattern.

Atlas remains paused until the full app deploy is healthy and the strict-chain feature is deliberately ported into `luminari`.
