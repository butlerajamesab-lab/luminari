import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "server/services/prism-verification-client.ts"),
  "utf8",
);

describe("Prism superseded request runtime boundary", () => {
  it("reads supersession state while recording a request", () => {
    expect(source).toContain("bridge_state: string");
    expect(source).toContain("superseded_by_request_id: string | null");
    expect(source).toContain("returning input_hash, bridge_state, superseded_by_request_id");
  });

  it("rejects superseded request IDs before the Prism call", () => {
    const record_position = source.indexOf("const input_hash = await record_request(request)");
    const call_position = source.indexOf("const response = await call_prism(request, options)");
    expect(record_position).toBeGreaterThan(-1);
    expect(call_position).toBeGreaterThan(record_position);
    expect(source).toContain('recorded.bridge_state === "superseded"');
    expect(source).toContain('"request_id_superseded"');
    expect(source).toContain('new PrismBoundaryError("request_id_conflict", 409');
  });
});
