const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function prism_rosetta_queue_canary_id(
  input = process.env.PRISM_ROSETTA_QUEUE_CANARY_ID,
): string | null {
  const configured = input?.trim();
  if (!configured) return null;
  if (!UUID_PATTERN.test(configured)) {
    throw new Error("prism_rosetta_queue_canary_id_invalid");
  }
  return configured.toLowerCase();
}

export function prism_rosetta_queue_batch_ids(
  input = process.env.PRISM_ROSETTA_QUEUE_BATCH_IDS,
  canary_input = process.env.PRISM_ROSETTA_QUEUE_CANARY_ID,
): string[] | null {
  const configured = input?.trim();
  if (!configured) return null;
  if (canary_input?.trim()) throw new Error("prism_rosetta_queue_selection_conflict");
  const ids = configured.split(",").map((id) => id.trim().toLowerCase());
  if (ids.length > 25 || ids.some((id) => !UUID_PATTERN.test(id)) ||
      new Set(ids).size !== ids.length) {
    throw new Error("prism_rosetta_queue_batch_ids_invalid");
  }
  return ids;
}

