import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ChronologyEvent } from "./layer-4-chronology_reconstruction";
import type { Entity } from "./layer-6-entity_registry";
import type { Relationship } from "./layer-7-relationship_graph";
import type { StateTransition } from "./layer-9-state_timeline";
import type { ParsedArtifact } from "./parsing-substrate";
import {
  assertDerivedSemanticQuality,
  collectDerivedSemanticQualityIssues,
  type DerivedSemanticQualityInput,
} from "./derived-semantic-quality";

function artifact(artifactKey: string, text: string): ParsedArtifact {
  return {
    artifact_key: artifactKey,
    raw_bytes_sha256: "a".repeat(64),
    declared_mime_type: "application/pdf",
    detected_mime_type: "application/pdf",
    mime_type: "application/pdf",
    byte_size: text.length,
    extracted_text: text,
    spans: [
      {
        text,
        start_offset: 0,
        end_offset: text.length,
        page: 1,
        source_artifact_key: artifactKey,
      },
    ],
    extraction_status: "success",
    parser_version: "test-parser",
    rule_version: "test-rule",
    parser_rule_manifest_hash: "b".repeat(64),
  };
}

function cmsArtifact(
  artifactKey: string,
  body: string,
  surveyDate = "08/04/2023",
): ParsedArtifact {
  return artifact(
    artifactKey,
    [
      "STATEMENT OF DEFICIENCIES",
      "PROVIDER/SUPPLIER/CLIA IDENTIFICATION NUMBER",
      "FORM CMS-2567",
      `DATE SURVEY COMPLETED ${surveyDate}`,
      "Residents Affected - Some residents",
      body,
      "(continued on next page)",
    ].join("\n"),
  );
}

function entity(
  entityId: string,
  type: Entity["type"],
  canonicalName: string,
  source: ParsedArtifact,
  rawText = canonicalName,
): Entity {
  return {
    entity_id: entityId,
    type,
    canonical_name: canonicalName,
    raw_mentions: [
      {
        raw_text: rawText,
        artifact_key: source.artifact_key,
        span_offset: source.extracted_text.indexOf(rawText),
      },
    ],
    review_candidates: [],
  };
}

function baseInput(source: ParsedArtifact): DerivedSemanticQualityInput {
  return {
    artifacts: [source],
    chronology: [],
    entities: [],
    relationships: [],
    state_transitions: [],
  };
}

function issueCodes(input: DerivedSemanticQualityInput): string[] {
  return collectDerivedSemanticQualityIssues(input).map((issue) => issue.code);
}

