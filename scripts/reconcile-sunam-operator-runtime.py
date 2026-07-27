from __future__ import annotations

import re
from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one exact anchor, found {count}: {old[:120]!r}")
    path.write_text(text.replace(old, new, 1))


def regex_replace_once(path: Path, pattern: str, replacement: str) -> None:
    text = path.read_text()
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{path}: expected one regex anchor, found {count}: {pattern[:120]!r}")
    path.write_text(updated)


context_path = Path("server/engines/system-copilot-sunam.ts")
replace_once(
    context_path,
    'import { db } from "../db";',
    'import { db, query_with_diagnostics } from "../db";',
)
replace_once(
    context_path,
    '''  const tableResult = await db.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);\n  const tableNames = (tableResult[0] as unknown as any[]).map((r: any) => Object.values(r)[0] as string).sort();''',
    '''  const table_result = await query_with_diagnostics<{ tablename: string }>(\n    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",\n    [],\n    {\n      label: "sunam_system_context_tables",\n      pool_acquire_timeout_ms: 2_000,\n      query_timeout_ms: 5_000,\n    },\n  );\n  const tableNames = table_result.rows\n    .map((row) => String(row.tablename))\n    .filter(Boolean);''',
)

executor_path = Path("server/engines/sunam-executor.ts")
replace_once(
    executor_path,
    'import { db } from "../db";',
    'import { db, query_with_diagnostics } from "../db";',
)
replace_once(
    executor_path,
    'import { SUNAM_SERVICE_ONLY_TOOLS, getSunamVisibleToolNames } from "./sunam-service-only-tools";',
    'import { assert_safe_public_table_name, resolve_direct_sunam_instruction } from "./sunam-runtime-contract";',
)
replace_once(
    executor_path,
    '''];\n\n// ─── Tool Dispatch ───''',
    '''];\n\nconst SUNAM_TOOL_NAMES = new Set(\n  SUNAM_TOOLS.map((tool) => tool.function.name),\n);\n\nexport function getSunamVisibleToolNames(): string[] {\n  return SUNAM_TOOLS.map((tool) => tool.function.name);\n}\n\nexport function isSunamToolAllowed(toolName: string): boolean {\n  return SUNAM_TOOL_NAMES.has(toolName);\n}\n\n// ─── Tool Dispatch ───''',
)
regex_replace_once(
    executor_path,
    r'''  // SCOPED: Validate that only service tools can be called\n  // This ensures Sunam cannot bypass the LLM tool list restriction\n  const \{ isSunamToolAllowed \} = await import\("\./sunam-service-only-tools"\);\n  if \(!isSunamToolAllowed\(toolName\)\) \{.*?\n  \}\n\n  try \{''',
    '''  // One canonical registry governs UI display, planning, LLM tool calls, and dispatch.\n  if (!isSunamToolAllowed(toolName)) {\n    return {\n      ...base,\n      success: false,\n      result: null,\n      error: `Tool '${toolName}' is not available to Sunam. Available tools: ${getSunamVisibleToolNames().join(", ")}`,\n    };\n  }\n\n  try {''',
)
replace_once(
    executor_path,
    '''      description: "Get detailed diagnostics for a specific stream: last run details, error classification, suggested remediation.",\n      parameters: {\n        type: "object",\n        properties: {\n          stream_id: { type: "string" },\n        },\n        required: ["stream_id"],\n        additionalProperties: false,\n      },''',
    '''      description: "Get diagnostics for one stream, or all failing/disabled streams when stream_id is omitted.",\n      parameters: {\n        type: "object",\n        properties: {\n          stream_id: { type: "string" },\n        },\n        additionalProperties: false,\n      },''',
)
replace_once(
    executor_path,
    '''      case "get_system_state": {\n        const [ingestion_summary, signal_summary] = await Promise.all([\n          get_unified_ingestion_summary(),\n          get_unified_signal_summary(),\n        ]);\n        return {\n          ...base,\n          success: true,\n          result: {\n            timestamp: Date.now(),\n            sunam_connected: true,\n            service_layer_active: true,\n            sql_access_disabled: true,\n            ingestion_summary,\n            signal_summary,\n          },\n        };\n      }''',
    '''      case "get_system_state": {\n        const [ingestion_summary, signal_summary, streams, engine_rows] = await Promise.all([\n          get_unified_ingestion_summary(),\n          get_unified_signal_summary(),\n          get_unified_ingestion_metrics(),\n          db.select({\n            engine_id: engineRegistry.engineId,\n            engine_name: engineRegistry.engineName,\n            enabled: engineRegistry.enabled,\n            category: engineRegistry.category,\n            version: engineRegistry.version,\n            sort_order: engineRegistry.sortOrder,\n          }).from(engineRegistry),\n        ]);\n\n        let scheduler_status: Record<string, unknown> = {};\n        try {\n          const { getSchedulerStatus } = await import("../ingestion/scheduler");\n          scheduler_status = getSchedulerStatus() as Record<string, unknown>;\n        } catch (error) {\n          scheduler_status = {\n            available: false,\n            error: error instanceof Error ? error.message : String(error),\n          };\n        }\n\n        const engines = engine_rows\n          .map((engine) => ({\n            ...engine,\n            sort_order: Number(engine.sort_order ?? 0),\n          }))\n          .sort((left, right) =>\n            left.sort_order - right.sort_order ||\n            String(left.engine_name).localeCompare(String(right.engine_name)),\n          );\n        const failures = streams.filter(\n          (stream) =>\n            stream.consecutive_failures > 0 ||\n            stream.auto_disabled ||\n            stream.health_status === "failing",\n        );\n\n        return {\n          ...base,\n          success: true,\n          result: {\n            timestamp: Date.now(),\n            sunam_connected: true,\n            governed_operator_tools: true,\n            direct_sql_access: false,\n            ingestion_summary,\n            signal_summary,\n            engine_count: engines.length,\n            engines,\n            stream_count: streams.length,\n            streams,\n            failure_count: failures.length,\n            failures,\n            scheduler_status,\n          },\n        };\n      }''',
)
replace_once(
    executor_path,
    '''      case "inspect_table": {\n        const limit = args.limit ?? 5;\n        const colResult = await db.execute(sql.raw(`SHOW COLUMNS FROM \\`${args.table_name}\\``));\n        const columns = ((colResult as unknown as any[][])[0] ?? []).map((c: any) => ({ field: c.Field, type: c.Type, null: c.Null, key: c.Key, default: c.Default }));\n        const countResult = await db.execute(sql.raw(`SELECT COUNT(*) as cnt FROM \\`${args.table_name}\\``));\n        const rowCount = ((countResult as unknown as any[][])[0]?.[0])?.cnt ?? 0;\n        const sampleResult = await db.execute(sql.raw(`SELECT * FROM \\`${args.table_name}\\` LIMIT ${limit}`));\n        const rows = ((sampleResult as unknown as any[][])[0] ?? []);\n        return { ...base, success: true, result: { table: args.table_name, columns, row_count: rowCount, sample_rows: rows } };\n      }''',
    '''      case "inspect_table": {\n        const table_name = assert_safe_public_table_name(args.table_name);\n        const limit = Math.min(100, Math.max(1, Math.floor(Number(args.limit ?? 5))));\n        const quoted_table_name = `"${table_name}"`;\n\n        const column_result = await query_with_diagnostics<{\n          column_name: string;\n          data_type: string;\n          is_nullable: string;\n          column_default: string | null;\n        }>(\n          `select column_name, data_type, is_nullable, column_default\n           from information_schema.columns\n           where table_schema = 'public' and table_name = $1\n           order by ordinal_position`,\n          [table_name],\n          { label: "sunam_inspect_columns", query_timeout_ms: 5_000 },\n        );\n        if (column_result.rows.length === 0) {\n          return { ...base, success: false, result: null, error: `public.${table_name} does not exist or has no visible columns` };\n        }\n\n        const count_result = await query_with_diagnostics<{ cnt: string }>(\n          `select count(*)::text as cnt from public.${quoted_table_name}`,\n          [],\n          { label: "sunam_inspect_count", query_timeout_ms: 5_000 },\n        );\n        const sample_result = await query_with_diagnostics<Record<string, unknown>>(\n          `select * from public.${quoted_table_name} limit ${limit}`,\n          [],\n          { label: "sunam_inspect_sample", query_timeout_ms: 5_000 },\n        );\n\n        return {\n          ...base,\n          success: true,\n          result: {\n            table: table_name,\n            columns: column_result.rows,\n            row_count: Number(count_result.rows[0]?.cnt ?? 0),\n            sample_rows: sample_result.rows,\n          },\n        };\n      }''',
)

