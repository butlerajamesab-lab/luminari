import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { processLayer4 } from "./layer-4-chronology_reconstruction";
import { processLayer6, type Entity } from "./layer-6-entity_registry";
import { processLayer7, type Relationship } from "./layer-7-relationship_graph";
import { processLayer9 } from "./layer-9-state_timeline";
import type { ParsedArtifact, TextSpan } from "./parsing-substrate";
import { semanticSpansForArtifact } from "./semantic-substrate";

/**
 * Regression fixture distilled from the Caroline Kline Galland Home CMS-2567
 * reports uploaded on 2026-08-30. The wording below is source wording, including
 * the four impossible dates. Keeping the fixture inline makes the contract
 * deterministic and prevents CI from depending on private case documents.
 */

const REPORT_2024_KEY = "cms-2567:health-inspection-8.pdf";
const REPORT_2026_KEY = "cms-2567:health-inspection-7.pdf";
const INVOICE_KEY = "billing:render-invoice-ieaekuoi-0003.pdf";

function cmsHeader(surveyDate: string, page: string): string {
  return [
    "Department of Health & Human Services Printed: 08/27/2026",
    "Form Approved OMB",
    "Centers for Medicare & Medicaid Services No. 0938-0391",
    "STATEMENT OF DEFICIENCIES (X1) PROVIDER/SUPPLIER/CLIA IDENTIFICATION NUMBER:",
    `(X2) MULTIPLE CONSTRUCTION (X3) DATE SURVEY COMPLETED ${surveyDate}`,
    "NAME OF PROVIDER OR SUPPLIER STREET ADDRESS, CITY, STATE, ZIP CODE",
    "Caroline Kline Galland Home 7500 Seward Park Avenue South Seattle, WA 98118",
    `(X4) ID PREFIX TAG SUMMARY STATEMENT OF DEFICIENCIES ${page}`,
  ].join("\n");
}

function cmsFooter(page: string): string {
  return [
    "Any deficiency statement ending with an asterisk (*) denotes a deficiency which the institution may be excused from correcting.",
    "LABORATORY DIRECTOR'S OR PROVIDER/SUPPLIER REPRESENTATIVE'S SIGNATURE TITLE (X6) DATE",
    "FORM CMS-2567 (02/99) Event ID: Facility ID: If continuation sheet",
    `Previous Versions Obsolete 505442 ${page}`,
  ].join("\n");
}

const report2024 = artifactFromPages(REPORT_2024_KEY, [
  [
    cmsHeader("11/21/2024", "Page 1 of 39"),
    "<Resident 133>",
    "Review of Resident 133's 05/29/2024 and 08/09/2024 Discharge Minimum Data Sets showed the resident was transferred to an acute care hospital.",
    "In an interview on 11/20/2024 at 12:57 PM, Staff E (Charge Nurse) stated they completed the transfer notice.",
    "Resident 133 was a resident of Caroline Kline Galland Home.",
    "Staff E provided care for Resident 133.",
    "A 05/23/2032 CP for dressing showed Resident 133 required set up to get dressed independently.",
    cmsFooter("Page 1 of 39"),
  ].join("\n"),
  [
    cmsHeader("11/21/2024", "Page 2 of 39"),
    "In an interview on 11/20/2204 at 1:35 PM, Staff E stated staff should not carry uncovered food through the hallways.",
    cmsFooter("Page 2 of 39"),
  ].join("\n"),
]);

const report2026 = artifactFromPages(REPORT_2026_KEY, [
  [
    cmsHeader("03/04/2026", "Page 1 of 42"),
    "<Resident 133>",
    "In an interview on 03/04/2026 at 12:12 PM, Staff E (Activities Director) stated food concerns were reported.",
    "Resident 133 was a resident of Caroline Kline Galland Home.",
    "Staff E provided care for Resident 133.",
    "Review of the 02/02/2028 and 02/28/2026 activity assessments showed Resident 133 enjoyed watching football.",
    "Observation on 11/19/2204 showed Staff E transporting Resident 133 in a shower chair.",
    cmsFooter("Page 1 of 42"),
  ].join("\n"),
  [
    cmsHeader("03/04/2026", "Page 2 of 42"),
    "On 02/27/2026 Resident 133 stated food concerns were expressed at every resident council meeting.",
    cmsFooter("Page 2 of 42"),
  ].join("\n"),
]);

