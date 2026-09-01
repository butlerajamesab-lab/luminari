import { describe, expect, it } from "vitest";

import {
  buildSourceMap,
  chronologyProvenanceFromItems,
  chronologyProvenanceFromSourceMap,
  chronologyProvenanceMatches,
  generateParagraphsFromGroups,
} from "./narrative-generator";

const OUTPUT_HASH = "a".repeat(64);
const RECEIPT_HASH = "b".repeat(64);
const REPLACEMENT_OUTPUT_HASH = "c".repeat(64);

function chronologyItem() {
  return {
    type: "event",
    id: "evt-canonical-42",
    date: "2024-01-15",
    datePrecision: "exact",
    sortKey: Date.parse("2024-01-15"),
    label: "The source records an event",
    description: null,
    documentId: 17,
    documentName: "record.pdf",
    page: null,
    entityNames: [],
    evidentiaryWeight: "source_bound",
    canonical_source_artifact_key: "source-17",
    canonical_source_span_offset: 24,
    canonical_output_hashes: [OUTPUT_HASH],
    canonical_receipt_hashes: [RECEIPT_HASH],
  } as any;
}

describe("governed narrative provenance", () => {
  it("persists exact chronology output and receipt hashes in the existing source map", () => {
    const item = chronologyItem();
    const sourceMap = buildSourceMap(
      [{ text: "Paragraph", sourceRefs: [0] }],
      [item],
    ) as any[];

    expect(sourceMap[0].sources[0]).toMatchObject({
      id: "evt-canonical-42",
      canonical_source_artifact_key: "source-17",
      canonical_source_span_offset: 24,
      canonical_output_hashes: [OUTPUT_HASH],
      canonical_receipt_hashes: [RECEIPT_HASH],
    });
    expect(chronologyProvenanceFromSourceMap(sourceMap)).toEqual(
      chronologyProvenanceFromItems([item]),
    );
  });

  it("treats a same-count output replacement and a hashless legacy narrative as stale", () => {
    const current = chronologyProvenanceFromItems([chronologyItem()]);
    expect(chronologyProvenanceMatches({
      canonical_output_hashes: [OUTPUT_HASH],
      canonical_receipt_hashes: [RECEIPT_HASH],
    }, current)).toBe(true);
    expect(chronologyProvenanceMatches({
      canonical_output_hashes: [REPLACEMENT_OUTPUT_HASH],
      canonical_receipt_hashes: [RECEIPT_HASH],
    }, current)).toBe(false);
    expect(chronologyProvenanceMatches({
      canonical_output_hashes: [],
      canonical_receipt_hashes: [],
    }, current)).toBe(false);
  });

  it("uses the stable canonical event id instead of an array-position citation", () => {
    const item = chronologyItem();
    const paragraphs = generateParagraphsFromGroups([{
      label: "January 2024",
      sortKey: item.sortKey,
      items: [item],
    }], [item]);

    expect(paragraphs[0].text).toContain("governed chronology event evt-canonical-42");
    expect(paragraphs[0].text).not.toContain("event #0");
  });

  it("keeps each governed event in its own source-bound paragraph", () => {
    const first = chronologyItem();
    const second = { ...chronologyItem(), id: "evt-canonical-43", label: "A second source event" };
    const paragraphs = generateParagraphsFromGroups([{
      label: "January 2024",
      sortKey: first.sortKey,
      items: [first, second],
    }], [first, second]);

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs.map(paragraph => paragraph.sourceRefs)).toEqual([[0], [1]]);
    expect(paragraphs[0].text).not.toContain("A second source event");
    expect(paragraphs[1].text).not.toContain("The source records an event");
  });
});
