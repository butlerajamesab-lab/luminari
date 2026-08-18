import { beforeEach, describe, expect, it, vi } from "vitest";

const { query, get_bill, project_state } = vi.hoisted(() => ({
  query: vi.fn(),
  get_bill: vi.fn(),
  project_state: vi.fn(),
}));

vi.mock("./db", () => ({
  query_with_diagnostics: query,
}));

vi.mock("./services/legiscan", () => ({
  get_bill,
}));

vi.mock("./civic-genome-projection", () => ({
  project_docket_cache_to_civic_genome: project_state,
}));

import {
  classify_docket_bill_activation_failure,
  docket_bill_activation_retry_delay_seconds,
  process_docket_bill_activation_job,
} from "./docket-jurisdiction-activation-queue-worker";

const job = {
  queue_id: "11111111-1111-4111-8111-111111111111",
  source_bill_id: 2043400,
  state: "NY",
  summary_fingerprint: "a".repeat(64),
  observed_change_hash: "change-1",
  attempt_count: 0,
};

const registration_receipt = {
  source_bill_id: job.source_bill_id,
  genome_bill_id: "22222222-2222-4222-8222-222222222222",
  registered_document_count: 3,
  text_version_count: 2,
  amendment_count: 1,
  matched_amendment_base_count: 1,
  queued_or_refreshed_count: 3,
  docket_fetched_at: "2026-08-06T17:12:24.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  project_state.mockResolvedValue({
    bills_seen: 100,
    inserted_count: 100,
    updated_count: 0,
    unchanged_count: 0,
  });
  get_bill.mockResolvedValue({
    bill_id: job.source_bill_id,
    bill_number: "A09058",
    texts: [{ doc_id: 1, type: "Introduced", state_link: "https://example.test/bill.pdf" }],
  });
  query.mockImplementation(async (sql: string) => {
    if (sql.includes("select exists")) return { rows: [{ ready: true }] };
    if (sql.includes("register_docket_legislative_version_spine")) {
      return { rows: [{ receipt: registration_receipt }] };
    }
    return { rows: [] };
  });
});

describe("Docket jurisdiction activation queue", () => {
  it("uses bounded exponential retry timing", () => {
    expect(docket_bill_activation_retry_delay_seconds(1)).toBe(15);
    expect(docket_bill_activation_retry_delay_seconds(2)).toBe(30);
    expect(docket_bill_activation_retry_delay_seconds(20)).toBe(1920);
  });

  it("keeps network and projection failures retryable", () => {
    expect(classify_docket_bill_activation_failure({
      error: new Error("docket_civic_genome_projection_missing_after_refresh"),
      prior_attempt_count: 0,
    })).toMatchObject({
      queue_state: "degraded",
      failure_class: "transient",
      terminal: false,
    });

    expect(classify_docket_bill_activation_failure({
      error: new Error("legiscan_http_503_while_calling_get_bill"),
      prior_attempt_count: 0,
    })).toMatchObject({
      queue_state: "degraded",
      failure_class: "transient",
      terminal: false,
    });
  });

  it("fetches exact bill detail and registers every official source in the existing version spine", async () => {
    await process_docket_bill_activation_job(job);

    expect(get_bill).toHaveBeenCalledTimes(1);
    expect(get_bill).toHaveBeenCalledWith(job.source_bill_id);
    expect(query.mock.calls.some(call => String(call[0]).includes("insert into public.docket_bill_detail_cache"))).toBe(true);
    expect(query.mock.calls.some(call => String(call[0]).includes("register_docket_legislative_version_spine"))).toBe(true);

    const terminal_call = query.mock.calls.find(call => String(call[0]).includes("docket_bill_processing_queue") && String(call[0]).includes("completed_at = now()"));
    expect(terminal_call?.[1]?.[1]).toBe("completed");
  });

  it("records a terminal source-unavailable state when the provider exposes no official documents", async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("select exists")) return { rows: [{ ready: true }] };
      if (sql.includes("register_docket_legislative_version_spine")) {
        return {
          rows: [{
            receipt: {
              ...registration_receipt,
              registered_document_count: 0,
              text_version_count: 0,
              amendment_count: 0,
              matched_amendment_base_count: 0,
              queued_or_refreshed_count: 0,
            },
          }],
        };
      }
      return { rows: [] };
    });

    await process_docket_bill_activation_job(job);

    const terminal_call = query.mock.calls.find(call => String(call[0]).includes("docket_bill_processing_queue") && String(call[0]).includes("completed_at = now()"));
    expect(terminal_call?.[1]?.[1]).toBe("source_unavailable");
  });

  it("projects a historical state before spending its first bill-detail request", async () => {
    let readiness_checks = 0;
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("select exists")) {
        readiness_checks += 1;
        return { rows: [{ ready: readiness_checks > 1 }] };
      }
      if (sql.includes("register_docket_legislative_version_spine")) {
        return { rows: [{ receipt: registration_receipt }] };
      }
      return { rows: [] };
    });

    await process_docket_bill_activation_job(job);

    expect(project_state).toHaveBeenCalledTimes(1);
    expect(project_state).toHaveBeenCalledWith({ state_code: "NY" });
    expect(get_bill).toHaveBeenCalledTimes(1);
  });

  it("does not spend a bill-detail request when state projection fails", async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("select exists")) return { rows: [{ ready: false }] };
      return { rows: [] };
    });
    project_state.mockRejectedValue(new Error("projection_database_unavailable"));

    await process_docket_bill_activation_job(job);

    expect(get_bill).not.toHaveBeenCalled();
    const failure_call = query.mock.calls.find(call => String(call[0]).includes("queue_state = $2"));
    expect(failure_call?.[1]?.[1]).toBe("degraded");
    expect(failure_call?.[1]?.[2]).toBe("transient");
    expect(failure_call?.[1]?.[3]).toBe("projection_database_unavailable");
  });

  it("does not invent a failure after provider/cache/version registration already succeeded", async () => {
    query.mockImplementation(async (sql: string, _params: unknown[], options?: { label?: string }) => {
      if (sql.includes("select exists")) return { rows: [{ ready: true }] };
      if (sql.includes("register_docket_legislative_version_spine")) {
        return { rows: [{ receipt: registration_receipt }] };
      }
      if (options?.label === "docket_bill_activation_queue_terminal") {
        throw new Error("docket_bill_activation_queue_terminal query timed out after 5000ms");
      }
      return { rows: [] };
    });

    await expect(process_docket_bill_activation_job(job)).resolves.toBeUndefined();

    expect(get_bill).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.some(call => call[2]?.label === "docket_bill_activation_queue_fail")).toBe(false);
    expect(query.mock.calls.some(call => call[2]?.label === "docket_bill_activation_queue_terminal")).toBe(true);
  });
});
