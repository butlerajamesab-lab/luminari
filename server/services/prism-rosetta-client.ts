import { query_with_diagnostics } from "../db";
import {
  PRISM_ROSETTA_RULE_SET_HASH,
  canonical_json,
  prism_receipt_schema,
  rosetta_binding_request_schema,
  rosetta_semantic_request_payload,
  sha256_hex,
  sign_prism_request,
  type DeepRosettaBindingRequest,
  type PrismReceipt,
} from "./prism-rosetta-contract-v2";
import { enrich_rosetta_binding_request } from "./prism-rosetta-structural-context";
import {
  PRISM_BASE_URL,
  PrismBoundaryError,
} from "./prism-verification-client";

const DEFAULT_PRISM_REQUEST_TIMEOUT_MS = 15_000;
const MIN_PRISM_REQUEST_TIMEOUT_MS = 1_000;
const MAX_PRISM_REQUEST_TIMEOUT_MS = 30_000;
const PRISM_MAX_ATTEMPTS = 1;
const PRISM_MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const DEFAULT_PRISM_CIRCUIT_FAILURE_THRESHOLD = 1;
const MIN_PRISM_CIRCUIT_FAILURE_THRESHOLD = 1;
const MAX_PRISM_CIRCUIT_FAILURE_THRESHOLD = 10;
const DEFAULT_PRISM_CIRCUIT_COOLDOWN_MS = 15 * 60_000;
const MIN_PRISM_CIRCUIT_COOLDOWN_MS = 15 * 60_000;
const MAX_PRISM_CIRCUIT_COOLDOWN_MS = 60 * 60_000;

type prism_rosetta_circuit_state = {
  consecutive_failures: number;
  open_until_ms: number;
  last_failure_class: PrismBoundaryError["failure_class"] | null;
  last_error_code: string | null;
  last_request_id: string | null;
};

export type prism_rosetta_circuit_snapshot = prism_rosetta_circuit_state & {
  state: "closed" | "open" | "half_open";
  remaining_cooldown_ms: number;
};

const prism_rosetta_circuit: prism_rosetta_circuit_state = {
  consecutive_failures: 0,
  open_until_ms: 0,
  last_failure_class: null,
  last_error_code: null,
  last_request_id: null,
};

function bounded_integer(
  input: string | number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed =
    typeof input === "number" ? input : Number.parseInt(input ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(parsed)));
}

export function prism_rosetta_request_timeout_ms(
  configured: string | number | undefined = process.env
    .PRISM_ROSETTA_REQUEST_TIMEOUT_MS,
): number {
  return bounded_integer(
    configured,
    DEFAULT_PRISM_REQUEST_TIMEOUT_MS,
    MIN_PRISM_REQUEST_TIMEOUT_MS,
    MAX_PRISM_REQUEST_TIMEOUT_MS,
  );
}

export function prism_rosetta_circuit_failure_threshold(): number {
  return bounded_integer(
    process.env.PRISM_ROSETTA_CIRCUIT_FAILURE_THRESHOLD,
    DEFAULT_PRISM_CIRCUIT_FAILURE_THRESHOLD,
    MIN_PRISM_CIRCUIT_FAILURE_THRESHOLD,
    MAX_PRISM_CIRCUIT_FAILURE_THRESHOLD,
  );
}

export function prism_rosetta_circuit_cooldown_ms(): number {
  return bounded_integer(
    process.env.PRISM_ROSETTA_CIRCUIT_COOLDOWN_MS,
    DEFAULT_PRISM_CIRCUIT_COOLDOWN_MS,
    MIN_PRISM_CIRCUIT_COOLDOWN_MS,
    MAX_PRISM_CIRCUIT_COOLDOWN_MS,
  );
}

