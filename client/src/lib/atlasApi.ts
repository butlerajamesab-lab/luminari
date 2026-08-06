import { authenticatedFetch } from "@/lib/session-token";

export interface AtlasHealth {
  status?: string;
  service?: string;
  version?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface AtlasCatalogStream {
  stream_id: string;
  stream_name?: string;
  stream_type?: string;
  source_url?: string;
  api_url?: string;
  update_frequency?: string;
  field_mapping?: Record<string, unknown>;
  jurisdiction?: string;
  domain?: string;
  [key: string]: unknown;
}

export interface AtlasCatalog {
  streams?: AtlasCatalogStream[];
  total_streams?: number;
  by_domain?: Record<string, number>;
  by_jurisdiction?: Record<string, number>;
  [key: string]: unknown;
}

export interface AtlasPopulationResult {
  created_stream_ids?: string[];
  skipped_stream_ids?: string[];
  failed_stream_ids?: string[];
  total_selected?: number;
  errors?: Record<string, string> | string[];
  [key: string]: unknown;
}

async function readAtlasResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();

  if (!response.ok) {
    let detail = body.slice(0, 240).trim();

    if (contentType.includes("application/json") && body) {
      try {
        const parsed = JSON.parse(body) as {
          error?: unknown;
          message?: unknown;
          detail?: unknown;
        };
        const parsedDetail = parsed.error ?? parsed.message ?? parsed.detail;
        if (typeof parsedDetail === "string") {
          detail = parsedDetail;
        }
      } catch {
        // Fall through to the short body preview below.
      }
    }

    throw new Error(
      `Atlas request failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`,
    );
  }

  if (!body) {
    return {} as T;
  }

  if (!contentType.includes("application/json")) {
    throw new Error(
      `Atlas returned non-JSON response (${response.status} ${response.statusText}): ${body.slice(0, 240).trim()}`,
    );
  }

  try {
    return JSON.parse(body) as T;
  } catch (error) {
    throw new Error(
      `Atlas returned invalid JSON (${response.status} ${response.statusText}): ${(error as Error).message}`,
    );
  }
}

async function atlasFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(`/api/atlas${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  return readAtlasResponse<T>(response);
}

export function getAtlasHealth(): Promise<AtlasHealth> {
  return atlasFetch<AtlasHealth>("/health");
}

export function getAtlasCatalog(): Promise<AtlasCatalog> {
  return atlasFetch<AtlasCatalog>("/catalog");
}

export function populateAtlasStreams(
  streamIds?: string[],
): Promise<AtlasPopulationResult> {
  const body =
    streamIds && streamIds.length > 0 ? { stream_ids: streamIds } : {};

  return atlasFetch<AtlasPopulationResult>("/populate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function triggerAtlasBridgeDrain(): Promise<AtlasPopulationResult> {
  return atlasFetch<AtlasPopulationResult>("/bridge-drain", {
    method: "POST",
  });
}
