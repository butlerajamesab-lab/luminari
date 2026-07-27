from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, value: str) -> None:
    Path(path).write_text(value)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one regex match, found {count}")
    return updated


# Sunam: use the live PostgreSQL audit adapter for direct and planned runs.
path = "server/engines/sunam-executor.ts"
text = read(path)
text = text.replace("  adminChangeLog,\n", "")
anchor = 'import { get_unified_ingestion_metrics, get_unified_ingestion_summary, get_unified_signal_summary, get_unified_signals } from "../unified-queries";\n'
text = replace_once(
    text,
    anchor,
    anchor + 'import { write_admin_change_log } from "./admin-change-log-store";\n',
    "sunam audit import",
)
text = text.replace("await db.insert(adminChangeLog).values({", "await write_admin_change_log({")
if "db.insert(adminChangeLog)" in text:
    raise RuntimeError("sunam still contains direct adminChangeLog inserts")
write(path, text)


# Admin Sovereign Control: canonical audit adapter and PostgreSQL schema inspection.
path = "server/engines/admin-sovereign-control.ts"
text = read(path)
text = text.replace("  adminChangeLog,\n", "")
anchor = '} from "../../drizzle/schema";\n'
text = replace_once(
    text,
    anchor,
    anchor
    + 'import {\n'
    + '  get_admin_change_log_entry,\n'
    + '  list_admin_change_log,\n'
    + '  mark_admin_change_rolled_back,\n'
    + '  write_admin_change_log,\n'
    + '} from "./admin-change-log-store";\n'
    + 'import { inspect_sovereign_table, list_sovereign_tables } from "./sovereign-schema-inspector";\n',
    "admin control imports",
)
text = regex_once(
    text,
    r"async function logChange\(entry: LogEntry\) \{.*?\n\}\n\nexport async function getChangeLog\(limit = 50\) \{.*?\n\}",
    '''async function logChange(entry: LogEntry) {
  return write_admin_change_log({
    adminId: entry.adminId,
    adminName: entry.adminName,
    actionType: entry.actionType,
    targetSystem: entry.targetSystem,
    targetId: entry.targetId,
    previousState: entry.previousState,
    newState: entry.newState,
    description: entry.description,
    rollbackAvailable: !!entry.rollbackData,
    rollbackData: entry.rollbackData,
    timestamp: new Date(),
  });
}

export async function getChangeLog(limit = 50) {
  return list_admin_change_log(limit);
}''',
    "admin control log functions",
)
text = replace_once(
    text,
    "  const [change] = await db.select().from(adminChangeLog).where(eq(adminChangeLog.id, changeId));\n",
    "  const change = await get_admin_change_log_entry(changeId);\n",
    "admin control rollback read",
)
text = replace_once(
    text,
    "  await db.update(adminChangeLog)\n    .set({ rolledBack: true })\n    .where(eq(adminChangeLog.id, changeId));\n",
    "  await mark_admin_change_rolled_back(changeId);\n",
    "admin control rollback mark",
)
text = regex_once(
    text,
    r"export async function listTables\(\) \{.*?\n\}\n\nexport async function inspectTable\(tableName: string\) \{.*?\n\}",
    '''export async function listTables() {
  return list_sovereign_tables();
}

export async function inspectTable(tableName: string) {
  return inspect_sovereign_table(tableName);
}''',
    "admin control schema manager",
)
if "DESCRIBE `" in text or "FROM `" in text or "db.insert(adminChangeLog)" in text:
    raise RuntimeError("admin control still contains stale database contracts")
write(path, text)


