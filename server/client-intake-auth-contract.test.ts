import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function client_source(path: string): string {
  return readFileSync(resolve(process.cwd(), "client/src", path), "utf8");
}

describe("Lighthouse client intake boundary", () => {
  it("uses the shared Supabase token transport for upload and replacement", () => {
    const upload = client_source("pages/Upload.tsx");
    const replacement = client_source("components/ReplaceDocumentModalV2.tsx");

    for (const source of [upload, replacement]) {
      expect(source).toContain("getAuthenticatedRequestHeaders");
      expect(source).toContain("headers,");
      expect(source).toContain('preservation_state !== "preserved"');
    }
    expect(upload).not.toContain("analyzeAll.mutate");
    expect(upload).not.toMatch(/AI analysis started/i);
    expect(replacement).toContain("Preserved replacement");
    expect(replacement).not.toContain("trigger extraction automatically");
    expect(replacement).toMatch(
      /Content\s+extraction is a separate, explicitly tracked step/,
    );
  });

  it("scopes replacement state to the target case and serializes both replacement modes", () => {
    const replacement = client_source("components/ReplaceDocumentModalV2.tsx");
    const detail = client_source("pages/DocumentDetail.tsx");

    expect(replacement).toContain("caseId?: number");
    expect(replacement).toContain(
      "const effectiveCaseId = caseId ?? currentCaseId",
    );
    expect(replacement).toContain("{ caseId: effectiveCaseId! }");
    expect(detail).toContain("caseId={doc.caseId}");
    expect(detail).toContain("{ caseId: caseId! }");

    expect(replacement).toContain(
      "const replacementBusy = uploading || replaceMutation.isPending",
    );
    expect(replacement).toContain(
      "if (!replacementDocId || replacementBusy) return",
    );
    expect(replacement).toContain(
      "if (!replaceFile || replacementBusy) return",
    );
    expect(replacement).toContain("!o && !replacementBusy && onClose()");
    expect(replacement).toContain(
      "disabled={!replacementDocId || replacementBusy}",
    );
    expect(replacement).toContain("disabled={!replaceFile || replacementBusy}");
    expect(replacement).toContain("d.snapshotId === snapshotId");
    expect(replacement).toContain(
      'data.receipt?.preservation_state !== "preserved"',
    );
  });

  it("routes select-existing replacement through a prior sealed receipt", () => {
    const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    const start = router.indexOf("replaceDocument: protectedProcedure");
    const end = router.indexOf("markCorrupted: protectedProcedure", start);
    const replacement = router.slice(start, end);

    expect(replacement).toContain("preserveDocumentInIntakeSpine");
    expect(replacement).toContain(
      'preservation_mode: "existing_receipted_document"',
    );
    expect(replacement).toContain(
      "replacementDoc.snapshotId !== originalDoc.snapshotId",
    );
    expect(replacement).toContain("await storageGet(replacementDoc.s3Key)");
    expect(replacement).not.toContain("db_helpers.replaceDocument(");
  });

  it("handles non-JSON replacement responses without exposing an HTML response body", () => {
    const replacement = client_source("components/ReplaceDocumentModalV2.tsx");

    expect(replacement).toContain('res.headers.get("content-type")');
    expect(replacement).toContain('contentType.includes("application/json")');
    expect(replacement).toContain("const responseText = await res.text()");
    expect(replacement).toContain("JSON.parse(responseText)");
    expect(replacement).toContain("let invalidResponse");
    expect(replacement).toContain(
      "Replacement upload returned an invalid response",
    );
    expect(replacement).toContain("Replacement upload failed (${res.status}");
    expect(replacement).not.toContain("await res.json()");
  });

  it("obtains protected source URLs through authenticated same-origin JSON access", () => {
    const detail = client_source("pages/DocumentDetail.tsx");

    expect(detail).toContain("getAuthenticatedRequestHeaders");
    expect(detail).toContain('parsed.searchParams.set("response", "json")');
    expect(detail).toContain('credentials: "include"');
    expect(detail).not.toContain("<a href={doc.s3Url}");
  });

  it("carries a Civic Map session through guided case creation and completion", () => {
    const map_panel = client_source("pages/MapIntakePanel.tsx");
    const guided = client_source("pages/GuidedIntake.tsx");

    expect(map_panel).toContain("result.session_id");
    expect(guided).toContain("mapIntake.completeSession.useMutation");
    expect(guided).toContain("caseId: result.id");
    expect(guided).toContain("setLocation(`/guide/${result.id}`)");
  });
});
