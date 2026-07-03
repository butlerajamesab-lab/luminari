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

import { db } from "../db";
import { eq, desc, sql } from "drizzle-orm";
import {
  engineRegistry,
  dataStreamRegistry,
  adminChangeLog,
  ingestRuns,
} from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";
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
import { SUNAM_SERVICE_ONLY_TOOLS, getSunamVisibleToolNames } from "./sunam-service-only-tools";
import { get_unified_ingestion_metrics, get_unified_ingestion_summary, get_unified_signal_summary, get_unified_signals } from "../unified-queries";

// ─── Tool Definitions ───

export const SUNAM_TOOLS = [
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
      description: "Run ingestion for ALL enabled data streams. Returns per-stream results.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "retry_failed_streams",
      description: "Find all streams with recent failures and retry them.",
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
      description: "Get detailed diagnostics for a specific stream: last run details, error classification, suggested remediation.",
      parameters: {
        type: "object",
        properties: {
          stream_id: { type: "string" },
        },
        required: ["stream_id"],
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

  // SCOPED: Validate that only service tools can be called
  // This ensures Sunam cannot bypass the LLM tool list restriction
  const { isSunamToolAllowed } = await import("./sunam-service-only-tools");
  if (!isSunamToolAllowed(toolName)) {
    return {
      ...base,
      success: false,
      result: null,
      error: `Tool '${toolName}' is not available to Sunam. Available tools: get_case_context, get_case, get_case_timeline, get_case_notes, get_jurisdiction, get_workflows, get_programs, get_entities, get_signals, record_validation, record_reconciliation, record_case_action, add_case_note, update_case_status, get_system_state`,
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
        const streams = await db.select({ streamId: dataStreamRegistry.streamId, streamName: dataStreamRegistry.streamName })
          .from(dataStreamRegistry).where(eq(dataStreamRegistry.enabled, true));
        const results = [];
        for (const s of streams) {
          try {
            const r = await Promise.race([
              triggerManualIngestion(s.streamId),
              new Promise<null>((res) => setTimeout(() => res(null), 120_000)),
            ]);
            results.push({ stream_id: s.streamId, success: r?.success ?? true, records: r?.recordsProcessed ?? 0, signals: r?.signalsGenerated ?? 0 });
          } catch (e: any) {
            results.push({ stream_id: s.streamId, success: false, error: e.message });
          }
        }
        return { ...base, success: true, result: { total: streams.length, succeeded: results.filter(r => r.success).length, results } };
      }

      case "retry_failed_streams": {
        const { triggerManualIngestion } = await import("../ingestion/scheduler");
        const hoursBack = args.hours_back ?? 24;
        const cutoff = Date.now() - hoursBack * 3600 * 1000;
        const failedRuns = await db.select({ datasetId: ingestRuns.datasetId })
          .from(ingestRuns).where(sql`${ingestRuns.status} = 'failed' AND ${ingestRuns.startTime} > ${cutoff}`);
        const unique = [...new Set(failedRuns.map((r: any) => r.datasetId))];
        const results = [];
        for (const sid of unique) {
          try {
            const r = await Promise.race([
              triggerManualIngestion(sid as string),
              new Promise<null>((res) => setTimeout(() => res(null), 120_000)),
            ]);
            results.push({ stream_id: sid, success: r?.success ?? true, records: r?.recordsProcessed ?? 0 });
          } catch (e: any) {
            results.push({ stream_id: sid, success: false, error: e.message });
          }
        }
        return { ...base, success: true, result: { streams_retried: unique.length, succeeded: results.filter(r => r.success).length, results } };
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
        await db.insert(adminChangeLog).values({
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
        await db.insert(adminChangeLog).values({
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
        await db.insert(adminChangeLog).values({
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
        const [ingestion_summary, signal_summary] = await Promise.all([
          get_unified_ingestion_summary(),
          get_unified_signal_summary(),
        ]);
        return {
          ...base,
          success: true,
          result: {
            timestamp: Date.now(),
            sunam_connected: true,
            service_layer_active: true,
            sql_access_disabled: true,
            ingestion_summary,
            signal_summary,
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
        await db.insert(adminChangeLog).values({
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
        const limit = args.limit ?? 5;
        const colResult = await db.execute(sql.raw(`SHOW COLUMNS FROM \`${args.table_name}\``));
        const columns = ((colResult as unknown as any[][])[0] ?? []).map((c: any) => ({ field: c.Field, type: c.Type, null: c.Null, key: c.Key, default: c.Default }));
        const countResult = await db.execute(sql.raw(`SELECT COUNT(*) as cnt FROM \`${args.table_name}\``));
        const rowCount = ((countResult as unknown as any[][])[0]?.[0])?.cnt ?? 0;
        const sampleResult = await db.execute(sql.raw(`SELECT * FROM \`${args.table_name}\` LIMIT ${limit}`));
        const rows = ((sampleResult as unknown as any[][])[0] ?? []);
        return { ...base, success: true, result: { table: args.table_name, columns, row_count: rowCount, sample_rows: rows } };
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
// This allows Sunam to accept conversational prompts like "Fix the failing tests" or
// "Check if detected_signals has data and backfill if empty".

async function parseNaturalLanguage(
  instruction: string,
  systemContext: string,
): Promise<{ parsedInstruction: string; isDirectToolCall: boolean }> {
  // Check if instruction already names a tool directly (backward compatible)
  // SCOPED: Only service tools visible to Sunam
  const visibleToolNames = getSunamVisibleToolNames();
  const lowerInstruction = instruction.toLowerCase().trim();
  
  // If the instruction starts with a tool name or "tool:" prefix, pass through directly
  for (const tn of visibleToolNames) {
    if (lowerInstruction.startsWith(tn) || lowerInstruction.startsWith(`tool: ${tn}`)) {
      return { parsedInstruction: instruction, isDirectToolCall: true };
    }
  }

  // Build a tool summary for the NL parser
  // SCOPED: Only service tools visible to Sunam
  const toolSummary = SUNAM_SERVICE_ONLY_TOOLS.map(t => 
    `- ${t.function.name}: ${t.function.description}`
  ).join("\n");

  // Use LLM to translate natural language into a structured execution plan
  const planResponse = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are Sunam's instruction parser. Your job is to translate natural language instructions into clear, step-by-step execution plans that reference specific tools.

Available tools:
${toolSummary}

System context (abbreviated):
${systemContext.substring(0, 1500)}

RULES:
1. Output a clear, imperative execution plan that the tool-calling LLM can follow
2. Reference specific tool names when the mapping is clear
3. For multi-step tasks, number the steps in order
4. If the instruction is ambiguous, make the most reasonable interpretation and proceed
5. If the instruction mentions "tests" or "vitest", map to execute_sql for checking test-related tables, or ui_read_file/ui_write_file/ui_patch_file for modifying test files
6. If the instruction mentions checking data counts, map to execute_sql with SELECT COUNT(*)
7. If the instruction mentions "backfill", map to backfill_stream or execute_sql depending on context
8. Always end with a verification step (get_system_state, execute_sql SELECT, or inspect_table)
9. Keep the plan concise — no explanations, just steps
10. For file modifications, always use ui_read_file first to check current content, then ui_patch_file to make changes`,
      },
      {
        role: "user",
        content: `Translate this instruction into an execution plan:\n\n"${instruction}"`,
      },
    ],
  });

  const rawContent = planResponse.choices?.[0]?.message?.content;
  const plan = (typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent)) || instruction;
  return { parsedInstruction: plan, isDirectToolCall: false };
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

  // Build system context
  const { buildSystemContext } = await import("./system-copilot-sunam");
  const systemContext = await buildSystemContext();

  // ─── Phase 1: Natural Language Parsing ───
  // Translate plain English into a structured plan if needed
  const { parsedInstruction, isDirectToolCall } = await parseNaturalLanguage(instruction, systemContext);

  // Build the effective instruction — use parsed plan for NL, original for direct tool calls
  const effectiveInstruction = isDirectToolCall ? instruction : 
    `ORIGINAL REQUEST: ${instruction}\n\nEXECUTION PLAN:\n${parsedInstruction}\n\nFollow the execution plan above. Call tools in the order specified. If a step fails, try an alternative approach before giving up.`;

  const messages: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; name?: string }> = [
    {
      role: "system",
      content: `You are Sunam, the autonomous system operator for the Luminari Forensic Engine.

You have FULL execution authority. You execute actions DIRECTLY — no proposals, no approval flow, no artifacts.
When you call a tool, it executes immediately and returns the real result.

${systemContext}

EXECUTION RULES:
1. When given an instruction, call the appropriate tool(s) immediately
2. After each tool call, review the result and decide if more steps are needed
3. Chain tool calls as needed (e.g. diagnose → fix → verify)
4. Always call get_system_state or get_stream_diagnostics first if you need to understand current state
5. After making changes, verify them with a follow-up tool call
6. When done, provide a concise summary of what was done and the result
7. If a tool call fails, try an alternative approach (different tool, adjusted parameters) before reporting failure
8. For multi-step instructions, complete ALL steps before providing the final summary
9. Accept both exact tool syntax AND natural language — parse intent and act accordingly

You are operating as: ${executedByName ?? executedBy}
Timestamp: ${new Date(executedAt).toISOString()}`,
    },
    { role: "user", content: effectiveInstruction },
  ];

  let stepCount = 0;
  let finalResponse = "";
  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 3;

  // ─── Phase 2: Tool-Call Loop with Error Recovery ───
  while (stepCount < maxSteps) {
    let llmResponse;
    try {
      llmResponse = await invokeLLM({
        messages: messages as any,
        tools: SUNAM_SERVICE_ONLY_TOOLS,
        // Use "auto" always — let the LLM decide when to call tools
        // SCOPED: Sunam can only see and use service layer tools
        tool_choice: "auto",
      });
    } catch (llmError: any) {
      // If LLM call itself fails, retry once with simplified context
      try {
        const trimmedMessages = messages.slice(0, 2).concat(messages.slice(-4));
        llmResponse = await invokeLLM({
          messages: trimmedMessages as any,
          tools: SUNAM_SERVICE_ONLY_TOOLS,
          tool_choice: "auto",
        });
      } catch {
        finalResponse = `LLM error after retry: ${llmError.message}`;
        break;
      }
    }

    const choice = llmResponse?.choices?.[0];
    if (!choice) {
      finalResponse = "No response from LLM. Execution halted.";
      break;
    }

    const msg = choice.message;

    // If no tool calls, we're done — LLM is providing its final summary
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      finalResponse = (typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)) || "Execution complete.";
      break;
    }

    // Process tool calls
    const toolResultMessages: any[] = [];

    for (const tc of msg.tool_calls) {
      stepCount++;
      const toolName = tc.function.name;
      let toolArgs: Record<string, any> = {};
      try {
        toolArgs = JSON.parse(tc.function.arguments);
      } catch {}

      let toolResult = await dispatchTool(toolName, toolArgs, executedBy);

      // ─── Error Recovery: retry with adjusted parameters ───
      if (!toolResult.success && toolResult.error && consecutiveFailures < MAX_CONSECUTIVE_FAILURES) {
        consecutiveFailures++;
        const recoveryResult = await retryWithRecovery(toolName, toolArgs, executedBy, toolResult.error);
        if (recoveryResult.success) {
          toolResult = recoveryResult;
          consecutiveFailures = 0; // Reset on success
        }
      } else if (toolResult.success) {
        consecutiveFailures = 0;
      }

      steps.push({
        step: stepCount,
        tool: toolName,
        args: toolArgs,
        result: toolResult.result,
        success: toolResult.success,
        error: toolResult.error,
      });

      toolResultMessages.push({
        role: "tool",
        tool_call_id: tc.id,
        name: toolName,
        content: JSON.stringify(toolResult.success ? toolResult.result : { error: toolResult.error, recovery_attempted: consecutiveFailures > 0 }),
      });
    }

    // Add assistant message with tool calls
    messages.push({ role: "assistant", content: msg.content || "", ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}) } as any);

    // Add tool results
    for (const tr of toolResultMessages) {
      messages.push(tr as any);
    }

    // If too many consecutive failures, stop and report
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      finalResponse = `Stopped after ${MAX_CONSECUTIVE_FAILURES} consecutive failures. Last error: ${steps[steps.length - 1]?.error || "unknown"}`;
      break;
    }

    if (stepCount >= maxSteps) {
      finalResponse = "Maximum steps reached. Partial execution completed.";
      break;
    }
  }

  // Log the overall execution
  await db.insert(adminChangeLog).values({
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
