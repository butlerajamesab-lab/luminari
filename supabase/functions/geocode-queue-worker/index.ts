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
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

async function geocode(
  address: string,
): Promise<{ lat: number; lon: number; precision: string } | null> {
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "supabase-geocode-queue-worker/1.0" },
  });
  if (!response.ok) return null;

  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  const item = data[0];
  const lat = Number(item.lat);
  const lon = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const precision = item.type === "house" || item.type === "building"
    ? "rooftop"
    : item.type === "road"
      ? "street"
      : item.type === "postcode"
        ? "zip"
        : item.type === "city" || item.type === "town"
          ? "city"
          : item.type === "county"
            ? "county"
            : item.type === "state"
              ? "state"
              : "unknown";

  return { lat, lon, precision };
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

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // The worker is invoked by pg_cron/pg_net rather than a signed-in user.
    // Platform JWT verification is therefore disabled for this deployment, but
    // no queue access occurs until the dedicated Vault-backed secret is checked
    // by a service-role-only RPC.
    const cronSecret = request.headers.get("x-cron-secret")?.trim() ?? "";
    if (!cronSecret) {
      return json({ error: "unauthorized" }, 401);
    }

    const { data: authorized, error: authorizationError } = await supabase.rpc(
      "verify_geocode_worker_cron_secret",
      { p_candidate: cronSecret },
    );
    if (authorizationError || authorized !== true) {
      return json({ error: "unauthorized" }, 401);
    }

    const url = new URL(request.url);
    const requestedBatchSize = Number(url.searchParams.get("batch_size") ?? "50");
    const batchSize = Math.min(
      Number.isFinite(requestedBatchSize) ? Math.max(1, requestedBatchSize) : 50,
      200,
    );

    const { data: pending, error: fetchError } = await supabase
      .from("coordinate_enrichment_queue_v1")
      .select(
        "id, entity_domain, entity_id, address_text, city, state, postal_code, country",
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
        "id, entity_domain, entity_id, address_text, city, state, postal_code, country",
      );

    if (claimError) throw claimError;

    let completed = 0;
    let failed = 0;

    for (const row of (claimed ?? []) as QueueRow[]) {
      try {
        const fullAddress = buildAddress(row);
        if (!isLikelyGeocodable(fullAddress)) {
          await supabase
            .from("coordinate_enrichment_queue_v1")
            .update({
              queue_status: "failed",
              last_attempt_at: new Date().toISOString(),
              attempts: 1,
            })
            .eq("id", row.id);
          failed += 1;
          continue;
        }

        const result = await geocode(fullAddress);
        if (!result) {
          await supabase
            .from("coordinate_enrichment_queue_v1")
            .update({
              queue_status: "failed",
              last_attempt_at: new Date().toISOString(),
              attempts: 1,
            })
            .eq("id", row.id);
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
              latitude: result.lat,
              longitude: result.lon,
              geocode_precision: result.precision,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.entity_id)
            .select("id");

          if (updateError || !updated || updated.length === 0) {
            await supabase
              .from("coordinate_enrichment_queue_v1")
              .update({
                queue_status: "failed",
                last_attempt_at: new Date().toISOString(),
                attempts: 1,
              })
              .eq("id", row.id);
            failed += 1;
            continue;
          }
        } else {
          await supabase
            .from("coordinate_enrichment_queue_v1")
            .update({
              queue_status: "failed",
              last_attempt_at: new Date().toISOString(),
              attempts: 1,
            })
            .eq("id", row.id);
          failed += 1;
          continue;
        }

        await supabase
          .from("coordinate_enrichment_queue_v1")
          .update({
            queue_status: "completed",
            last_attempt_at: new Date().toISOString(),
            attempts: 1,
          })
          .eq("id", row.id);
        completed += 1;
      } catch {
        await supabase
          .from("coordinate_enrichment_queue_v1")
          .update({
            queue_status: "failed",
            last_attempt_at: new Date().toISOString(),
            attempts: 1,
          })
          .eq("id", row.id);
        failed += 1;
      }
    }

    return json({ claimed: claimed?.length ?? 0, completed, failed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
