import { afterEach, expect, it, vi } from "vitest";
import { render_civic_genome_human_report } from "./civic-genome-human-report";

afterEach(() => vi.unstubAllGlobals());

it.each(["summary", "detailed"] as const)("exports %s evidence while all source versions await decomposition", async mode => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const report = await render_civic_genome_human_report({
    source_bill_id: 2034656,
    bill_detail: {
      bill: { source_bill_number: "HB3633", source_bill_title: "Example" },
      structural_dna: { traits: [], validation_summary: {} },
      current_version: { version_type: "introduced", source_document_id: null },
    },
    bill_versions: [
      { source_document_key: "text:2034656:4", provider_sequence: 4, stage_rank: 100, provider_date: "2026-06-03", source_url: "https://www.congress.gov/119/bills/hr3633/BILLS-119hr3633rs.pdf", processing_state: "registered" },
      { source_document_key: "text:2034656:3", provider_sequence: 3, stage_rank: 300, provider_date: "2025-07-21", source_url: "https://www.congress.gov/119/bills/hr3633/BILLS-119hr3633eh.pdf", processing_state: "registered" },
      { source_document_key: "unsafe", provider_sequence: 5, source_url: "javascript:alert(1)" },
    ],
  }, mode);
  expect(report).toContain("Source decomposition pending");
  expect(report).toContain("does not establish validated bill content or amendment effects");
  expect(report).toContain("BILLS-119hr3633rs.pdf");
  expect(report.indexOf("text:2034656:3")).toBeLessThan(report.indexOf("text:2034656:4"));
  expect(report).not.toContain("javascript:");
  expect(fetch).not.toHaveBeenCalled();
});