export function get_prism_rosetta_circuit_snapshot(
  now_ms = Date.now(),
): prism_rosetta_circuit_snapshot {
  const remaining_cooldown_ms = Math.max(
    0,
    prism_rosetta_circuit.open_until_ms - now_ms,
  );
  const threshold = prism_rosetta_circuit_failure_threshold();
  const state =
    remaining_cooldown_ms > 0
      ? "open"
      : prism_rosetta_circuit.consecutive_failures >= threshold
        ? "half_open"
        : "closed";
  return {
    ...prism_rosetta_circuit,
    state,
    remaining_cooldown_ms,
  };
}

export function prism_rosetta_circuit_allows_request(
  now_ms = Date.now(),
): boolean {
  return get_prism_rosetta_circuit_snapshot(now_ms).state !== "open";
}

function circuit_breaking_failure(error: PrismBoundaryError): boolean {
  return (
    ["timeout", "transient_upstream", "network"].includes(
      error.failure_class,
    ) && error.message !== "prism_rosetta_circuit_open"
  );
}

export function record_prism_rosetta_circuit_failure(
  error: PrismBoundaryError,
  request_id: string,
  now_ms = Date.now(),
): prism_rosetta_circuit_snapshot {
  if (!circuit_breaking_failure(error)) {
    return get_prism_rosetta_circuit_snapshot(now_ms);
  }

  prism_rosetta_circuit.consecutive_failures += 1;
  prism_rosetta_circuit.last_failure_class = error.failure_class;
  prism_rosetta_circuit.last_error_code = error.message;
  prism_rosetta_circuit.last_request_id = request_id;

  const threshold = prism_rosetta_circuit_failure_threshold();
  if (prism_rosetta_circuit.consecutive_failures >= threshold) {
    const cooldown_ms = prism_rosetta_circuit_cooldown_ms();
    prism_rosetta_circuit.open_until_ms = now_ms + cooldown_ms;
    console.error("[PrismRosettaCircuit] opened", {
      request_id,
      failure_class: error.failure_class,
      error_code: error.message,
      consecutive_failures: prism_rosetta_circuit.consecutive_failures,
      failure_threshold: threshold,
      cooldown_ms,
      open_until: new Date(prism_rosetta_circuit.open_until_ms).toISOString(),
    });
  } else {
    console.warn("[PrismRosettaCircuit] upstream_failure", {
      request_id,
      failure_class: error.failure_class,
      error_code: error.message,
      consecutive_failures: prism_rosetta_circuit.consecutive_failures,
      failure_threshold: threshold,
    });
  }
  return get_prism_rosetta_circuit_snapshot(now_ms);
}

export function record_prism_rosetta_circuit_success(
  request_id: string,
  now_ms = Date.now(),
): void {
  const prior = get_prism_rosetta_circuit_snapshot(now_ms);
  prism_rosetta_circuit.consecutive_failures = 0;
  prism_rosetta_circuit.open_until_ms = 0;
  prism_rosetta_circuit.last_failure_class = null;
  prism_rosetta_circuit.last_error_code = null;
  prism_rosetta_circuit.last_request_id = null;
  if (prior.consecutive_failures > 0) {
    console.log("[PrismRosettaCircuit] closed", {
      request_id,
      prior_state: prior.state,
      prior_consecutive_failures: prior.consecutive_failures,
    });
  }
}

export function reset_prism_rosetta_circuit(): void {
  prism_rosetta_circuit.consecutive_failures = 0;
  prism_rosetta_circuit.open_until_ms = 0;
  prism_rosetta_circuit.last_failure_class = null;
  prism_rosetta_circuit.last_error_code = null;
  prism_rosetta_circuit.last_request_id = null;
}

function classify_http_failure(
  status: number,
): PrismBoundaryError["failure_class"] {
  if (status === 401 || status === 403) return "authentication";
  if (status === 409) return "request_id_conflict";
  if (status === 400 || status === 422) return "validation";
  if (status === 408 || status === 429 || status >= 500)
    return "transient_upstream";
  return "permanent_upstream";
}

function semantic_input_hash(request: DeepRosettaBindingRequest): string {
  return sha256_hex(canonical_json(rosetta_semantic_request_payload(request)));
}

