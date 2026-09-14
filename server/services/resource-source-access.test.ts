import { describe, expect, it } from "vitest";
import { resource_source_access } from "./resource-source-access";

const artifact = {
  bucket_id: "State Enriched Registry bucket",
  object_name: "registry (1).docx",
  bucket_public: true,
  object_present: true,
  storage_version_matches: true,
  storage_state: "active",
  content_sha256: "a".repeat(64),
  storage_updated_at: "2026-06-09T15:43:33.255259+00:00",
  object_updated_at: new Date("2026-06-09T15:43:33.255259+00:00"),
};
const project_url = "https://example.supabase.co";

describe("catalog source access", () => {
  it("opens only a bound public source and URL-encodes its object path", () => {
    expect(
      resource_source_access(artifact, project_url, artifact.content_sha256),
    ).toEqual({
      status: "public_source_available",
      url: "https://example.supabase.co/storage/v1/object/public/State%20Enriched%20Registry%20bucket/registry%20(1).docx",
    });
  });

  it("never provides a public or signed URL for private case or Batch sources", () => {
    for (const bucket_id of ["case-documents", "Batch"]) {
      expect(
        resource_source_access(
          { ...artifact, bucket_id, bucket_public: false },
          project_url,
          artifact.content_sha256,
        ),
      ).toEqual({ status: "source_access_restricted", url: null });
    }
  });

  it("withholds absent, unregistered and changed source versions", () => {
    expect(
      resource_source_access(undefined, project_url, artifact.content_sha256)
        .url,
    ).toBeNull();
    expect(
      resource_source_access(
        { ...artifact, object_present: false },
        project_url,
        artifact.content_sha256,
      ).url,
    ).toBeNull();
    expect(
      resource_source_access(artifact, project_url, "b".repeat(64)).status,
    ).toBe("source_version_unresolved");
    expect(
      resource_source_access(
        { ...artifact, object_updated_at: new Date("2026-09-14") },
        project_url,
        artifact.content_sha256,
      ).url,
    ).toBeNull();
  });

  it("rejects unsafe configuration and path traversal", () => {
    for (const value of [
      "javascript:alert(1)",
      "http://example.com",
      "https://user:password@example.com",
    ]) {
      expect(
        resource_source_access(artifact, value, artifact.content_sha256).url,
      ).toBeNull();
    }
    expect(
      resource_source_access(
        { ...artifact, object_name: "../secret" },
        project_url,
        artifact.content_sha256,
      ).url,
    ).toBeNull();
  });

  it("rejects changes detected at PostgreSQL timestamp precision even when JavaScript dates round to the same millisecond", () => {
    expect(
      resource_source_access(
        { ...artifact, storage_version_matches: false },
        project_url,
        artifact.content_sha256,
      ),
    ).toEqual({ status: "source_version_unresolved", url: null });
  });
});
