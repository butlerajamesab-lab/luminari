from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    file.write_text(text.replace(old, new, 1))


path = "server/engines/sovereign-export-spine-engine.ts"
text = Path(path).read_text()
text = text.replace(
    "  patterns: any[];\n  exportedAt: number;",
    "  patterns: any[];\n  registryTables: DataExport[];\n  exportedAt: number;",
)
old_sanitize = '''function sanitizeForExport(value: any): any {
  const sensitiveKeys = [
    "password", "secret", "token", "apikey", "api_key", "credential",
    "privatekey", "private_key", "jwt", "authorization", "cookie",
  ];
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(sanitizeForExport);
  if (value && typeof value === "object") {
    const sanitized: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
      sanitized[key] = sensitiveKeys.some((candidate) => normalized.includes(candidate))
        ? "ENV_PLACEHOLDER"
        : sanitizeForExport(item);
    }
    return sanitized;
  }
  return value;
}'''
new_sanitize = '''const SENSITIVE_EXPORT_KEYS = [
  "password", "secret", "token", "apikey", "api_key", "credential",
  "privatekey", "private_key", "jwt", "authorization", "cookie",
];

function sanitizeExportString(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return stringify_spine_json(sanitizeForExport(JSON.parse(trimmed)), 0);
    } catch {
      // Preserve ordinary text that only resembles JSON.
    }
  }
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (SENSITIVE_EXPORT_KEYS.some((candidate) => normalized.includes(candidate))) {
        url.searchParams.set(key, "ENV_PLACEHOLDER");
      }
    }
    return url.toString();
  } catch {
    return value.replace(
      /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      "ENV_PLACEHOLDER",
    );
  }
}

function sanitizeForExport(value: any): any {
  if (typeof value === "string") return sanitizeExportString(value);
  if (Array.isArray(value)) return value.map(sanitizeForExport);
  if (value && typeof value === "object") {
    const sanitized: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
      sanitized[key] = SENSITIVE_EXPORT_KEYS.some((candidate) => normalized.includes(candidate))
        ? "ENV_PLACEHOLDER"
        : sanitizeForExport(item);
    }
    return sanitized;
  }
  return value;
}'''
if text.count(old_sanitize) != 1:
    raise RuntimeError("sanitize block not found")
text = text.replace(old_sanitize, new_sanitize, 1)
text = text.replace(
    '''  return sanitizeForExport({
    engines:''',
    '''  const registryTables = await mapWithConcurrency(
    ["engine_registry", "data_stream_registry", "signal_registry", "pattern_registry"],
    2,
    (table) => exportTableData(table, 100_000),
  );

  return sanitizeForExport({
    engines:''',
    1,
)
text = text.replace(
    '''    patterns: patterns.map((pattern: any) => ({
      patternId: pattern.patternId,
      patternName: pattern.patternName,
      patternType: pattern.patternType,
      signalType: pattern.signalType,
      triggerThreshold: pattern.triggerThreshold,
      confidenceThreshold: pattern.confidenceThreshold,
      jurisdictionScope: pattern.jurisdictionScope,
    })),
    exportedAt: Date.now(),''',
    '''    patterns: patterns.map((pattern: any) => ({
      patternId: pattern.patternId,
      patternName: pattern.patternName,
      patternType: pattern.patternType,
      signalType: pattern.signalType,
      triggerThreshold: pattern.triggerThreshold,
      confidenceThreshold: pattern.confidenceThreshold,
      jurisdictionScope: pattern.jurisdictionScope,
    })),
    registryTables,
    exportedAt: Date.now(),''',
    1,
)
text = text.replace("  limit = 10_000,", "  limit = 100_000,", 1)
old_data = '''      bundle.data = await mapWithConcurrency(
        existingConfigTables,
        2,
        (table) => exportTableData(table),
      );
      bundle.dataPolicy = {
        allowlistedTables: existingConfigTables,
        absentAllowlistedTables: SPINE_CONFIG_TABLES.filter(
          (table) => !inventory.has(table),
        ),
        rowLimitPerTable: 10_000,
      };'''
new_data = '''      const dataExports = await mapWithConcurrency(
        existingConfigTables,
        2,
        (table) => exportTableData(table, 100_000),
      );
      const truncatedTables = dataExports
        .filter((table) => table.truncated)
        .map((table) => table.tableName);
      if (truncatedTables.length > 0) {
        throw new Error(
          `Full Spine export refused an incomplete bundle; row limit exceeded for: ${truncatedTables.join(", ")}`,
        );
      }
      bundle.data = dataExports;
      bundle.dataPolicy = {
        allowlistedTables: existingConfigTables,
        absentAllowlistedTables: SPINE_CONFIG_TABLES.filter(
          (table) => !inventory.has(table),
        ),
        rowLimitPerTable: 100_000,
        truncatedTables: [],
      };'''
if text.count(old_data) != 1:
    raise RuntimeError("full data export block not found")
text = text.replace(old_data, new_data, 1)
Path(path).write_text(text)

replace_once(
    "server/engines/spine-postgres.ts",
    "  limit = 10_000,\n): Promise<spine_table_data> {\n  const table_name = assert_spine_identifier(tableName, \"table name\");\n  const bounded_limit = Math.min(50_000, Math.max(1, Math.floor(limit)));",
    "  limit = 100_000,\n): Promise<spine_table_data> {\n  const table_name = assert_spine_identifier(tableName, \"table name\");\n  const bounded_limit = Math.min(250_000, Math.max(1, Math.floor(limit)));",
    "postgres export row bound",
)

print("Sovereign Spine export finalized")
