import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  from: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("./_core/env", () => ({
  ENV: {
    lighthouseSupabaseUrl: "https://lighthouse-test.supabase.co",
    lighthouseSupabaseServiceRoleKey: "test-service-role-key",
    forgeApiUrl: "",
    forgeApiKey: "",
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: state.from,
    },
  })),
}));

import { storageDelete } from "./storage";

const original_storage_backend =
  process.env.LIGHTHOUSE_DOCUMENT_STORAGE_BACKEND;

beforeEach(() => {
  vi.clearAllMocks();
  state.remove.mockResolvedValue({ error: null });
  state.from.mockReturnValue({ remove: state.remove });
  process.env.LIGHTHOUSE_DOCUMENT_STORAGE_BACKEND = "supabase";
});

afterAll(() => {
  if (original_storage_backend === undefined) {
    delete process.env.LIGHTHOUSE_DOCUMENT_STORAGE_BACKEND;
  } else {
    process.env.LIGHTHOUSE_DOCUMENT_STORAGE_BACKEND = original_storage_backend;
  }
});

describe("document storage compensation", () => {
  it("removes the exact private Supabase object after a failed replacement transaction", async () => {
    await storageDelete(
      "supabase://case-documents/cases/44/documents/replacement.pdf",
    );

    expect(state.from).toHaveBeenCalledWith("case-documents");
    expect(state.remove).toHaveBeenCalledWith([
      "cases/44/documents/replacement.pdf",
    ]);
  });

  it("surfaces Supabase cleanup failures to the caller", async () => {
    state.remove.mockResolvedValue({
      error: { message: "object removal unavailable" },
    });

    await expect(
      storageDelete(
        "supabase://case-documents/cases/44/documents/replacement.pdf",
      ),
    ).rejects.toThrow(
      "Supabase document deletion failed: object removal unavailable",
    );
  });
});
