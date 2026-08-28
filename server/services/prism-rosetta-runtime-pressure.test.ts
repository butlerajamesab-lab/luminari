import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const activation = readFileSync(
  new URL("./prism-rosetta-activation.ts", import.meta.url),
  "utf8",
);
const client = readFileSync(
  new URL("./prism-rosetta-client.ts", import.meta.url),
  "utf8",
);
const queue_worker = readFileSync(
  new URL("./prism-rosetta-queue-worker.ts", import.meta.url),
  "utf8",
);

describe("PRISM 2.2 bounded runtime pressure", () => {
  it("limits concurrent deep verification requests to one", () => {
    expect(activation).toContain("const PRISM_CONCURRENCY = 1;");
    expect(activation).toContain("PRISM_CONCURRENCY,");
  });

  it("bounds the deep verification endpoint timeout and keeps one attempt", () => {
    expect(client).toContain(
      "const DEFAULT_PRISM_REQUEST_TIMEOUT_MS = 15_000;",
    );
    expect(client).toContain("const MAX_PRISM_REQUEST_TIMEOUT_MS = 30_000;");
    expect(client).toContain(
      "const DEFAULT_PRISM_CIRCUIT_FAILURE_THRESHOLD = 1;",
    );
    expect(client).toContain(
      "const DEFAULT_PRISM_CIRCUIT_COOLDOWN_MS = 15 * 60_000;",
    );
    expect(client).toContain("PRISM_ROSETTA_REQUEST_TIMEOUT_MS");
    expect(client).toContain("const PRISM_MAX_ATTEMPTS = 1;");
    expect(client).toContain(
      "const PRISM_MAX_REQUEST_BYTES = 4 * 1024 * 1024;",
    );
  });

  it("does not claim more queue work while the upstream circuit is open", () => {
    const circuit_guard_position = queue_worker.indexOf(
      'if (circuit.state === "open")',
    );
    const claim_position = queue_worker.indexOf(
      "const job = await claim_next_job();",
    );
    expect(queue_worker).toContain("[PrismRosettaQueue] circuit_open_skip");
    expect(queue_worker).toContain("prism_rosetta_circuit_allows_request");
    expect(circuit_guard_position).toBeGreaterThan(-1);
    expect(claim_position).toBeGreaterThan(circuit_guard_position);
  });

  it("caps new Prism submissions per queue activation pass", () => {
    expect(queue_worker).toContain(
      "const DEFAULT_QUEUE_MAX_NEW_SUBMISSIONS = 1;",
    );
    expect(queue_worker).toContain(
      "process.env.PRISM_ROSETTA_QUEUE_MAX_NEW_SUBMISSIONS",
    );
    expect(queue_worker).toContain(
      "max_new_submissions: bounded_queue_max_new_submissions(),",
    );
    expect(activation).toContain("max_new_submissions?: number;");
    expect(activation).toContain(
      "export class PrismRosettaPartialActivationError extends Error",
    );
    expect(activation).toContain(
      "const pending_batch = pending_requests.slice(0, max_new_submissions);",
    );
  });

  it("reuses locally persisted trait receipts before calling Prism again", () => {
    const load_position = activation.indexOf(
      "const existing_receipts = await load_existing_binding_receipts(assembly);",
    );
    const submit_position = activation.indexOf(
      "const receipt = await submit_rosetta_prism_request(request);",
    );
    expect(activation).toContain(
      "prism_rosetta_load_existing_binding_receipts",
    );
    expect(activation).toContain("existing_receipts.get(trait.trait_id)");
    expect(activation).toContain(
      "if (existing_receipt?.request_id === request.request_id)",
    );
    expect(load_position).toBeGreaterThan(-1);
    expect(submit_position).toBeGreaterThan(load_position);
  });
});
