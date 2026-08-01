import { query_with_diagnostics } from "../db";
import {
  PRISM_ROSETTA_RULE_SET_HASH,
  canonical_json,
  prism_receipt_schema,
  rosetta_binding_request_schema,
  sha256_hex,
  sign_prism_request,
  type PrismReceipt,
  type RosettaBindingRequest,
} from "./prism-verification-contract";
import {
  PRISM_BASE_URL,
  PrismBoundaryError,
} from "./prism-verification-client";

const PRISM_REQUEST_TIMEOUT_MS = 8_000;
const PRISM_MAX_ATTEMPTS = 3;
const PRISM_MAX_REQUEST_BYTES = 256 * 1024;

function classify_http_failure(status: number): PrismBoundaryError["failure_class"] {
  if (status === 401 || status === 403) return "authentication";
  if (status === 409) return "request_id_conflict";
  if (status === 400 || status === 422) return "validation";
  if (status === 408 || status === 429 || status >= 500) return "transient_upstream";
  return "permanent_upstream";
}

function validate_receipt_integrity(
  request: RosettaBindingRequest,
  receipt: PrismReceipt,
): PrismReceipt {
  if (receipt.rule_set_id !== request.rule_set_id) {
    throw new PrismBoundaryError("validation", 502, "prism_rule_set_mismatch");
  }
  const expected_input_hash = sha256_hex(canonical_json(request));
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

async function record_request(request: RosettaBindingRequest): Promise<string> {
  const input_hash = sha256_hex(canonical_json(request));
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
    throw new PrismBoundaryError("request_id_conflict", 409, "request_id_conflict");
  }
  return input_hash;
}

async function record_attempt(input: {
  request_id: string;
  input_hash: string;
  attempt_number: number;
  outcome: "completed" | "reused" | "conflict" | "degraded" | "permanent_failure";
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
    throw new PrismBoundaryError("validation", 502, "prism_receipt_mirror_conflict");
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
  request: RosettaBindingRequest,
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
  const base_url = options.base_url ?? PRISM_BASE_URL;
  const timeout_ms = options.timeout_ms ?? PRISM_REQUEST_TIMEOUT_MS;
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
        return { receipt, attempts: attempt, http_status: response.status };
      }
      const failure_class = classify_http_failure(response.status);
      const error = new PrismBoundaryError(
        failure_class,
        response.status,
        typeof (response_body as Record<string, unknown>).error === "string"
          ? String((response_body as Record<string, unknown>).error)
          : "prism_request_failed",
      );
      if (failure_class !== "transient_upstream" || attempt === PRISM_MAX_ATTEMPTS) {
        throw error;
      }
      last_error = error;
    } catch (error) {
      if (error instanceof PrismBoundaryError) {
        if (error.failure_class !== "transient_upstream" || attempt === PRISM_MAX_ATTEMPTS) {
          throw error;
        }
        last_error = error;
      } else if (error instanceof Error && error.name === "AbortError") {
        last_error = new PrismBoundaryError("timeout", 503, "prism_request_timed_out");
        if (attempt === PRISM_MAX_ATTEMPTS) throw last_error;
      } else if (error instanceof Error && error.name === "ZodError") {
        throw new PrismBoundaryError("validation", 502, "invalid_prism_receipt");
      } else {
        last_error = new PrismBoundaryError("network", 503, "prism_network_failure");
        if (attempt === PRISM_MAX_ATTEMPTS) throw last_error;
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw last_error ?? new PrismBoundaryError("network", 503, "prism_network_failure");
}

export async function submit_rosetta_prism_request(
  raw_request: unknown,
  options: { base_url?: string; timeout_ms?: number } = {},
): Promise<PrismReceipt> {
  const request = rosetta_binding_request_schema.parse(raw_request);
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
    const boundary_error = error instanceof PrismBoundaryError
      ? error
      : new PrismBoundaryError("network", 503, "prism_network_failure");
    const transient = ["timeout", "transient_upstream", "network"].includes(
      boundary_error.failure_class,
    );
    const outcome = boundary_error.failure_class === "request_id_conflict"
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
