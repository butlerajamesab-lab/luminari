const install_key = "__luminari_mission_control_population_compat_v1__";

type mutable_record = Record<string, unknown>;

function is_record(value: unknown): value is mutable_record {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalize_population_summary(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalize_population_summary);
  }

  if (!is_record(value)) return value;

  const normalized: mutable_record = {};
  for (const [key, child] of Object.entries(value)) {
    normalized[key] = normalize_population_summary(child);
  }

  if ("overall_coverage" in normalized && !("overallCoverage" in normalized)) {
    normalized.overallCoverage = normalized.overall_coverage;
  }
  if ("critically_low" in normalized && !("criticallyLow" in normalized)) {
    normalized.criticallyLow = normalized.critically_low;
  }
  if ("under_populated" in normalized && !("underPopulated" in normalized)) {
    normalized.underPopulated = normalized.under_populated;
  }

  return normalized;
}

export function install_mission_control_population_compat(): void {
  if (typeof window === "undefined") return;

  const runtime = window as typeof window & Record<string, unknown>;
  if (runtime[install_key]) return;
  runtime[install_key] = true;

  const original_fetch = window.fetch.bind(window);

  window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const response = await original_fetch(...args);
    const request_url = typeof args[0] === "string"
      ? args[0]
      : args[0] instanceof URL
        ? args[0].toString()
        : args[0].url;

    if (!request_url.includes("knowledgeIngestion.populationStats")) {
      return response;
    }

    try {
      const payload = await response.clone().json();
      const normalized_payload = normalize_population_summary(payload);
      const headers = new Headers(response.headers);
      headers.delete("content-length");

      return new Response(JSON.stringify(normalized_payload), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch {
      return response;
    }
  };
}