# One operational registry must govern the parser and both LLM attempts.
text = executor_path.read_text()
text = text.replace("SUNAM_SERVICE_ONLY_TOOLS.map", "SUNAM_TOOLS.map")
text = text.replace("tools: SUNAM_SERVICE_ONLY_TOOLS", "tools: SUNAM_TOOLS")
text = text.replace("// SCOPED: Only service tools visible to Sunam", "// Use the canonical operational tool registry")
text = text.replace("// SCOPED: Sunam can only see and use service layer tools", "// The LLM sees the same governed tools shown in Sovereign Control")
executor_path.write_text(text)

replace_once(
    executor_path,
    '''5. If the instruction mentions "tests" or "vitest", map to execute_sql for checking test-related tables, or ui_read_file/ui_write_file/ui_patch_file for modifying test files\n6. If the instruction mentions checking data counts, map to execute_sql with SELECT COUNT(*)\n7. If the instruction mentions "backfill", map to backfill_stream or execute_sql depending on context\n8. Always end with a verification step (get_system_state, execute_sql SELECT, or inspect_table)''',
    '''5. If the instruction mentions tests or source files, use ui_read_file before ui_patch_file or ui_write_file\n6. If the instruction mentions data counts, use inspect_table or get_system_state\n7. If the instruction mentions backfill, use backfill_stream\n8. Always end with a verification step using get_system_state, get_stream_diagnostics, or inspect_table''',
)
replace_once(
    executor_path,
    '''  // Build system context\n  const { buildSystemContext } = await import("./system-copilot-sunam");''',
    '''  // Sovereign Control's standard buttons are deterministic operator commands.\n  // They bypass LLM interpretation and dispatch directly through the same governed tools.\n  const direct_instruction = resolve_direct_sunam_instruction(instruction);\n  if (direct_instruction) {\n    const direct_result = await dispatchTool(\n      direct_instruction.tool_name,\n      direct_instruction.args,\n      executedBy,\n    );\n    const direct_step = {\n      step: 1,\n      tool: direct_instruction.tool_name,\n      args: direct_instruction.args,\n      result: direct_result.result,\n      success: direct_result.success,\n      error: direct_result.error,\n    };\n\n    await db.insert(adminChangeLog).values({\n      adminId: executedBy,\n      adminName: executedByName ?? "Sunam",\n      actionType: "config_change",\n      targetSystem: "sunam",\n      targetId: direct_instruction.tool_name,\n      description: `[SUNAM DIRECT] ${instruction.substring(0, 200)} — ${direct_result.success ? "completed" : "failed"}`,\n      newState: {\n        instruction,\n        tool: direct_instruction.tool_name,\n        success: direct_result.success,\n      },\n      rollbackAvailable: false,\n      timestamp: new Date(executedAt),\n    });\n\n    return {\n      instruction,\n      steps: [direct_step],\n      final_response: direct_result.success\n        ? `Executed ${direct_instruction.tool_name}.\\n${JSON.stringify(direct_result.result, null, 2)}`\n        : `Execution failed: ${direct_result.error ?? "unknown error"}`,\n      actions_taken: 1,\n      success: direct_result.success,\n      executed_by: executedByName ?? executedBy,\n      executed_at: executedAt,\n    };\n  }\n\n  // Build system context\n  const { buildSystemContext } = await import("./system-copilot-sunam");''',
)

if "SUNAM_SERVICE_ONLY_TOOLS" in executor_path.read_text() or "sunam-service-only-tools" in executor_path.read_text():
    raise SystemExit("sunam-executor.ts: stale restricted-tool reference remains")

router_path = Path("server/routers/session76-router.ts")
replace_once(router_path, "  execute: protectedProcedure", "  execute: adminProcedure")
replace_once(router_path, "  getTools: protectedProcedure.query", "  getTools: adminProcedure.query")
replace_once(router_path, "  dispatchTool: protectedProcedure", "  dispatchTool: adminProcedure")

ui_path = Path("client/src/pages/SovereignControl.tsx")
replace_once(
    ui_path,
    "Sunam has full authority over streams, engines, SQL, migrations, config, and UI.",
    "Sunam has governed authority over streams, engines, scheduler, diagnostics, configuration, and UI. Schema changes remain in Admin Control.",
)

print("Sunam operator runtime reconciliation applied")
