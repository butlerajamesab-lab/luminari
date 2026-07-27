from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:120]!r}")
    path.write_text(text.replace(old, new, 1))


executor = Path("server/engines/sunam-executor.ts")
replace_once(
    executor,
    'import { assert_safe_public_table_name, resolve_direct_sunam_instruction } from "./sunam-runtime-contract";',
    'import { assert_safe_public_table_name, launch_sunam_background_ingestion, resolve_direct_sunam_instruction } from "./sunam-runtime-contract";',
)
replace_once(
    executor,
    'description: "Run ingestion for ALL enabled data streams. Returns per-stream results.",',
    'description: "Start ingestion for all enabled data streams in the background. Returns the accepted stream list immediately; ingest_runs records completion.",',
)
replace_once(
    executor,
    'description: "Find all streams with recent failures and retry them.",',
    'description: "Find streams with recent failed runs and start their retries in the background. Returns the accepted stream list immediately.",',
)
replace_once(
    executor,
    '''      case "run_all_streams": {\n        const { triggerManualIngestion } = await import("../ingestion/scheduler");\n        const streams = await db.select({ streamId: dataStreamRegistry.streamId, streamName: dataStreamRegistry.streamName })\n          .from(dataStreamRegistry).where(eq(dataStreamRegistry.enabled, true));\n        const results = [];\n        for (const s of streams) {\n          try {\n            const r = await Promise.race([\n              triggerManualIngestion(s.streamId),\n              new Promise<null>((res) => setTimeout(() => res(null), 120_000)),\n            ]);\n            results.push({ stream_id: s.streamId, success: r?.success ?? true, records: r?.recordsProcessed ?? 0, signals: r?.signalsGenerated ?? 0 });\n          } catch (e: any) {\n            results.push({ stream_id: s.streamId, success: false, error: e.message });\n          }\n        }\n        return { ...base, success: true, result: { total: streams.length, succeeded: results.filter(r => r.success).length, results } };\n      }''',
    '''      case "run_all_streams": {\n        const { triggerManualIngestion } = await import("../ingestion/scheduler");\n        const streams = await db\n          .select({\n            stream_id: dataStreamRegistry.streamId,\n            stream_name: dataStreamRegistry.streamName,\n          })\n          .from(dataStreamRegistry)\n          .where(eq(dataStreamRegistry.enabled, true));\n\n        const launches = streams.map((stream) => ({\n          ...launch_sunam_background_ingestion(\n            stream.stream_id,\n            () => triggerManualIngestion(stream.stream_id),\n          ),\n          stream_name: stream.stream_name,\n        }));\n\n        return {\n          ...base,\n          success: true,\n          result: {\n            status: "started",\n            total: launches.length,\n            streams: launches,\n            completion_source: "ingest_runs",\n          },\n        };\n      }''',
)
replace_once(
    executor,
    '''      case "retry_failed_streams": {\n        const { triggerManualIngestion } = await import("../ingestion/scheduler");\n        const hoursBack = args.hours_back ?? 24;\n        const cutoff = Date.now() - hoursBack * 3600 * 1000;\n        const failedRuns = await db.select({ datasetId: ingestRuns.datasetId })\n          .from(ingestRuns).where(sql`${ingestRuns.status} = 'failed' AND ${ingestRuns.startTime} > ${cutoff}`);\n        const unique = [...new Set(failedRuns.map((r: any) => r.datasetId))];\n        const results = [];\n        for (const sid of unique) {\n          try {\n            const r = await Promise.race([\n              triggerManualIngestion(sid as string),\n              new Promise<null>((res) => setTimeout(() => res(null), 120_000)),\n            ]);\n            results.push({ stream_id: sid, success: r?.success ?? true, records: r?.recordsProcessed ?? 0 });\n          } catch (e: any) {\n            results.push({ stream_id: sid, success: false, error: e.message });\n          }\n        }\n        return { ...base, success: true, result: { streams_retried: unique.length, succeeded: results.filter(r => r.success).length, results } };\n      }''',
    '''      case "retry_failed_streams": {\n        const { triggerManualIngestion } = await import("../ingestion/scheduler");\n        const hours_back = Math.min(24 * 30, Math.max(1, Number(args.hours_back ?? 24)));\n        const cutoff = Date.now() - hours_back * 3_600_000;\n        const failed_runs = await db\n          .select({ stream_id: ingestRuns.datasetId })\n          .from(ingestRuns)\n          .where(\n            sql`${ingestRuns.status} = 'failed' AND ${ingestRuns.startTime} > ${cutoff}`,\n          );\n        const stream_ids = [\n          ...new Set(\n            failed_runs\n              .map((run) => run.stream_id)\n              .filter(\n                (stream_id): stream_id is string =>\n                  typeof stream_id === "string" && stream_id.trim().length > 0,\n              ),\n          ),\n        ].sort();\n\n        const launches = stream_ids.map((stream_id) =>\n          launch_sunam_background_ingestion(\n            stream_id,\n            () => triggerManualIngestion(stream_id),\n          ),\n        );\n\n        return {\n          ...base,\n          success: true,\n          result: {\n            status: "started",\n            hours_back,\n            streams_retried: launches.length,\n            streams: launches,\n            completion_source: "ingest_runs",\n          },\n        };\n      }''',
)

source_test = Path("server/engines/sunam-operator-source-contract.test.ts")
replace_once(
    source_test,
    '''  it("routes standard operator actions deterministically", () => {\n    expect(executor).toContain("resolve_direct_sunam_instruction(instruction)");\n    expect(executor).toContain("direct_instruction.tool_name");\n    expect(executor).toContain("direct_instruction.args");\n  });''',
    '''  it("routes standard operator actions deterministically", () => {\n    expect(executor).toContain("resolve_direct_sunam_instruction(instruction)");\n    expect(executor).toContain("direct_instruction.tool_name");\n    expect(executor).toContain("direct_instruction.args");\n  });\n\n  it("launches bulk stream work without holding the operator request open", () => {\n    expect(executor).toContain("launch_sunam_background_ingestion");\n    expect(executor).toContain('completion_source: "ingest_runs"');\n    expect(executor).toContain('status: "started"');\n    expect(executor).not.toContain("streams_retried: unique.length");\n  });''',
)

print("Sunam bulk background-launch reconciliation applied")
