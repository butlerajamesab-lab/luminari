import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const read = (path: string) => readFileSync(resolve(repo, path), "utf8");

describe("pipeline-specific dossier continuity", () => {
  const migration = read(
    "supabase/migrations/20260818233000_bind_pipeline_identity_to_intake_spine.sql",
  );
  const action_paths = read("server/enforcement-action-paths-live-compat.ts");

  it("preserves the exact case pipeline identity through case-create and upload authority", () => {
    expect(migration).toContain("nullif(btrim(new.pipeline_type), '')");
    expect(migration).toContain("'pipeline_key', pipeline_key_value");
    expect(migration).toContain(
      "select cib.case_uuid, nullif(btrim(c.pipeline_type), '')",
    );
    expect(migration).toContain("'pipeline_key', v_pipeline_key");
    expect(migration).toContain("'pipeline_key_source', 'cases.pipeline_type'");
    expect(migration).not.toMatch(/set\s+user_selected_immediate_issue\s*=/i);
  });

  it("backfills routing identity without invalidating existing sealed execution", () => {
    expect(migration).toContain(
      "pipeline_key is not yet an input to the 14-layer",
    );
    expect(migration).not.toContain("pipeline_identity_bound");
    expect(migration).not.toMatch(
      /with linked as[\s\S]*?update public\.intake_sessions s[\s\S]*?set completion_state\s*=/i,
    );
  });

  it("keeps existing legacy action paths authoritative when they exist", () => {
    expect(action_paths).toContain(
      "if (legacy_paths.length > 0) return legacy_paths;",
    );
    expect(action_paths).toContain(
      "return select_reviewed_dossier_action_paths(pipelineType, jurisdiction);",
    );
  });

  it("uses the governed reviewed-action overlay as the fallback source", () => {
    expect(action_paths).toContain(
      "from public.v_lighthouse_reviewed_action_route_current_v1",
    );
    expect(action_paths).toContain(
      "from public.luminari_reviewed_source_overlay_v1 o",
    );
    expect(action_paths).toContain(
      "join public.luminari_reviewed_source_supplement_revision_v1 s",
    );
    expect(action_paths).toContain(
      "o.activation_receipt ->> 'pipeline_key' = $1",
    );
    expect(action_paths).toContain(
      "(o.activation_receipt -> 'pipeline_keys') ? $1",
    );
  });

  it("does not promote held jurisdiction rows into person-facing action paths", () => {
    expect(action_paths).toContain(
      "s.supplement_type in ('deadline', 'authority', 'optional_action', 'integrity_flag')",
    );
    expect(action_paths).not.toContain(
      "s.supplement_type in ('deadline', 'authority', 'optional_action', 'jurisdiction_entry_point'",
    );
    expect(action_paths).toContain(
      "source_row_verification_status_unverified",
    );
    expect(action_paths).toContain("held pending independent verification");
  });

  it("does not silently turn dossier deadline prose into a numeric filing clock", () => {
    expect(action_paths).toContain("filingDeadlineDays: null");
    expect(action_paths).toContain("route_deadline_description");
    expect(action_paths).toContain("deadline_kind");
    expect(action_paths).toContain("source_text");
  });
});
