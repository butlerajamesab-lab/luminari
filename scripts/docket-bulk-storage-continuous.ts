/**
 * Scheduled source-only Docket intake, exactly one archive per invocation.
 * Invoked exclusively by a dedicated Render cron service.
 *
 * No LegiScan API, no worker start, no migration, no downstream publication.
 * A create-only Supabase Storage stop latch prevents automatic retries after
 * errors or process crashes (including partial source admission).
 */
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import {
  DOCKET_ACTIVE_MARKER, DOCKET_DONE_MARKER, markerPresentFromHttpStatus, runOneArchiveGuarded,
  type DocketGuardStore, type DocketImportOutcome
} from "./docket-bulk-continuous-guard";
import { BASELINE_MANIFEST_SHA256 } from "./docket-bulk-storage-plan";
import { isArchiveLocalQuarantineReason } from "./docket-bulk-archive-quarantine";

const PROJECT_REF = "wepxlinwbjrkqdzkqpar";
const BUCKET = "Docket";
const projectUrl = (process.env.SUPABASE_URL ||
  "https://" + PROJECT_REF + ".supabase.co").replace(/\/$/, "");
const key = process.env.LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const authorization = process.env.DOCKET_BULK_ARCHIVE_APPLY_APPROVED_SHA256;
if (process.argv.length !== 2 || !key ||
    authorization !== BASELINE_MANIFEST_SHA256 ||
    !process.env.DATABASE_URL ||
    new URL(projectUrl).host !== PROJECT_REF + ".supabase.co") {
  throw new Error("docket_continuous_missing_explicit_approval_credentials_or_project");
}
const storage = createClient(projectUrl, key, {
  auth: { autoRefreshToken: false, persistSession: false },
}).storage.from(BUCKET);
const headers = { apikey: key, Authorization: "Bearer " + key };

const guardStore: DocketGuardStore = {
  async exists(path) {
    const url = projectUrl + "/storage/v1/object/" + BUCKET + "/" +
      path.split("/").map(encodeURIComponent).join("/");
    const response = await fetch(url, { method: "HEAD", headers });
    return markerPresentFromHttpStatus(response.status);
  },
  async create(path, body) {
    const { error } = await storage.upload(path, Buffer.from(body, "utf8"), {
      upsert: false,
      contentType: "application/json",
    });
    if (error) throw new Error("docket_continuous_marker_create_failed: " + path + " " + error.message);
  },
  async remove(path) {
    // Deletes only our transient lock, NEVER a LegiScan original source.
    if (path !== DOCKET_ACTIVE_MARKER) {
      throw new Error("docket_continuous_forbidden_marker_removal");
    }
    const { error } = await storage.remove([path]);
    if (error || await guardStore.exists(path)) {
      throw new Error("docket_continuous_marker_release_not_confirmed: " + String(error?.message || "still exists"));
    }
  },
};

