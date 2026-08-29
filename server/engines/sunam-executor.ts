/**
 * SunamExecutor — Full System Operator Engine
 *
 * Sunam executes directly through this engine.
 * No artifacts. No approval flow. No proposals.
 * Every tool call is immediate and real.
 *
 * Architecture:
 *   User instruction → LLM tool-call loop → tool dispatch → system mutation → result
 *
 * Tool schema covers ALL system layers:
 *   - Streams: run, retry, backfill, reset, patch, enable/disable, update config
 *   - Engines: enable/disable, reorder, patch config, register, remove
 *   - SQL: execute arbitrary SQL with rollback
 *   - Migrations: apply schema changes
 *   - Config: modify system configuration
 *   - Signals: adjust weights, thresholds
 *   - UI: read/write/patch React components
 *   - Scheduler: refresh, status, force-run
 *   - Diagnostics: inspect tables, streams, engines
 */

import { db, query_with_diagnostics } from "../db";
import { eq, desc, sql } from "drizzle-orm";
import {
  engineRegistry,
  dataStreamRegistry,
} from "../../drizzle/schema";
import {
  applyEnginePatch,
  applyStreamPatch,
  applySchemaPatch,
  rollbackPatch,
  getExecutionLog,
  resetStreamCheckpoint,
} from "./executor-service";
import { uiReadFile, uiWriteFile, uiPatchFile, uiListFiles } from "../ui-editor/index";
import { dispatchServiceTool } from "./sunam-service-dispatcher";
import { SUNAM_SERVICE_ONLY_TOOLS } from "./sunam-service-only-tools";
import { assert_safe_public_table_name, launch_sunam_background_ingestion, resolve_direct_sunam_instruction } from "./sunam-runtime-contract";
import {
  get_sunam_retry_selection,
  get_sunam_run_all_selection,
  summarize_sunam_exclusions,
} from "./sunam-stream-selection";
import { get_unified_ingestion_metrics, get_unified_ingestion_summary, get_unified_signal_summary, get_unified_signals } from "../unified-queries";
import { write_admin_change_log } from "./admin-change-log-store";

// ─── Tool Definitions ───