function validate_receipt_integrity(
  request: DeepRosettaBindingRequest,
  receipt: PrismReceipt,
): PrismReceipt {
  if (receipt.rule_set_id !== request.rule_set_id) {
    throw new PrismBoundaryError("validation", 502, "prism_rule_set_mismatch");
  }
  const expected_input_hash = semantic_input_hash(request);
  const semantic_output = {
    prism_engine_version: receipt.prism_engine_version,
    rule_set_id: receipt.rule_set_id,
    rule_set_version: receipt.rule_set_version,
    status: receipt.status,
    supported_findings: receipt.supported_findings,
    contradictions: receipt.contradictions,
    missing_evidence: receipt.missing_evidence,
    unresolved_conditions: receipt.unresolved_conditions,
    cited_evidence_identifiers: receipt.cited_evidence_identifiers,
  };
  const expected_output_hash = sha256_hex(canonical_json(semantic_output));
  const expected_replay_key = sha256_hex(
    `${PRISM_ROSETTA_RULE_SET_HASH}:${expected_input_hash}`,
  );

  if (
    receipt.request_id !== request.request_id ||
    receipt.input_hash !== expected_input_hash ||
    receipt.output_hash !== expected_output_hash ||
    receipt.deterministic_replay_key !== expected_replay_key
  ) {
    throw new PrismBoundaryError(
      "validation",
      502,
      "prism_receipt_integrity_failure",
    );
  }
  return receipt;
}

