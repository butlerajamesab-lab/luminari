import { beforeEach, expect, it, vi } from "vitest";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./db", () => ({ getPool: () => ({ query }) }));
import { load_queued_docket_binding } from "./civic-genome-docket-binding";
const input = { genome_bill_id: "00000000-0000-4000-8000-000000000001", source_document_id: 6281 };
const binding = { source_document_key: "text:1921589:3249036", source_content_hash: "a".repeat(64) };
beforeEach(() => vi.clearAllMocks());
it("transports a unique persisted source identity without selecting a run", async () => {
 query.mockResolvedValue({ rows: [binding] });
 await expect(load_queued_docket_binding(input)).resolves.toEqual(binding);
 expect(query.mock.calls[0][0]).not.toContain("order by");
 expect(query.mock.calls[0][0]).not.toContain("extraction_run_id");
});
it.each([[], [binding, { ...binding, source_document_key: "text:other" }], [{ ...binding, source_content_hash: null }]])(
 "blocks absent, ambiguous or unhashed queue bindings", async (...rows) => {
 query.mockResolvedValue({ rows });
 await expect(load_queued_docket_binding(input)).rejects.toThrow("requires_review");
});
