# Lighthouse Stabilization Runbook

This is the operating contract for recovering Lighthouse without repeatedly
turning the public web process into an experiment. It applies until the runtime
is formally promoted out of stabilization.

UTC is the receipt authority. Human-facing incident updates also show Pacific
local time (`PDT`, UTC-7, or `PST`, UTC-8, according to the date).

## Status vocabulary

| Status | Meaning |
| --- | --- |
| `CONTAINED` | The front door completed a 24-hour soak while all heavy workers remained paused. |
| `CANARY-PASSED` | One allowlisted queue job completed in an isolated worker and passed a 30-minute observation. |
| `RECOVERED` | Isolated workers and the front door completed a fresh 24-hour soak together. |
| `SECURED-CANDIDATE` | Runtime recovery **and** the broader repository, authentication, upload, database, and provenance gates pass. |

A paused-worker soak can establish `CONTAINED`; it cannot establish worker
recovery or secured-candidate status.

## Stabilization change freeze

Allowed changes:

- rollback and fail-closed controls;
- health, resource, lease, and transition observability;
- narrow tests, indexes, authentication, and security fixes;
- this runbook and incident receipts.

Disallowed changes:

- feature activation or new feature work;
- worker re-enablement, backlog replay, or manual lock clearing;
- broad migrations, dependency churn, or architecture expansion;
- more than one stabilization concern in a production deploy.

## Front-door hold state

The Render web service is an HTTP-only process.

- `LIGHTHOUSE_RUNTIME_ROLE=web` is explicit in the Blueprint and is also the
  fail-closed code default.
- Missing, misspelled, or unknown runtime roles resolve to `web`.
- Only exact role `worker` can start background work.
- Every worker also requires its own explicit `*_ENABLED=true` grant.
- Admin/manual ingestion mutations return `503 background_runtime_required`
  on the web service.

Backlog growth is accepted containment. Processing that backlog in the web
process is not.

## Deploy gate

Every production change requires all of the following:

1. A reviewed pull request; no direct production commit.
2. Install from the committed pnpm lockfile with `--frozen-lockfile`.
3. Required build, runtime-isolation, health-contract, and Prism checks green.
4. Render deploy only after checks pass.
5. `/api/runtime-build` equals the merged commit SHA exactly.
6. Both domains return JSON HTTP 200 from `/health` and `/api/health` after the
   deploy becomes live and again at least five minutes later.
7. Record commit SHA, deploy ID, UTC/Pacific timestamps, and probe receipts.

Repository declarations do not repair Dashboard drift by themselves. Verify the
live Render build command and deploy trigger separately after every control-plane
change.

## Immediate stop conditions

Any one condition stops a canary, preserves queue state, and starts rollback or
containment:

- unexpected `SIGTERM`, restart, instance count zero, or unexplained handoff;
- service-originated HTTP 499 or 5xx during a canary;
- two consecutive liveness failures, or liveness application time over 1 second;
- CPU above 0.80 core for 60 seconds;
- RSS above 75% of 2 GiB for five minutes, or above 90% once;
- any DB acquisition timeout, DB lease at least 10 seconds, expired 60-second
  lease, busy-client release, or pool waiting above zero for 30 seconds;
- Prism circuit opens;
- missing/orphaned receipt, input-hash mismatch, unexpected permanent failure,
  or any state transition without an immutable receipt.

## Front-door soak

The continuous 24-hour clock starts when the final stabilization deploy becomes
live. It resets on any stop condition.

Pass criteria:

- zero unexplained restarts;
- zero long or expired DB leases;
- zero service-originated 499/5xx and rolling 24-hour 5xx below 0.1%;
- `/api/health` server-side p95 at most 250 ms and maximum at most 1 second on
  both domains;
- Prism completed requests = receipts = bindings, with zero missing, orphaned,
  or input-hash defects;
- no new stale submitted locks and no unexpected queue transition.

## Worker canary protocol

No production queue is re-enabled in the web service.

1. Use a separate background worker at concurrency one.
2. Run the exact production commit on production-equivalent CPU and memory.
3. Use a queue-ID allowlist and exactly one existing or synthetic job.
4. For Prism, keep request timeout at or below 15 seconds, maximum new
   submissions at one, and require the circuit to remain closed.
5. Legislative work is `NO-GO` until it has a queue-ID allowlist and an enforced
   cycle budget at or below 30 seconds. Its staging envelope includes the
   observed 2,103-trait by 481-candidate case.
6. Observe a successful terminal receipt for 30 minutes before considering a
   second job. There is no automatic batch expansion.
7. A passed canary starts a fresh 24-hour isolated-worker soak.

## Queue replay contract

Never delete, unlock, or overwrite a stale/partial row by hand. In the same
transaction as the queue state update, append a transition receipt containing:

- receipt ID, queue family, and queue ID;
- prior/new state and attempt count before/after;
- prior lock timestamp/owner;
- input SHA-256 and contract/rule-set ID plus version;
- expected/observed counts;
- output SHA-256 and receipt-manifest SHA-256;
- failure class and error code;
- worker/service ID, commit SHA, and deploy ID;
- start/completion timestamps and replay reason.

Replay procedure: lock one row; recompute input identity; reconcile already
persisted receipts; submit only missing idempotent work; verify exact counts and
hashes; append the receipt and transition the queue atomically.

## Rollback

1. Disable the affected worker grant and restart that worker. Worker flags are
   evaluated at process start.
2. Preserve locks, partials, and receipts.
3. Roll code back only to a recorded schema-compatible deploy. Do not reverse a
   production migration during an incident; use a narrow forward fix.
4. Verify the target SHA and both domains immediately and again five minutes
   later.
5. Record the rollback commit/deploy, timestamps, probes, and queue hashes.

## Current recovery order

1. Hold the HTTP-only web boundary for 24 hours.
2. Make Dashboard builds frozen and deploys checks-gated; protect `main` with
   required checks.
3. Add the immutable queue transition receipt before touching stale locks or
   partials.
4. Add a legislative queue-ID canary and hard cycle budget.
5. Create isolated workers and run one-job canaries.
6. Begin the isolated-worker 24-hour soak.
