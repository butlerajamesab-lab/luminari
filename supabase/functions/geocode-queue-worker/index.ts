import { createClient } from "npm:@supabase/supabase-js@2.49.8";

type QueueRow = {
  id: number;
  entity_domain: string;
  entity_id: string;
  address_text: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  attempts: number;
};

type QueueStatus = "pending" | "completed" | "failed";

type GeocodeOutcome =
  | { kind: "success"; lat: number; lon: number; precision: string }
  | { kind: "no_result" }
  | { kind: "permanent_error"; status: number }
  | { kind: "retryable_error"; status: number | null; reason: string };

type QueueTransitionResult =
  | { ok: true }
  | { ok: false; reason: string };

type CronAuthorizationOutcome =
  | { kind: "authorized"; elapsed_ms: number }
  | { kind: "rejected"; elapsed_ms: number }
  | { kind: "unavailable"; elapsed_ms: number; reason: string };

type SupabaseAdminClient = ReturnType<typeof createClient>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function buildAddress(row: QueueRow): string {
  return [row.address_text, row.city, row.state, row.postal_code, row.country]
    .map((value) => (value ?? "").trim())
    .filter((value) => value.length > 0)
    .join(", ");
}

function isLikelyGeocodable(address: string): boolean {
  return address.length >= 3 && /[a-zA-Z]/.test(address);
}

function geocodePrecision(type: unknown): string {
  return type === "house" || type === "building"
    ? "rooftop"
    : type === "road"
      ? "street"
      : type === "postcode"
        ? "zip"
        : type === "city" || type === "town"
          ? "city"
          : type === "county"
            ? "county"
            : type === "state"
              ? "state"
              : "unknown";
}