async function record_request(
  request: DeepRosettaBindingRequest,
): Promise<string> {
  const input_hash = semantic_input_hash(request);
  const result = await query_with_diagnostics<{ input_hash: string }>(
    `with inserted as (
       insert into public.lighthouse_prism_verification_requests (
         request_id, lighthouse_case_id, evidence_document_id,
         evidence_fingerprint, source_content_hash, claim_assertion_id,
         rule_set_id, rule_set_version, requested_checks,
         originating_lighthouse_commit, originating_lighthouse_runtime_version,
         input_hash, bridge_state
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,'pending')
       on conflict (request_id) do nothing
       returning input_hash
     )
     select input_hash from inserted
     union all
     select input_hash
       from public.lighthouse_prism_verification_requests
      where request_id = $1
     limit 1`,
    [
      request.request_id,
      request.lighthouse_case_id,
      request.evidence_document_id,
      request.evidence_fingerprint.toLowerCase(),
      request.source_content_hash.toLowerCase(),
      request.claim_assertion_id,
      request.rule_set_id,
      request.rule_set_version,
      JSON.stringify(request.requested_checks),
      request.originating_lighthouse_commit,
      request.originating_lighthouse_runtime_version,
      input_hash,
    ],
    {
      label: "prism_rosetta_record_request",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  if (result.rows[0]?.input_hash !== input_hash) {
    throw new PrismBoundaryError(
      "request_id_conflict",
      409,
      "request_id_conflict",
    );
  }
  return input_hash;
}

async function record_attempt(input: {
  request_id: string;
  input_hash: string;
  attempt_number: number;
  outcome:
    | "completed"
    | "reused"
    | "conflict"
    | "degraded"
    | "permanent_failure";
  http_status?: number;
  failure_class?: string;
}): Promise<void> {
  await query_with_diagnostics(
    `insert into public.lighthouse_prism_verification_attempts (
       request_id, input_hash, attempt_number, outcome, http_status, failure_class
     ) values ($1,$2,$3,$4,$5,$6)`,
    [
      input.request_id,
      input.input_hash,
      input.attempt_number,
      input.outcome,
      input.http_status ?? null,
      input.failure_class ?? null,
    ],
    {
      label: "prism_rosetta_record_attempt",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
}

async function mirror_receipt(receipt: PrismReceipt): Promise<void> {
  await query_with_diagnostics(
    `insert into public.lighthouse_prism_verification_receipts (
       prism_verification_receipt_id, request_id, prism_engine_version,
       rule_set_id, rule_set_version, rule_set_hash, input_hash, output_hash,
       verification_status, supported_findings, contradictions, missing_evidence,
       unresolved_conditions, cited_evidence_identifiers,
       deterministic_replay_key, prism_completion_timestamp
     ) values (
       $1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,
       $10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15,$16::timestamptz
     ) on conflict (request_id) do nothing`,
    [
      receipt.verification_receipt_id,
      receipt.request_id,
      receipt.prism_engine_version,
      receipt.rule_set_id,
      receipt.rule_set_version,
      receipt.rule_set_hash,
      receipt.input_hash,
      receipt.output_hash,
      receipt.status,
      JSON.stringify(receipt.supported_findings),
      JSON.stringify(receipt.contradictions),
      JSON.stringify(receipt.missing_evidence),
      JSON.stringify(receipt.unresolved_conditions),
      JSON.stringify(receipt.cited_evidence_identifiers),
      receipt.deterministic_replay_key,
      receipt.completion_timestamp,
    ],
    {
      label: "prism_rosetta_mirror_receipt",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );

  const mirrored = await query_with_diagnostics<{
    prism_verification_receipt_id: string;
    input_hash: string;
    output_hash: string;
  }>(
    `select prism_verification_receipt_id::text, input_hash, output_hash
       from public.lighthouse_prism_verification_receipts
      where request_id = $1`,
    [receipt.request_id],
    {
      label: "prism_rosetta_verify_mirror",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  const row = mirrored.rows[0];
  if (
    !row ||
    row.prism_verification_receipt_id !== receipt.verification_receipt_id ||
    row.input_hash !== receipt.input_hash ||
    row.output_hash !== receipt.output_hash
  ) {
    throw new PrismBoundaryError(
      "validation",
      502,
      "prism_receipt_mirror_conflict",
    );
  }

  await query_with_diagnostics(
    `update public.lighthouse_prism_verification_requests
        set bridge_state = 'completed', failure_class = null, updated_at = now()
      where request_id = $1`,
    [receipt.request_id],
    {
      label: "prism_rosetta_complete_request",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
}

async function call_prism(
  request: DeepRosettaBindingRequest,
  options: { base_url?: string; timeout_ms?: number } = {},
): Promise<{ receipt: PrismReceipt; attempts: number; http_status: number }> {
  const secret = process.env.PRISM_BRIDGE_SECRET;
  if (!secret) {
    throw new PrismBoundaryError(
      "authentication",
      503,
      "prism_bridge_secret_unconfigured",
    );
  }
  const path = "/api/v1/verification-requests";
  const body = canonical_json(request);
  if (Buffer.byteLength(body, "utf8") > PRISM_MAX_REQUEST_BYTES) {
    throw new PrismBoundaryError("validation", 413, "prism_request_too_large");
  }
  if (!prism_rosetta_circuit_allows_request()) {
    throw new PrismBoundaryError(
      "transient_upstream",
      503,
      "prism_rosetta_circuit_open",
    );
  }
  const base_url = options.base_url ?? PRISM_BASE_URL;
  const timeout_ms = prism_rosetta_request_timeout_ms(options.timeout_ms);
  let last_error: PrismBoundaryError | null = null;

  for (let attempt = 1; attempt <= PRISM_MAX_ATTEMPTS; attempt += 1) {
    const timestamp = Date.now().toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeout_ms);
    try {
      const response = await fetch(`${base_url}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-prism-client": "lighthouse",
          "x-prism-timestamp": timestamp,
          "x-prism-signature": sign_prism_request(
            secret,
            timestamp,
            "POST",
            path,
            body,
          ),
        },
        body,
        signal: controller.signal,
      });
      const response_body = await response.json().catch(() => ({}));
      if (response.ok) {
        const receipt = validate_receipt_integrity(
          request,
          prism_receipt_schema.parse(response_body),
        );
        record_prism_rosetta_circuit_success(request.request_id);
        return { receipt, attempts: attempt, http_status: response.status };
      }
      const failure_class = classify_http_failure(response.status);
      const boundary_error = new PrismBoundaryError(
        failure_class,
        response.status,
        typeof (response_body as Record<string, unknown>).error === "string"
          ? String((response_body as Record<string, unknown>).error)
          : "prism_request_failed",
      );
      if (
        failure_class !== "transient_upstream" ||
        attempt === PRISM_MAX_ATTEMPTS
      ) {
        throw boundary_error;
      }
      last_error = boundary_error;
    } catch (error) {
      if (error instanceof PrismBoundaryError) {
        if (
          error.failure_class !== "transient_upstream" ||
          attempt === PRISM_MAX_ATTEMPTS
        ) {
          record_prism_rosetta_circuit_failure(error, request.request_id);
          throw error;
        }
        last_error = error;
      } else if (error instanceof Error && error.name === "AbortError") {
        last_error = new PrismBoundaryError(
          "timeout",
          503,
          "prism_request_timed_out",
        );
        if (attempt === PRISM_MAX_ATTEMPTS) {
          record_prism_rosetta_circuit_failure(last_error, request.request_id);
          throw last_error;
        }
      } else if (error instanceof Error && error.name === "ZodError") {
        throw new PrismBoundaryError(
          "validation",
          502,
          "invalid_prism_receipt",
        );
      } else {
        last_error = new PrismBoundaryError(
          "network",
          503,
          "prism_network_failure",
        );
        if (attempt === PRISM_MAX_ATTEMPTS) {
          record_prism_rosetta_circuit_failure(last_error, request.request_id);
          throw last_error;
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw (
    last_error ??
    new PrismBoundaryError("network", 503, "prism_network_failure")
  );
}

export async function submit_rosetta_prism_request(
  raw_request: unknown,
  options: { base_url?: string; timeout_ms?: number } = {},
): Promise<PrismReceipt> {
  const base_request = rosetta_binding_request_schema.parse(raw_request);
  const request = await enrich_rosetta_binding_request(base_request);
  const input_hash = await record_request(request);
  try {
    const response = await call_prism(request, options);
    await mirror_receipt(response.receipt);
    await record_attempt({
      request_id: request.request_id,
      input_hash,
      attempt_number: response.attempts,
      outcome: response.receipt.idempotency_reused ? "reused" : "completed",
      http_status: response.http_status,
    });
    return response.receipt;
  } catch (error) {
    const boundary_error =
      error instanceof PrismBoundaryError
        ? error
        : new PrismBoundaryError("network", 503, "prism_network_failure");
    const transient = ["timeout", "transient_upstream", "network"].includes(
      boundary_error.failure_class,
    );
    const outcome =
      boundary_error.failure_class === "request_id_conflict"
        ? "conflict"
        : transient
          ? "degraded"
          : "permanent_failure";
    await record_attempt({
      request_id: request.request_id,
      input_hash,
      attempt_number: transient ? PRISM_MAX_ATTEMPTS : 1,
      outcome,
      http_status: boundary_error.http_status,
      failure_class: boundary_error.failure_class,
    });
    await query_with_diagnostics(
      `update public.lighthouse_prism_verification_requests request
          set bridge_state = $2, failure_class = $3, updated_at = now()
        where request.request_id = $1
          and not exists (
            select 1
              from public.lighthouse_prism_verification_receipts receipt
             where receipt.request_id = request.request_id
          )`,
      [
        request.request_id,
        outcome === "conflict"
          ? "conflict"
          : outcome === "degraded"
            ? "degraded"
            : "permanent_failure",
        boundary_error.failure_class,
      ],
      {
        label: "prism_rosetta_fail_request",
        pool_acquire_timeout_ms: 1_000,
        query_timeout_ms: 5_000,
      },
    );
    throw boundary_error;
  }
}
