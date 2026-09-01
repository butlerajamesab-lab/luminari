import { describe, expect, it } from "vitest";

import { processLayer4 } from "./layer-4-chronology_reconstruction";
import { processLayer6, type Entity } from "./layer-6-entity_registry";
import { processLayer7 } from "./layer-7-relationship_graph";
import { processLayer9 } from "./layer-9-state_timeline";
import type { ParsedArtifact, TextSpan } from "./parsing-substrate";
import { semanticSpansForArtifact } from "./semantic-substrate";

function artifactFromSentences(sentences: string[]): ParsedArtifact {
  const extractedText = sentences.join("\n");
  const spans: TextSpan[] = [];
  let offset = 0;
  sentences.forEach((sentence, paragraphIndex) => {
    spans.push({
      text: sentence,
      start_offset: offset,
      end_offset: offset + sentence.length,
      paragraph_index: paragraphIndex,
      source_artifact_key: "sha256:reviewer-regression",
    });
    offset += sentence.length + (paragraphIndex < sentences.length - 1 ? 1 : 0);
  });
  return {
    artifact_key: "sha256:reviewer-regression",
    raw_bytes_sha256: "a".repeat(64),
    declared_mime_type: "text/plain",
    detected_mime_type: "text/plain",
    mime_type: "text/plain",
    byte_size: Buffer.byteLength(extractedText),
    extracted_text: extractedText,
    spans,
    extraction_status: "success",
    parser_version: "fixture-parser-v1",
    rule_version: "fixture-rule-v1",
    parser_rule_manifest_hash: "b".repeat(64),
  };
}

function entityAtSource(
  id: string,
  type: Entity["type"],
  rawText: string,
  artifact: ParsedArtifact,
): Entity {
  return {
    entity_id: `entity-${id}`,
    type,
    canonical_name: rawText.toLowerCase(),
    raw_mentions: [
      {
        raw_text: rawText,
        artifact_key: artifact.artifact_key,
        span_offset: artifact.extracted_text.indexOf(rawText),
      },
    ],
    review_candidates: [],
  };
}

