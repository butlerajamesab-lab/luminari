import { beforeEach, describe, expect, it, vi } from "vitest";

import { computeHash } from "./engines/intake-spine/utils";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  readIntegrity: vi.fn(),
}));

vi.mock("./db-legacy", () => ({
  getPool: () => ({ query: mocks.query }),
}));

vi.mock("./intake-case-integrity-projection", () => ({
  read_case_intake_integrity_projection: mocks.readIntegrity,
}));

import { get_projected_entity_roles, project_case_entities } from "./intake-case-runtime-projection";

const entityData = [
  {
    entity_id: "entity-resident-1",
    type: "person",
    canonical_name: "Resident 1",
    raw_mentions: [
      {
        raw_text: "Resident 1",
        artifact_key: "artifact-shared",
        span_offset: 12,
      },
    ],
    review_candidates: [],
  },
];

const outputHash = computeHash(entityData);
const layerRows = [
  {
    intake_session_id: "session-quarantined",
    link_type: "primary_projection",
    is_primary: true,
    layer_run_id: "run-entity",
    layer_name: "entity_registry",
    layer_version: "2.5.0",
    rule_version: "2.5.0",
    normalization_version: null,
    run_status: "completed",
    input_hash: "1".repeat(64),
    output_hash: outputHash,
    output_refs: [{ artifact_id: "output-entity" }],
    unresolved_dependencies: [],
    receipt: {
      receipt_type: "layer_execution",
      execution_contract_version: "luminari.intake.layer-execution.v1",
      output_artifact_id: "output-entity",
    },
    receipt_hash: "2".repeat(64),
    canonicalization_version: "luminari.intake.canonical-json.v2",
    completed_at: "2026-08-30T21:00:00.000Z",
    sealed_at: "2026-08-30T21:00:00.000Z",
    output_artifact_id: "output-entity",
    output_artifact_key: "output:key",
    output_artifact_type: "intake_layer_output",
    output_artifact_status: "preserved",
    output_artifact_metadata: {
      execution_contract_version: "luminari.intake.layer-execution.v1",
      canonicalization_version: "luminari.intake.canonical-json.v2",
      layer_name: "entity_registry",
      layer_version: "2.5.0",
      rule_version: "2.5.0",
      output_hash: outputHash,
      data: entityData,
    },
  },
];

const sourceRows = [
  {
    intake_session_id: "session-quarantined",
    artifact_id: "source-quarantined",
    artifact_key: "artifact-shared",
    artifact_status: "registered",
    filename: "quarantined.pdf",
    mime_type: "application/pdf",
    metadata: { legacy_document_id: 8 },
  },
  {
    intake_session_id: "session-preserved",
    artifact_id: "source-preserved-duplicate",
    artifact_key: "artifact-shared",
    artifact_status: "registered",
    filename: "preserved-duplicate.pdf",
    mime_type: "application/pdf",
    metadata: { legacy_document_id: 7 },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("lr.layer_name = $2") ? layerRows : sourceRows,
  }));
  mocks.readIntegrity.mockResolvedValue({
    artifacts: [
      {
        intake_session_id: "session-quarantined",
        artifact_id: "source-quarantined",
        artifact_key: "artifact-shared",
        integrity_status: "quarantined",
      },
      {
        intake_session_id: "session-preserved",
        artifact_id: "source-preserved-duplicate",
        artifact_key: "artifact-shared",
        integrity_status: "preserved",
      },
    ],
  });
});

describe("entity mention producing-session source binding", () => {
  it("does not bind a quarantined mention to a preserved duplicate in another session", async () => {
    const projection = await project_case_entities(44);

    expect(projection.state).toBe("canonical_projection");
    expect(projection.canonical_entities).toEqual([]);
    expect(projection.entities).toEqual([]);
  });
});