describe("derived semantic quality gate", () => {
  it("accepts a source-bound, typed, document-scoped CMS graph", () => {
    const source = cmsArtifact(
      "cms-a",
      "Resident 12 was a resident at Caroline Kline Galland Home on 08/01/2023.",
    );
    const resident = entity(
      "resident-a",
      "person",
      "resident 12",
      source,
      "Resident 12",
    );
    const facility = entity(
      "facility",
      "organization",
      "caroline kline galland home",
      source,
      "Caroline Kline Galland Home",
    );
    const relationship: Relationship = {
      relationship_id: "rel-clean",
      entity_a_id: facility.entity_id,
      entity_b_id: resident.entity_id,
      type: "facility_resident",
      direction: "a_to_b",
      role_a: "facility",
      role_b: "resident",
      source_refs: [
        {
          artifact_key: source.artifact_key,
          span_start_offset: source.extracted_text.indexOf("Resident 12"),
          span_text:
            "Resident 12 was a resident at Caroline Kline Galland Home on 08/01/2023.",
          marker_text: "resident at",
          marker_offset: source.extracted_text.indexOf("resident at"),
        },
      ],
    };
    const chronology: ChronologyEvent = {
      event_id: "evt-clean",
      date: "2023-08-01",
      date_precision: "exact",
      event_text: relationship.source_refs[0].span_text,
      actor: "Resident 12",
      source_artifact_key: source.artifact_key,
      source_span_offset: source.extracted_text.indexOf("08/01/2023"),
      verification_status: "document_stated",
    };

    expect(() =>
      assertDerivedSemanticQuality({
        artifacts: [source],
        chronology: [chronology],
        entities: [resident, facility],
        relationships: [relationship],
        state_transitions: [],
      }),
    ).not.toThrow();
  });

  it("rejects missing, self-referential, and type-incompatible relationship endpoints", () => {
    const source = cmsArtifact(
      "cms-a",
      "The inspection documented a care concern.",
    );
    const organization = entity(
      "org",
      "organization",
      "Galland Home",
      source,
      "inspection",
    );
    const relationships: Relationship[] = [
      {
        relationship_id: "missing",
        entity_a_id: "org",
        entity_b_id: "absent",
        type: "facility_resident",
        direction: "a_to_b",
        role_a: "facility",
        role_b: "resident",
        source_refs: [],
      },
      {
        relationship_id: "self",
        entity_a_id: "org",
        entity_b_id: "org",
        type: "family",
        direction: "bidirectional",
        role_a: "family_member",
        role_b: "family_member",
        source_refs: [],
      },
    ];
    const codes = issueCodes({
      ...baseInput(source),
      entities: [organization],
      relationships,
    });

    expect(codes).toContain("relationship_missing_endpoint");
    expect(codes).toContain("relationship_self_endpoint");
    expect(codes).toContain("relationship_incompatible_endpoint_type");
  });

  it("rejects CMS form furniture and an unrelated invoice in every semantic output", () => {
    const cms = cmsArtifact("cms-a", "The inspection documented a concern.");
    const invoice = artifact(
      "invoice",
      "Invoice\nInvoice number INV-3\nBilling period August\nWorkspace Subscription",
    );
    const cmsFurniture = entity("cms-label", "organization", "cms", cms, "CMS");
    const invoiceEntity = entity(
      "invoice-entity",
      "organization",
      "Workspace Subscription",
      invoice,
    );
    const chronology: ChronologyEvent[] = [
      {
        event_id: "header-event",
        date: null,
        date_precision: "unknown",
        event_text: "FORM CMS-2567 Previous Versions Obsolete",
        actor: null,
        source_artifact_key: cms.artifact_key,
        source_span_offset: 0,
        verification_status: "document_stated",
      },
      {
        event_id: "invoice-event",
        date: null,
        date_precision: "unknown",
        event_text: "Billing period August",
        actor: null,
        source_artifact_key: invoice.artifact_key,
        source_span_offset: 0,
        verification_status: "document_stated",
      },
    ];
    const transition: StateTransition = {
      transition_id: "header-state",
      entity_id: cmsFurniture.entity_id,
      from_state: null,
      to_state: "approved",
      transition_date: null,
      source_artifact_key: cms.artifact_key,
      source_span_offset: 0,
      source_text: "Form Approved OMB",
      verification_status: "document_stated",
    };
    const relationship: Relationship = {
      relationship_id: "invoice-rel",
      entity_a_id: invoiceEntity.entity_id,
      entity_b_id: cmsFurniture.entity_id,
      type: "opposing_party",
      direction: "bidirectional",
      role_a: "party",
      role_b: "party",
      source_refs: [
        {
          artifact_key: invoice.artifact_key,
          span_start_offset: 0,
          span_text: invoice.extracted_text,
          marker_text: "Invoice",
          marker_offset: 0,
        },
      ],
    };
    const codes = issueCodes({
      artifacts: [cms, invoice],
      chronology,
      entities: [cmsFurniture, invoiceEntity],
      relationships: [relationship],
      state_transitions: [transition],
    });

    expect(codes).toEqual(
      expect.arrayContaining([
        "cms_furniture_chronology",
        "cms_furniture_entity",
        "cms_furniture_state",
        "excluded_artifact_chronology",
        "excluded_artifact_entity",
        "excluded_artifact_relationship",
      ]),
    );
  });

  it("requires CMS Resident/Staff aliases to be document-scoped person entities", () => {
    const first = cmsArtifact("cms-a", "Resident 12 was assisted by Staff E.");
    const second = cmsArtifact("cms-b", "Resident 12 was assisted by Staff E.");
    const mergedResident = entity(
      "resident",
      "unknown",
      "resident 12",
      first,
      "Resident 12",
    );
    mergedResident.raw_mentions.push({
      raw_text: "Resident 12",
      artifact_key: second.artifact_key,
      span_offset: second.extracted_text.indexOf("Resident 12"),
    });

    const codes = issueCodes({
      artifacts: [first, second],
      chronology: [],
      entities: [mergedResident],
      relationships: [],
      state_transitions: [],
    });

    expect(codes).toEqual(
      expect.arrayContaining([
        "cms_alias_not_person",
        "cms_alias_cross_document_identity",
        "cms_alias_missing_document_person",
      ]),
    );
  });

  it("rejects future CMS chronology and state dates beyond the survey window", () => {
    const source = cmsArtifact("cms-a", "The report referenced 02/02/2028.");
    const chronology: ChronologyEvent = {
      event_id: "future-event",
      date: "2028-02-02",
      date_precision: "exact",
      event_text: "The report referenced 02/02/2028.",
      actor: null,
      source_artifact_key: source.artifact_key,
      source_span_offset: source.extracted_text.indexOf("02/02/2028"),
      verification_status: "document_stated",
    };
    const transition: StateTransition = {
      transition_id: "future-state",
      entity_id: "not-material-to-this-invariant",
      from_state: null,
      to_state: "approved",
      transition_date: "2028-02-02",
      source_artifact_key: source.artifact_key,
      source_span_offset: chronology.source_span_offset,
      source_text: chronology.event_text,
      verification_status: "document_stated",
    };

    expect(
      issueCodes({
        ...baseInput(source),
        chronology: [chronology],
        state_transitions: [transition],
      }),
    ).toEqual(
      expect.arrayContaining([
        "cms_future_chronology_date",
        "cms_future_state_date",
      ]),
    );
  });

  it("runs the gate before the first derived layer persistence", () => {
    const orchestrator = readFileSync(
      new URL("../../intake-spine-orchestrator.ts", import.meta.url),
      "utf8",
    );
    const gate = orchestrator.indexOf("assertDerivedSemanticQuality({");
    const chronologyPersistence = orchestrator.indexOf(
      "dependency_key: 'chronology_reconstruction'",
    );
    const entityPersistence = orchestrator.indexOf(
      "dependency_key: 'entity_registry'",
    );

    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(chronologyPersistence);
    expect(gate).toBeLessThan(entityPersistence);
  });
});
