export interface MissionControlPayload {
  timestamp: string;
  tables: {
    total: number;
    items: Array<{ table_name: string; column_count: number }>;
  };
  views: {
    total: number;
    items: Array<{ view_name: string }>;
  };
  foreign_keys: {
    total: number;
    items: Array<{
      source_table: string;
      source_column: string;
      target_table: string;
      target_column: string;
    }>;
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeTableItems(value: unknown): Array<{ table_name: string; column_count: number }> {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const record = asRecord(row);
    return {
      table_name: asString(record.table_name),
      column_count: asNumber(record.column_count, 0),
    };
  });
}

function normalizeViewItems(value: unknown): Array<{ view_name: string }> {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const record = asRecord(row);
    return { view_name: asString(record.view_name) };
  });
}

function normalizeForeignKeyItems(value: unknown): Array<{
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
}> {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const record = asRecord(row);
    return {
      source_table: asString(record.source_table),
      source_column: asString(record.source_column),
      target_table: asString(record.target_table),
      target_column: asString(record.target_column),
    };
  });
}

export function normalizeMissionControlPayload(raw: unknown): MissionControlPayload {
  const root = asRecord(raw);
  const tablesSection = asRecord(root.tables);
  const viewsSection = asRecord(root.views);
  const foreignKeysSection = asRecord(root.foreign_keys);

  const tablesItems = normalizeTableItems(tablesSection.items);
  const viewsItems = normalizeViewItems(viewsSection.items);
  const foreignKeysItems = normalizeForeignKeyItems(foreignKeysSection.items);

  return {
    timestamp: asString(root.timestamp, new Date().toISOString()),
    tables: {
      total: asNumber(tablesSection.total, tablesItems.length),
      items: tablesItems,
    },
    views: {
      total: asNumber(viewsSection.total, viewsItems.length),
      items: viewsItems,
    },
    foreign_keys: {
      total: asNumber(foreignKeysSection.total, foreignKeysItems.length),
      items: foreignKeysItems,
    },
  };
}
