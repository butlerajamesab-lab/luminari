import { Router, type Request } from "express";
import { z } from "zod";
import {
  PrismBoundaryError,
  PRISM_BASE_URL,
  get_prism_status,
  run_prism_verification,
} from "../services/prism-verification-client";
import { safe_equal } from "../services/prism-verification-contract";
import { activate_prism_for_rosetta_assembly } from "../services/prism-rosetta-activation";

export const prism_verification_router = Router();

function has_test_authorization(req: Request): boolean {
  const expected = process.env.PRISM_BRIDGE_TEST_TOKEN;
  const supplied = req.get("x-prism-test-token") ?? "";
  return Boolean(expected && safe_equal(expected, supplied));
}

function has_session_authorization(req: Request): boolean {
  const session = (req as Request & { session?: Record<string, unknown> }).session;
  return Boolean(session?.user_id ?? session?.userId ?? session?.passport);
}

function require_request_authorization(req: Request): boolean {
  return has_test_authorization(req) || has_session_authorization(req);
}

function boundary_response(res: any, error: unknown) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: "invalid_verification_request" });
  }
  const boundary_error = error instanceof PrismBoundaryError
    ? error
    : new PrismBoundaryError("network", 503, "verification_unavailable");
  return res.status(boundary_error.http_status).json({
    error: boundary_error.message,
    failure_class: boundary_error.failure_class,
    verification_status: "unresolved",
  });
}

prism_verification_router.get("/health", async (_req, res) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const response = await fetch(`${PRISM_BASE_URL}/api/health`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    const body = await response.json().catch(() => ({}));
    return res.status(response.ok ? 200 : 503).json({
      lighthouse_bridge: response.ok ? "available" : "degraded",
      prism: body,
    });
  } catch {
    return res.status(503).json({
      lighthouse_bridge: "degraded",
      prism: { status: "unavailable" },
    });
  } finally {
    clearTimeout(timeout);
  }
});

prism_verification_router.post("/rosetta/verify-assembly", async (req, res) => {
  if (!require_request_authorization(req)) {
    return res.status(401).json({ error: "authentication_required" });
  }
  try {
    const input = z.object({
      genome_bill_id: z.string().uuid(),
      assembly_run_id: z.string().uuid().optional(),
    }).strict().parse(req.body);
    const result = await activate_prism_for_rosetta_assembly(input);
    return res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "invalid_rosetta_activation_request" });
    }
    if (error instanceof PrismBoundaryError) {
      return boundary_response(res, error);
    }
    const message = error instanceof Error ? error.message : "verification_unavailable";
    return res.status(503).json({
      error: message,
      verification_status: "unresolved",
    });
  }
});

prism_verification_router.post("/verification-requests", async (req, res) => {
  if (!require_request_authorization(req)) {
    return res.status(401).json({ error: "authentication_required" });
  }
  try {
    const receipt = await run_prism_verification(req.body);
    return res.status(receipt.idempotency_reused ? 200 : 201).json(receipt);
  } catch (error) {
    return boundary_response(res, error);
  }
});

prism_verification_router.get("/verification-requests/:request_id", async (req, res) => {
  const public_fixture = req.params.request_id.startsWith("prism-fixture-");
  if (!public_fixture && !require_request_authorization(req)) {
    return res.status(401).json({ error: "authentication_required" });
  }
  const row = await get_prism_status(req.params.request_id);
  if (!row) return res.status(404).json({ error: "verification_request_not_found" });
  return res.json(row);
});

