/**
 * System Copilot — Sunam
 * 
 * LLM-powered conversational assistant for system administration.
 * Can inspect, analyze, and propose modifications to the Luminari platform.
 * 
 * Capabilities:
 * - Inspect system state (tables, engines, streams, signals)
 * - Propose SQL, config changes, engine modifications
 * - Generate impact analysis for proposed changes
 * - Approval workflow: draft → pending_approval → approved → executed
 * - Rollback support for executed changes
 */
import { db } from "../db";
import { eq, desc, sql, and } from "drizzle-orm";
import {
  copilotConversations,
  copilotMessages,
  copilotArtifacts,
  copilotImpactAnalyses,
  copilotExecutions,
  copilotSystemContext,
  engineRegistry,
  dataStreamRegistry,
  adminChangeLog,
} from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";
import { applyEnginePatch, applyStreamPatch, applySchemaPatch, rollbackPatch as executorRollback, getExecutionLog } from "./executor-service";
import { uiReadFile, uiWriteFile, uiPatchFile, uiListFiles, uiGetChangeLog, uiRollbackLastWrite } from "../ui-editor";

// ─── System Context Builder ───

/** Build a system context summary for the LLM */
export async function buildSystemContext(): Promise<string> {
  // Get table list
  const tableResult = await db.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  const tableNames = (tableResult[0] as unknown as any[]).map((r: any) => Object.values(r)[0] as string).sort();

  // Get engine list
  const engines = await db.select().from(engineRegistry);

  // Get stream list
  const streams = await db.select().from(dataStreamRegistry);

  // Datasets are unified into dataStreamRegistry — no separate query

  // Get recent changes
  const recentChanges = await db.select().from(adminChangeLog).orderBy(desc(adminChangeLog.timestamp)).limit(10);

  const context = `
## Luminari Forensic Engine — System State

### Database Tables (${tableNames.length} total)
${tableNames.map(t => `- ${t}`).join("\n")}

### Registered Engines (${engines.length} total)
${engines.length > 0 ? engines.map((e: any) => `- ${e.engineId}: ${e.engineName} [${e.enabled ? "ENABLED" : "DISABLED"}] (category: ${e.category || "uncategorized"})`).join("\n") : "No engines registered yet."}

### Data Streams (${streams.length} total)
${streams.length > 0 ? streams.map((s: any) => {
    const status = (s as any).autoDisabled ? "AUTO-DISABLED" : s.enabled ? "ENABLED" : "DISABLED";
    const failures = (s as any).consecutiveFailures ?? 0;
    const failureInfo = failures > 0 ? ` [${failures} consecutive failures]` : "";
    const lastError = (s as any).lastErrorType ? ` [last error: ${(s as any).lastErrorType}]` : "";
    return `- ${s.streamId}: ${s.streamName} [${status}] (type: ${s.streamType}, weight: ${s.signalWeight}, records: ${s.recordsIngested}, signals: ${s.signalsGenerated})${failureInfo}${lastError}`;
  }).join("\n") : "No streams registered yet."}

### Registered Datasets (unified into Data Streams above)
All datasets are now managed through the Data Stream Registry. Each stream entry includes its API URL, field mapping, and ingestion configuration.

### Recent Admin Changes (last 10)
${recentChanges.length > 0 ? recentChanges.map((c: any) => `- [${new Date(Number(c.timestamp)).toISOString()}] ${c.actionType}: ${c.description || "No description"}`).join("\n") : "No recent changes."}

### Self-Healing Status
- Auto-disabled streams: ${streams.filter((s: any) => (s as any).autoDisabled).length}
- Streams with failures: ${streams.filter((s: any) => ((s as any).consecutiveFailures ?? 0) > 0).length}
- Total failure count: ${streams.reduce((sum: any, s: any) => sum + ((s as any).failureCount ?? 0), 0)}

### Stream Failure Details
${streams.filter((s: any) => ((s as any).consecutiveFailures ?? 0) > 0 || (s as any).autoDisabled).map((s: any) => {
    return `- ${s.streamId}: ${(s as any).consecutiveFailures ?? 0} consecutive failures, ${(s as any).failureCount ?? 0} total, lastError: ${(s as any).lastErrorType || "none"}, lastHttpStatus: ${(s as any).lastHttpStatus || "none"}, autoDisabled: ${(s as any).autoDisabled ? "YES" : "no"}, disabledReason: ${(s as any).disabledReason || "none"}`;
  }).join("\n") || "No streams with failures."}

### Capabilities & Execution Authority
You have FULL execution authority. When artifacts are approved, they perform REAL system mutations:
1. **sql** artifacts: Execute SQL directly against the database
2. **engine** artifacts: Enable/disable engines, update config, change versions (JSON format: {engineId, action, ...params})
3. **stream** artifacts: Enable/disable streams, update weights, edit config, re-enable auto-disabled streams (JSON format: {streamId, action, ...params})
4. **config** artifacts: Execute SQL targeting config/settings tables
5. **rule** artifacts: Execute SQL for signal detection rules or thresholds
6. **engine_patch** artifacts: Diff-based engine updates via executor service with automatic rollback (JSON format: {engineId, changes: {field: newValue}})
7. **stream_patch** artifacts: Diff-based stream updates via executor service with automatic rollback (JSON format: {streamId, changes: {field: newValue}})
8. **schema_patch** artifacts: Schema migrations via executor service with rollback SQL (JSON format: {migrationSql, rollbackSql, description})
9. **ui_patch** artifacts: Direct frontend UI modifications — read/write/patch React components in /client/src/ (JSON format: {action: "read"|"write"|"patch"|"list", path, content?, find?, replace?}). UI patches apply IMMEDIATELY via Vite hot reload. NO approval required.

You can also:
- Inspect any table's schema and sample data
- Propose SQL queries or migrations
- Suggest engine configuration changes
- Recommend stream weight adjustments
- Analyze system health and data quality
- Generate reports on patterns and signals
- Diagnose stream failures and suggest remediations
- Re-enable auto-disabled streams
- Modify frontend UI components directly (add buttons, change layouts, update text)
- View execution log of all system patches

### Safety Rules
- NEVER propose dropping tables without explicit confirmation
- NEVER expose secrets, API keys, or credentials
- Always generate rollback SQL for destructive operations
- Flag high-risk operations clearly
- Prefer non-destructive operations when possible
- UI patches: only edit files inside /client/src/, maintain valid JSX/TSX syntax
`;

  return context.trim();
}