describe("Codex reviewer regressions", () => {
  it("keeps an honorific and titled person in one source-bound sentence", () => {
    const sentence = "Dr. Jane Smith reviewed the file.";
    const artifact = artifactFromSentences([sentence]);

    expect(
      semanticSpansForArtifact(artifact, [artifact]).map((span) => span.text),
    ).toEqual([sentence]);

    const person = processLayer6({ artifacts: [artifact] }).data.find(
      (entity) => entity.canonical_name === "jane smith",
    );
    expect(person?.type).toBe("person");
    expect(person?.raw_mentions).toEqual([
      {
        raw_text: "Jane Smith",
        artifact_key: artifact.artifact_key,
        span_offset: sentence.indexOf("Jane Smith"),
      },
    ]);
  });

  it("preserves abbreviated dates for the chronology engine", () => {
    const sentence = "On Jan. 5, 2026, Alice Smith filed a complaint.";
    const artifact = artifactFromSentences([sentence]);

    expect(
      semanticSpansForArtifact(artifact, [artifact]).map((span) => span.text),
    ).toEqual([sentence]);
    expect(processLayer4({ artifacts: [artifact] }).data).toEqual([
      expect.objectContaining({
        date: "2026-01-05",
        event_text: sentence,
      }),
    ]);
  });

  it("preserves abbreviated dates in state-transition source bounds", () => {
    const sentence =
      "On Jan. 5, 2026, Alice Smith was admitted to the hospital.";
    const artifact = artifactFromSentences([sentence]);
    const alice = entityAtSource(
      "alice-smith",
      "person",
      "Alice Smith",
      artifact,
    );

    expect(
      processLayer9({ entities: [alice], artifacts: [artifact] }).data,
    ).toEqual([
      expect.objectContaining({
        transition_date: "2026-01-05",
        source_text: sentence,
      }),
    ]);
  });

  it("keeps organization suffixes with following relationship predicates", () => {
    const sentence = "Acme Inc. is employer Alice Smith was hired.";
    const artifact = artifactFromSentences([sentence]);

    expect(
      semanticSpansForArtifact(artifact, [artifact]).map((span) => span.text),
    ).toEqual([sentence]);
    const entities = processLayer6({ artifacts: [artifact] }).data;
    expect(
      entities.find((entity) => entity.canonical_name === "acme inc."),
    ).toMatchObject({ type: "organization" });
    expect(
      processLayer7({ entities, artifacts: [artifact] }).data.map(
        (relationship) => relationship.type,
      ),
    ).toContain("employer_employee");
  });

  it("keeps dotted contacts intact for contact extraction", () => {
    const sentence = "Email jane.doe@example.com or call 206.555-0123 today.";
    const artifact = artifactFromSentences([sentence]);

    expect(
      semanticSpansForArtifact(artifact, [artifact]).map((span) => span.text),
    ).toEqual([sentence]);
    expect(
      processLayer6({ artifacts: [artifact] })
        .data.filter((entity) => entity.type === "contact")
        .map((entity) => entity.canonical_name)
        .sort(),
    ).toEqual(["206.555-0123", "jane.doe@example.com"]);
  });

  it("binds relationship predicates that immediately follow coordinated endpoints", () => {
    const artifact = artifactFromSentences([
      "Alice and Bob are family.",
      "Acme LLC and Beta LLC are opposing parties.",
    ]);
    const entities: Entity[] = [
      entityAtSource("alice", "person", "Alice", artifact),
      entityAtSource("bob", "person", "Bob", artifact),
      entityAtSource("acme", "organization", "Acme LLC", artifact),
      entityAtSource("beta", "organization", "Beta LLC", artifact),
    ];

    const result = processLayer7({ entities, artifacts: [artifact] });

    expect(result.data.map((relationship) => relationship.type).sort()).toEqual(
      ["family", "opposing_party"],
    );
    for (const relationship of result.data) {
      expect(relationship.source_refs).toHaveLength(1);
      expect(relationship.source_refs[0].marker_text).toMatch(
        /^(?:are family|are opposing parties)$/i,
      );
      const source = relationship.source_refs[0];
      expect(
        artifact.extracted_text.substring(
          source.marker_offset,
          source.marker_offset + source.marker_text.length,
        ),
      ).toBe(source.marker_text);
    }
  });

  it("projects every pair in an explicitly coordinated endpoint list", () => {
    const artifact = artifactFromSentences([
      "Resident 1, Resident 2, and Resident 3 are family.",
    ]);
    const entities: Entity[] = [
      entityAtSource("resident-1", "person", "Resident 1", artifact),
      entityAtSource("resident-2", "person", "Resident 2", artifact),
      entityAtSource("resident-3", "person", "Resident 3", artifact),
    ];

    const relationships = processLayer7({
      entities,
      artifacts: [artifact],
    }).data;

    expect(
      relationships
        .map((relationship) =>
          [relationship.entity_a_id, relationship.entity_b_id].sort().join("|"),
        )
        .sort(),
    ).toEqual([
      "entity-resident-1|entity-resident-2",
      "entity-resident-1|entity-resident-3",
      "entity-resident-2|entity-resident-3",
    ]);
    expect(
      relationships.every((relationship) => relationship.type === "family"),
    ).toBe(true);
    expect(
      relationships.every(
        (relationship) =>
          relationship.source_refs.length === 1 &&
          relationship.source_refs[0].marker_text === "are family",
      ),
    ).toBe(true);
  });

  it("uses a repeated entity's occurrence inside the coordinated list", () => {
    const artifact = artifactFromSentences([
      "Resident 1 spoke, then Resident 1, Resident 2, and Resident 3 are family.",
    ]);
    const repeatedResident = entityAtSource(
      "resident-1",
      "person",
      "Resident 1",
      artifact,
    );
    repeatedResident.raw_mentions.push({
      raw_text: "Resident 1",
      artifact_key: artifact.artifact_key,
      span_offset: artifact.extracted_text.lastIndexOf("Resident 1"),
    });
    const entities: Entity[] = [
      repeatedResident,
      entityAtSource("resident-2", "person", "Resident 2", artifact),
      entityAtSource("resident-3", "person", "Resident 3", artifact),
    ];

    const relationships = processLayer7({
      entities,
      artifacts: [artifact],
    }).data;

    expect(
      relationships
        .map((relationship) =>
          [relationship.entity_a_id, relationship.entity_b_id].sort().join("|"),
        )
        .sort(),
    ).toEqual([
      "entity-resident-1|entity-resident-2",
      "entity-resident-1|entity-resident-3",
      "entity-resident-2|entity-resident-3",
    ]);
    expect(
      relationships.every(
        (relationship) => relationship.entity_a_id !== relationship.entity_b_id,
      ),
    ).toBe(true);
  });

  it("does not borrow a later predicate for an earlier coordinated pair", () => {
    const artifact = artifactFromSentences([
      "Alice and Bob met Carol and Dave are family.",
    ]);
    const entities: Entity[] = [
      entityAtSource("alice", "person", "Alice", artifact),
      entityAtSource("bob", "person", "Bob", artifact),
      entityAtSource("carol", "person", "Carol", artifact),
      entityAtSource("dave", "person", "Dave", artifact),
    ];

    const relationships = processLayer7({
      entities,
      artifacts: [artifact],
    }).data;

    expect(relationships).toHaveLength(1);
    expect(
      new Set([relationships[0].entity_a_id, relationships[0].entity_b_id]),
    ).toEqual(new Set(["entity-carol", "entity-dave"]));
  });
});
