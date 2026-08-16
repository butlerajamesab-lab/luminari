import { db as legacyDb } from "./db-legacy";

/**
 * Drizzle's node-postgres execute() returns the PostgreSQL QueryResult shape.
 * A number of preserved Lighthouse routers still destructure execute() using
 * the historical mysql2 `[rows, fields]` convention. Those reads otherwise
 * throw before they can render any data.
 *
 * Keep the native QueryResult properties intact for current callers and add
 * only an iterator for the legacy tuple contract. No SQL is rewritten and no
 * query behavior changes.
 */
export function makeExecuteResultTupleCompatible<T>(result: T): T {
  if (
    result == null
    || typeof result !== "object"
    || Array.isArray(result)
    || typeof (result as any)[Symbol.iterator] === "function"
  ) {
    return result;
  }

  const native = result as any;
  const rows = Array.isArray(native.rows) ? native.rows : [];
  const fields = Array.isArray(native.fields) ? native.fields : [];

  return new Proxy(native, {
    get(target, property, receiver) {
      if (property === Symbol.iterator) {
        return function* legacyExecuteTupleIterator() {
          yield rows;
          yield fields;
        };
      }
      return Reflect.get(target, property, receiver);
    },
  }) as T;
}

export const db = new Proxy(legacyDb as any, {
  get(target, property, receiver) {
    if (property === "execute") {
      return async (...args: any[]) => {
        const execute = Reflect.get(target, property, target);
        const result = await execute.apply(target, args);
        return makeExecuteResultTupleCompatible(result);
      };
    }

    const value = Reflect.get(target, property, receiver);
    return typeof value === "function" ? value.bind(target) : value;
  },
});