// ─── Conversation Management ───

export async function createConversation(userId: string, title?: string) {
  const [result] = await db.insert(copilotConversations).values({
    userId,
    title: title || "New Conversation",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return { id: (result as any).insertId };
}

export async function getConversations(userId: string, limit = 20) {
  return db.select().from(copilotConversations)
    .where(and(eq(copilotConversations.userId, userId), eq(copilotConversations.status, "active")))
    .orderBy(desc(copilotConversations.updatedAt))
    .limit(limit);
}

export async function getConversationMessages(conversationId: number) {
  return db.select().from(copilotMessages)
    .where(eq(copilotMessages.conversationId, conversationId))
    .orderBy(copilotMessages.createdAt);
}

export async function archiveConversation(conversationId: number) {
  await db.update(copilotConversations)
    .set({ status: "archived", updatedAt: Date.now() })
    .where(eq(copilotConversations.id, conversationId));
  return { success: true };
}

// ─── Chat with Sunam ───

export async function chat(
  conversationId: number,
  userMessage: string,
  userId: string,
): Promise<{ response: string; artifact?: { id: number; type: string; title: string } }> {
  // Save user message
  await db.insert(copilotMessages).values({
    conversationId,
    role: "user",
    content: userMessage,
    createdAt: Date.now(),
  });

  // Update conversation timestamp
  await db.update(copilotConversations)
    .set({ updatedAt: Date.now() })
    .where(eq(copilotConversations.id, conversationId));

  // Build context
  const systemContext = await buildSystemContext();

  // Get conversation history (last 20 messages)
  const history = await db.select().from(copilotMessages)
    .where(eq(copilotMessages.conversationId, conversationId))
    .orderBy(copilotMessages.createdAt)
    .limit(20);

  // Build messages for LLM
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    {
      role: "system",
      content: `You are Sunam, the System Copilot for the Luminari Forensic Engine platform. You help administrators inspect, analyze, and manage the system.

${systemContext}

When proposing changes, format them as artifacts using this pattern:
[ARTIFACT:type:title]
content here
[/ARTIFACT]

Supported artifact types: sql, engine, config, stream, rule, engine_patch, stream_patch, schema_patch, ui_patch

For engine_patch artifacts (preferred for engine modifications):
[ARTIFACT:engine_patch:Update signal-detection-engine config]
{"engineId": "signal-detection-engine", "updates": {"configJson": {"threshold": 0.8}, "version": "2.1"}}
[/ARTIFACT]

For stream_patch artifacts (preferred for stream modifications):
[ARTIFACT:stream_patch:Update WA Consumer Complaints weight]
{"streamId": "gpri-47xz", "updates": {"signalWeight": 1.5, "cronExpression": "0 */4 * * *"}}
[/ARTIFACT]

For schema_patch artifacts (SQL with rollback):
[ARTIFACT:schema_patch:Add index to live_signals]
{"sql": "CREATE INDEX idx_ls_entity ON live_signals(entity_name);", "rollbackSql": "DROP INDEX idx_ls_entity ON live_signals;", "description": "Add entity name index for faster lookups"}
[/ARTIFACT]

Prefer engine_patch/stream_patch/schema_patch over raw sql/engine/stream types because they provide:
- Automatic diff generation (before/after comparison)
- Impact analysis
- One-click rollback
- Full audit trail via executor service

For ui_patch artifacts (DIRECT UI modification — NO approval required, executes immediately):
[ARTIFACT:ui_patch:Add Run All button to DataStreamPanel]
{"action": "patch", "filePath": "pages/SovereignControl.tsx", "patches": [{"find": "<div className=\"flex gap-2\"", "replace": "<Button onClick={() => fetch('/api/executor/runAllStreams', {method:'POST'})}>Run All</Button>\n<div className=\"flex gap-2\""}]}
[/ARTIFACT]

ui_patch supports these actions:
- "read": {"action": "read", "filePath": "pages/Home.tsx"}
- "write": {"action": "write", "filePath": "pages/NewPage.tsx", "content": "...full file content..."}
- "patch": {"action": "patch", "filePath": "pages/Home.tsx", "patches": [{"find": "old text", "replace": "new text"}]}
- "list": {"action": "list", "dirPath": "pages/"}
- "rollback": {"action": "rollback"}

ui_patch artifacts execute IMMEDIATELY — no approval flow. The Vite dev server auto-reloads on file change.

For SQL artifacts, always include:
1. The SQL to execute
2. A rollback SQL (prefixed with -- ROLLBACK:)

Example:
[ARTIFACT:sql:Add index to live_signals]
CREATE INDEX idx_ls_entity ON live_signals(entity_name);
-- ROLLBACK: DROP INDEX idx_ls_entity ON live_signals;
[/ARTIFACT]

For table inspections, you can run SELECT queries. Format them as artifacts so the admin can execute them.

Be concise, technical, and safety-conscious. Flag destructive operations clearly.`,
    },
  ];

  // Add conversation history
  for (const msg of history) {
    if (msg.role === "user" || msg.role === "assistant") {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  // Call LLM
  const llmResponse = await invokeLLM({ messages });
  const responseText = llmResponse.choices?.[0]?.message?.content || "I apologize, I was unable to generate a response. Please try again.";

  // Parse artifacts from response
  let artifact: { id: number; type: string; title: string } | undefined;
  // @ts-ignore pre-existing type mismatch
  const artifactMatch = responseText.match(/\[ARTIFACT:(\w+):([^\]]+)\]([\s\S]*?)\[\/ARTIFACT\]/);
  
  if (artifactMatch) {
    const [, artifactType, artifactTitle, artifactContent] = artifactMatch;
    
    // Extract rollback content if present
    const rollbackMatch = artifactContent.match(/-- ROLLBACK:([\s\S]*?)$/m);
    const mainContent = rollbackMatch
      ? artifactContent.replace(/-- ROLLBACK:[\s\S]*$/, "").trim()
      : artifactContent.trim();
    const rollbackContent = rollbackMatch ? rollbackMatch[1].trim() : null;

    const [insertResult] = await db.insert(copilotArtifacts).values({
      conversationId,
      artifactType: artifactType as any,
      title: artifactTitle,
      content: mainContent,
      status: "pending_approval",
      rollbackContent,
      createdAt: Date.now(),
    });

    const artifactId = (insertResult as any).insertId;

    // Generate impact analysis
    await generateImpactAnalysis(artifactId, artifactType, mainContent);

    artifact = { id: artifactId, type: artifactType, title: artifactTitle };
  }

  // Save assistant message
  // @ts-ignore pre-existing type mismatch
  await db.insert(copilotMessages).values({
    conversationId,
    role: "assistant",
    content: responseText,
    artifactId: artifact?.id,
    createdAt: Date.now(),
  });

  // @ts-ignore pre-existing type mismatch
  return { response: responseText, artifact };
}

// ─── Artifact Management ───

export async function getArtifact(artifactId: number) {
  const [artifact] = await db.select().from(copilotArtifacts).where(eq(copilotArtifacts.id, artifactId));
  if (!artifact) return null;

  const [impact] = await db.select().from(copilotImpactAnalyses).where(eq(copilotImpactAnalyses.artifactId, artifactId));
  const executions = await db.select().from(copilotExecutions)
    .where(eq(copilotExecutions.artifactId, artifactId))
    .orderBy(desc(copilotExecutions.executedAt));

  return { ...artifact, impact, executions };
}

export async function getPendingArtifacts() {
  return db.select().from(copilotArtifacts)
    .where(eq(copilotArtifacts.status, "pending_approval"))
    .orderBy(desc(copilotArtifacts.createdAt));
}

export async function approveArtifact(artifactId: number) {
  await db.update(copilotArtifacts)
    .set({ status: "approved" })
    .where(eq(copilotArtifacts.id, artifactId));
  return { success: true };
}

export async function rejectArtifact(artifactId: number) {
  await db.update(copilotArtifacts)
    .set({ status: "rejected" })
    .where(eq(copilotArtifacts.id, artifactId));
  return { success: true };
}

export async function executeArtifact(artifactId: number, executedBy: string) {
  const [artifact] = await db.select().from(copilotArtifacts).where(eq(copilotArtifacts.id, artifactId));
  if (!artifact) throw new Error("Artifact not found");
  if (artifact.status !== "approved") throw new Error("Artifact must be approved before execution");

  try {
    let resultSummary = "Executed successfully";

    // Execute based on type — REAL system mutations, not proposals
    switch (artifact.artifactType) {
      case "sql": {
        // Direct SQL execution
        const result = await db.execute(sql.raw(artifact.content));
        const affectedRows = (result[0] as any)?.affectedRows;
        resultSummary = affectedRows !== undefined
          ? `SQL executed: ${affectedRows} row(s) affected`
          : "SQL executed successfully";
        break;
      }

      case "engine": {
        // Engine configuration mutation
        // Content format: JSON with { engineId, action, ...params }
        const engineCmd = JSON.parse(artifact.content);
        if (engineCmd.action === "enable" || engineCmd.action === "disable") {
          await db.update(engineRegistry)
            .set({ enabled: engineCmd.action === "enable", updatedAt: Date.now() })
            .where(eq(engineRegistry.engineId, engineCmd.engineId));
          resultSummary = `Engine ${engineCmd.engineId} ${engineCmd.action}d`;
        } else if (engineCmd.action === "update_config") {
          await db.update(engineRegistry)
            .set({ configJson: engineCmd.config, updatedAt: Date.now() })
            .where(eq(engineRegistry.engineId, engineCmd.engineId));
          resultSummary = `Engine ${engineCmd.engineId} config updated`;
        } else if (engineCmd.action === "update_version") {
          await db.update(engineRegistry)
            .set({ version: engineCmd.version, updatedAt: Date.now() })
            .where(eq(engineRegistry.engineId, engineCmd.engineId));
          resultSummary = `Engine ${engineCmd.engineId} version set to ${engineCmd.version}`;
        } else {
          throw new Error(`Unknown engine action: ${engineCmd.action}`);
        }
        break;
      }

      case "stream": {
        // Stream configuration mutation
        const streamCmd = JSON.parse(artifact.content);
        if (streamCmd.action === "enable" || streamCmd.action === "disable") {
          await db.update(dataStreamRegistry)
            .set({ enabled: streamCmd.action === "enable", updatedAt: Date.now() })
            .where(eq(dataStreamRegistry.streamId, streamCmd.streamId));
          resultSummary = `Stream ${streamCmd.streamId} ${streamCmd.action}d`;
        } else if (streamCmd.action === "update_weight") {
          await db.update(dataStreamRegistry)
            .set({ signalWeight: streamCmd.signalWeight, updatedAt: Date.now() })
            .where(eq(dataStreamRegistry.streamId, streamCmd.streamId));
          resultSummary = `Stream ${streamCmd.streamId} weight set to ${streamCmd.signalWeight}`;
        } else if (streamCmd.action === "update_config") {
          const setValues: any = { updatedAt: Date.now() };
          if (streamCmd.apiUrl) setValues.apiUrl = streamCmd.apiUrl;
          if (streamCmd.cronExpression) setValues.cronExpression = streamCmd.cronExpression;
          if (streamCmd.fieldMapping) setValues.fieldMapping = streamCmd.fieldMapping;
          if (streamCmd.sourceUrl) setValues.sourceUrl = streamCmd.sourceUrl;
          await db.update(dataStreamRegistry)
            .set(setValues)
            .where(eq(dataStreamRegistry.streamId, streamCmd.streamId));
          resultSummary = `Stream ${streamCmd.streamId} config updated`;
        } else if (streamCmd.action === "reenable") {
          // Re-enable an auto-disabled stream
          await db.update(dataStreamRegistry)
            .set({
              autoDisabled: false, disabledReason: null,
              consecutiveFailures: 0, retryAfterAt: null, updatedAt: Date.now(),
            })
            .where(eq(dataStreamRegistry.streamId, streamCmd.streamId));
          resultSummary = `Stream ${streamCmd.streamId} re-enabled and failure counters reset`;
        } else {
          throw new Error(`Unknown stream action: ${streamCmd.action}`);
        }
        break;
      }

      case "config": {
        // System config mutation — direct SQL for config tables
        // Content is treated as SQL targeting config/settings tables
        await db.execute(sql.raw(artifact.content));
        resultSummary = "System configuration updated";
        break;
      }

      case "rule": {
        // Rule mutation — typically SQL for signal detection rules or thresholds
        await db.execute(sql.raw(artifact.content));
        resultSummary = "Rule applied successfully";
        break;
      }

      // @ts-ignore pre-existing type mismatch
      case "engine_patch": {
        // Engine patch via executor service — diff-based with rollback
        const epCmd = JSON.parse(artifact.content);
        const epResult = await applyEnginePatch(epCmd.engineId, epCmd.updates, executedBy, "Sunam");
        if (!epResult.success) throw new Error(epResult.error || "Engine patch failed");
        // @ts-ignore pre-existing type mismatch
        resultSummary = `Engine patch applied: ${JSON.stringify(epResult.diff)}`;
        break;
      }

      // @ts-ignore pre-existing type mismatch
      case "stream_patch": {
        // Stream patch via executor service — diff-based with rollback
        const spCmd = JSON.parse(artifact.content);
        const spResult = await applyStreamPatch(spCmd.streamId, spCmd.updates, executedBy, "Sunam");
        if (!spResult.success) throw new Error(spResult.error || "Stream patch failed");
        // @ts-ignore pre-existing type mismatch
        resultSummary = `Stream patch applied: ${JSON.stringify(spResult.diff)}`;
        break;
      }

      // @ts-ignore pre-existing type mismatch
      case "schema_patch": {
        // Schema patch via executor service — SQL with rollback
        const schCmd = JSON.parse(artifact.content);
        const schResult = await applySchemaPatch(schCmd.sql, schCmd.rollbackSql || null, schCmd.description, executedBy, "Sunam");
        if (!schResult.success) throw new Error(schResult.error || "Schema patch failed");
        resultSummary = `Schema patch applied: ${schCmd.description}`;
        break;
      }

      // @ts-ignore pre-existing type mismatch
      case "ui_patch": {
        // UI patch — DIRECT file system modification, no approval needed
        const uiCmd = JSON.parse(artifact.content);
        switch (uiCmd.action) {
          case "read": {
            const readResult = await uiReadFile(uiCmd.filePath, executedBy);
            if (!readResult.success) throw new Error(readResult.error || "UI read failed");
            resultSummary = `UI file read: ${uiCmd.filePath} (${readResult.lines} lines)`;
            break;
          }
          case "write": {
            const writeResult = await uiWriteFile(uiCmd.filePath, uiCmd.content, executedBy);
            if (!writeResult.success) throw new Error(writeResult.error || "UI write failed");
            resultSummary = `UI file written: ${uiCmd.filePath} (${writeResult.lines} lines). Vite will hot-reload.`;
            break;
          }
          case "patch": {
            const patchResult = await uiPatchFile(uiCmd.filePath, uiCmd.patches, executedBy);
            if (!patchResult.success) throw new Error(patchResult.error || "UI patch failed");
            resultSummary = `UI file patched: ${uiCmd.filePath} (${patchResult.patchesApplied} patches applied). Vite will hot-reload.`;
            break;
          }
          case "list": {
            const listResult = await uiListFiles(uiCmd.dirPath || "", executedBy);
            if (!listResult.success) throw new Error(listResult.error || "UI list failed");
            resultSummary = `UI directory listed: ${listResult.files.length} entries`;
            break;
          }
          case "rollback": {
            const rbResult = uiRollbackLastWrite(executedBy);
            if (!rbResult.success) throw new Error(rbResult.error || "UI rollback failed");
            resultSummary = `UI rollback: restored ${rbResult.path}. Vite will hot-reload.`;
            break;
          }
          default:
            throw new Error(`Unknown ui_patch action: ${uiCmd.action}`);
        }
        break;
      }

      default:
        throw new Error(`Unsupported artifact type: ${artifact.artifactType}`);
    }

    await db.update(copilotArtifacts)
      .set({ status: "executed" })
      .where(eq(copilotArtifacts.id, artifactId));

    await db.insert(copilotExecutions).values({
      artifactId,
      executedBy,
      status: "success",
      resultSummary,
      executedAt: Date.now(),
    });

    // Log in admin change log
    await db.insert(adminChangeLog).values({
      adminId: executedBy,
      actionType: artifact.artifactType === "sql" ? "migration_run" : "config_change",
      targetSystem: "copilot",
      targetId: String(artifactId),
      description: `Copilot artifact executed: ${artifact.title} — ${resultSummary}`,
      newState: { content: artifact.content, type: artifact.artifactType },
      rollbackAvailable: !!artifact.rollbackContent,
      rollbackData: artifact.rollbackContent ? { content: artifact.rollbackContent, type: artifact.artifactType } : null,
      timestamp: new Date(),
    });

    return { success: true, summary: resultSummary };
  } catch (error: any) {
    await db.insert(copilotExecutions).values({
      artifactId,
      executedBy,
      status: "failed",
      errorMessage: error.message,
      executedAt: Date.now(),
    });

    return { success: false, error: error.message };
  }
}

export async function rollbackArtifact(artifactId: number, executedBy: string) {
  const [artifact] = await db.select().from(copilotArtifacts).where(eq(copilotArtifacts.id, artifactId));
  if (!artifact) throw new Error("Artifact not found");
  if (!artifact.rollbackContent) throw new Error("No rollback content available");

  try {
    await db.execute(sql.raw(artifact.rollbackContent));

    await db.update(copilotArtifacts)
      .set({ status: "rolled_back" })
      .where(eq(copilotArtifacts.id, artifactId));

    await db.insert(copilotExecutions).values({
      artifactId,
      executedBy,
      status: "rolled_back",
      resultSummary: "Rolled back successfully",
      executedAt: Date.now(),
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ─── Impact Analysis ───

async function generateImpactAnalysis(artifactId: number, artifactType: string, content: string) {
  // Analyze what the artifact affects
  const affectedTables: string[] = [];
  const affectedEngines: string[] = [];
  const affectedStreams: string[] = [];
  let riskLevel: "low" | "medium" | "high" | "critical" = "low";
  let rollbackComplexity: "simple" | "moderate" | "complex" = "simple";

  if (artifactType === "sql") {
    const upper = content.toUpperCase();
    // Extract table names from SQL
    const tableMatches = content.match(/(?:FROM|INTO|UPDATE|TABLE|JOIN)\s+`?(\w+)`?/gi);
    if (tableMatches) {
      for (const match of tableMatches) {
        const tableName = match.replace(/(?:FROM|INTO|UPDATE|TABLE|JOIN)\s+`?/i, "").replace(/`/g, "");
        if (tableName && !affectedTables.includes(tableName)) {
          affectedTables.push(tableName);
        }
      }
    }

    if (upper.includes("DROP") || upper.includes("TRUNCATE")) {
      riskLevel = "critical";
      rollbackComplexity = "complex";
    } else if (upper.includes("ALTER") || upper.includes("DELETE")) {
      riskLevel = "high";
      rollbackComplexity = "moderate";
    } else if (upper.includes("INSERT") || upper.includes("UPDATE")) {
      riskLevel = "medium";
      rollbackComplexity = "simple";
    }
  }

  const summary = [
    affectedTables.length > 0 ? `Affects ${affectedTables.length} table(s): ${affectedTables.join(", ")}` : null,
    `Risk level: ${riskLevel}`,
    `Rollback complexity: ${rollbackComplexity}`,
  ].filter(Boolean).join(". ");

  await db.insert(copilotImpactAnalyses).values({
    artifactId,
    affectedTables,
    affectedEngines,
    affectedStreams,
    riskLevel,
    rollbackComplexity,
    summary,
    createdAt: Date.now(),
  });
}

// ─── Quick Inspect ───

export async function inspectTable(tableName: string) {
  let schema = "";
  try {
    const result = await db.execute(sql.raw(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = \'public\' AND table_name = \'${tableName}\'`));
    schema = ((result[0] as unknown as any[])[0] as any)?.["Create Table"] || "";
  } catch { /* */ }

  let rowCount = 0;
  try {
    const result = await db.execute(sql.raw(`SELECT COUNT(*) as cnt FROM \`${tableName}\``));
    rowCount = ((result[0] as unknown as any[])[0] as any)?.cnt || 0;
  } catch { /* */ }

  let sampleRows: any[] = [];
  try {
    const result = await db.execute(sql.raw(`SELECT * FROM \`${tableName}\` LIMIT 5`));
    sampleRows = result[0] as unknown as any[];
  } catch { /* */ }

  return { tableName, schema, rowCount, sampleRows };
}