const renderInvoice = artifactFromPages(INVOICE_KEY, [
  [
    "Invoice",
    "Invoice number IEAEKUOI-0003",
    "Date of issue August 5, 2026",
    "Billing period Jul 1 - Jul 31, 2026",
    "Render Services, Inc dba Render",
    "525 Brannan St San Francisco, California 94107",
    "support@render.com",
    "Workspace Subscription $22.38",
  ].join("\n"),
]);

describe("CMS-2567 semantic-lane regression", () => {
  it("carries the CMS narrative boundary across paragraph spans on one page", () => {
    const header = `${cmsHeader("11/21/2024", "Page 1 of 1")}\nResidents Affected - One resident`;
    const firstNarrative =
      "On 11/20/2024 Resident 45 was admitted to the hospital.";
    const secondNarrative =
      "Resident 45 was a resident of Caroline Kline Galland Home.";
    const footer = cmsFooter("Page 1 of 1");
    const splitPage = artifactFromParagraphPages(
      "cms-2567:paragraph-split.pdf",
      [[header, firstNarrative, secondNarrative, footer]],
    );

    const semantic = semanticSpansForArtifact(splitPage, [splitPage]);
    expect(semantic.map((span) => span.text)).toEqual([
      firstNarrative,
      secondNarrative,
    ]);
    expect(semantic[0].start_offset).toBe(
      splitPage.extracted_text.indexOf(firstNarrative),
    );
    expect(semantic.some((span) => /FORM CMS-2567/i.test(span.text))).toBe(
      false,
    );

    const chronology = processLayer4({ artifacts: [splitPage] });
    const entities = processLayer6({ artifacts: [splitPage] });
    const relationships = processLayer7({
      entities: entities.data,
      artifacts: [splitPage],
    });
    const timeline = processLayer9({
      entities: entities.data,
      artifacts: [splitPage],
    });

    expect(
      chronology.data.some((event) => event.event_text === firstNarrative),
    ).toBe(true);
    expect(
      relationships.data.some(
        (relationship) => relationship.type === "facility_resident",
      ),
    ).toBe(true);
    expect(
      timeline.data.some(
        (transition) => transition.to_state === "facility_hospitalization",
      ),
    ).toBe(true);
  });

  it("carries the CMS narrative boundary across unpaged DOCX/text spans", () => {
    const artifactKey = "cms-2567:unpaged.txt";
    const firstNarrative =
      "On 11/20/2024 Resident 45 was admitted to the hospital.";
    const secondNarrative =
      "Resident 45 was a resident of Caroline Kline Galland Home.";
    const paged = artifactFromParagraphPages(artifactKey, [
      [
        `${cmsHeader("11/21/2024", "Page 1 of 1")}\nResidents Affected - One resident`,
        firstNarrative,
        secondNarrative,
        cmsFooter("Page 1 of 1"),
      ],
    ]);
    const unpaged: ParsedArtifact = {
      ...paged,
      declared_mime_type: "text/plain",
      detected_mime_type: "text/plain",
      mime_type: "text/plain",
      spans: paged.spans.map(({ page: _page, ...span }) => span),
    };

    expect(
      semanticSpansForArtifact(unpaged, [unpaged]).map((span) => span.text),
    ).toEqual([firstNarrative, secondNarrative]);

    const chronology = processLayer4({ artifacts: [unpaged] });
    const entities = processLayer6({ artifacts: [unpaged] });
    const relationships = processLayer7({
      entities: entities.data,
      artifacts: [unpaged],
    });
    const timeline = processLayer9({
      entities: entities.data,
      artifacts: [unpaged],
    });

    expect(chronology.data.some((event) => event.date === "2024-11-20")).toBe(
      true,
    );
    expect(
      relationships.data.some(
        (relationship) => relationship.type === "facility_resident",
      ),
    ).toBe(true);
    expect(
      timeline.data.some(
        (transition) => transition.to_state === "facility_hospitalization",
      ),
    ).toBe(true);
  });

  it("preserves every CMS deficiency narrative block on the same page", () => {
    const firstEvent =
      "On 11/19/2024 Resident 45 was admitted to the hospital.";
    const firstRelationship =
      "Resident 45 was a resident of Caroline Kline Galland Home.";
    const secondEvent =
      "On 11/20/2024 Resident 46 was admitted to the hospital.";
    const secondRelationship =
      "Resident 46 was a resident of Caroline Kline Galland Home.";
    const secondHeading =
      "(X4) ID PREFIX TAG SUMMARY STATEMENT OF DEFICIENCIES Page 1 of 1";
    const multipleBlocks = artifactFromParagraphPages(
      "cms-2567:multiple-narrative-blocks.pdf",
      [
        [
          `${cmsHeader("11/21/2024", "Page 1 of 1")}\nResidents Affected - One resident`,
          firstEvent,
          firstRelationship,
          `${secondHeading}\nResidents Affected - One resident`,
          secondEvent,
          secondRelationship,
          cmsFooter("Page 1 of 1"),
        ],
      ],
    );

    const semantic = semanticSpansForArtifact(multipleBlocks, [multipleBlocks]);
    expect(semantic.map((span) => span.text)).toEqual([
      firstEvent,
      firstRelationship,
      secondEvent,
      secondRelationship,
    ]);

    const chronology = processLayer4({ artifacts: [multipleBlocks] });
    const entities = processLayer6({ artifacts: [multipleBlocks] });
    const relationships = processLayer7({
      entities: entities.data,
      artifacts: [multipleBlocks],
    });
    const timeline = processLayer9({
      entities: entities.data,
      artifacts: [multipleBlocks],
    });

    expect(chronology.data.map((event) => event.date)).toEqual(
      expect.arrayContaining(["2024-11-19", "2024-11-20"]),
    );
    expect(
      relationships.data.filter(
        (relationship) => relationship.type === "facility_resident",
      ),
    ).toHaveLength(2);
    expect(
      timeline.data.filter(
        (transition) => transition.to_state === "facility_hospitalization",
      ),
    ).toHaveLength(2);
  });

  it("does not turn repeated CMS headers or footers into semantic facts", () => {
    const headerOnly = artifactFromPages("cms-2567:repeated-furniture.pdf", [
      `${cmsHeader("11/21/2024", "Page 1 of 2")}\n${cmsFooter("Page 1 of 2")}`,
      `${cmsHeader("11/21/2024", "Page 2 of 2")}\n${cmsFooter("Page 2 of 2")}`,
    ]);

    const chronology = processLayer4({ artifacts: [headerOnly] });
    const entities = processLayer6({ artifacts: [headerOnly] });
    const timeline = processLayer9({
      entities: entities.data,
      artifacts: [headerOnly],
    });

    expect(chronology.data).toEqual([]);
    expect(timeline.data).toEqual([]);

    const forbiddenHeaderEntities = new Set([
      "omb",
      "clia identification number",
      "date survey completed",
      "form cms",
      "multiple construction",
      "provider",
      "supplier",
      "statement of deficiencies",
      "zip code",
    ]);
    expect(
      entities.data.filter((entity) =>
        forbiddenHeaderEntities.has(entity.canonical_name),
      ),
    ).toEqual([]);
  });

  it("keeps CMS resident and staff aliases typed as people and scoped to one document", () => {
    const entities = processLayer6({
      artifacts: [report2024, report2026],
    }).data;
    const residents = entitiesWithRawAlias(entities, /^Resident 133$/i);
    const staff = entitiesWithRawAlias(entities, /^Staff E$/i);

    expectDocumentScopedPeople(residents, [REPORT_2024_KEY, REPORT_2026_KEY]);
    expectDocumentScopedPeople(staff, [REPORT_2024_KEY, REPORT_2026_KEY]);
    expect(new Set(residents.map((entity) => entity.entity_id)).size).toBe(2);
    expect(new Set(staff.map((entity) => entity.entity_id)).size).toBe(2);
  });

  it("keeps an unrelated Render invoice out of every CMS semantic output", () => {
    const artifacts = [report2024, report2026, renderInvoice];
    const chronology = processLayer4({ artifacts });
    const entities = processLayer6({ artifacts });
    const relationships = processLayer7({ entities: entities.data, artifacts });
    const timeline = processLayer9({ entities: entities.data, artifacts });

    expect(
      entities.data
        .flatMap((entity) => entity.raw_mentions)
        .some((mention) => mention.artifact_key === INVOICE_KEY),
    ).toBe(false);
    expect(
      chronology.data.some(
        (event) => event.source_artifact_key === INVOICE_KEY,
      ),
    ).toBe(false);
    expect(
      relationships.data
        .flatMap((relationship) => relationship.source_refs)
        .some((ref) => ref.artifact_key === INVOICE_KEY),
    ).toBe(false);
    expect(
      timeline.data.some(
        (transition) => transition.source_artifact_key === INVOICE_KEY,
      ),
    ).toBe(false);
  });

  it("emits only type-compatible, sentence-bound facility and caregiver relationships", () => {
    const artifacts = [report2024, report2026, renderInvoice];
    const entities = processLayer6({ artifacts }).data;
    const relationships = processLayer7({ entities, artifacts }).data;
    const facilityRelationships = relationships.filter(
      (relationship) => relationship.type === "facility_resident",
    );
    const caregiverRelationships = relationships.filter(
      (relationship) => relationship.type === "caregiver_recipient",
    );

    expect(facilityRelationships).toHaveLength(2);
    expect(caregiverRelationships).toHaveLength(2);

    for (const relationship of facilityRelationships) {
      const facility = entityAtRole(relationship, entities, "facility");
      const resident = entityAtRole(relationship, entities, "resident");
      expect(facility.type).toBe("organization");
      expect(facility.canonical_name).toBe("caroline kline galland home");
      expect(resident.type).toBe("person");
      expect(
        resident.raw_mentions.some((mention) =>
          /^Resident 133$/i.test(mention.raw_text),
        ),
      ).toBe(true);
      expectRelationshipSourceScope(relationship, facility, resident);
    }

    for (const relationship of caregiverRelationships) {
      const caregiver = entityAtRole(relationship, entities, "caregiver");
      const recipient = entityAtRole(relationship, entities, "care_recipient");
      expect(caregiver.type).toBe("person");
      expect(
        caregiver.raw_mentions.some((mention) =>
          /^Staff E$/i.test(mention.raw_text),
        ),
      ).toBe(true);
      expect(recipient.type).toBe("person");
      expect(
        recipient.raw_mentions.some((mention) =>
          /^Resident 133$/i.test(mention.raw_text),
        ),
      ).toBe(true);
      expectRelationshipSourceScope(relationship, caregiver, recipient);
    }
  });

  it("flags impossible source dates instead of silently accepting them as events", () => {
    const chronology = processLayer4({ artifacts: [report2024, report2026] });
    const impossibleNormalizedDates = [
      "2028-02-02",
      "2032-05-23",
      "2204-11-19",
      "2204-11-20",
    ];
    const impossibleSourceDates = [
      "02/02/2028",
      "05/23/2032",
      "11/19/2204",
      "11/20/2204",
    ];
    const unresolvedText = chronology.unresolved_dependencies
      .map((dependency) => `${dependency.field} ${dependency.detail}`)
      .join("\n");

    expect(chronology.data.some((event) => event.date === "2024-11-20")).toBe(
      true,
    );
    expect(chronology.data.some((event) => event.date === "2026-03-04")).toBe(
      true,
    );
    for (const date of impossibleNormalizedDates) {
      expect(chronology.data.some((event) => event.date === date)).toBe(false);
    }
    for (const date of impossibleSourceDates) {
      expect(unresolvedText).toContain(date);
    }
  });
});

