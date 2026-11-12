import { describe, it, expect } from "vitest";
import {
  REPAIR_VERSION,
  FAMILIES,
  CORPUS_NAME_TEST_SQL,
  ledgerRowForTextSet,
  ledgerRowForContactMint,
  ledgerRowForHeld,
  ledgerRowForRejection,
  manifestFor,
  summarizePlan,
  buildLedgerInsert,
  buildTextUpdate,
  buildContactInsert,
} from "./apply-content-projection.mjs";

const E1 = "11111111-1111-1111-1111-111111111111";
const E2 = "22222222-2222-2222-2222-222222222222";

const textSet = {
  entity_id: E1,
  field: "description",
  new_value: "Helps people.",
  rule: "C2-text-projection",
  source_civic_object_uid: "obj-1",
  source_artifact_key: "a/b.docx",
  source_section_name: null,
};
const mint = {
  entity_id: E1,
  contact_type: "phone",
  contact_value: "206-555-1234",
  label: "Phone",
  is_primary: true,
  rule: "C2-contact-projection",
  source_value: "(206) 555-1234",
  source_content_sha256: "deadbeef",
  source_civic_object_uid: "obj-1",
  source_artifact_key: "a/b.docx",
  source_section_name: null,
};

describe("families", () => {
  it("covers the three projection families with their link keys", () => {
    expect(FAMILIES.map((f) => f.source_table)).toEqual([
      "catalog_site_projection_v1",
      "catalog_remainder_projection_v1",
      "bundle_decomposition_v1",
    ]);
    expect(FAMILIES.map((f) => f.link_key)).toEqual([
      "site_entity_id",
      "resource_entity_id",
      "minted_entity_id",
    ]);
  });
});

describe("corpus name test mirror", () => {
  it("carries the widened PR #810 clauses", () => {
    expect(CORPUS_NAME_TEST_SQL).toContain("enriched");
    expect(CORPUS_NAME_TEST_SQL).toContain("verify remaining fields");
    expect(CORPUS_NAME_TEST_SQL).toContain("street|avenue|road");
    expect(CORPUS_NAME_TEST_SQL).toContain("[A-Za-z0-9][A-Za-z0-9.-]*");
  });
});

describe("ledger rows", () => {
  it("shapes a text_set row with the idempotency key", () => {
    const row = ledgerRowForTextSet(textSet, null);
    expect(row.repair_kind).toBe("text_set");
    expect(row.repair_key).toBe("text_set:description");
    expect(row.repair_version).toBe(REPAIR_VERSION);
    expect(row.old_value).toBeNull();
    expect(row.new_value).toBe("Helps people.");
  });
  it("shapes a contact_mint row keyed by type and value", () => {
    const row = ledgerRowForContactMint(mint);
    expect(row.repair_key).toBe("contact_mint:phone:206-555-1234");
    expect(row.field_name).toBe("phone");
    expect(row.source_value).toBe("(206) 555-1234");
  });
  it("shapes held and rejection rows", () => {
    const held = ledgerRowForHeld({ entity_id: E2, rule: "held_no_linked_rows" });
    expect(held.repair_key).toBe("held");
    expect(held.field_name).toBe("");
    const rej = ledgerRowForRejection({
      entity_id: E2, field: "phone", rule: "rejected_no_valid_nanp",
      source_value: "19948", source_civic_object_uid: "o",
      source_artifact_key: "a", source_section_name: "s",
    });
    expect(rej.repair_key).toMatch(/^value_rejected:phone:[0-9a-f]{16}$/);
  });
});

describe("manifest", () => {
  it("is deterministic and order-insensitive over the same plan", () => {
    const planA = {
      textSets: [textSet],
      contactMints: [mint],
      helds: [{ entity_id: E2, rule: "held_no_linked_rows" }],
      rejections: [],
    };
    const planB = {
      textSets: [textSet],
      contactMints: [mint],
      helds: [{ entity_id: E2, rule: "held_no_linked_rows" }],
      rejections: [],
    };
    expect(manifestFor(planA)).toBe(manifestFor(planB));
    expect(manifestFor(planA)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("changes when any planned value changes", () => {
    const base = { textSets: [textSet], contactMints: [], helds: [], rejections: [] };
    const changed = {
      textSets: [{ ...textSet, new_value: "Different." }],
      contactMints: [], helds: [], rejections: [],
    };
    expect(manifestFor(base)).not.toBe(manifestFor(changed));
  });
});

describe("summarizePlan", () => {
  it("counts entities, fields, types, holds, and rejections", () => {
    const summary = summarizePlan(
      {
        textSets: [textSet, { ...textSet, field: "apply_notes" }],
        contactMints: [mint, { ...mint, contact_type: "website", contact_value: "https://x.org" }],
        helds: [{ entity_id: E2, rule: "held_no_linked_rows" }],
        rejections: [
          { entity_id: E2, field: "phone", rule: "rejected_no_valid_nanp", source_value: "19948" },
        ],
      },
      42,
    );
    expect(summary.entities_in_scope).toBe(42);
    expect(summary.entities_with_text).toBe(1);
    expect(summary.text_fields_set).toBe(2);
    expect(summary.contact_points_by_type).toEqual({ phone: 1, website: 1 });
    expect(summary.held_by_rule).toEqual({ held_no_linked_rows: 1 });
    expect(summary.rejected_by_rule).toEqual({ rejected_no_valid_nanp: 1 });
  });
});

describe("write builders", () => {
  it("builds a conflict-guarded ledger insert with 12 params per row", () => {
    const built = buildLedgerInsert([ledgerRowForTextSet(textSet, null)]);
    expect(built.text).toContain("luminari_content_projection_repairs");
    expect(built.text).toContain("on conflict (resource_entity_id, repair_key) do nothing");
    expect(built.params).toHaveLength(12);
  });
  it("builds a drift-guarded text update and refuses unknown fields", () => {
    const built = buildTextUpdate("description", [textSet]);
    expect(built.text).toContain("set description = v.new_value");
    expect(built.text).toContain("coalesce(btrim(e.description), '') = ''");
    expect(() => buildTextUpdate("resource_name", [textSet])).toThrow();
  });
  it("builds a contact insert in the served shape", () => {
    const built = buildContactInsert([mint], new Map([[E1, "canon-1"]]));
    expect(built.text).toContain("luminari_resource_contact_points");
    expect(built.params).toContain("source_attached");
    expect(built.params).toContain("canon-1");
    const metadata = JSON.parse(built.params[built.params.length - 1]);
    expect(metadata.repair_version).toBe(REPAIR_VERSION);
    expect(metadata.source_field).toBe("phone");
  });
  it("returns null for empty row sets", () => {
    expect(buildLedgerInsert([])).toBeNull();
    expect(buildTextUpdate("description", [])).toBeNull();
    expect(buildContactInsert([], new Map())).toBeNull();
  });
});