prism_verification_router.get("/verification-requests/:request_id/view", async (req, res) => {
  const public_fixture = req.params.request_id.startsWith("prism-fixture-");
  if (!public_fixture && !require_request_authorization(req)) {
    return res.status(401).send("Authentication required");
  }
  const row = await get_prism_status(req.params.request_id);
  if (!row) return res.status(404).send("Verification request not found");
  const escape_html = (value: unknown) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  return res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Prism Verification Receipt</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;background:#0b1220;color:#e5e7eb}dl{display:grid;grid-template-columns:220px 1fr;gap:10px;padding:24px;border:1px solid #334155;border-radius:12px;background:#111827}dt{color:#94a3b8}dd{margin:0;overflow-wrap:anywhere}.status{font-weight:700}</style></head>
<body><h1>Prism Verification Receipt</h1><dl>
<dt>Request ID</dt><dd>${escape_html(row.request_id)}</dd>
<dt>Receipt ID</dt><dd>${escape_html(row.prism_verification_receipt_id)}</dd>
<dt>Verification status</dt><dd class="status">${escape_html(row.verification_status ?? row.bridge_state)}</dd>
<dt>Bridge state</dt><dd>${escape_html(row.bridge_state)}</dd>
<dt>Input hash</dt><dd>${escape_html(row.input_hash)}</dd>
<dt>Output hash</dt><dd>${escape_html(row.output_hash)}</dd>
<dt>Replay key</dt><dd>${escape_html(row.deterministic_replay_key)}</dd>
<dt>Rule set</dt><dd>${escape_html(row.rule_set_id)} @ ${escape_html(row.rule_set_version)}</dd>
</dl></body></html>`);
});

prism_verification_router.post("/controlled-test", async (req, res) => {
  if (!has_test_authorization(req)) {
    return res.status(401).json({ error: "test_authorization_required" });
  }

  const run_id = `prism-fixture-${Date.now()}`;
  const hash_a = "a".repeat(64);
  const hash_b = "b".repeat(64);
  const hash_c = "c".repeat(64);
  const base = {
    lighthouse_case_id: "public-safe-cross-domain-fixture",
    evidence_document_id: "fixture-document",
    evidence_fingerprint: hash_a,
    source_content_hash: hash_b,
    claim_assertion_id: "fixture-assertion",
    rule_set_id: "prism-core-assertion",
    rule_set_version: "1.0.0",
    requested_checks: [
      "classify_support_state",
      "detect_contradictions",
      "identify_missing_evidence",
    ],
    originating_lighthouse_commit:
      process.env.RENDER_GIT_COMMIT ??
      "817be553ead1a573bc7025ac239e23099930042f",
    originating_lighthouse_runtime_version: "lighthouse-prism-bridge-1.0.0",
  };

  const support_request = {
    ...base,
    request_id: `${run_id}-support`,
    evidence_refs: [{
      evidence_id: "fixture-evidence-support",
      document_id: "fixture-document-support",
      evidence_fingerprint: hash_a,
      source_content_hash: hash_b,
      relationship: "supports",
    }],
  };
  const contradiction_request = {
    ...base,
    request_id: `${run_id}-contradiction`,
    evidence_refs: [
      {
        evidence_id: "fixture-evidence-support-2",
        document_id: "fixture-document-support-2",
        evidence_fingerprint: hash_a,
        source_content_hash: hash_b,
        relationship: "supports",
      },
      {
        evidence_id: "fixture-evidence-contradiction",
        document_id: "fixture-document-contradiction",
        evidence_fingerprint: hash_c,
        source_content_hash: hash_c,
        relationship: "contradicts",
      },
    ],
  };
  const incomplete_request = {
    ...base,
    request_id: `${run_id}-incomplete`,
    evidence_refs: [],
  };

  try {
    const support = await run_prism_verification(support_request);
    const contradiction = await run_prism_verification(contradiction_request);
    const incomplete = await run_prism_verification(incomplete_request);
    const duplicate = await run_prism_verification(support_request);

    let modified_input_conflict = false;
    try {
      await run_prism_verification({
        ...support_request,
        source_content_hash: hash_c,
      });
    } catch (error) {
      modified_input_conflict =
        error instanceof PrismBoundaryError &&
        error.failure_class === "request_id_conflict";
    }

    let degraded_visible = false;
    try {
      await run_prism_verification({
        ...base,
        request_id: `${run_id}-unavailable`,
        evidence_refs: [],
      }, {
        base_url: "http://127.0.0.1:1",
        timeout_ms: 250,
      });
    } catch (error) {
      degraded_visible =
        error instanceof PrismBoundaryError &&
        ["timeout", "network", "transient_upstream"].includes(error.failure_class);
    }

    const acceptance = {
      support_status_preserved: support.status === "supported_by_one_source",
      contradiction_preserved: contradiction.status === "contradicted",
      incomplete_preserved: incomplete.status === "incomplete",
      duplicate_receipt_reused:
        duplicate.verification_receipt_id === support.verification_receipt_id &&
        duplicate.output_hash === support.output_hash &&
        duplicate.idempotency_reused === true,
      modified_input_rejected: modified_input_conflict,
      outage_visible_as_degraded: degraded_visible,
      deterministic_replay:
        duplicate.output_hash === support.output_hash &&
        duplicate.deterministic_replay_key === support.deterministic_replay_key,
    };

    return res.json({
      ok: Object.values(acceptance).every(Boolean),
      run_id,
      acceptance,
      sample_request_ids: {
        support: support.request_id,
        contradiction: contradiction.request_id,
        incomplete: incomplete.request_id,
      },
      sample_receipt_ids: {
        support: support.verification_receipt_id,
        contradiction: contradiction.verification_receipt_id,
        incomplete: incomplete.verification_receipt_id,
      },
      sample_output_hashes: {
        support: support.output_hash,
        duplicate: duplicate.output_hash,
      },
      display_path: `/api/prism/verification-requests/${support.request_id}/view`,
    });
  } catch (error) {
    return boundary_response(res, error);
  }
});
