from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:140]!r}")
    path.write_text(text.replace(old, new, 1))


executor = Path("server/engines/sunam-executor.ts")

replace_once(
    executor,
    '''import {
  engineRegistry,
  dataStreamRegistry,
  adminChangeLog,
  ingestRuns,
} from "../../drizzle/schema";''',
    '''import {
  engineRegistry,
  dataStreamRegistry,
  adminChangeLog,
} from "../../drizzle/schema";''',
)

replace_once(
    executor,
    'import { assert_safe_public_table_name, launch_sunam_background_ingestion, resolve_direct_sunam_instruction } from "./sunam-runtime-contract";',
    '''import { assert_safe_public_table_name, launch_sunam_background_ingestion, resolve_direct_sunam_instruction } from "./sunam-runtime-contract";
import {
  get_sunam_retry_selection,
  get_sunam_run_all_selection,
  summarize_sunam_exclusions,
} from "./sunam-stream-selection";''',
)

replace_once(
    executor,
    '''      case "run_all_streams": {
        const { triggerManualIngestion } = await import("../ingestion/scheduler");
        const streams = await db
          .select({
            stream_id: dataStreamRegistry.streamId,
            stream_name: dataStreamRegistry.streamName,
          })
          .from(dataStreamRegistry)
          .where(eq(dataStreamRegistry.enabled, true));

        const launches = streams.map((stream) => ({
          ...launch_sunam_background_ingestion(
            stream.stream_id,
            () => triggerManualIngestion(stream.stream_id),
          ),
          stream_name: stream.stream_name,
        }));

        return {
          ...base,
          success: true,
          result: {
            status: "started",
            total: launches.length,
            streams: launches,
            completion_source: "ingest_runs",
          },
        };
      }''',
    '''      case "run_all_streams": {
        const { triggerManualIngestion } = await import("../ingestion/scheduler");
        const selection = await get_sunam_run_all_selection();
        const launches = selection.eligible.map((stream) => ({
          ...launch_sunam_background_ingestion(
            stream.stream_id,
            () => triggerManualIngestion(stream.stream_id),
          ),
          stream_name: stream.stream_name,
        }));

        return {
          ...base,
          success: true,
          result: {
            status: launches.length > 0 ? "started" : "no_eligible_streams",
            eligible_count: selection.eligible.length,
            streams: launches,
            excluded: summarize_sunam_exclusions(selection),
            registry_truth_source: "data_stream_registry",
            completion_source: "ingest_runs",
          },
        };
      }''',
)

replace_once(
    executor,
    '''      case "retry_failed_streams": {
        const { triggerManualIngestion } = await import("../ingestion/scheduler");
        const hours_back = Math.min(24 * 30, Math.max(1, Number(args.hours_back ?? 24)));
        const cutoff = Date.now() - hours_back * 3_600_000;
        const failed_runs = await db
          .select({ stream_id: ingestRuns.datasetId })
          .from(ingestRuns)
          .where(
            sql`${ingestRuns.status} = 'failed' AND ${ingestRuns.startTime} > ${cutoff}`,
          );
        const stream_ids = [
          ...new Set(
            failed_runs
              .map((run) => run.stream_id)
              .filter(
                (stream_id): stream_id is string =>
                  typeof stream_id === "string" && stream_id.trim().length > 0,
              ),
          ),
        ].sort();

        const launches = stream_ids.map((stream_id) =>
          launch_sunam_background_ingestion(
            stream_id,
            () => triggerManualIngestion(stream_id),
          ),
        );

        return {
          ...base,
          success: true,
          result: {
            status: "started",
            hours_back,
            streams_retried: launches.length,
            streams: launches,
            completion_source: "ingest_runs",
          },
        };
      }''',
    '''      case "retry_failed_streams": {
        const { triggerManualIngestion } = await import("../ingestion/scheduler");
        const selection = await get_sunam_retry_selection(
          Number(args.hours_back ?? 24),
        );
        const launches = selection.eligible.map((stream) => ({
          ...launch_sunam_background_ingestion(
            stream.stream_id,
            () => triggerManualIngestion(stream.stream_id),
          ),
          stream_name: stream.stream_name,
          consecutive_failures: stream.consecutive_failures,
          last_failure_at: stream.last_failure_at,
        }));

        return {
          ...base,
          success: true,
          result: {
            status: launches.length > 0 ? "started" : "no_eligible_recent_failures",
            hours_back: selection.hours_back,
            cutoff_ms: selection.cutoff_ms,
            streams_retried: launches.length,
            streams: launches,
            excluded: summarize_sunam_exclusions(selection),
            registry_truth_source: "data_stream_registry",
            completion_source: "ingest_runs",
          },
        };
      }''',
)

source_test = Path("server/engines/sunam-operator-source-contract.test.ts")
replace_once(
    source_test,
    '''  it("launches bulk stream work without holding the operator request open", () => {
    expect(executor).toContain("launch_sunam_background_ingestion");
    expect(executor).toContain('completion_source: "ingest_runs"');
    expect(executor).toContain('status: "started"');
    expect(executor).not.toContain("streams_retried: unique.length");
  });''',
    '''  it("launches only registry-eligible bulk stream work without holding the operator request open", () => {
    expect(executor).toContain("launch_sunam_background_ingestion");
    expect(executor).toContain("get_sunam_run_all_selection");
    expect(executor).toContain("get_sunam_retry_selection");
    expect(executor).toContain('registry_truth_source: "data_stream_registry"');
    expect(executor).toContain('completion_source: "ingest_runs"');
    expect(executor).toContain("summarize_sunam_exclusions");
    expect(executor).not.toContain("ingestRuns.datasetId");
    expect(executor).not.toContain("where(eq(dataStreamRegistry.enabled, true))");
  });''',
)

print("Sunam registry-truth selector reconciliation applied")
