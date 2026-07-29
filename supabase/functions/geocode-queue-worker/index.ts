import postgres from "npm:postgres@3.4.5";

type QueueRow = {
  id: string;
  entity_domain: string;
  entity_id: string;
  address_text: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  attempts: number;
};

type GeocodeOutcome =
  | { kind: "success"; lat: number; lon: number; precision: string }
  | { kind: "no_result" }
  | { kind: "permanent_error"; status: number }
  | { kind: "retryable_error"; status: number | null; reason: string };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildAddress(row: QueueRow): string {
  return [row.address_text, row.city, row.state, row.postal_code, row.country]
    .map((value) => (value ?? "").trim())
    .filter(Boolean)
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

async function geocode(address: string): Promise<GeocodeOutcome> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "luminari-geocode-worker/1.0" },
    });
    if ([408, 425, 429].includes(response.status) || response.status >= 500) {
      return {
        kind: "retryable_error",
        status: response.status,
        reason: "transient_geocoder_response",
      };
    }
    if (!response.ok) return { kind: "permanent_error", status: response.status };

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
    if (!Array.isArray(data) || data.length === 0) return { kind: "no_result" };

    const item = data[0] as { lat?: unknown; lon?: unknown; type?: unknown };
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { kind: "no_result" };
    return { kind: "success", lat, lon, precision: geocodePrecision(item.type) };
  } catch (error) {
    return {
      kind: "retryable_error",
      status: null,
      reason: error instanceof Error ? error.message : "geocoder_fetch_failed",
    };
  }
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const connectionString = Deno.env.get("SUPABASE_DB_URL");
  if (!connectionString) return json({ error: "missing_database_connection" }, 500);

  const sql = postgres(connectionString, {
    max: 1,
    prepare: false,
    idle_timeout: 5,
    connect_timeout: 10,
  });

  try {
    const cronSecret = request.headers.get("x-cron-secret")?.trim() ?? "";
    if (!cronSecret) return json({ error: "unauthorized" }, 401);

    const verification = await sql<{ authorized: boolean }[]>`
      select public.verify_geocode_worker_cron_secret(${cronSecret}) as authorized
    `;
    if (verification[0]?.authorized !== true) return json({ error: "unauthorized" }, 401);

    const url = new URL(request.url);
    const requestedBatchSize = Number(url.searchParams.get("batch_size") ?? "10");
    const batchSize = Math.min(
      Number.isFinite(requestedBatchSize) ? Math.max(1, requestedBatchSize) : 10,
      25,
    );

    const claimed = await sql.begin(async (tx) => {
      return await tx<QueueRow[]>`
        with picked as (
          select id
          from public.coordinate_enrichment_queue_v1
          where queue_status = 'pending'
            and coalesce(attempts, 0) < 5
          order by id
          limit ${batchSize}
          for update skip locked
        )
        update public.coordinate_enrichment_queue_v1 q
        set queue_status = 'processing',
            attempts = coalesce(q.attempts, 0) + 1,
            last_attempt_at = now()
        from picked
        where q.id = picked.id
        returning q.id::text, q.entity_domain, q.entity_id, q.address_text,
                  q.city, q.state, q.postal_code, q.country, q.attempts
      `;
    });

    if (claimed.length === 0) {
      return json({
        claimed: 0,
        completed: 0,
        failed: 0,
        requeued: 0,
        finalize_failures: 0,
        message: "No claimable rows",
      });
    }

    let completed = 0;
    let failed = 0;
    let requeued = 0;
    let finalizeFailures = 0;

    for (const row of claimed) {
      try {
        const address = buildAddress(row);
        if (!isLikelyGeocodable(address)) {
          const result = await sql`
            update public.coordinate_enrichment_queue_v1
            set queue_status = 'failed', last_attempt_at = now()
            where id = ${row.id}::bigint and queue_status = 'processing'
            returning id
          `;
          if (result.length === 1) failed += 1;
          else finalizeFailures += 1;
          continue;
        }

        const outcome = await geocode(address);
        if (outcome.kind === "retryable_error") {
          const result = await sql`
            update public.coordinate_enrichment_queue_v1
            set queue_status = 'pending', last_attempt_at = now()
            where id = ${row.id}::bigint and queue_status = 'processing'
            returning id
          `;
          if (result.length === 1) requeued += 1;
          else finalizeFailures += 1;
          continue;
        }

        if (outcome.kind === "no_result" || outcome.kind === "permanent_error") {
          const result = await sql`
            update public.coordinate_enrichment_queue_v1
            set queue_status = 'failed', last_attempt_at = now()
            where id = ${row.id}::bigint and queue_status = 'processing'
            returning id
          `;
          if (result.length === 1) failed += 1;
          else finalizeFailures += 1;
          continue;
        }

        const finalized = await sql.begin(async (tx) => {
          if (row.entity_domain !== "normalized_civic_resource" && row.entity_domain !== "civic") {
            const queueRows = await tx`
              update public.coordinate_enrichment_queue_v1
              set queue_status = 'failed', last_attempt_at = now()
              where id = ${row.id}::bigint and queue_status = 'processing'
              returning id
            `;
            return queueRows.length === 1 ? "failed" : "finalize_failure";
          }

          const resourceRows = await tx`
            update public.normalized_civic_resource
            set latitude = ${outcome.lat},
                longitude = ${outcome.lon},
                geocode_precision = ${outcome.precision},
                updated_at = now()
            where id = ${row.entity_id}
            returning id
          `;
          const targetStatus = resourceRows.length === 1 ? "completed" : "failed";
          const queueRows = await tx`
            update public.coordinate_enrichment_queue_v1
            set queue_status = ${targetStatus}, last_attempt_at = now()
            where id = ${row.id}::bigint and queue_status = 'processing'
            returning id
          `;
          return queueRows.length === 1 ? targetStatus : "finalize_failure";
        });

        if (finalized === "completed") completed += 1;
        else if (finalized === "failed") failed += 1;
        else finalizeFailures += 1;
      } catch {
        const result = await sql`
          update public.coordinate_enrichment_queue_v1
          set queue_status = 'pending', last_attempt_at = now()
          where id = ${row.id}::bigint and queue_status = 'processing'
          returning id
        `;
        if (result.length === 1) requeued += 1;
        else finalizeFailures += 1;
      }
    }

    return json({
      claimed: claimed.length,
      completed,
      failed,
      requeued,
      finalize_failures: finalizeFailures,
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "unknown_worker_error" },
      500,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
});
