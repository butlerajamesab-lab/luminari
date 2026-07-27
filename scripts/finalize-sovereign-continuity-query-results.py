from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, found {count}")
    file.write_text(text.replace(old, new, 1))


replace_once(
    "server/engines/admin-sovereign-control.ts",
    '''    const result = await db.execute(sql.raw(sqlStatement));
    const rows = result[0] as unknown as any[];
    const rowsAffected = (result[0] as any)?.affectedRows || rows?.length || 0;''',
    '''    const result = await db.execute(sql.raw(sqlStatement));
    const rows = Array.isArray((result as any).rows)
      ? (result as any).rows
      : [];
    const rowsAffected = Number((result as any).rowCount ?? rows.length ?? 0);''',
)

replace_once(
    "server/engines/executor-service.ts",
    '''    const result = await db.execute(sql.raw(sqlStatement));
    const affectedRows = (result[0] as any)?.affectedRows ?? 0;''',
    '''    const result = await db.execute(sql.raw(sqlStatement));
    const affectedRows = Number((result as any).rowCount ?? 0);''',
)

print("Final PostgreSQL query result reconciliation applied")
