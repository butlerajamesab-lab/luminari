# Field Atlas Streaming & Investigation API

This directory implements the **Field Atlas Streaming & Investigation API** as a local Node.js/Express service connected to the Lighthouse Supabase project. It creates and uses the streaming tables `streams`, `signal_events`, `cursors`, `investigative_jobs`, and `prime_patterns`, implements the five endpoints from the OpenAPI contract, wires OpenStates as an API-ingesting signal source, and includes a working investigative function called `luminari_stream_health_v1`.

## Implemented API surface

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/ingest/signals` | Batch ingest normalized signal events with provenance tracking. |
| `GET` | `/v1/streams/:stream_id/events` | Retrieve stream events by offset, timestamp, or named cursor. |
| `POST` | `/v1/streams/:stream_id/cursors` | Create named cursors for cursor-based retrieval. |
| `POST` | `/internal/investigations/run` | Trigger a synchronous local investigation job. |
| `GET` | `/v1/patterns/prime` | Query emitted prime patterns by module, jurisdiction, and timestamp. |

## Database schema

The SQL migration is in [`sql/001_init.sql`](sql/001_init.sql). It creates the required Lighthouse tables with JSONB fields for schema-shaped payloads and indexes for stream retrieval, cursor lookup, job tracking, and pattern filtering. The `signal_events.offset` column is quoted in SQL because `offset` is a PostgreSQL keyword, while the REST/JavaScript shape still exposes the field as `offset`.

Apply the migration through the Supabase Management API:

```bash
SUPABASE_MANAGEMENT_PAT=... node scripts/apply-sql-management-api.mjs sql/001_init.sql
```

## Local configuration

Copy `.env.example` to `.env` and provide the Lighthouse service role key.

```bash
cp .env.example .env
npm install
npm run seed:streams
npm start
```

The service expects these variables:

| Variable | Required | Description |
|---|---:|---|
| `PORT` | No | Local Express port, defaults to `8787`. |
| `SUPABASE_URL` | Yes | Lighthouse Supabase REST URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key for server-side reads/writes. |
| `FIELD_ATLAS_API_BASE_URL` | No | Base URL used by local scripts, defaults to `http://localhost:8787`. |
| `OPEN_STATES_API_KEY` | No | Required only for live OpenStates fetches. |

## Registered streams

The stream seed script registers one stream for each existing adapter family.

| Stream ID | Source | Jurisdiction | Module | Throughput | Safety |
|---|---|---|---|---|---|
| `court_listener` | `court_listener` | `us-federal` | `judicial` | `medium` | `restricted` |
| `open_states` | `open_states` | `wa` | `legislation` | `medium` | `default` |
| `grants_gov` | `grants_gov` | `us-federal` | `grants` | `low` | `default` |
| `pro_publica` | `pro_publica` | `us-federal` | `nonprofit` | `low` | `default` |

## OpenStates source wiring

The OpenStates wrapper is in [`src/adapters/openStatesApiSource.js`](src/adapters/openStatesApiSource.js). It normalizes OpenStates bills into `signal_event` records and posts them to `POST /v1/ingest/signals` rather than writing directly to Supabase. It supports both live fetches with `OPEN_STATES_API_KEY` and deterministic sample ingestion.

```bash
npm run adapter:openstates:sample
```

## Investigation function

The investigative function is implemented in [`src/streamHealthInvestigation.js`](src/streamHealthInvestigation.js) with this manifest-like identity:

```json
{
  "function_id": "luminari_stream_health_v1",
  "input_types": ["signal_event"],
  "output_types": ["stream_health_alert", "prime_pattern"]
}
```

It evaluates **stream staleness**, **signal frequency**, and **confidence score distribution** over a requested offset window. When a health issue is detected, the function writes a `stream_health_alert` pattern into `prime_patterns`.

## End-to-end verification

With the service running locally:

```bash
npm run test:cycle
```

The cycle performs all required operations: ingest sample OpenStates signals, create a cursor, read events back, trigger the investigation job, and verify that a prime pattern is emitted. The latest summary is written to `test-results/e2e-cycle.json`.