export const SUNAM_OPERATOR_TOOLS = [
  // ── Direct Backfill ──
  {
    type: "function" as const,
    function: {
      name: "process_signals_batch",
      description: "Backfill detected_signals from live_signals via the Sunam gate. Reads only rows not yet in sunam_gate_log, scores them, inserts approved signals into detected_signals, logs every decision. No stream registration, no data_stream_registry writes, no SQL fallback.",
      parameters: {
        type: "object",
        properties: {
          batch_size: { type: "number", description: "Max signals to process in this batch (default: 500)" },
        },
        additionalProperties: false,
      },
    },
  },

  // ── Streams ──
  {
    type: "function" as const,
    function: {
      name: "run_stream",
      description: "Run ingestion for a specific data stream immediately. Returns records processed and signals generated.",
      parameters: {
        type: "object",
        properties: {
          stream_id: { type: "string", description: "The stream ID to run (e.g. 'gpri-47xz', 'cfpb-complaints')" },
          max_records: { type: "number", description: "Optional limit on records to fetch (default: all)" },
        },
        required: ["stream_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "run_all_streams",
      description: "Start ingestion for all enabled data streams in the background. Returns the accepted stream list immediately; ingest_runs records completion.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "retry_failed_streams",
      description: "Find streams with recent failed runs and start their retries in the background. Returns the accepted stream list immediately.",
      parameters: {
        type: "object",
        properties: {
          hours_back: { type: "number", description: "How many hours back to look for failures (default: 24)" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "backfill_stream",
      description: "Reset a stream's ingestion checkpoint and re-run it from the beginning (full backfill).",
      parameters: {
        type: "object",
        properties: {
          stream_id: { type: "string", description: "The stream ID to backfill" },
          max_records: { type: "number", description: "Optional record limit" },
        },
        required: ["stream_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "reset_stream_checkpoint",
      description: "Reset a stream's lastIngestedAt checkpoint so the next run fetches all records.",
      parameters: {
        type: "object",
        properties: {
          stream_id: { type: "string", description: "The stream ID to reset" },
        },
        required: ["stream_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "patch_stream",
      description: "Modify a stream's configuration: apiUrl, cronExpression, fieldMapping, signalWeight, confidenceMultiplier, enabled, parserMode, postProcessingEngineName. Changes are logged with rollback support.",
      parameters: {
        type: "object",
        properties: {
          stream_id: { type: "string", description: "The stream ID to patch" },
          updates: {
            type: "object",
            description: "Fields to update",
            properties: {
              stream_name: { type: "string" },
              api_url: { type: "string" },
              source_url: { type: "string" },
              field_mapping: { type: "object", additionalProperties: { type: "string" } },
              cron_expression: { type: "string" },
              signal_weight: { type: "number" },
              confidence_multiplier: { type: "number" },
              enabled: { type: "boolean" },
              post_processing_engine_name: { type: "string" },
              parser_mode: { type: "string" },
            },
            additionalProperties: false,
          },
        },
        required: ["stream_id", "updates"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "reenable_stream",
      description: "Re-enable an auto-disabled stream and reset its failure counters.",
      parameters: {
        type: "object",
        properties: {
          stream_id: { type: "string", description: "The stream ID to re-enable" },
        },
        required: ["stream_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "disable_stream",
      description: "Disable a stream so it no longer runs on schedule.",
      parameters: {
        type: "object",
        properties: {
          stream_id: { type: "string", description: "The stream ID to disable" },
          reason: { type: "string", description: "Reason for disabling" },
        },
        required: ["stream_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "register_stream",
      description: "Register a new data stream in the registry.",
      parameters: {
        type: "object",
        properties: {
          stream_id: { type: "string" },
          stream_name: { type: "string" },
          api_url: { type: "string" },
          source: { type: "string", description: "Source type: socrata, rest, graphql, rss, etc." },
          stream_type: { type: "string", description: "Data type: enforcement, complaints, legislation, etc." },
          cron_expression: { type: "string", description: "Cron schedule (default: 0 2 * * *)" },
          signal_weight: { type: "number", description: "Signal weight multiplier (default: 1.0)" },
          field_mapping: { type: "object", additionalProperties: { type: "string" } },
        },
        required: ["stream_id", "stream_name", "api_url", "source", "stream_type"],
        additionalProperties: false,
      },
    },
  },

  // ── Engines ──
  {
    type: "function" as const,
    function: {
      name: "patch_engine",
      description: "Modify an engine's configuration: engineName, description, category, version, configJson, enabled, sortOrder. Changes are logged with rollback support.",
      parameters: {
        type: "object",
        properties: {
          engine_id: { type: "string", description: "The engine ID to patch" },
          updates: {
            type: "object",
            properties: {
              engine_name: { type: "string" },
              description: { type: "string" },
              category: { type: "string" },
              version: { type: "string" },
              config_json: { type: "object", additionalProperties: true },
              enabled: { type: "boolean" },
              sort_order: { type: "number" },
            },
            additionalProperties: false,
          },
        },
        required: ["engine_id", "updates"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "toggle_engine",
      description: "Enable or disable an engine.",
      parameters: {
        type: "object",
        properties: {
          engine_id: { type: "string" },
          enabled: { type: "boolean" },
        },
        required: ["engine_id", "enabled"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "reorder_engines",
      description: "Set the execution order of engines by providing an ordered list of engine IDs.",
      parameters: {
        type: "object",
        properties: {
          ordered_ids: { type: "array", items: { type: "string" }, description: "Engine IDs in desired order" },
        },
        required: ["ordered_ids"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "register_engine",
      description: "Register a new engine in the engine registry.",
      parameters: {
        type: "object",
        properties: {
          engine_id: { type: "string" },
          engine_name: { type: "string" },
          description: { type: "string" },
          category: { type: "string" },
          version: { type: "string" },
          config: { type: "object", additionalProperties: true },
        },
        required: ["engine_id", "engine_name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "remove_engine",
      description: "Remove an engine from the registry (marks as removed, does not delete).",
      parameters: {
        type: "object",
        properties: {
          engine_id: { type: "string" },
        },
        required: ["engine_id"],
        additionalProperties: false,
      },
    },
  },

  // ── SQL / Schema ──
  // REMOVED: execute_sql and run_migration
  // Sunam now uses service layer only - no direct SQL access

  // REMOVED: rollback_change - Sunam uses service layer only

  // ── Signal / Config ──
  {
    type: "function" as const,
    function: {
      name: "set_signal_weight",
      description: "Adjust the signal weight and/or confidence multiplier for a data stream. This controls how much weight signals from this stream carry.",
      parameters: {
        type: "object",
        properties: {
          stream_id: { type: "string" },
          signal_weight: { type: "number", description: "Weight multiplier (e.g. 1.0 = normal, 2.0 = double weight)" },
          confidence_multiplier: { type: "number", description: "Confidence multiplier (e.g. 1.0 = normal, 0.5 = halved)" },
        },
        required: ["stream_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "refresh_scheduler",
      description: "Reload all stream schedules from the registry. Call after changing cron expressions.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_scheduler_status",
      description: "Get the current scheduler status: total streams, enabled streams, and scheduler internals.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },

  // ── UI ──
  {
    type: "function" as const,
    function: {
      name: "ui_read_file",
      description: "Read a frontend React/TypeScript file from /client/src/. Returns the file content.",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Relative path within /client/src/ (e.g. 'pages/Home.tsx')" },
        },
        required: ["file_path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "ui_write_file",
      description: "Write (overwrite) a frontend React/TypeScript file. Vite hot-reloads immediately.",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Relative path within /client/src/" },
          content: { type: "string", description: "Full file content to write" },
        },
        required: ["file_path", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "ui_patch_file",
      description: "Apply targeted find-and-replace patches to a frontend file. Vite hot-reloads immediately.",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Relative path within /client/src/" },
          patches: {
            type: "array",
            items: {
              type: "object",
              properties: {
                find: { type: "string", description: "Exact text to find" },
                replace: { type: "string", description: "Replacement text" },
              },
              required: ["find", "replace"],
              additionalProperties: false,
            },
          },
        },
        required: ["file_path", "patches"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "ui_list_files",
      description: "List files in a frontend directory under /client/src/.",
      parameters: {
        type: "object",
        properties: {
          dir_path: { type: "string", description: "Directory path relative to /client/src/ (e.g. 'pages/')" },
        },
        required: ["dir_path"],
        additionalProperties: false,
      },
    },
  },

  // ── Diagnostics / Inspection ──
  {
    type: "function" as const,
    function: {
      name: "inspect_table",
      description: "Inspect a database table: show columns, row count, and sample rows.",
      parameters: {
        type: "object",
        properties: {
          table_name: { type: "string", description: "Name of the database table to inspect" },
          limit: { type: "number", description: "Number of sample rows to return (default: 5)" },
        },
        required: ["table_name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_system_state",
      description: "Get a full snapshot of the system: all engines, all streams, recent failures, scheduler status, and recent changes.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_stream_diagnostics",
      description: "Get diagnostics for one stream, or all failing/disabled streams when stream_id is omitted.",
      parameters: {
        type: "object",
        properties: {
          stream_id: { type: "string" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_execution_log",
      description: "Get the recent execution log of all system patches and changes.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of entries to return (default: 20)" },
        },
        additionalProperties: false,
      },
    },
  },
];

const SUNAM_OPERATOR_TOOL_NAMES = new Set(
  SUNAM_OPERATOR_TOOLS.map((tool) => tool.function.name),
);

/**
 * One canonical, additive tool registry. Operational control tools remain
 * available alongside Lighthouse's case-service tools. Duplicate names (the
 * shared system-state surface) resolve to the operational contract.
 */
export const SUNAM_TOOLS = [
  ...SUNAM_OPERATOR_TOOLS,
  ...SUNAM_SERVICE_ONLY_TOOLS.filter(
    (tool) => !SUNAM_OPERATOR_TOOL_NAMES.has(tool.function.name),
  ),
];

const SUNAM_TOOL_NAMES = new Set(
  SUNAM_TOOLS.map((tool) => tool.function.name),
);

export function getSunamVisibleToolNames(): string[] {
  return SUNAM_TOOLS.map((tool) => tool.function.name);
}

export function isSunamToolAllowed(toolName: string): boolean {
  return SUNAM_TOOL_NAMES.has(toolName);
}

// ─── Tool Dispatch ───

export interface ToolCallResult {
  tool: string;
  args: Record<string, any>;
  result: any;
  success: boolean;
  error?: string;
}

export async function dispatchTool(
  toolName: string,
  args: Record<string, any>,
  executedBy: string,
): Promise<ToolCallResult> {
  const base = { tool: toolName, args };

  // One canonical registry governs UI display, planning, LLM tool calls, and dispatch.
  if (!isSunamToolAllowed(toolName)) {
    return {
      ...base,
      success: false,
      result: null,
      error: `Tool '${toolName}' is not available to Sunam. Available tools: ${getSunamVisibleToolNames().join(", ")}`,
    };
  }

  try {
    switch (toolName) {
      // ── Streams ──
      case "process_signals_batch": {
        const { processSignalsBatch } = await import("../process-signals-batch");
        const batchResult = await processSignalsBatch({
          batch_size: args.batch_size,
        });
        return { ...base, success: true, result: batchResult };
      }

      case "run_stream": {
        const { triggerManualIngestion } = await import("../ingestion/scheduler");
        const result = await Promise.race([
          triggerManualIngestion(args.stream_id, args.max_records),
          new Promise<null>((res) => setTimeout(() => res(null), 120_000)),
        ]);
        if (!result) return { ...base, success: true, result: { message: "Ingestion started in background", status: "running" } };
        return {
          ...base, success: result.success,
          result: {
            status: result.success ? "completed" : "failed",
            records_processed: result.recordsProcessed,
            records_inserted: result.recordsInserted,
            signals_generated: result.signalsGenerated,
            errors: result.errors,
            run_id: result.runId,
          },
        };
      }

      case "run_all_streams": {
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
      }

      case "retry_failed_streams": {
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
      }

      case "backfill_stream": {
        const resetResult = await resetStreamCheckpoint(args.stream_id, executedBy, "Sunam");
        if (!resetResult.success) return { ...base, success: false, result: null, error: resetResult.summary };
        const { triggerManualIngestion } = await import("../ingestion/scheduler");
        const r = await Promise.race([
          triggerManualIngestion(args.stream_id, args.max_records),
          new Promise<null>((res) => setTimeout(() => res(null), 120_000)),
        ]);
        return {
          ...base, success: r?.success ?? true,
          result: { checkpoint_reset: true, records_processed: r?.recordsProcessed ?? 0, signals_generated: r?.signalsGenerated ?? 0 },
        };
      }

      case "reset_stream_checkpoint": {
        const r = await resetStreamCheckpoint(args.stream_id, executedBy, "Sunam");
        return { ...base, success: r.success, result: r };
      }

      case "patch_stream": {
        // Map snake_case args to camelCase for executor
        const updates: any = {};
        if (args.updates.stream_name !== undefined) updates.streamName = args.updates.stream_name;
        if (args.updates.api_url !== undefined) updates.apiUrl = args.updates.api_url;
        if (args.updates.source_url !== undefined) updates.sourceUrl = args.updates.source_url;
        if (args.updates.field_mapping !== undefined) updates.fieldMapping = args.updates.field_mapping;
        if (args.updates.cron_expression !== undefined) updates.cronExpression = args.updates.cron_expression;
        if (args.updates.signal_weight !== undefined) updates.signalWeight = args.updates.signal_weight;
        if (args.updates.confidence_multiplier !== undefined) updates.confidenceMultiplier = args.updates.confidence_multiplier;
        if (args.updates.enabled !== undefined) updates.enabled = args.updates.enabled;
        if (args.updates.post_processing_engine_name !== undefined) updates.postProcessingEngineName = args.updates.post_processing_engine_name;
        if (args.updates.parser_mode !== undefined) updates.parserMode = args.updates.parser_mode;
        const r = await applyStreamPatch(args.stream_id, updates, executedBy, "Sunam");
        if (r.success && args.updates.cron_expression) {
          try { const { refreshSchedules } = await import("../ingestion/scheduler"); await refreshSchedules(); } catch {}
        }
        return { ...base, success: r.success, result: r, error: r.error };
      }

      case "reenable_stream": {
        await db.update(dataStreamRegistry).set({
          autoDisabled: false, disabledReason: null,
          consecutiveFailures: 0, retryAfterAt: null,
          enabled: true, updatedAt: Date.now(),
        }).where(eq(dataStreamRegistry.streamId, args.stream_id));
        await write_admin_change_log({
          adminId: executedBy, adminName: "Sunam",
          actionType: "stream_edit", targetSystem: "data_stream_registry",
          targetId: args.stream_id,
          description: `[SUNAM] Re-enabled stream ${args.stream_id} and reset failure counters`,
          rollbackAvailable: false, timestamp: new Date(),
        });
        return { ...base, success: true, result: { stream_id: args.stream_id, status: "enabled", failures_reset: true } };
      }

      case "disable_stream": {
        await db.update(dataStreamRegistry).set({
          enabled: false, disabledReason: args.reason ?? "Disabled by Sunam",
          updatedAt: Date.now(),
        }).where(eq(dataStreamRegistry.streamId, args.stream_id));
        await write_admin_change_log({
          adminId: executedBy, adminName: "Sunam",
          actionType: "stream_disable", targetSystem: "data_stream_registry",
          targetId: args.stream_id,
          description: `[SUNAM] Disabled stream ${args.stream_id}: ${args.reason ?? "no reason given"}`,
          rollbackAvailable: false, timestamp: new Date(),
        });
        return { ...base, success: true, result: { stream_id: args.stream_id, status: "disabled" } };
      }

      case "register_stream": {
        await db.insert(dataStreamRegistry).values({
          streamId: args.stream_id,
          streamName: args.stream_name,
          apiUrl: args.api_url,
          source: args.source,
          streamType: (args.stream_type as any) ?? "public_records",
          cronExpression: args.cron_expression ?? "0 2 * * *",
          signalWeight: Math.round((args.signal_weight ?? 1.0) * 100),
          fieldMapping: args.field_mapping ?? {},
          enabled: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        await write_admin_change_log({
          adminId: executedBy, adminName: "Sunam",
          actionType: "stream_add", targetSystem: "data_stream_registry",
          targetId: args.stream_id,
          description: `[SUNAM] Registered new stream: ${args.stream_name} (${args.stream_id})`,
          rollbackAvailable: false, timestamp: new Date(),
        });
        return { ...base, success: true, result: { stream_id: args.stream_id, registered: true } };
      }

      // ── Engines ──
      case "patch_engine": {
        const updates: any = {};
        if (args.updates.engine_name !== undefined) updates.engineName = args.updates.engine_name;
        if (args.updates.description !== undefined) updates.description = args.updates.description;
        if (args.updates.category !== undefined) updates.category = args.updates.category;
        if (args.updates.version !== undefined) updates.version = args.updates.version;
        if (args.updates.config_json !== undefined) updates.configJson = args.updates.config_json;
        if (args.updates.enabled !== undefined) updates.enabled = args.updates.enabled;
        if (args.updates.sort_order !== undefined) updates.sortOrder = args.updates.sort_order;
        const r = await applyEnginePatch(args.engine_id, updates, executedBy, "Sunam");
        return { ...base, success: r.success, result: r, error: r.error };
      }

      case "toggle_engine": {
        const { toggleEngine } = await import("./admin-sovereign-control");
        await toggleEngine(args.engine_id, args.enabled, executedBy, "Sunam");
        return { ...base, success: true, result: { engine_id: args.engine_id, enabled: args.enabled } };
      }

      case "reorder_engines": {
        const { reorderEngines } = await import("./admin-sovereign-control");
        const r = await reorderEngines(args.ordered_ids, executedBy, "Sunam");
        return { ...base, success: true, result: r };
      }

      case "register_engine": {
        const { addEngine } = await import("./admin-sovereign-control");
        const r = await addEngine({
          engineId: args.engine_id,
          engineName: args.engine_name,
          description: args.description,
          category: args.category,
          version: args.version,
          config: args.config,
        }, executedBy, "Sunam");
        return { ...base, success: true, result: r };
      }

      case "remove_engine": {
        const { removeEngine } = await import("./admin-sovereign-control");
        const r = await removeEngine(args.engine_id, executedBy, "Sunam");
        return { ...base, success: true, result: r };
      }

      // ── SQL / Schema ──
      // ── Service Layer Tools (Sunam service-only access) ──
      case "get_case_context":
      case "get_case":
      case "get_case_timeline":
      case "get_case_notes":
      case "get_jurisdiction":
      case "get_workflows":
      case "get_programs":
      case "get_entities":
      case "record_validation":
      case "record_reconciliation":
      case "record_case_action":
      case "add_case_note":
      case "update_case_status": {
        const serviceResult = await dispatchServiceTool(toolName, args);
        return { ...base, success: serviceResult.success, result: serviceResult.result, error: serviceResult.error };
      }


      case "get_signals": {
        const signals = await get_unified_signals({
          stream_id: args.stream_id,
          status: args.status,
          severity: args.severity,
          limit: args.limit ?? 50,
        });
        return { ...base, success: true, result: { signals, total: signals.length } };
      }

      case "get_system_state": {
        const [ingestion_summary, signal_summary, streams, engine_rows] = await Promise.all([
          get_unified_ingestion_summary(),
          get_unified_signal_summary(),
          get_unified_ingestion_metrics(),
          db.select({
            engine_id: engineRegistry.engineId,
            engine_name: engineRegistry.engineName,
            enabled: engineRegistry.enabled,
            category: engineRegistry.category,
            version: engineRegistry.version,
            sort_order: engineRegistry.sortOrder,
          }).from(engineRegistry),
        ]);

        let scheduler_status: Record<string, unknown> = {};
        try {
          const { getSchedulerStatus } = await import("../ingestion/scheduler");
          scheduler_status = getSchedulerStatus() as Record<string, unknown>;
        } catch (error) {
          scheduler_status = {
            available: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }

        const engines = engine_rows
          .map((engine: (typeof engine_rows)[number]) => ({
            ...engine,
            sort_order: Number(engine.sort_order ?? 0),
          }))
          .sort((left: (typeof engine_rows)[number], right: (typeof engine_rows)[number]) =>
            left.sort_order - right.sort_order ||
            String(left.engine_name).localeCompare(String(right.engine_name)),
          );
        const failures = streams.filter(
          (stream) =>
            stream.consecutive_failures > 0 ||
            stream.auto_disabled,
        );

        return {
          ...base,
          success: true,
          result: {
            timestamp: Date.now(),
            sunam_connected: true,
            governed_operator_tools: true,
            direct_sql_access: false,
            ingestion_summary,
            signal_summary,
            engine_count: engines.length,
            engines,
            stream_count: streams.length,
            streams,
            failure_count: failures.length,
            failures,
            scheduler_status,
          },
        };
      }

      // ── SQL / Schema (DISABLED) ──
      case "execute_sql":
      case "run_migration":
      case "rollback_change": {
        return {
          ...base,
          success: false,
          result: null,
          error: `Direct SQL access is disabled for Sunam. Use service layer tools instead (e.g., get_case_context, record_validation, record_reconciliation).`,
        };
      }

      // ── Signal / Config ──
      case "set_signal_weight": {
        const setValues: any = { updatedAt: Date.now() };
        if (args.signal_weight !== undefined) setValues.signalWeight = args.signal_weight;
        if (args.confidence_multiplier !== undefined) setValues.confidenceMultiplier = args.confidence_multiplier;
        await db.update(dataStreamRegistry).set(setValues).where(eq(dataStreamRegistry.streamId, args.stream_id));
        await write_admin_change_log({
          adminId: executedBy, adminName: "Sunam",
          actionType: "signal_weight_change", targetSystem: "data_stream_registry",
          targetId: args.stream_id,
          description: `[SUNAM] Signal weight for ${args.stream_id} → weight=${args.signal_weight ?? "unchanged"}, confidence=${args.confidence_multiplier ?? "unchanged"}`,
          rollbackAvailable: false, timestamp: new Date(),
        });
        return { ...base, success: true, result: { stream_id: args.stream_id, signal_weight: args.signal_weight, confidence_multiplier: args.confidence_multiplier } };
      }

      case "refresh_scheduler": {
        const { refreshSchedules, getSchedulerStatus } = await import("../ingestion/scheduler");
        await refreshSchedules();
        const status = getSchedulerStatus();
        return { ...base, success: true, result: status };
      }

      case "get_scheduler_status": {
        let scheduler_status: any = {};
        try {
          const { getSchedulerStatus } = await import("../ingestion/scheduler");
          scheduler_status = getSchedulerStatus();
        } catch {}
        const ingestion_summary = await get_unified_ingestion_summary();
        return {
          ...base, success: true,
          result: {
            total_streams: ingestion_summary.total_streams,
            enabled_streams: ingestion_summary.enabled_streams,
            scheduler_status,
          },
        };
      }

      // ── UI ──
      case "ui_read_file": {
        const r = await uiReadFile(args.file_path, executedBy);
        return { ...base, success: r.success, result: r, error: r.error };
      }

      case "ui_write_file": {
        const r = await uiWriteFile(args.file_path, args.content, executedBy);
        return { ...base, success: r.success, result: r, error: r.error };
      }

      case "ui_patch_file": {
        const r = await uiPatchFile(args.file_path, args.patches, executedBy);
        return { ...base, success: r.success, result: r, error: r.error };
      }

      case "ui_list_files": {
        const r = await uiListFiles(args.dir_path, executedBy);
        return { ...base, success: r.success, result: r, error: r.error };
      }

      // ── Diagnostics ──
      case "inspect_table": {
        const table_name = assert_safe_public_table_name(args.table_name);
        const limit = Math.min(100, Math.max(1, Math.floor(Number(args.limit ?? 5))));
        const quoted_table_name = `"${table_name}"`;

        const column_result = await query_with_diagnostics<{
          column_name: string;
          data_type: string;
          is_nullable: string;
          column_default: string | null;
        }>(
          `select column_name, data_type, is_nullable, column_default
           from information_schema.columns
           where table_schema = 'public' and table_name = $1
           order by ordinal_position`,
          [table_name],
          { label: "sunam_inspect_columns", query_timeout_ms: 5_000 },
        );
        if (column_result.rows.length === 0) {
          return { ...base, success: false, result: null, error: `public.${table_name} does not exist or has no visible columns` };
        }

        const count_result = await query_with_diagnostics<{ cnt: string }>(
          `select count(*)::text as cnt from public.${quoted_table_name}`,
          [],
          { label: "sunam_inspect_count", query_timeout_ms: 5_000 },
        );
        const sample_result = await query_with_diagnostics<Record<string, unknown>>(
          `select * from public.${quoted_table_name} limit ${limit}`,
          [],
          { label: "sunam_inspect_sample", query_timeout_ms: 5_000 },
        );

        return {
          ...base,
          success: true,
          result: {
            table: table_name,
            columns: column_result.rows,
            row_count: Number(count_result.rows[0]?.cnt ?? 0),
            sample_rows: sample_result.rows,
          },
        };
      }



      case "get_stream_diagnostics": {
        const streams = await get_unified_ingestion_metrics(args.stream_id ? { stream_id: args.stream_id } : {});
        const diagnostics = streams
          .filter((stream) => args.stream_id || stream.consecutive_failures > 0 || !stream.enabled || stream.auto_disabled)
          .map((stream) => ({
            stream_id: stream.stream_id,
            stream_name: stream.stream_name,
            consecutive_failures: stream.consecutive_failures,
            last_error_type: stream.last_error_type,
            last_error_message: stream.last_error_message,
            enabled: stream.enabled,
            auto_disabled: stream.auto_disabled,
            health_status: stream.health_status,
          }));
        return {
          ...base,
          success: true,
          result: {
            total_streams: streams.length,
            failing_count: diagnostics.length,
            stream: args.stream_id ? streams[0] ?? null : null,
            diagnostics,
          },
        };
      }

      case "get_execution_log": {
        const log = await getExecutionLog(args.limit ?? 20);
        return { ...base, success: true, result: { entries: log } };
      }

      default:
        return { ...base, success: false, result: null, error: `Unknown tool: ${toolName}` };
    }
  } catch (err: any) {
    return { ...base, success: false, result: null, error: err.message };
  }
}

// ─── Sunam Execute — Full Autonomous Loop ───

export interface SunamExecuteResult {
  instruction: string;
  steps: Array<{
    step: number;
    tool: string;
    args: Record<string, any>;
    result: any;
    success: boolean;
    error?: string;
  }>;
  final_response: string;
  actions_taken: number;
  success: boolean;
  executed_by: string;
  executed_at: number;
}

// ─── Natural Language Parser ───
// Translates plain English into a structured execution plan before the tool-call loop.
// Fully deterministic: keyword matching maps intent to specific tool calls.

function parseNaturalLanguage(
  instruction: string,
  _systemContext: string,
): { parsedInstruction: string; isDirectToolCall: boolean } {
  // Check if instruction already names a tool directly (backward compatible)
  const visibleToolNames = getSunamVisibleToolNames();
  const lowerInstruction = instruction.toLowerCase().trim();

  // If the instruction starts with a tool name or "tool:" prefix, pass through directly
  for (const tn of visibleToolNames) {
    if (lowerInstruction.startsWith(tn) || lowerInstruction.startsWith(`tool: ${tn}`)) {
      return { parsedInstruction: instruction, isDirectToolCall: true };
    }
  }

  // Keyword-to-plan mapping: most specific patterns first
  const patterns: Array<{ keywords: string[]; plan: string }> = [
    // Backfill / signals
    { keywords: ["backfill", "process signals", "fill detected"], plan: "1. Call backfill_stream to process pending signals.\n2. Call inspect_table with table=detected_signals to verify results." },
    { keywords: ["process_signals_batch", "signals batch"], plan: "1. Call process_signals_batch to process pending signals from live_signals." },
    // Stream operations
    { keywords: ["run all streams", "run every stream", "ingest all"], plan: "1. Call get_system_state to list all streams.\n2. Call run_stream for each enabled stream.\n3. Call get_stream_diagnostics to verify results." },
    { keywords: ["retry failed", "retry failing", "re-run failed"], plan: "1. Call get_stream_diagnostics to identify failing streams.\n2. Call retry_stream for each failing stream.\n3. Call get_stream_diagnostics to verify recovery." },
    { keywords: ["run stream", "ingest stream", "trigger stream"], plan: `1. Call run_stream with the stream_id from the instruction: "${instruction}".\n2. Call get_stream_diagnostics to verify result.` },
    { keywords: ["enable stream", "activate stream"], plan: `1. Call enable_stream with the stream_id from the instruction: "${instruction}".` },
    { keywords: ["disable stream", "deactivate stream"], plan: `1. Call disable_stream with the stream_id from the instruction: "${instruction}".` },
    { keywords: ["reset checkpoint", "reset stream"], plan: `1. Call reset_stream_checkpoint with the stream_id from the instruction: "${instruction}".` },
    // Engine operations
    { keywords: ["enable engine", "activate engine"], plan: `1. Call enable_engine with the engine_id from the instruction: "${instruction}".` },
    { keywords: ["disable engine", "deactivate engine"], plan: `1. Call disable_engine with the engine_id from the instruction: "${instruction}".` },
    { keywords: ["patch engine", "update engine config", "modify engine"], plan: `1. Call apply_engine_patch with the engine_id and patch from the instruction: "${instruction}".` },
    // SQL
    { keywords: ["execute sql", "run sql", "run query", "select ", "insert ", "update ", "delete ", "create table"], plan: `1. Call execute_sql with the SQL statement from the instruction: "${instruction}".` },
    { keywords: ["apply migration", "run migration", "schema migration"], plan: `1. Call apply_schema_patch with the migration from the instruction: "${instruction}".` },
    // Diagnostics / inspection
    { keywords: ["inspect table", "check table", "count rows", "how many rows", "table contents"], plan: `1. Call inspect_table with the table name from the instruction: "${instruction}".\n2. Report the results.` },
    { keywords: ["system state", "get state", "current state", "system status", "check status"], plan: "1. Call get_system_state to retrieve current system status.\n2. Report the results." },
    { keywords: ["stream diagnostics", "stream health", "failing streams", "stream errors"], plan: "1. Call get_stream_diagnostics to retrieve stream health.\n2. Report the results." },
    { keywords: ["execution log", "recent actions", "change log", "audit log"], plan: "1. Call get_execution_log to retrieve recent execution history.\n2. Report the results." },
    // UI / file operations
    { keywords: ["read file", "view file", "show file", "check file"], plan: `1. Call ui_read_file with the path from the instruction: "${instruction}".` },
    { keywords: ["write file", "create file", "save file"], plan: `1. Call ui_write_file with the path and content from the instruction: "${instruction}".` },
    { keywords: ["patch file", "edit file", "modify file", "update file", "fix file"], plan: `1. Call ui_read_file first to check current content.\n2. Call ui_patch_file with the changes from the instruction: "${instruction}".\n3. Call ui_read_file to verify the change.` },
    { keywords: ["list files", "show files", "files in"], plan: `1. Call ui_list_files with the directory from the instruction: "${instruction}".` },
    // Config / signals
    { keywords: ["update config", "modify config", "change config", "patch config"], plan: `1. Call apply_stream_patch or apply_engine_patch with the config change from the instruction: "${instruction}".` },
    { keywords: ["adjust weight", "signal weight", "threshold"], plan: `1. Call apply_stream_patch with the weight/threshold change from the instruction: "${instruction}".` },
    // Scheduler
    { keywords: ["refresh scheduler", "restart scheduler", "scheduler status"], plan: "1. Call get_system_state to check scheduler status.\n2. Report scheduler health." },
  ];

  for (const { keywords, plan } of patterns) {
    if (keywords.some(k => lowerInstruction.includes(k.toLowerCase()))) {
      return { parsedInstruction: plan, isDirectToolCall: false };
    }
  }

  // Default: treat as a diagnostics request
  return {
    parsedInstruction: `1. Call get_system_state to understand current system state.\n2. Based on the result, take the most appropriate action for: "${instruction}".\n3. Verify the result.`,
    isDirectToolCall: false,
  };
}

// ─── Error Recovery ───
// Retries failed tool calls with adjusted parameters before surfacing errors.

async function retryWithRecovery(
  toolName: string,
  args: Record<string, any>,
  executedBy: string,
  originalError: string,
): Promise<ToolCallResult> {
  // Strategy 1: Retry with relaxed parameters
  const relaxedArgs = { ...args };
  
  // If a stream_id or engine_id failed, try fetching the correct ID first
  if (originalError.includes("not found") || originalError.includes("No stream") || originalError.includes("No engine")) {
    // Try to find the closest match
    if (args.stream_id) {
      const streams = await db.select({ streamId: dataStreamRegistry.streamId, streamName: dataStreamRegistry.streamName })
        .from(dataStreamRegistry);
      const match = streams.find((s: any) => 
        s.streamId.includes(args.stream_id) || 
        s.streamName.toLowerCase().includes(args.stream_id.toLowerCase())
      );
      if (match) {
        relaxedArgs.stream_id = match.streamId;
        const retryResult = await dispatchTool(toolName, relaxedArgs, executedBy);
        if (retryResult.success) return retryResult;
      }
    }
    if (args.engine_id) {
      const engines = await db.select({ engineId: engineRegistry.engineId, engineName: engineRegistry.engineName })
        .from(engineRegistry);
      const match = engines.find((e: any) => 
        e.engineId.includes(args.engine_id) || 
        e.engineName.toLowerCase().includes(args.engine_id.toLowerCase())
      );
      if (match) {
        relaxedArgs.engine_id = match.engineId;
        const retryResult = await dispatchTool(toolName, relaxedArgs, executedBy);
        if (retryResult.success) return retryResult;
      }
    }
  }

  // Strategy 2: If SQL failed, try wrapping in backticks or adjusting syntax
  if (toolName === "execute_sql" && args.sql_statement) {
    const fixedSql = args.sql_statement
      .replace(/(?<!`)\b(live_signals|detected_signals|engine_registry|data_stream_registry)\b(?!`)/g, '`$1`');
    if (fixedSql !== args.sql_statement) {
      const retryResult = await dispatchTool(toolName, { ...args, sql_statement: fixedSql }, executedBy);
      if (retryResult.success) return retryResult;
    }
  }

  // Both strategies failed — return the original error
  return { tool: toolName, args, result: null, success: false, error: originalError };
}

export async function sunamExecute(
  instruction: string,
  executedBy: string,
  executedByName?: string,
  maxSteps = 10,
): Promise<SunamExecuteResult> {
  const steps: SunamExecuteResult["steps"] = [];
  const executedAt = Date.now();

  // ─── Direct Executor Bypass ───
  // process_signals_batch is a dedicated pathway — no NL parsing, no LLM loop,
  // no SQL fallback, no stream registration, no replanning.
  const trimmedLower = instruction.toLowerCase().trim();
  if (trimmedLower.startsWith("process_signals_batch")) {
    let batchSize = 500;
    const sizeMatch = instruction.match(/batch_size\s*[=:]\s*(\d+)/i);
    if (sizeMatch) batchSize = parseInt(sizeMatch[1], 10);
    // Also support JSON-style args
    const jsonMatch = instruction.match(/\{[^}]*batch_size[^}]*\}/i);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.batch_size) batchSize = parsed.batch_size;
      } catch {}
    }
    const { processSignalsBatch } = await import("../process-signals-batch");
    const directResult = await processSignalsBatch({ batch_size: batchSize });
    return {
      instruction,
      steps: [{
        step: 1,
        tool: "process_signals_batch",
        args: { batch_size: batchSize },
        result: directResult,
        success: true,
      }],
      final_response: `Batch complete: ${directResult.processed} processed, ${directResult.inserted} inserted, ${directResult.skipped} skipped, ${directResult.failed} failed. Final detected_signals count: ${directResult.final_detected_signals_count}`,
      actions_taken: 1,
      success: true,
      executed_by: executedBy,
      executed_at: executedAt,
    };
  }

  // Sovereign Control's standard buttons are deterministic operator commands.
  // They bypass LLM interpretation and dispatch directly through the same governed tools.
  const direct_instruction = resolve_direct_sunam_instruction(instruction);
  if (direct_instruction) {
    const direct_result = await dispatchTool(
      direct_instruction.tool_name,
      direct_instruction.args,
      executedBy,
    );
    const direct_step = {
      step: 1,
      tool: direct_instruction.tool_name,
      args: direct_instruction.args,
      result: direct_result.result,
      success: direct_result.success,
      error: direct_result.error,
    };

    await write_admin_change_log({
      adminId: executedBy,
      adminName: executedByName ?? "Sunam",
      actionType: "config_change",
      targetSystem: "sunam",
      targetId: direct_instruction.tool_name,
      description: `[SUNAM DIRECT] ${instruction.substring(0, 200)} — ${direct_result.success ? "completed" : "failed"}`,
      newState: {
        instruction,
        tool: direct_instruction.tool_name,
        success: direct_result.success,
      },
      rollbackAvailable: false,
      timestamp: new Date(executedAt),
    });

    return {
      instruction,
      steps: [direct_step],
      final_response: direct_result.success
        ? `Executed ${direct_instruction.tool_name}.\n${JSON.stringify(direct_result.result, null, 2)}`
        : `Execution failed: ${direct_result.error ?? "unknown error"}`,
      actions_taken: 1,
      success: direct_result.success,
      executed_by: executedByName ?? executedBy,
      executed_at: executedAt,
    };
  }

  // ─── Phase 1: Natural Language Parsing ───
  // Translate plain English into a structured plan (deterministic, no LLM)
  const { parsedInstruction, isDirectToolCall } = parseNaturalLanguage(instruction, "");

  // ─── Phase 2: Deterministic Plan Execution ───
  // Parse the plan into ordered steps and dispatch each tool call directly.
  // Plan lines look like: "1. Call <tool_name> [with ...]" or just a tool name.
  let finalResponse = "";
  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 3;

  // Extract tool calls from the parsed plan
  const planLines = (isDirectToolCall ? instruction : parsedInstruction).split("\n");
  const plannedCalls: Array<{ toolName: string; rawLine: string }> = [];

  for (const line of planLines) {
    const trimmed = line.trim().replace(/^\d+\.\s*/, ""); // strip leading "1. "
    // Match "Call <tool_name>" or a bare tool name
    const callMatch = trimmed.match(/^(?:call\s+)?([a-z_]+)/i);
    if (callMatch) {
      const candidate = callMatch[1].toLowerCase();
      if (isSunamToolAllowed(candidate)) {
        plannedCalls.push({ toolName: candidate, rawLine: trimmed });
      }
    }
  }

  // If no tool calls were parsed from the plan, fall back to get_system_state
  if (plannedCalls.length === 0) {
    plannedCalls.push({ toolName: "get_system_state", rawLine: "get_system_state" });
  }

  // Execute each planned tool call in order
  for (const { toolName, rawLine } of plannedCalls) {
    if (steps.length >= maxSteps) {
      finalResponse = "Maximum steps reached. Partial execution completed.";
      break;
    }

    // Extract args from the raw instruction line (best-effort key=value / JSON parsing)
    const toolArgs: Record<string, any> = {};
    // Try JSON block in the line
    const jsonMatch = rawLine.match(/\{[^}]+\}/);
    if (jsonMatch) {
      try { Object.assign(toolArgs, JSON.parse(jsonMatch[0])); } catch {}
    }
    // Try key=value pairs
    const kvMatches = rawLine.matchAll(/(\w+)\s*[=:]\s*([\w-]+)/g);
    for (const [, k, v] of kvMatches) {
      if (k !== toolName) toolArgs[k] = isNaN(Number(v)) ? v : Number(v);
    }
    // For stream/engine tools, try to extract an ID from the original instruction
    if ((toolName.includes("stream") || toolName.includes("engine")) && !toolArgs.stream_id && !toolArgs.engine_id) {
      const idMatch = instruction.match(/([a-z0-9][-a-z0-9]{2,})/i);
      if (idMatch) {
        if (toolName.includes("stream")) toolArgs.stream_id = idMatch[1];
        else toolArgs.engine_id = idMatch[1];
      }
    }

    let toolResult = await dispatchTool(toolName, toolArgs, executedBy);

    // Error recovery: retry with adjusted parameters
    if (!toolResult.success && toolResult.error && consecutiveFailures < MAX_CONSECUTIVE_FAILURES) {
      consecutiveFailures++;
      const recoveryResult = await retryWithRecovery(toolName, toolArgs, executedBy, toolResult.error);
      if (recoveryResult.success) {
        toolResult = recoveryResult;
        consecutiveFailures = 0;
      }
    } else if (toolResult.success) {
      consecutiveFailures = 0;
    }

    steps.push({
      step: steps.length + 1,
      tool: toolName,
      args: toolArgs,
      result: toolResult.result,
      success: toolResult.success,
      error: toolResult.error,
    });

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      finalResponse = `Stopped after ${MAX_CONSECUTIVE_FAILURES} consecutive failures. Last error: ${steps[steps.length - 1]?.error || "unknown"}`;
      break;
    }
  }

  if (!finalResponse) {
    const successCount = steps.filter(s => s.success).length;
    const failCount = steps.filter(s => !s.success).length;
    finalResponse = `Execution complete. ${successCount} step(s) succeeded${failCount > 0 ? `, ${failCount} failed` : ""}.`;
    if (steps.length > 0 && steps[steps.length - 1].result) {
      finalResponse += `\nLast result: ${JSON.stringify(steps[steps.length - 1].result).substring(0, 500)}`;
    }
  }

  // Log the overall execution
  await write_admin_change_log({
    adminId: executedBy,
    adminName: executedByName ?? "Sunam",
    actionType: "config_change",
    targetSystem: "sunam",
    targetId: "execute",
    description: `[SUNAM EXECUTE] ${instruction.substring(0, 200)} — ${steps.length} actions taken`,
    newState: { instruction, steps: steps.length, success: steps.every(s => s.success) },
    rollbackAvailable: false,
    timestamp: new Date(executedAt),
  });

  return {
    instruction,
    steps,
    final_response: finalResponse,
    actions_taken: steps.length,
    success: steps.length > 0 && steps.some(s => s.success),
    executed_by: executedByName ?? executedBy,
    executed_at: executedAt,
  };
}
