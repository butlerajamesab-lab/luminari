import { afterEach, describe, expect, it } from "vitest";
import {
  getDocumentStorageMode,
  isSupabaseStorageKey,
  storagePut,
} from "./storage";

const original_environment = {
  LIGHTHOUSE_DOCUMENT_STORAGE_BACKEND:
    process.env.LIGHTHOUSE_DOCUMENT_STORAGE_BACKEND,
  BUILT_IN_FORGE_API_URL: process.env.BUILT_IN_FORGE_API_URL,
  BUILT_IN_FORGE_API_KEY: process.env.BUILT_IN_FORGE_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};

function restore_environment_value(key: keyof typeof original_environment): void {
  const value = original_environment[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  restore_environment_value("LIGHTHOUSE_DOCUMENT_STORAGE_BACKEND");
  restore_environment_value("BUILT_IN_FORGE_API_URL");
  restore_environment_value("BUILT_IN_FORGE_API_KEY");
  restore_environment_value("OPENAI_BASE_URL");
  restore_environment_value("OPENAI_API_KEY");
});

describe("case document storage boundary", () => {
  it("honors the explicit Supabase storage mode", () => {
    process.env.LIGHTHOUSE_DOCUMENT_STORAGE_BACKEND = "supabase";
    expect(getDocumentStorageMode()).toBe("supabase");
  });

  it("recognizes only governed Supabase object keys", () => {
    expect(
      isSupabaseStorageKey(
        "supabase://case-documents/cases/2/documents/example.pdf",
      ),
    ).toBe(true);
    expect(
      isSupabaseStorageKey("cases/2/documents/legacy-forge-object.pdf"),
    ).toBe(false);
  });

  it("does not treat OpenAI credentials as Forge storage credentials", async () => {
    process.env.LIGHTHOUSE_DOCUMENT_STORAGE_BACKEND = "forge";
    process.env.OPENAI_BASE_URL = "https://api.openai.com/v1";
    process.env.OPENAI_API_KEY = "test-openai-key";
    delete process.env.BUILT_IN_FORGE_API_URL;
    delete process.env.BUILT_IN_FORGE_API_KEY;

    await expect(
      storagePut("cases/2/documents/test.txt", "test", "text/plain"),
    ).rejects.toThrow("Forge storage credentials missing");
  });
});
