import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const connection = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./db", () => ({ getPool: () => connection }));
import {
  get_publishable_resource_directory_summary,
  search_publishable_resource_directory,
  get_publishable_resource_directory_detail,
} from "./services/resource-directory-fast-current";
const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260914220207_resource_category_review_ledger.sql",
    import.meta.url,
  ),
  "utf8",
);
const receipts = JSON.parse(
  readFileSync(
    new URL(
      "../docs/continuity/colorado-resource-category-receipts-20260914.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const application_sql = readFileSync(
  new URL(
    "../supabase/reviewed-data/20260914_colorado_resource_categories.sql",
    import.meta.url,
  ),
  "utf8",
);
const transcription_receipts = JSON.parse(
  readFileSync(
    new URL(
      "../docs/continuity/colorado-resource-transcription-receipts-20260914.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
let db: PGlite;
async function append(rows = receipts) {
  const fields = Object.keys(receipts[0]).join(",");
  return db.query(
    `insert into public.luminari_resource_category_revision_v1 (${fields}) select ${fields} from jsonb_populate_recordset(null::public.luminari_resource_category_revision_v1,$1::jsonb) on conflict (revision_id) do nothing`,
    [JSON.stringify(rows)],
  );
}
beforeAll(async () => {
  db = new PGlite();
  const text_columns =
    "civic_object_uid object_ref artifact_key source_content_sha256 source_candidate_hash source_locator object_class name organization_name phone email website_url address eligibility_summary apply_notes description category layer jurisdiction state_code source_object_type target_surface current_run_role current_run_engine_version artifact_role parser_version jurisdiction_resolution_state section_name filing_portal filing_portal_url statutory_authority deadline hours languages organization_type candidate_state projection_state projection_version data_state catalog_kind".split(
      " ",
    );
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create function luminari_stable_uuid_v1(text) returns uuid language sql immutable as 'select md5($1)::uuid';
    create table fixture_current (${text_columns.map((name) => `${name} text`).join(",")},run_id uuid,person_facing_ready boolean,has_access_point boolean,typed_ready boolean,jurisdiction_ready boolean,direct_access_ready boolean,field_provenance jsonb,source_transcription_correction jsonb,current_run_completed_at timestamptz,source_created_at timestamptz,reconciled_at timestamptz);
    create view v_lighthouse_resource_program_catalog_v2 as select * from fixture_current;
    create view v_lighthouse_resource_program_transcribed_v1 as select * from fixture_current;
    grant select on v_lighthouse_resource_program_catalog_v2,v_lighthouse_resource_program_transcribed_v1 to service_role;`);
  const fixtures = receipts.map((row: any) => ({
    ...row,
    source_transcription_correction: transcription_receipts.find(
      (receipt: any) => receipt.object_ref === row.object_ref,
    ),
    category: row.before_category,
    layer: row.before_layer,
    name: row.source_text.split("\n")[1],
    state_code: "CO",
    jurisdiction: "CO",
    object_class: "resource",
    person_facing_ready: true,
    data_state: "current_typed",
  }));
  await db.query(
    "insert into fixture_current select * from jsonb_populate_recordset(null::fixture_current,$1::jsonb)",
    [JSON.stringify(fixtures)],
  );
  await db.exec(migration);
  connection.query.mockImplementation((sql: string, params: any[]) => {
    if (
      sql.includes("luminari_corpus_candidate_v1") ||
      sql.includes("luminari_corpus_source_artifact_v1") ||
      sql.includes("luminari_corpus_resource_quality_v1")
    )
      return { rows: [] };
    return db.query(sql, params);
  });
}, 30000);
afterAll(async () => {
  await db.close();
});

describe("reviewed resource categories in PostgreSQL", () => {
  it("applies 24 primary classifications and 19 service memberships without altering source category or readiness", async () => {
    await db.exec(application_sql);
    const { rows } = await db.query<any>(
      "select * from v_lighthouse_resource_program_classified_v1",
    );
    expect(rows).toHaveLength(24);
    expect(
      rows.reduce((n, r) => n + r.reviewed_category_memberships.length, 0),
    ).toBe(43);
    const denver = rows.find(
      (r) =>
        r.object_ref ===
        "d84ce4dc423d0191b01880984d5043412713f45f017a93fe9291c7187265aef4",
    );
    expect(denver).toMatchObject({
      category: "cash_assistance_income",
      reviewed_primary_category: "housing",
      reviewed_category_memberships: ["housing", "food_nutrition"],
      person_facing_ready: true,
      data_state: "current_typed",
    });
    expect(denver.category_review.primary_basis).toBe(
      "reviewed_source_heading_mapping",
    );
    expect(denver.category_review.secondary_memberships[0].basis).toBe(
      "reviewed_interpretation_of_source_service",
    );
    await db.exec("reset role");
  });
  it("executes the real directory summary and filters with distinct record totals", async () => {
    const summary = (await get_publishable_resource_directory_summary()) as any;
    expect(summary.total_resources).toBe(24);
    expect(summary.jurisdictions[0].count).toBe(24);
    expect(
      summary.categories.reduce((n: number, r: any) => n + r.count, 0),
    ).toBe(43);
    const housing = await search_publishable_resource_directory({
      category: "housing",
      jurisdiction: "CO",
      limit: 60,
    });
    expect(housing.items).toHaveLength(
      summary.categories.find((r: any) => r.id === "housing").count,
    );
    expect(
      housing.items.some(
        (r) =>
          r.object_ref ===
          "d84ce4dc423d0191b01880984d5043412713f45f017a93fe9291c7187265aef4",
      ),
    ).toBe(true);
    expect(
      housing.items.every((r) => r.directory_categories.includes("housing")),
    ).toBe(true);
    const denver = housing.items.find(
      (r) =>
        r.object_ref ===
        "d84ce4dc423d0191b01880984d5043412713f45f017a93fe9291c7187265aef4",
    )!;
    const detail = await get_publishable_resource_directory_detail(
      denver.resource_entity_id,
    );
    expect(detail).toMatchObject({
      resource_entity_id: denver.resource_entity_id,
      resource_category: "housing",
      directory_categories: denver.directory_categories,
      category_review: denver.category_review,
      state: denver.state,
      source_resource_category: denver.source_resource_category,
    });
  });
  it("replays identically and rejects conflicting receipts, unsupported memberships and invented evidence", async () => {
    await db.exec(application_sql);
    await expect(
      append([{ ...receipts[0], review_note: "silent replacement" }]),
    ).rejects.toThrow("conflicting_receipt_replay");
    const next = {
      ...receipts[0],
      revision_id: "11111111-1111-1111-1111-111111111111",
      supersedes_revision_id: receipts[0].revision_id,
    };
    await expect(
      append([{ ...next, primary_category: "invented_category" }]),
    ).rejects.toThrow("vocabulary_required");
    await expect(
      append([
        {
          ...next,
          secondary_memberships: [
            {
              category: "housing",
              basis: "reviewed_interpretation_of_source_service",
              evidence_quote: "invented service",
              source_paragraph: "P1",
            },
          ],
        },
      ]),
    ).rejects.toThrow("explicit_service_interpretation_required");
    await expect(
      append([{ ...next, before_layer: "wrong_layer" }]),
    ).rejects.toThrow("before_classification_changed");
  });
  it("fails closed after source, category or readiness changes", async () => {
    const id = receipts[0].object_ref;
    await db.query(
      "update fixture_current set person_facing_ready=false where object_ref=$1",
      [id],
    );
    expect(
      (
        await db.query<any>(
          "select reviewed_primary_category,person_facing_ready from v_lighthouse_resource_program_classified_v1 where object_ref=$1",
          [id],
        )
      ).rows[0],
    ).toEqual({ reviewed_primary_category: null, person_facing_ready: false });
    await db.query(
      "update fixture_current set person_facing_ready=true,category='changed' where object_ref=$1",
      [id],
    );
    expect(
      (
        await db.query<any>(
          "select reviewed_primary_category from v_lighthouse_resource_program_classified_v1 where object_ref=$1",
          [id],
        )
      ).rows[0].reviewed_primary_category,
    ).toBeNull();
    await db.query(
      "update fixture_current set category=$2,source_content_sha256=$3 where object_ref=$1",
      [id, receipts[0].before_category, "f".repeat(64)],
    );
    expect(
      (
        await db.query<any>(
          "select reviewed_primary_category from v_lighthouse_resource_program_classified_v1 where object_ref=$1",
          [id],
        )
      ).rows[0].reviewed_primary_category,
    ).toBeNull();
    await db.query(
      "update fixture_current set source_content_sha256=$2 where object_ref=$1",
      [id, receipts[0].source_content_sha256],
    );
  });
  it("supports service-role retraction without destructive access or public reads", async () => {
    await db.exec("set role service_role");
    await append([
      {
        ...receipts[0],
        revision_id: "22222222-2222-2222-2222-222222222222",
        supersedes_revision_id: receipts[0].revision_id,
        operation: "retract",
      },
    ]);
    expect(
      (
        await db.query<any>(
          "select reviewed_primary_category from v_lighthouse_resource_program_classified_v1 where object_ref=$1",
          [receipts[0].object_ref],
        )
      ).rows[0].reviewed_primary_category,
    ).toBeNull();
    await db.exec("reset role");
    await expect(db.exec(application_sql)).rejects.toThrow(
      "receipt_superseded_requires_new_review",
    );
    await db.exec("rollback;reset role;set role anon");
    await expect(
      db.query("select * from v_lighthouse_resource_program_classified_v1"),
    ).rejects.toThrow("permission denied");
    await db.exec("reset role");
    await expect(
      db.exec("delete from luminari_resource_category_revision_v1"),
    ).rejects.toThrow("append_only");
    await expect(
      db.exec("truncate luminari_resource_category_revision_v1"),
    ).rejects.toThrow("append_only");
  });
});