async function verifyCronSecret(
  supabaseUrl: string,
  serviceRoleKey: string,
  candidate: string,
): Promise<CronAuthorizationOutcome> {
  const startedAt = Date.now();
  let lastReason = "verifier_request_failed";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/rpc/verify_geocode_worker_cron_secret`,
        {
          method: "POST",
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ p_candidate: candidate }),
          signal: controller.signal,
        },
      );
      clearTimeout(timeout);

      const responseText = await response.text();
      if (response.ok) {
        let verified: unknown;
        try {
          verified = JSON.parse(responseText);
        } catch {
          return {
            kind: "unavailable",
            elapsed_ms: Date.now() - startedAt,
            reason: "verifier_invalid_json",
          };
        }

        if (verified === true) {
          return { kind: "authorized", elapsed_ms: Date.now() - startedAt };
        }
        if (verified === false) {
          return { kind: "rejected", elapsed_ms: Date.now() - startedAt };
        }
        return {
          kind: "unavailable",
          elapsed_ms: Date.now() - startedAt,
          reason: "verifier_invalid_payload",
        };
      }

      const retryable = response.status === 408 || response.status === 425 ||
        response.status === 429 || response.status >= 500;
      lastReason = `verifier_http_${response.status}`;
      if (!retryable || attempt === 2) {
        return {
          kind: "unavailable",
          elapsed_ms: Date.now() - startedAt,
          reason: lastReason,
        };
      }
    } catch (error) {
      clearTimeout(timeout);
      lastReason = error instanceof DOMException && error.name === "AbortError"
        ? "verifier_timeout"
        : "verifier_network_error";
      if (attempt === 2) {
        return {
          kind: "unavailable",
          elapsed_ms: Date.now() - startedAt,
          reason: lastReason,
        };
      }
    }

    await sleep(250);
  }

  return {
    kind: "unavailable",
    elapsed_ms: Date.now() - startedAt,
    reason: lastReason,
  };
}

async function geocode(address: string): Promise<GeocodeOutcome> {
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "supabase-geocode-queue-worker/1.0" },
    });

    if (
      response.status === 408 ||
      response.status === 425 ||
      response.status === 429 ||
      response.status >= 500
    ) {
      return {
        kind: "retryable_error",
        status: response.status,
        reason: "transient_geocoder_response",
      };
    }

    if (!response.ok) {
      return { kind: "permanent_error", status: response.status };
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return {
        kind: "retryable_error",
        status: response.status,
        reason: "invalid_geocoder_payload",
      };
    }

    if (!Array.isArray(data) || data.length === 0) {
      return { kind: "no_result" };
    }

    const item = data[0] as { lat?: unknown; lon?: unknown; type?: unknown };
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return { kind: "no_result" };
    }

    return {
      kind: "success",
      lat,
      lon,
      precision: geocodePrecision(item.type),
    };
  } catch (error) {
    return {
      kind: "retryable_error",
      status: null,
      reason: error instanceof Error ? error.message : "geocoder_fetch_failed",
    };
  }
}

async function transitionQueueStatus(
  supabase: SupabaseAdminClient,
  row: QueueRow,
  queueStatus: QueueStatus,
  requireProcessing = true,
): Promise<QueueTransitionResult> {
  const attemptCount = Math.max(0, row.attempts) + 1;
  let lastReason = "queue_transition_failed";

  for (let transitionAttempt = 0; transitionAttempt < 2; transitionAttempt += 1) {
    const baseQuery = supabase
      .from("coordinate_enrichment_queue_v1")
      .update({
        queue_status: queueStatus,
        last_attempt_at: new Date().toISOString(),
        attempts: attemptCount,
      })
      .eq("id", row.id);

    const { data, error } = requireProcessing
      ? await baseQuery.eq("queue_status", "processing").select("id")
      : await baseQuery.select("id");

    if (!error && Array.isArray(data) && data.length === 1) {
      return { ok: true };
    }

    lastReason = error?.message ??
      `queue_transition_row_count_${Array.isArray(data) ? data.length : 0}`;
  }

  return { ok: false, reason: lastReason };
}

async function readQueueStatus(
  supabase: SupabaseAdminClient,
  rowId: number,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("coordinate_enrichment_queue_v1")
    .select("queue_status")
    .eq("id", rowId)
    .maybeSingle();

  if (error || !data || typeof data.queue_status !== "string") {
    return null;
  }

  return data.queue_status;
}

async function recoverPending(
  supabase: SupabaseAdminClient,
  row: QueueRow,
): Promise<QueueTransitionResult> {
  const currentStatus = await readQueueStatus(supabase, row.id);
  if (currentStatus === "pending") {
    return { ok: true };
  }
  if (currentStatus !== "processing") {
    return {
      ok: false,
      reason: currentStatus === null
        ? "queue_status_unavailable"
        : `queue_status_not_recoverable_${currentStatus}`,
    };
  }

  return transitionQueueStatus(supabase, row, "pending");
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "missing_admin_connection" }, 500);
    }

    // The worker is invoked by pg_cron/pg_net rather than a signed-in user.
    // Platform JWT verification is disabled for this deployment, but no queue
    // read or write occurs before the dedicated Vault-backed credential is
    // verified through the service-role-only PostgreSQL RPC.
    const cronSecret = request.headers.get("x-cron-secret")?.trim() ?? "";
    if (!cronSecret) {
      console.warn(JSON.stringify({
        event: "geocode_worker_cron_auth",
        outcome: "rejected",
        reason: "missing_cron_secret_header",
      }));
      return json({
        error: "unauthorized",
        diagnostic_code: "missing_cron_secret_header",
      }, 401);
    }

    const authorization = await verifyCronSecret(
      supabaseUrl,
      serviceRoleKey,
      cronSecret,
    );
    if (authorization.kind === "unavailable") {
      console.error(JSON.stringify({
        event: "geocode_worker_cron_auth",
        outcome: "unavailable",
        reason: authorization.reason,
        elapsed_ms: authorization.elapsed_ms,
      }));
      return json({
        error: "authorization_service_unavailable",
        diagnostic_code: authorization.reason,
      }, 503);
    }
    if (authorization.kind === "rejected") {
      console.warn(JSON.stringify({
        event: "geocode_worker_cron_auth",
        outcome: "rejected",
        reason: "verifier_rejected",
        elapsed_ms: authorization.elapsed_ms,
      }));
      return json({
        error: "unauthorized",
        diagnostic_code: "verifier_rejected",
      }, 401);
    }

    console.info(JSON.stringify({
      event: "geocode_worker_cron_auth",
      outcome: "authorized",
      elapsed_ms: authorization.elapsed_ms,
    }));

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const url = new URL(request.url);
    const requestedBatchSize = Number(url.searchParams.get("batch_size") ?? "50");
    const batchSize = Math.min(
      Number.isFinite(requestedBatchSize) ? Math.max(1, requestedBatchSize) : 50,
      200,
    );

    const { data: pending, error: fetchError } = await supabase
      .from("coordinate_enrichment_queue_v1")
      .select(
        "id, entity_domain, entity_id, address_text, city, state, postal_code, country, attempts",
      )
      .eq("queue_status", "pending")
      .order("id", { ascending: true })
      .limit(batchSize);

    if (fetchError) throw fetchError;
    const pendingRows = (pending ?? []) as QueueRow[];
    if (pendingRows.length === 0) {
      return json({
        claimed: 0,
        completed: 0,
        failed: 0,
        requeued: 0,
        queue_update_failures: 0,
        message: "No pending rows",
      });
    }

    const ids = pendingRows.map((row) => row.id);
    const { data: claimed, error: claimError } = await supabase
      .from("coordinate_enrichment_queue_v1")
      .update({
        queue_status: "processing",
        last_attempt_at: new Date().toISOString(),
      })
      .in("id", ids)
      .eq("queue_status", "pending")
      .select(
        "id, entity_domain, entity_id, address_text, city, state, postal_code, country, attempts",
      );

    if (claimError) throw claimError;

    let completed = 0;
    let failed = 0;
    let requeued = 0;
    let queueUpdateFailures = 0;

    for (const row of (claimed ?? []) as QueueRow[]) {
      try {
        const fullAddress = buildAddress(row);
        if (!isLikelyGeocodable(fullAddress)) {
          const transition = await transitionQueueStatus(
            supabase,
            row,
            "failed",
          );
          if (!transition.ok) {
            throw new Error(`invalid_address_transition_failed:${transition.reason}`);
          }
          failed += 1;
          continue;
        }

        const outcome = await geocode(fullAddress);

        if (outcome.kind === "retryable_error") {
          const transition = await recoverPending(supabase, row);
          if (!transition.ok) {
            queueUpdateFailures += 1;
          } else {
            requeued += 1;
          }
          continue;
        }

        if (
          outcome.kind === "no_result" ||
          outcome.kind === "permanent_error"
        ) {
          const transition = await transitionQueueStatus(
            supabase,
            row,
            "failed",
          );
          if (!transition.ok) {
            throw new Error(`terminal_geocode_transition_failed:${transition.reason}`);
          }
          failed += 1;
          continue;
        }

        if (
          row.entity_domain === "normalized_civic_resource" ||
          row.entity_domain === "civic"
        ) {
          const { data: updated, error: updateError } = await supabase
            .from("normalized_civic_resource")
            .update({
              latitude: outcome.lat,
              longitude: outcome.lon,
              geocode_precision: outcome.precision,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.entity_id)
            .select("id");

          if (updateError || !updated || updated.length === 0) {
            const transition = await transitionQueueStatus(
              supabase,
              row,
              "failed",
            );
            if (!transition.ok) {
              throw new Error(`resource_update_transition_failed:${transition.reason}`);
            }
            failed += 1;
            continue;
          }
        } else {
          const transition = await transitionQueueStatus(
            supabase,
            row,
            "failed",
          );
          if (!transition.ok) {
            throw new Error(`unsupported_domain_transition_failed:${transition.reason}`);
          }
          failed += 1;
          continue;
        }

        const completionTransition = await transitionQueueStatus(
          supabase,
          row,
          "completed",
        );

        if (!completionTransition.ok) {
          const currentStatus = await readQueueStatus(supabase, row.id);
          if (currentStatus === "completed") {
            completed += 1;
            continue;
          }

          const recovery = await recoverPending(supabase, row);
          if (!recovery.ok) {
            queueUpdateFailures += 1;
          } else {
            requeued += 1;
          }
          continue;
        }

        completed += 1;
      } catch {
        const recovery = await recoverPending(supabase, row);
        if (!recovery.ok) {
          queueUpdateFailures += 1;
        } else {
          requeued += 1;
        }
      }
    }

    return json({
      claimed: claimed?.length ?? 0,
      completed,
      failed,
      requeued,
      queue_update_failures: queueUpdateFailures,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
