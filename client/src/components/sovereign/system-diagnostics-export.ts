/**
 * Owner-triggered, read-only snapshot of the existing administrator diagnostics.
 * Uses the installed same-origin Supabase REST authentication transport; it does
 * not introduce a new endpoint or expand the server-to-server read-token scope.
 */
export const SYSTEM_DIAGNOSTIC_EXPORT_PATHS = [
  "/api/system/health",
  "/api/system/routes",
  "/api/system/schema",
] as const;

type DiagnosticPath = (typeof SYSTEM_DIAGNOSTIC_EXPORT_PATHS)[number];
type JsonObject = Record<string, unknown>;

export type SystemDiagnosticExport = {
  format: "lighthouse_system_diagnostics_v1";
  exported_at: string;
  source_paths: readonly DiagnosticPath[];
  health: JsonObject;
  routes: JsonObject;
  schema: JsonObject;
};

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasText(value: JsonObject, field: string): boolean {
  return typeof value[field] === "string" && (value[field] as string).length > 0;
}

function isCompleteCollection(
  value: unknown,
  requiredFields: readonly string[],
): boolean {
  if (!isObject(value) || !Array.isArray(value.items)) return false;
  if (typeof value.total !== "number" || !Number.isSafeInteger(value.total) || value.total < 0) return false;
  if (value.total !== value.items.length) return false;
  return value.items.every(
    (item: unknown) =>
      isObject(item) &&
      !("error" in item) &&
      requiredFields.every((field) => hasText(item, field)),
  );
}

function requireValidResponse(path: DiagnosticPath, value: unknown): JsonObject {
  if (!isObject(value) || "error" in value) {
    throw new Error(`${path} returned an invalid diagnostic response.`);
  }

  if (path === "/api/system/health") {
    if (!hasText(value, "status") || !hasText(value, "database") || !hasText(value, "timestamp")) {
      throw new Error(`${path} returned an incomplete health response.`);
    }
  } else if (path === "/api/system/routes") {
    const frontend = isObject(value.frontend) ? value.frontend : null;
    const backend = isObject(value.backend) ? value.backend : null;
    const validRoutes =
      hasText(value, "timestamp") &&
      frontend !== null &&
      backend !== null &&
      Array.isArray(frontend.routes) &&
      Array.isArray(backend.mounts) &&
      typeof frontend.total === "number" &&
      typeof backend.total === "number" &&
      Number.isSafeInteger(frontend.total) &&
      Number.isSafeInteger(backend.total) &&
      frontend.total === frontend.routes.length &&
      backend.total === backend.mounts.length &&
      frontend.routes.every((item: unknown) =>
        isObject(item) && !("error" in item) &&
        hasText(item, "path") && hasText(item, "component_slug") &&
        hasText(item, "layer") && typeof item.registered === "boolean"
      ) &&
      backend.mounts.every((item: unknown) =>
        isObject(item) && !("error" in item) &&
        hasText(item, "method") && hasText(item, "path") && hasText(item, "source")
      );
    if (!validRoutes) {
      throw new Error(`${path} returned an incomplete route inventory.`);
    }
  } else if (
    !hasText(value, "timestamp") ||
    !isCompleteCollection(value.tables, ["table_name"]) ||
    !isCompleteCollection(value.views, ["view_name"]) ||
    !isCompleteCollection(value.foreign_keys, [
      "source_table", "source_column", "target_table", "target_column",
    ])
  ) {
    // safeQuery can return [{ error }] with HTTP 200: never export it as a
    // successful one-item schema inventory or a misleading zero count.
    throw new Error(`${path} returned a failed or incomplete schema inventory.`);
  }
  return value;
}

async function readSection(path: DiagnosticPath): Promise<JsonObject> {
  const response = await fetch(path, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    const authorization = response.status === 401 || response.status === 403
      ? " (administrator authentication required)"
      : "";
    throw new Error(`${path} returned HTTP ${response.status}${authorization}.`);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`${path} did not return valid JSON.`);
  }
  return requireValidResponse(path, body);
}

export async function fetchSystemDiagnosticExport(): Promise<SystemDiagnosticExport> {
  // On-demand and sequential: avoid adding concurrent database diagnostic load.
  const health = await readSection("/api/system/health");
  const routes = await readSection("/api/system/routes");
  const schema = await readSection("/api/system/schema");
  return {
    format: "lighthouse_system_diagnostics_v1",
    exported_at: new Date().toISOString(),
    source_paths: SYSTEM_DIAGNOSTIC_EXPORT_PATHS,
    health,
    routes,
    schema,
  };
}
