from pathlib import Path
import re


def replace_once(path: str, old: str, new: str, label: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    target.write_text(text.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str, label: str) -> None:
    target = Path(path)
    text = target.read_text()
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    target.write_text(updated)


# Exporter: static civic policy and Date preservation.
replace_once(
    "server/engines/sovereign-export-spine-engine-v2.ts",
    '''import {
  SPINE_CONFIG_TABLES,
  type spine_table_data,''',
    '''import {
  type spine_table_data,''',
    "remove mixed export allowlist import",
)
replace_once(
    "server/engines/sovereign-export-spine-engine-v2.ts",
    '''} from "./spine-postgres";
import {''',
    '''} from "./spine-postgres";
import { SPINE_STATIC_CIVIC_TABLES } from "./spine-static-table-policy";
import {''',
    "add static civic export policy",
)
replace_once(
    "server/engines/sovereign-export-spine-engine-v2.ts",
    '''export function sanitize_spine_export_value(value: any): any {
  if (typeof value === "string") return sanitizeExportString(value);''',
    '''export function sanitize_spine_export_value(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return sanitizeExportString(value);''',
    "preserve Date values",
)
exporter_path = Path("server/engines/sovereign-export-spine-engine-v2.ts")
exporter = exporter_path.read_text().replace(
    "SPINE_CONFIG_TABLES",
    "SPINE_STATIC_CIVIC_TABLES",
)
exporter_path.write_text(exporter)

# Bundle override: waive only absent signatures, never invalid signatures.
replace_once(
    "server/engines/spine-bundle-contract.ts",
    '''  const executable =
    checksumValid &&
    metadataValid &&
    formatValid &&
    databaseValid &&
    (signatureValid || legacyOverride);''',
    '''  const signatureAbsent =
    manifest.signature === undefined ||
    manifest.signature === null ||
    manifest.signature === "";
  const executable =
    checksumValid &&
    metadataValid &&
    formatValid &&
    databaseValid &&
    (signatureValid || (legacyOverride && signatureAbsent));''',
    "bound unsigned override",
)

# Restore engine: use shared registry policy and static-only data wrapper.
restore_path = "server/engines/sovereign-restore-spine-engine.ts"
replace_once(
    restore_path,
    '''  restore_spine_table_data,
  type spine_table_data,''',
    '''  type spine_table_data,''',
    "remove broad data restore import",
)
replace_once(
    restore_path,
    '''} from "./spine-postgres";
import {''',
    '''} from "./spine-postgres";
import {
  get_spine_registry_policy,
  resolve_registry_identity_column,
  select_spine_registry_write_row,
} from "./spine-registry-policy";
import { restore_static_spine_table_data } from "./spine-static-table-policy";
export { resolve_registry_identity_column } from "./spine-registry-policy";
import {''',
    "add shared restore policies",
)
regex_once(
    restore_path,
    r'''type registry_restore_policy = \{.*?export function resolve_registry_identity_column\(.*?\n\}\n\nexport function parseBundleJson''',
    '''export function parseBundleJson''',
    "remove duplicate registry policy",
)
replace_once(
    restore_path,
    '''  const policy = REGISTRY_RESTORE_POLICY[tableName];
  if (!policy) throw new Error(`Unsupported registry restore table: ${tableName}`);''',
    '''  const policy = get_spine_registry_policy(tableName);''',
    "use shared registry policy",
)
replace_once(
    restore_path,
    '''    const entries = Object.entries(rawRow).filter(([column]) => writable.has(column));''',
    '''    const entries = Object.entries(
      select_spine_registry_write_row(tableName, targetColumns, rawRow),
    );''',
    "select governed registry writes",
)
replace_once(
    restore_path,
    "await restore_spine_table_data(dataExport);",
    "await restore_static_spine_table_data(dataExport);",
    "enforce static data restore",
)

# Fail closed if stale contracts remain.
exporter = Path("server/engines/sovereign-export-spine-engine-v2.ts").read_text()
bundle = Path("server/engines/spine-bundle-contract.ts").read_text()
restorer = Path(restore_path).read_text()
if "SPINE_CONFIG_TABLES" in exporter:
    raise RuntimeError("mixed export allowlist remains")
if "value instanceof Date" not in exporter:
    raise RuntimeError("Date preservation missing")
if "legacyOverride && signatureAbsent" not in bundle:
    raise RuntimeError("invalid signature override remains")
if "REGISTRY_RESTORE_POLICY" in restorer:
    raise RuntimeError("duplicate registry policy remains")
if "restore_spine_table_data(dataExport)" in restorer:
    raise RuntimeError("broad data restore remains")