async function executeSourceOnlyArchive(): Promise<DocketImportOutcome> {
  const args = [
    "exec", "tsx", "scripts/docket-bulk-storage-runner.ts",
    "--apply", "--acknowledge-docket-triggers", "--max-archives=1",
  ];
  type Summary = { mode: string; inventoried: number; remaining: number;
    quarantined: number; selected_count: number; selected_archive_sha256: string | null };
  type SourceResult = { result: "complete" | "quarantined" | "waiting_review"; mode: string;
    processed: number; archive_sha256?: string; reason_code?: string };
  let summary: Summary | null = null;
  let sourceResult: SourceResult | null = null;
  const code = await new Promise<number>((resolve, reject) => {
    const child = spawn("pnpm", args, {
      cwd: process.cwd(),
      env: { ...process.env, LEGISCAN_API_KEY: "" },
      stdio: ["ignore", "pipe", "inherit"],
    });
    let tail = "";
    const handle = (line: string) => {
      try {
        const item = JSON.parse(line);
        if (item && typeof item === "object" && item.mode === "apply" &&
            Number.isInteger(item.inventoried) &&
            Number.isInteger(item.remaining) &&
            Number.isInteger(item.quarantined) &&
            Number.isInteger(item.selected_count)) {
          summary = item as Summary;
        }
        if (["complete", "quarantined", "waiting_review"].includes(item?.result) &&
            item.mode === "apply" && Number.isInteger(item.processed)) {
          sourceResult = item as SourceResult;
        }
      } catch { /* Ordinary text logs are allowed; do not reinterpret them. */ }
    };
    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      process.stdout.write(text);
      tail += text;
      const lines = tail.split("\n");
      tail = lines.pop() ?? "";
      for (const line of lines) handle(line);
      if (tail.length > 65536) {
        reject(new Error("docket_continuous_unbounded_stdout_line"));
        child.kill("SIGTERM");
      }
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (tail) handle(tail);
      if (signal) return reject(new Error("docket_continuous_child_signal_" + signal));
      resolve(code ?? 1);
    });
  });
  if (code !== 0 || !sourceResult || !summary) {
    throw new Error("docket_continuous_source_runner_failed_or_missing_receipts_" + code);
  }
  const s = summary as Summary;
  const result = sourceResult as SourceResult;
  if (s.inventoried !== 60 || s.remaining < 0 || s.quarantined < 0 ||
      s.quarantined > s.remaining || s.selected_count < 0 || s.selected_count > 1 ||
      (s.remaining === 0 && (s.selected_count !== 0 || s.quarantined !== 0)) ||
      (s.remaining > s.quarantined && s.selected_count !== 1) ||
      (s.remaining === s.quarantined && s.selected_count !== 0)) {
    throw new Error("docket_continuous_unexpected_archive_selection");
  }
  if (result.result === "quarantined") {
    if (s.selected_count !== 1 || result.processed !== 0 ||
        !/^[a-f0-9]{64}$/.test(result.archive_sha256 || "") ||
        result.archive_sha256 !== s.selected_archive_sha256 ||
        typeof result.reason_code !== "string" || !isArchiveLocalQuarantineReason(result.reason_code)) {
      throw new Error("docket_continuous_invalid_quarantine_receipt");
    }
    // The runner already created and read back the exact-hash, create-only
    // quarantine receipt before reporting this outcome.
    return { complete: false, deferred: "quarantined", quarantine_sha256: result.archive_sha256 };
  }
  if (result.result === "waiting_review") {
    if (s.remaining === 0 || s.selected_count !== 0 ||
        s.remaining !== s.quarantined || result.processed !== 0) {
      throw new Error("docket_continuous_invalid_waiting_review_receipt");
    }
    return { complete: false, deferred: "waiting_review" };
  }
  if (result.processed !== s.selected_count || result.processed < 0 ||
      result.processed > 1) {
    throw new Error("docket_continuous_missing_verified_archive");
  }
  return { complete: s.remaining === 0 };
}

const result = await runOneArchiveGuarded(guardStore, executeSourceOnlyArchive);
if (result === "paused") {
  console.error("DOCKET_SOURCE_IMPORT_PAUSED: active marker remains; inspect last run and source receipts before explicit clearance.");
} else if (result === "complete") {
  console.log("DOCKET_SOURCE_IMPORT_ALL_60_COMPLETE: future scheduled runs will be no-op.");
} else if (result === "quarantined") {
  console.error("DOCKET_SOURCE_ARCHIVE_QUARANTINED: durable archive-specific proof retained; next eligible ZIP can proceed.");
} else if (result === "waiting_review") {
  console.log("DOCKET_SOURCE_IMPORT_WAITING_REVIEW: all remaining ZIPs quarantined; no automatic retries.");
} else {
  console.log("DOCKET_SOURCE_IMPORT_ONE_ARCHIVE_VERIFIED: next scheduled run may proceed.");
}
