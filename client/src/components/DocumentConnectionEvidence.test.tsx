import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentConnectionEvidence, type connection_basis } from "./DocumentConnectionEvidence";

describe("DocumentConnectionEvidence", () => {
  it("shows paired exact mentions, retained context and provenance without inventing missing context", () => {
    const source = { documentId: 12, documentName: "message.xml", sourceArtifactId: "source-a", artifactKey: "artifact-a", sessionId: "session-a", mentionText: "Ada", charStart: 9, charEnd: 12, bindingProvenanceRefs: [], sourceContext: "I called Ada yesterday.", sourceContextOffset: 0 };
    const target = { ...source, documentId: 15, documentName: "letter.docx", sourceArtifactId: "source-b", artifactKey: "artifact-b", sourceContext: null, sourceContextOffset: null, charStart: 70, charEnd: 73 };
    const basis: connection_basis[] = [{ canonicalEntityId: "entity-ada", canonicalEntityName: "Ada", sourceMentionCount: 2, targetMentionCount: 1, source, target }];
    const html = renderToStaticMarkup(createElement(DocumentConnectionEvidence, { basis, onOpenDocument: () => undefined }));
    for (const text of ["message.xml", "letter.docx", "I called Ada yesterday.", "Exact source mention", "70–73", "artifact-a", "artifact-b", "One exact mention from each document is shown."]) expect(html).toContain(text);
    expect(html).not.toContain("independently corroborated");
  });
});
