import { AsyncLocalStorage } from "node:async_hooks";

export type database_request_context = {
  method: string;
  path: string;
  request_id: string | null;
  /**
   * Optional owner identity for background (non-HTTP) work. HTTP requests
   * populate method/path/request_id and leave these null; background jobs
   * wrap their work in run_with_database_job_context so pool-lease telemetry
   * can name the job that acquired the client.
   */
  label?: string | null;
  job_id?: string | null;
};

const request_context_storage = new AsyncLocalStorage<database_request_context>();

export function run_with_database_request_context<T>(
  context: database_request_context,
  callback: () => T,
): T {
  return request_context_storage.run(context, callback);
}

/**
 * Tag a unit of background work so every database client acquired inside it
 * carries the job's identity. method/path are synthesized from the label so
 * existing telemetry fields stay populated even outside HTTP handling.
 */
export function run_with_database_job_context<T>(
  job: { label: string; job_id?: string | null },
  callback: () => T,
): T {
  return request_context_storage.run({
    method: "JOB",
    path: job.label,
    request_id: job.job_id ?? null,
    label: job.label,
    job_id: job.job_id ?? null,
  }, callback);
}

export function get_database_request_context(): database_request_context | null {
  return request_context_storage.getStore() ?? null;
}
