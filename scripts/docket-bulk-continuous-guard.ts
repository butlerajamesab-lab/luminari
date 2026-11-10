/**
 * Durable fail-closed orchestration for ONE Docket archive per scheduled run.
 *
 * A unique create-only Storage marker is placed BEFORE any import writes. On
 * interruption or error the marker remains, preventing repeated attempts.
 * This deliberately favors operator review over automatic retries.
 */
export const DOCKET_ACTIVE_MARKER = "_docket_intake_control/active.json";
export const DOCKET_DONE_MARKER = "_docket_intake_control/complete.json";

/** Supabase Storage object HEAD uses 400 or 404 when the object is absent. */
export function markerPresentFromHttpStatus(status: number): boolean {
  if (status === 200) return true;
  if (status === 400 || status === 404) return false;
  throw new Error("docket_continuous_marker_read_failed_HTTP_" + status);
}


export type DocketGuardStore = {
  exists(path: string): Promise<boolean>;
  create(path: string, body: string): Promise<void>;
  remove(path: string): Promise<void>;
};
export type DocketImportOutcome = { complete: boolean };

export async function runOneArchiveGuarded(
  store: DocketGuardStore,
  runExactlyOne: () => Promise<DocketImportOutcome>,
): Promise<"paused" | "complete" | "processed"> {
  // Check the STOP latch first, even if "complete" is present. A crash after
  // writing the done record but before removing the latch must stay visible.
  if (await store.exists(DOCKET_ACTIVE_MARKER)) return "paused";
  if (await store.exists(DOCKET_DONE_MARKER)) return "complete";

  const guard = JSON.stringify({
    purpose: "docket_bulk_archive_guard",
    status: "in_progress_or_unverified",
    manifest_sha256: "c0fda81b255685a7e9bb55083195cbbeafe922afab78b50a2daa0eab9695bb80",
    activated_at: new Date().toISOString(),
    note: "Review current receipts and logs before clearing this latch after failure.",
  }) + "\n";

  // This MUST be a storage create-only operation; if another run already has
  // this path, it throws and no subprocess can start.
  await store.create(DOCKET_ACTIVE_MARKER, guard);

  // Do NOT wrap in finally. On any error, keep the marker and halt all later
  // scheduled runs until an operator verifies and explicitly releases it.
  const outcome = await runExactlyOne();
  if (outcome.complete) {
    await store.create(DOCKET_DONE_MARKER, JSON.stringify({
      status: "all_manifest_archives_complete",
      manifest_sha256: "c0fda81b255685a7e9bb55083195cbbeafe922afab78b50a2daa0eab9695bb80",
      verified_at: new Date().toISOString(),
    }) + "\n");
  }
  await store.remove(DOCKET_ACTIVE_MARKER);
  return outcome.complete ? "complete" : "processed";
}
