import { expect, it } from "vitest";
import { legislative_current_source_scope } from "./legislative-current-source-scope";

it("requires explicit activation and rejects ambiguous recovery/current scopes", () => {
  expect(legislative_current_source_scope({})).toBe(false);
  expect(legislative_current_source_scope({ LEGISLATIVE_VERSION_CURRENT_SOURCES_ENABLED: "false" })).toBe(false);
  expect(legislative_current_source_scope({ LEGISLATIVE_VERSION_CURRENT_SOURCES_ENABLED: "true" })).toBe(true);
  expect(() => legislative_current_source_scope({ LEGISLATIVE_VERSION_CURRENT_SOURCES_ENABLED: "yes" })).toThrow("scope_invalid");
  expect(() => legislative_current_source_scope({
    LEGISLATIVE_VERSION_CURRENT_SOURCES_ENABLED: "true",
    LEGISLATIVE_VERSION_QUEUE_RECOVERY_CONTRACT_SCOPE: "civic-genome-provider-copy-fallback-recovery-v1",
  })).toThrow("conflicts_with_recovery");
});
