import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create_document: vi.fn(),
  log_audit: vi.fn(),
  pool_query: vi.fn(),
  client_query: vi.fn(),
  client_release: vi.fn(),
  storage_put: vi.fn(),
  storage_delete: vi.fn(),
}));

vi.mock("./db", () => ({
  createDocument: mocks.create_document,
  logAudit: mocks.log_audit,
}));

vi.mock("./db-legacy", () => ({
  getPool: () => ({
    query: mocks.pool_query,
    connect: async () => ({
      query: mocks.client_query,
      release: mocks.client_release,
    }),
  }),
}));

vi.mock("./storage", () => ({
  storagePut: mocks.storage_put,
  storageDelete: mocks.storage_delete,
}));

import { register_declared_intake_context } from "./declared-intake-context";

describe("declared intake context registration cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storage_put.mockResolvedValue({
      key: "supabase://case-documents/cases/42/documents/declaration.json",
      url: "https://example.invalid/declaration.json",
    });
    mocks.create_document.mockResolvedValue(91);
    mocks.client_query.mockResolvedValue({ rows: [] });
    mocks.storage_delete.mockResolvedValue(undefined);
  });

  it("removes the document projection and stored bytes when spine registration fails", async () => {
    const failure = new Error("rpc failed");
    mocks.pool_query.mockRejectedValue(failure);

    await expect(
      register_declared_intake_context({
        case_id: 42,
        user_id: 7,
        submission: {
          entry_surface: "conversation_intake",
        selection_basis: "explicit_pipeline",
          selected_pipeline: "other",
          statements: [{ prompt_id: "statement_1", text: "Exact statement" }],
        },
      }),
    ).rejects.toBe(failure);

    expect(mocks.client_query).toHaveBeenCalledWith("begin");
    expect(mocks.client_query).toHaveBeenCalledWith(
      expect.stringContaining("delete from public.intake_artifacts"),
      expect.any(Array),
    );
    expect(mocks.client_query).toHaveBeenCalledWith(
      expect.stringContaining("delete from public.documents"),
      expect.any(Array),
    );
    expect(mocks.client_query).toHaveBeenCalledWith("commit");
    expect(mocks.client_release).toHaveBeenCalledOnce();
    expect(mocks.storage_delete).toHaveBeenCalledWith(
      "supabase://case-documents/cases/42/documents/declaration.json",
    );
  });
});
