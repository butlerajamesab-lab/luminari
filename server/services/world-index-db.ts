import { query_with_diagnostics } from "../db";

type world_index_query_result<T> = [T[]];

type world_index_pool_contract = {
  query<T = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<world_index_query_result<T>>;
};

let query_tail: Promise<void> = Promise.resolve();

function infer_query_label(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  const source_match = normalized.match(/\bfrom\s+([a-zA-Z0-9_.\"]+)/i);
  const source = source_match?.[1]?.replace(/[^a-zA-Z0-9_]+/g, "_") || "projection";
  return `world_index_${source}`.slice(0, 63);
}

async function run_serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = query_tail.then(task, task);
  query_tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Compatibility boundary for the historical World Index loader.
 *
 * The loader was originally written against a MySQL-style `[rows]` return
 * contract while Lighthouse now uses node-postgres. This adapter preserves the
 * loader's complete standalone projection without changing the canonical
 * database pool or duplicating connections.
 *
 * World Index reads are serialized deliberately. A cold projection may scan
 * several large registries, but it may consume only one shared pool slot at a
 * time so authentication and ordinary Lighthouse requests retain capacity.
 */
export const pool: world_index_pool_contract = {
  async query<T = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ): Promise<world_index_query_result<T>> {
    return run_serialized(async () => {
      const result = await query_with_diagnostics<T>(text, values, {
        label: infer_query_label(text),
        pool_acquire_timeout_ms: 2_000,
        query_timeout_ms: 7_500,
      });
      return [result.rows];
    });
  },
};

export const __testing = {
  infer_query_label,
  reset_query_tail(): void {
    query_tail = Promise.resolve();
  },
};
