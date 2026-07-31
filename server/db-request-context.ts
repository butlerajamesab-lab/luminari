import { AsyncLocalStorage } from "node:async_hooks";

export type database_request_context = {
  method: string;
  path: string;
  request_id: string | null;
};

const request_context_storage = new AsyncLocalStorage<database_request_context>();

export function run_with_database_request_context<T>(
  context: database_request_context,
  callback: () => T,
): T {
  return request_context_storage.run(context, callback);
}

export function get_database_request_context(): database_request_context | null {
  return request_context_storage.getStore() ?? null;
}
