import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read_repo_file(relative_path: string): string {
  return readFileSync(
    fileURLToPath(new URL(relative_path, import.meta.url)),
    "utf8",
  );
}

describe("unrestricted evidence upload boundary", () => {
  const upload_page = read_repo_file("../client/src/pages/Upload.tsx");
  const upload_route = read_repo_file("./upload-route.ts");

  it("does not restrict the browser file picker by extension or MIME type", () => {
    expect(upload_page).not.toMatch(/\baccept\s*=/);
    expect(upload_page).toContain("Any file type");
  });

  it("forwards the live Supabase session on multipart upload requests", () => {
    expect(upload_page).toContain(
      'import { getAuthenticatedRequestHeaders } from "@/lib/session-token";',
    );
    expect(upload_page).toContain(
      "const uploadHeaders = await getAuthenticatedRequestHeaders();",
    );
    expect(upload_page).toContain(
      'uploadHeaders.has("x-lighthouse-supabase-session")',
    );
    expect(upload_page).toMatch(
      /fetch\("\/api\/upload", \{[\s\S]*headers: uploadHeaders,[\s\S]*credentials: "include"/,
    );
  });

  it("preserves unknown file formats instead of rejecting them", () => {
    expect(upload_route).toContain("multer.memoryStorage()");
    expect(upload_route).not.toContain("fileFilter:");
    expect(upload_route).toContain('return "other";');
    expect(upload_route).toContain("fileSize: 100 * 1024 * 1024");
  });

  it("keeps authentication, hashing, and case ownership while preserving analysis separation", () => {
    expect(upload_route).toContain("authenticateCurrentRequest");
    expect(upload_route).toMatch(
      /app\.post\("\/api\/upload", requireUploadAuthentication, requireBoundedMultipartRequest, requireMultipartUploadCapacity, upload\.array\("files", MAX_BATCH_SIZE\)/,
    );
    expect(upload_route).toMatch(
      /app\.post\("\/api\/upload\/replace\/:documentId", requireUploadAuthentication, requireBoundedMultipartRequest, requireMultipartUploadCapacity, upload\.single\("file"\)/,
    );
    expect(upload_route).toContain(
      "const MAX_UPLOAD_REQUEST_BYTES = 110 * 1024 * 1024",
    );
    expect(upload_route).toContain(
      "const MAX_CONCURRENT_MULTIPART_UPLOADS = 2",
    );
    expect(upload_route).toContain('createHash("sha256")');
    expect(upload_route).toContain("eq(cases.userId, user.id)");
    expect(upload_route).not.toContain('from "./analysis-pipeline"');
    expect(upload_route).not.toContain("enqueueDocument(");
    expect(upload_page).not.toContain("analyzeAll.mutateAsync");
    expect(upload_page).toContain("registeredCount > 0");
    expect(upload_page).toContain(
      "Sources registered. Open the Universal Intake Spine",
    );
    expect(upload_page).not.toContain("Upload preserved");
    expect(upload_page).not.toContain("AI analysis started");
  });
});