# Executor service: mutations, rollback, and execution history share the same receipt store.
path = "server/engines/executor-service.ts"
text = read(path)
text = text.replace("  adminChangeLog,\n", "")
anchor = '} from "../../drizzle/schema";\n'
text = replace_once(
    text,
    anchor,
    anchor
    + 'import {\n'
    + '  get_admin_change_log_entry,\n'
    + '  list_admin_change_log,\n'
    + '  mark_admin_change_rolled_back,\n'
    + '  write_admin_change_log,\n'
    + '} from "./admin-change-log-store";\n',
    "executor audit imports",
)
text = text.replace(
    "const [logEntry] = await db.insert(adminChangeLog).values({",
    "const logEntry = await write_admin_change_log({",
)
text = text.replace(
    "await db.insert(adminChangeLog).values({",
    "await write_admin_change_log({",
)
text = text.replace(
    "const patchId = (logEntry as any).insertId;",
    "const patchId = logEntry.id;",
)
text = replace_once(
    text,
    "  const [change] = await db.select().from(adminChangeLog)\n    .where(eq(adminChangeLog.id, changeId)).limit(1);\n",
    "  const change = await get_admin_change_log_entry(changeId);\n",
    "executor rollback read",
)
text = replace_once(
    text,
    "    await db.update(adminChangeLog)\n      .set({ rolledBack: true })\n      .where(eq(adminChangeLog.id, changeId));\n",
    "    await mark_admin_change_rolled_back(changeId);\n",
    "executor rollback mark",
)
text = regex_once(
    text,
    r"export async function getExecutionLog\(limit = 50\): Promise<ExecutionLogEntry\[]> \{\n  const changes = await db\.select\(\)\.from\(adminChangeLog\)\n    \.orderBy\(desc\(adminChangeLog\.timestamp\)\)\n    \.limit\(limit\);",
    "export async function getExecutionLog(limit = 50): Promise<ExecutionLogEntry[]> {\n  const changes = await list_admin_change_log(limit);",
    "executor execution log read",
)
if "db.insert(adminChangeLog)" in text or "from(adminChangeLog)" in text:
    raise RuntimeError("executor service still contains direct adminChangeLog access")
write(path, text)


# Governance snapshot insert must return a PostgreSQL id rather than MySQL insertId.
path = "server/governance-log.ts"
text = read(path)
old = '''  const [result] = await dbInstance.insert(governanceSnapshots).values({
    snapshotAt: now,
    upToSeqNo: lastEntry.seqNo,
    hashChainRoot,
    entryCount: entries.length,
    signature,
    signedBy: fingerprint,
    signatureAlgorithm: "Ed25519",
    createdAt: now,
  });
  
  return {
    snapshotId: result.insertId,
    hashChainRoot,
    entryCount: entries.length,
  };'''
new = '''  const [result] = await dbInstance.insert(governanceSnapshots).values({
    snapshotAt: now,
    upToSeqNo: lastEntry.seqNo,
    hashChainRoot,
    entryCount: entries.length,
    signature,
    signedBy: fingerprint,
    signatureAlgorithm: "Ed25519",
    createdAt: now,
  }).returning({ id: governanceSnapshots.id });

  if (!result?.id) {
    throw new Error("Governance snapshot insert did not return an id");
  }
  
  return {
    snapshotId: Number(result.id),
    hashChainRoot,
    entryCount: entries.length,
  };'''
text = replace_once(text, old, new, "governance snapshot returning")
write(path, text)


# Preserve legacy governance and expose the constitutional dashboard contract separately.
path = "server/routers.ts"
text = read(path)
text = replace_once(
    text,
    'import { governanceRouter } from "./routers/governance";\n',
    'import { governanceRouter } from "./routers/governance";\n'
    'import { governanceRouter as constitutionalGovernanceRouter } from "./routers/governance-router";\n',
    "constitutional governance import",
)
text = replace_once(
    text,
    "  governance: governanceRouter,\n",
    "  governance: governanceRouter,\n  constitutionalGovernance: constitutionalGovernanceRouter,\n",
    "constitutional governance mount",
)
write(path, text)

for path in [
    "client/src/pages/GovernanceDashboard.tsx",
    "client/src/pages/Verify.tsx",
]:
    text = read(path)
    count = text.count("trpc.governance.")
    if count == 0:
        raise RuntimeError(f"{path}: expected governance client calls")
    text = text.replace("trpc.governance.", "trpc.constitutionalGovernance.")
    write(path, text)

print("Sovereign Continuity reconciliation applied")
