from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    target.write_text(text.replace(old, new, 1))


replace_once(
    "server/engines/sovereign-export-spine-engine.ts",
    '''} from "./spine-bundle-contract";
import {
  SPINE_CONFIG_TABLES,
  export_spine_table_data,
  list_spine_public_tables,''',
    '''} from "./spine-bundle-contract";
import { export_spine_table_data_consistent } from "./spine-consistent-data-export";
import {
  SPINE_CONFIG_TABLES,
  list_spine_public_tables,''',
    "wire consistent export import",
)

replace_once(
    "server/engines/sovereign-export-spine-engine.ts",
    '''export async function exportTableData(
  tableName: string,
  limit = 100_000,
): Promise<DataExport> {
  return sanitize_spine_export_value(await export_spine_table_data(tableName, limit));
}''',
    '''export async function exportTableData(
  tableName: string,
  limit = 100_000,
): Promise<DataExport> {
  return sanitize_spine_export_value(
    await export_spine_table_data_consistent(tableName, limit),
  );
}''',
    "route exporter through one-snapshot reader",
)

replace_once(
    "server/engines/sovereign-restore-spine-engine.ts",
    '''} from "./spine-bundle-contract";
import {
  SPINE_CONFIG_TABLE_SET,''',
    '''} from "./spine-bundle-contract";
import { preflight_spine_restore_request } from "./spine-restore-preflight";
import {
  SPINE_CONFIG_TABLE_SET,''',
    "wire restore preflight import",
)

replace_once(
    "server/engines/sovereign-restore-spine-engine.ts",
    '''    if (!preview.validation.executable) {
      throw new Error(
        `Spine bundle is not executable: ${preview.validation.warnings.join("; ")}`,
      );
    }
    await set_restore_spine_run_status(runId, "restoring");''',
    '''    if (!preview.validation.executable) {
      throw new Error(
        `Spine bundle is not executable: ${preview.validation.warnings.join("; ")}`,
      );
    }
    preflight_spine_restore_request(bundle, restoreType);
    await set_restore_spine_run_status(runId, "restoring");''',
    "preflight restore before target mutation",
)

# Fail closed if any stale path remains after the bounded replacements.
exporter = Path("server/engines/sovereign-export-spine-engine.ts").read_text()
restorer = Path("server/engines/sovereign-restore-spine-engine.ts").read_text()
if "export_spine_table_data," in exporter:
    raise RuntimeError("stale parallel exporter import remains")
if "await export_spine_table_data(tableName, limit)" in exporter:
    raise RuntimeError("stale parallel exporter call remains")
if "preflight_spine_restore_request(bundle, restoreType);" not in restorer:
    raise RuntimeError("restore preflight call was not installed")
