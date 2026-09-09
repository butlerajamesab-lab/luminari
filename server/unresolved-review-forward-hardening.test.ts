import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const semanticHardening = readFileSync(
  "supabase/migrations/20260909012008_live_data_signal_review_hardening.sql",
  "utf8",
);
const convergenceGrant = readFileSync(
  "supabase/migrations/20260909012009_rosetta_convergence_service_role_grant.sql",
  "utf8",
);

describe("forward hardening for unresolved database review findings", () => {
  it("re-keys and re-ranks preserved cross-category signal history", () => {
    expect(semanticHardening).toContain(
      "where detection_rule_id = 'atlas.domain3.cross_category_entity'",
    );
    expect(semanticHardening).toContain(
      "set atlas_semantic_key = public.live_data_signal_semantic_key_v2",
    );
    expect(semanticHardening).toContain("partition by atlas_semantic_key");
    expect(semanticHardening).toContain("set is_current = (ranked.current_rank = 1)");
    expect(semanticHardening).toContain(
      "create unique index live_data_signals_one_current_atlas_semantic_idx",
    );
  });

  it("keeps an already-current exact legacy replay out of the transition ledger", () => {
    const noOpStart = semanticHardening.indexOf(
      "A replay of the already-current exact content is a no-op",
    );
    const transitionStart = semanticHardening.indexOf(
      "v_transition_reason := 'reactivated_version'",
    );
    expect(noOpStart).toBeGreaterThan(-1);
    expect(transitionStart).toBeGreaterThan(noOpStart);
    expect(semanticHardening).toContain("v_existing_is_current is true");
    expect(semanticHardening).toContain(
      "legacy_supersedes_id_conflicts_with_existing",
    );
    expect(semanticHardening).toContain("return v_existing_id;");
  });

  it("enforces the transition ledger as append-only for every direct role", () => {
    expect(semanticHardening).toContain(
      "before update or delete on public.live_data_signal_semantic_transition_v1",
    );
    expect(semanticHardening).toContain(
      "live_data_signal_semantic_transition_v1 is append-only",
    );
    expect(semanticHardening).toMatch(
      /revoke insert, update, delete[\s\S]*from public, anon, authenticated, service_role;/,
    );
  });

  it("keeps the Rosetta convergence receipt private but service-readable", () => {
    expect(convergenceGrant).toMatch(
      /revoke all[\s\S]*from public, anon, authenticated;/,
    );
    expect(convergenceGrant).toMatch(
      /grant select[\s\S]*to service_role;/,
    );
  });
});
