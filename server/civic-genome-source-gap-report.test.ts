import { afterEach, expect, it, vi } from "vitest";
import { render_civic_genome_human_report } from "./civic-genome-human-report";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each(["summary", "detailed"] as const)("exports %s evidence while all source versions await decomposition", async mode => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const unsafeUrl = ["java", "script:alert(1)"].join("");
  const unsafeScheme = ["java", "script:"].join("");
  const report = await render_civic_genome_human_report({
    source_bill_id: 2034656,
    bill_detail: {
      bill: { source_bill_number: "HB3633", source_bill_title: "Example" },
      structural_dna: { traits: [{trait_class: "duty", trait_key: "unbound-claim"}], validation_summary: { supported: 999 } },
      current_version: { version_type: "introduced", source_document_id: null },
    },
    bill_versions: [
      { source_document_key: "text:2034656:4", provider_sequence: 4, stage_rank: 100, provider_date: "2026-06-03", source_url: "https://www.congress.gov/119/bills/hr3633/BILLS-119hr3633rs.pdf", processing_state: "registered" },
      { source_document_key: "text:2034656:3", provider_sequence: 3, stage_rank: 300, provider_date: "2025-07-21", source_url: "https://www.congress.gov/119/bills/hr3633/BILLS-119hr3633eh.pdf", processing_state: "registered" },
      { source_document_key: "unsafe", provider_sequence: 5, source_url: unsafeUrl },
    ],
  }, mode);
  expect(report).toContain("Source decomposition pending");
  expect(report).toContain("does not establish validated bill content or amendment effects");
  expect(report).toContain("BILLS-119hr3633rs.pdf");
  expect(report.indexOf("text:2034656:3")).toBeLessThan(report.indexOf("text:2034656:4"));
  expect(report).not.toContain(unsafeScheme);
  expect(report).not.toContain("unbound-claim");
  expect(report).not.toContain("<b>999</b>");
  expect(report.indexOf("text:2034656:4")).toBeLessThan(report.indexOf("unsafe"));
  expect(fetch).not.toHaveBeenCalled();
});

it("fails closed when the chosen current source has no preserved text", async () => {
  vi.stubEnv("ROSETTA_SUPABASE_URL", "https://rosetta.test");
  vi.stubEnv("ROSETTA_SUPABASE_SERVICE_ROLE_KEY", "sb_secret_test");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]", { status: 200 })));
  await expect(render_civic_genome_human_report({
    source_bill_id: 1, bill_detail: {
      bill: {}, structural_dna: { traits: [], validation_summary: {} },
      current_version: { source_document_id: 7, processing_state: "failed" },
    },
  }, "summary")).rejects.toThrow("civic_genome_human_report_verified_source_text_unavailable");
});

it("still fails closed when a published verified source loses its exact text", async () => {
  vi.stubEnv("ROSETTA_SUPABASE_URL", "https://rosetta.test");
  vi.stubEnv("ROSETTA_SUPABASE_SERVICE_ROLE_KEY", "sb_secret_test");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]", { status: 200 })));
  await expect(render_civic_genome_human_report({
    source_bill_id: 1, bill_detail: {
      bill: {}, structural_dna: { traits: [], validation_summary: {} },
      current_version: { source_document_id: 7, processing_state: "verified" },
      published_version: { source_document_id: 7, processing_state: "verified" },
    },
  }, "summary")).rejects.toThrow("civic_genome_human_report_verified_source_text_unavailable");
});

it("keeps a historical source separate when current structural DNA is unavailable", async () => {
  vi.stubEnv("ROSETTA_SUPABASE_URL", "https://rosetta.test");
  vi.stubEnv("ROSETTA_SUPABASE_SERVICE_ROLE_KEY", "sb_secret_test");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([{
    source_document_id: 9,
    source_content_id: "11111111-1111-4111-8111-111111111111",
    source_version: "published-historical-v1",
    source_text: "Historical verified source text.",
    source_content_hash: "a".repeat(64),
    source_byte_hash: "b".repeat(64),
    created_at: "2026-01-01T00:00:00Z",
  }]), { status: 200 })));
  const report = await render_civic_genome_human_report({
    source_bill_id: 1,
    bill_detail: {
      bill: {},
      structural_dna: {
        snapshot_state: "unavailable",
        traits: [{ trait_class: "duty", trait_key: "not_current_claim" }],
        validation_summary: { supported: 22 },
      },
      current_version: { source_document_id: null, version_type: "enrolled" },
      published_version: { source_document_id: 9, version_type: "amendment", processing_state: "verified" },
    },
  }, "summary");
  expect(report).toContain("historical source, not current");
  expect(report).toContain("Current structural snapshot unavailable");
  expect(report).not.toContain("not_current_claim");
  expect(report).not.toContain("<b>22</b>");
});