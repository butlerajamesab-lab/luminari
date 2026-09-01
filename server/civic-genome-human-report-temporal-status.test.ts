import { afterEach, describe, expect, it, vi } from "vitest";

import { render_civic_genome_human_report } from "./civic-genome-human-report";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Civic Genome human report temporal status", () => {
  it("separates pending provider records from confirmed event history", async () => {
    vi.stubEnv("ROSETTA_SUPABASE_URL", "https://rosetta.test");
    vi.stubEnv("ROSETTA_SUPABASE_SERVICE_ROLE_KEY", "sb_secret_test");
    const source_payload = JSON.stringify([{
      source_content_id: "11111111-1111-4111-8111-111111111111",
      source_document_id: 7,
      source_version: "fixture-v1",
      source_url: "https://legiscan.com/VT/text/S0001/id/99",
      media_type: "text/html",
      source_text: "Analyzed source fixture.",
      source_content_hash: "a".repeat(64),
      source_byte_hash: "b".repeat(64),
      source_provider_hash: null,
      source_identity_hash: "c".repeat(64),
      source_metadata: {
        docket_official_source_url:
          "https://legislature.vermont.gov/bill/status/2026/S.1",
        docket_source_url: "https://legiscan.com/VT/text/S0001/id/99",
        provider_copy_retrieval_url:
          "https://legiscan.com/VT/text/S0001/id/99",
        source_fetch_mode: "provider_copy_fallback",
        provider_copy_fallback_used: true,
        provider_copy_hash_verified: true,
        provider_copy_size_verified: true,
      },
      created_at: "2026-09-01T00:00:00.000Z",
    }]);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(
      source_payload,
      { status: 200, headers: { "content-type": "application/json" } },
    )));

    const payload = {
      exported_at: "2026-09-01T00:00:00.000Z",
      source_bill_id: 1,
      genome_bill_id: "22222222-2222-4222-8222-222222222222",
      bill_detail: {
        bill: {
          source_bill_number: "S 1",
          source_bill_title: "Temporal status fixture",
          state_code: "VT",
          session_key: "2026",
          bill_status: "active",
        },
        structural_dna: {
          traits: [{
            trait_class: "duty",
            trait_key: "fixture_support",
            normalized_value_json: { present: true },
            prism_verification_status: "supported_by_one_source",
          }],
          validation_summary: { supported: 1 },
        },
        current_version: {
          source_document_id: 7,
          version_type: "introduced",
          processing_state: "assembled",
        },
        published_version: null,
        family_assignment: null,
      },
      bill_versions: [{
        rosetta_source_document_id: 7,
        stage_rank: 1,
        provider_sequence: 1,
        version_type: "introduced",
        processing_state: "assembled",
      }],
      all_structural_traits: [],
      all_assembly_runs: [],
      bill_events: [
        {
          valid_at: "2026-08-01T00:00:00.000Z",
          observed_at: "2026-09-01T00:00:00.000Z",
          event_type: "introduced",
          action_text: "Introduced",
          temporal_status: "confirmed_provider_record",
        },
        {
          valid_at: "2026-10-01T00:00:00.000Z",
          observed_at: "2026-09-01T00:00:00.000Z",
          event_type: "enacted",
          action_text: "Provider reports enactment",
          temporal_status: "future_dated_provider_record",
        },
      ],
      lineage_edges: [],
      family: null,
      bill_temporal_facts: null,
    };
    const report = await render_civic_genome_human_report(payload, "detailed");
    const summary = await render_civic_genome_human_report(payload, "summary");

    expect(report).toContain(
      '<span class="label">Confirmed events</span><b>1</b>',
    );
    expect(report).toContain(
      '<span class="label">Pending provider records</span><b>1</b>',
    );
    expect(report).toContain("Confirmed provider record");
    expect(report).toContain("Pending provider record — not confirmed");
    expect(report).toMatch(
      /<tr class="pending-event">[\s\S]*?Pending provider record — not confirmed[\s\S]*?Provider reports enactment[\s\S]*?<\/tr>/,
    );
    expect(summary).toContain(
      '<span class="label">Pending provider records</span><b>1</b>',
    );
    expect(summary).toContain("Pending source evidence");
    expect(summary).toContain("Provider-reported actions awaiting confirmation");
    expect(summary).toContain("Provider reports enactment");
    expect(summary).toContain("not counted as confirmed legislative history");
    for (const rendered of [report, summary]) {
      expect(rendered).toContain(
        '<b>Official source:</b> <a href="https://legislature.vermont.gov/bill/status/2026/S.1"',
      );
      expect(rendered).toContain(
        '<b>Verified provider copy:</b> <a href="https://legiscan.com/VT/text/S0001/id/99"',
      );
      expect(rendered).not.toContain(
        '<b>Official source:</b> <a href="https://legiscan.com/',
      );
      expect(rendered).toContain(
        "after exact hash and byte-size verification",
      );
      expect(rendered).toContain("Verified provider retrieval copy");
      expect(rendered).toContain(
        "full verified provider copy analyzed by Rosetta",
      );
      expect(rendered).toContain("Provider-copy text supported");
      expect(rendered).toContain(
        "Provider-copy text supports this extraction",
      );
      expect(rendered).toContain(
        "do not assert that Rosetta retrieved or independently confirmed",
      );
      expect(rendered).not.toContain("Authoritative source copy");
      expect(rendered).not.toContain("full authoritative source");
      expect(rendered).not.toContain("Official-source supported");
      expect(rendered).not.toContain("Official legislative source verified");
    }
  });
});
