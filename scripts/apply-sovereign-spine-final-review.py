from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    target.write_text(text.replace(old, new, 1))


path = "server/engines/sovereign-restore-spine-engine.ts"
replace_once(
    path,
    'import { preflight_spine_restore_request } from "./spine-restore-preflight";',
    'import { preflight_spine_restore_contents } from "./spine-restore-preflight";',
    "wire complete restore preflight import",
)

replace_once(
    path,
    '''  const available = new Set(targetColumns);

  for (const candidate of policy.identityColumns) {''',
    '''  const available = new Set(targetColumns);

  if (tableName === "pattern_registry" && available.has("pattern_id")) {
    const completePatternIds = rows.every((row) => {
      const value = row?.pattern_id;
      return value !== null && value !== undefined && String(value).trim() !== "";
    });
    if (!completePatternIds) {
      throw new Error(
        "Target pattern_registry requires complete pattern_id values; mutable name fallback is not permitted",
      );
    }
    return "pattern_id";
  }

  for (const candidate of policy.identityColumns) {''',
    "fail closed on canonical pattern targets",
)

replace_once(
    path,
    '''    preflight_spine_restore_request(bundle, restoreType);
    await set_restore_spine_run_status(runId, "restoring");''',
    '''    await preflight_spine_restore_contents(
      bundle,
      restoreType,
      resolve_registry_identity_column,
    );
    await set_restore_spine_run_status(runId, "restoring");''',
    "run content preflight before restore mutation",
)

text = Path(path).read_text()
if "preflight_spine_restore_request(bundle, restoreType);" in text:
    raise RuntimeError("stale section-only preflight remains")
if "preflight_spine_restore_contents(" not in text:
    raise RuntimeError("complete preflight was not installed")
if "mutable name fallback is not permitted" not in text:
    raise RuntimeError("canonical pattern guard was not installed")
