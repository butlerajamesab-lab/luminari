from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    file.write_text(text.replace(old, new, 1))


replace_once(
    "server/engines/spine-postgres.ts",
    '''export type spine_schema_index = {
  indexName: string;
  definition: string;
};

export type spine_table_schema = {''',
    '''export type spine_schema_index = {
  indexName: string;
  definition: string;
};

export type spine_enum_definition = {
  enumName: string;
  labels: string[];
};

export type spine_table_schema = {''',
    "enum type",
)

replace_once(
    "server/engines/spine-postgres.ts",
    '''export async function create_spine_missing_tables(
  schemas: spine_table_schema[],
): Promise<string[]> {
  const client = await getPool().connect();
  const created: string[] = [];
  try {
    await client.query("begin");
    const existingResult = await client.query(
      `select table_name from information_schema.tables where table_schema = 'public'`,
    );''',
    '''export async function create_spine_missing_tables(
  schemas: spine_table_schema[],
  enums: spine_enum_definition[] = [],
): Promise<string[]> {
  const client = await getPool().connect();
  const created: string[] = [];
  try {
    await client.query("begin");

    const existingEnumsResult = await client.query(
      `select t.typname as enum_name
       from pg_type t
       join pg_namespace n on n.oid=t.typnamespace
       where n.nspname='public' and t.typtype='e'`,
    );
    const existingEnums = new Set<string>(
      existingEnumsResult.rows.map((row) => row.enum_name),
    );
    for (const definition of [...enums].sort((a, b) =>
      a.enumName.localeCompare(b.enumName),
    )) {
      const enumName = assert_spine_identifier(definition.enumName, "enum name");
      if (existingEnums.has(enumName)) continue;
      if (!Array.isArray(definition.labels) || definition.labels.length === 0) {
        throw new Error(`Enum ${enumName} has no labels`);
      }
      const labels = definition.labels.map((label) => {
        if (typeof label !== "string" || label.includes("\\u0000")) {
          throw new Error(`Enum ${enumName} contains an invalid label`);
        }
        return `'${label.replace(/'/g, "''")}'`;
      });
      await client.query(
        `create type public.${quote_spine_identifier(enumName)} as enum (${labels.join(", ")})`,
      );
      existingEnums.add(enumName);
    }

    const existingResult = await client.query(
      `select table_name from information_schema.tables where table_schema = 'public'`,
    );''',
    "create enum before tables",
)

schema_export = Path("server/engines/spine-schema-export.ts")
text = schema_export.read_text()
text = text.replace(
    '''  type spine_schema_index,
  type spine_table_schema,''',
    '''  type spine_schema_index,
  type spine_enum_definition,
  type spine_table_schema,''',
    1,
)
text += '''

export async function export_spine_database_enums(): Promise<spine_enum_definition[]> {
  const result = await query_with_diagnostics<{
    enum_name: string;
    labels: unknown;
  }>(
    `select
       t.typname as enum_name,
       jsonb_agg(e.enumlabel order by e.enumsortorder) as labels
     from pg_type t
     join pg_enum e on e.enumtypid=t.oid
     join pg_namespace n on n.oid=t.typnamespace
     where n.nspname='public'
     group by t.typname
     order by t.typname`,
    [],
    {
      label: "spine_schema_enums_all",
      pool_acquire_timeout_ms: 3_000,
      query_timeout_ms: 10_000,
    },
  );
  return result.rows.map((row) => ({
    enumName: row.enum_name,
    labels: Array.isArray(row.labels)
      ? row.labels.map((label) => String(label))
      : [],
  }));
}
'''
schema_export.write_text(text)

export_path = Path("server/engines/sovereign-export-spine-engine.ts")
text = export_path.read_text()
text = text.replace(
    '''  type spine_table_data,
  type spine_table_schema,''',
    '''  type spine_table_data,
  type spine_table_schema,
  type spine_enum_definition,''',
    1,
)
text = text.replace(
    'import { export_spine_database_schema } from "./spine-schema-export";',
    'import { export_spine_database_enums, export_spine_database_schema } from "./spine-schema-export";',
    1,
)
text = text.replace(
    '''export interface SchemaExport {
  tables: spine_table_schema[];
  exportedAt: number;
}''',
    '''export interface SchemaExport {
  enums: spine_enum_definition[];
  tables: spine_table_schema[];
  exportedAt: number;
}''',
    1,
)
text = text.replace(
    '''export async function exportSchema(): Promise<SchemaExport> {
  return {
    tables: await export_spine_database_schema(),
    exportedAt: Date.now(),
  };
}''',
    '''export async function exportSchema(): Promise<SchemaExport> {
  const [enums, tables] = await Promise.all([
    export_spine_database_enums(),
    export_spine_database_schema(),
  ]);
  return { enums, tables, exportedAt: Date.now() };
}''',
    1,
)
export_path.write_text(text)

replace_once(
    "server/engines/sovereign-restore-spine-engine.ts",
    '''  if (!Array.isArray(schema?.tables)) return [];
  return create_spine_missing_tables(schema.tables as spine_table_schema[]);''',
    '''  if (!Array.isArray(schema?.tables)) return [];
  const enums = Array.isArray(schema?.enums) ? schema.enums : [];
  return create_spine_missing_tables(
    schema.tables as spine_table_schema[],
    enums,
  );''',
    "restore enums before tables",
)

print("Sovereign Spine enum portability staged")