function artifactFromPages(
  artifactKey: string,
  pages: string[],
): ParsedArtifact {
  const separator = "\n\f\n";
  const extractedText = pages.join(separator);
  const spans: TextSpan[] = [];
  let offset = 0;

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex];
    spans.push({
      text: page,
      start_offset: offset,
      end_offset: offset + page.length,
      page: pageIndex + 1,
      paragraph_index: 0,
      source_artifact_key: artifactKey,
    });
    offset +=
      page.length + (pageIndex < pages.length - 1 ? separator.length : 0);
  }

  return {
    artifact_key: artifactKey,
    raw_bytes_sha256: createHash("sha256").update(extractedText).digest("hex"),
    declared_mime_type: "application/pdf",
    detected_mime_type: "application/pdf",
    mime_type: "application/pdf",
    byte_size: Buffer.byteLength(extractedText),
    extracted_text: extractedText,
    spans,
    extraction_status: "success",
    parser_version: "cms-2567-regression-fixture-v1",
    rule_version: "cms-2567-regression-fixture-v1",
    parser_rule_manifest_hash: "a".repeat(64),
  };
}

function artifactFromParagraphPages(
  artifactKey: string,
  pages: string[][],
): ParsedArtifact {
  const paragraphSeparator = "\n\n";
  const pageSeparator = "\n\f\n";
  const pageTexts = pages.map((paragraphs) =>
    paragraphs.join(paragraphSeparator),
  );
  const extractedText = pageTexts.join(pageSeparator);
  const spans: TextSpan[] = [];
  let pageOffset = 0;

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    let paragraphOffset = pageOffset;
    for (
      let paragraphIndex = 0;
      paragraphIndex < pages[pageIndex].length;
      paragraphIndex++
    ) {
      const paragraph = pages[pageIndex][paragraphIndex];
      spans.push({
        text: paragraph,
        start_offset: paragraphOffset,
        end_offset: paragraphOffset + paragraph.length,
        page: pageIndex + 1,
        paragraph_index: paragraphIndex,
        source_artifact_key: artifactKey,
      });
      paragraphOffset +=
        paragraph.length +
        (paragraphIndex < pages[pageIndex].length - 1
          ? paragraphSeparator.length
          : 0);
    }
    pageOffset +=
      pageTexts[pageIndex].length +
      (pageIndex < pages.length - 1 ? pageSeparator.length : 0);
  }

  return {
    artifact_key: artifactKey,
    raw_bytes_sha256: createHash("sha256").update(extractedText).digest("hex"),
    declared_mime_type: "application/pdf",
    detected_mime_type: "application/pdf",
    mime_type: "application/pdf",
    byte_size: Buffer.byteLength(extractedText),
    extracted_text: extractedText,
    spans,
    extraction_status: "success",
    parser_version: "cms-2567-paragraph-regression-fixture-v1",
    rule_version: "cms-2567-paragraph-regression-fixture-v1",
    parser_rule_manifest_hash: "a".repeat(64),
  };
}

