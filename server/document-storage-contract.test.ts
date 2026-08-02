import { afterEach, describe, expect, it } from "vitest";
import {
  getDocumentStorageMode,
  isSupabaseStorageKey,
  uses_supabase_document_storage,
} from "./storage";

const original_environment = {
  LIGHTHOUSE_DOCUMENT_STORAGE_BACKEND:
    process.env.LIGHTHOUSE_DOCUMENT_STORAGE_BACKEND,
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

  it("routes only the case document namespace to Supabase", () => {
    process.env.LIGHTHOUSE_DOCUMENT_STORAGE_BACKEND = "supabase";

    expect(
      uses_supabase_document_storage(
        "cases/2/documents/fixture-evidence.pdf",
      ),
    ).toBe(true);
    expect(
      uses_supabase_document_storage("exports/case-2/attorney-packet.pdf"),
    ).toBe(false);
    expect(
      uses_supabase_document_storage("docket/wa/hb1234.pdf"),
    ).toBe(false);
  });

  it("does not allow OpenAI variables to override the case storage mode", () => {
    process.env.LIGHTHOUSE_DOCUMENT_STORAGE_BACKEND = "supabase";
    process.env.OPENAI_BASE_URL = "https://api.openai.com/v1";
    process.env.OPENAI_API_KEY = "test-openai-key";

    expect(getDocumentStorageMode()).toBe("supabase");
    expect(
      uses_supabase_document_storage("cases/2/documents/test.txt"),
    ).toBe(true);
  });
});