function mock_preserved_entity_output(data: Array<Record<string, unknown>>) {
  const output_hash = computeHash(data);
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("lr.layer_name = $2") ? [{
      ...layerRows[0],
      output_hash,
      output_artifact_metadata: {
        ...layerRows[0].output_artifact_metadata,
        output_hash,
        data,
      },
    }] : [sourceRows[0]],
  }));
  mocks.readIntegrity.mockResolvedValue({
    artifacts: [{
      intake_session_id: "session-quarantined",
      artifact_id: "source-quarantined",
      artifact_key: "artifact-shared",
      integrity_status: "preserved",
    }],
  });
}

describe("reviewed message-author display names", () => {
  const author = {
    entity_id: "entity-reviewed-author",
    type: "person",
    canonical_name: "jordan reviewer",
    raw_mentions: [{
      raw_text: "I",
      artifact_key: "artifact-shared",
      span_offset: 0,
      binding_provenance_refs: ["reviewed-assertion:fixture"],
    }],
    review_candidates: [],
  };

  it("shows the reviewed canonical identity instead of I while preserving ordinary source casing", async () => {
    const ordinary = {
      ...entityData[0],
      entity_id: "entity-rick",
      canonical_name: "rick",
      raw_mentions: [{ raw_text: "Rick", artifact_key: "artifact-shared", span_offset: 5 }],
    };
    mock_preserved_entity_output([author, ordinary]);

    const projection = await project_case_entities(44);
    const names = Object.fromEntries(projection.entities.map(entity => [entity.canonicalEntityId, entity.name]));
    expect(names).toEqual({ "entity-reviewed-author": "jordan reviewer", "entity-rick": "Rick" });
    expect(projection.canonical_entities.find(entity => entity.entity_id === author.entity_id)?.raw_mentions[0])
      .toMatchObject(author.raw_mentions[0]);
  });

  it("retains a literal canonical-name spelling when it appears after a bound pronoun", async () => {
    mock_preserved_entity_output([{
      ...author,
      raw_mentions: [...author.raw_mentions, {
        raw_text: "Jordan Reviewer",
        artifact_key: "artifact-shared",
        span_offset: 25,
      }],
    }]);

    const projection = await project_case_entities(44);
    expect(projection.entities[0].name).toBe("Jordan Reviewer");
  });

  it("does not treat an empty provenance reference as a reviewed author binding", async () => {
    mock_preserved_entity_output([{
      ...author,
      raw_mentions: [{ ...author.raw_mentions[0], binding_provenance_refs: [""] }],
    }]);

    const projection = await project_case_entities(44);
    expect(projection.entities[0].name).toBe("I");
  });

  it("exposes source membership and exact reviewed mention context without replacing the source words", async () => {
    mock_preserved_entity_output([{
      ...author,
      raw_mentions: [{
        ...author.raw_mentions[0],
        source_context: "I am the caregiver.",
        source_context_offset: 0,
      }],
    }]);
    const projection = await project_case_entities(44);
    expect(projection.entities[0]).toMatchObject({ sourceDocumentIds: [8], sourceMentionCount: 1 });
    const roles = await get_projected_entity_roles(projection.entities[0].id);
    expect(roles).toHaveLength(1);
    expect(roles![0]).toMatchObject({
      documentId: 8,
      rawMention: "I",
      sourceContext: "I am the caregiver.",
      sourceContextOffset: 0,
      bindingProvenanceRefs: ["reviewed-assertion:fixture"],
      canonicalSpanOffset: 0,
    });
  });

  it("does not display a context excerpt whose offset does not locate the sealed mention", async () => {
    mock_preserved_entity_output([{
      ...author,
      raw_mentions: [{
        ...author.raw_mentions[0],
        source_context: "Someone else is the caregiver.",
        source_context_offset: 0,
      }],
    }]);
    const projection = await project_case_entities(44);
    const roles = await get_projected_entity_roles(projection.entities[0].id);
    expect(roles![0]).toMatchObject({ rawMention: "I", sourceContext: null, sourceContextOffset: null });
  });
});