function entitiesWithRawAlias(entities: Entity[], alias: RegExp): Entity[] {
  return entities.filter((entity) =>
    entity.raw_mentions.some((mention) => alias.test(mention.raw_text)),
  );
}

function expectDocumentScopedPeople(
  entities: Entity[],
  artifactKeys: string[],
): void {
  expect(entities).toHaveLength(artifactKeys.length);
  expect(entities.every((entity) => entity.type === "person")).toBe(true);
  const scopes = entities.map((entity) =>
    Array.from(
      new Set(entity.raw_mentions.map((mention) => mention.artifact_key)),
    ),
  );
  expect(scopes.every((scope) => scope.length === 1)).toBe(true);
  expect(scopes.flat().sort()).toEqual([...artifactKeys].sort());
}

function entityAtRole(
  relationship: Relationship,
  entities: Entity[],
  role: string,
): Entity {
  const entityId =
    relationship.role_a === role
      ? relationship.entity_a_id
      : relationship.role_b === role
        ? relationship.entity_b_id
        : null;
  expect(
    entityId,
    `relationship ${relationship.relationship_id} is missing role ${role}`,
  ).not.toBeNull();
  const entity = entities.find((candidate) => candidate.entity_id === entityId);
  expect(
    entity,
    `relationship ${relationship.relationship_id} refers to a missing entity`,
  ).toBeDefined();
  return entity!;
}

function expectRelationshipSourceScope(
  relationship: Relationship,
  first: Entity,
  second: Entity,
): void {
  expect(relationship.source_refs).toHaveLength(1);
  const artifactKey = relationship.source_refs[0].artifact_key;
  expect(artifactKey).not.toBe(INVOICE_KEY);
  expect(
    first.raw_mentions.some((mention) => mention.artifact_key === artifactKey),
  ).toBe(true);
  expect(
    second.raw_mentions.some((mention) => mention.artifact_key === artifactKey),
  ).toBe(true);
}
