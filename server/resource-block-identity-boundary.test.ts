import { describe, expect, it } from "vitest";
import { parseResourceCandidates } from "./services/fresh-corpus-reconciliation-v1";

function context(text: string) {
  return {
    runId: "11111111-1111-4111-8111-111111111111",
    artifact: {
      artifact_key: "State Enriched Registry bucket/luminari-IDAHO-RESOURCE-DIRECTORY-2026.docx",
      bucket_id: "State Enriched Registry bucket",
      object_name: "luminari-IDAHO-RESOURCE-DIRECTORY-2026.docx",
      transport_etag: null,
      byte_size: text.length,
      mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      artifact_role: "state_resource_directory_source",
      jurisdiction_hint: "ID",
      semantic_family: "state_resource_directory",
      generation_label: null,
      exact_duplicate_of: null,
    },
    contentSha256: "a".repeat(64),
    text,
  } as any;
}

describe("resource block identity boundary", () => {
  it("keeps URLs, addresses, and portal instructions inside the open resource", () => {
    const rows = parseResourceCandidates(context([
      "Kootenai Tribe of Idaho [KTOI] VERIFIED",
      "Service Type: Tribal government / social services / tribal court",
      "Address: 100 Circle Drive, Bonners Ferry, ID 83805",
      "Phone: 208-267-3519 | Fax 208-267-2960",
      "Website: http://www.kootenai.org",
      "https://www.kootenai.org/tribal-court/",
      "What it does for people: Sovereign tribal nation with member services and a tribal court.",
      "Statutory Authority: 25 U.S.C. § 1301",
      "No dedicated portal — use phone or website",
      "",
      "Idaho Legal Aid Services — Statewide [ILAS] VERIFIED",
      "Service Type: Free civil legal aid — housing, benefits, DV, elder law, consumer",
      "Address: Boise, ID 83702",
      "Phone: 208-746-7541 | TwinFalls@idaholegalaid.org",
      "Email: Not published (use statewide line)",
      "Website: https://idaholegalaid.org",
      "What it does for people: Free civil legal aid for qualifying Idaho residents.",
      "Statutory Authority: Idaho Legal Aid statutory authority text",
    ].join("\n")));

    const resources = rows.filter(row => row.candidate_type === "resource");
    expect(resources).toHaveLength(2);
    expect(resources.map(row => row.name)).toEqual([
      "Kootenai Tribe of Idaho",
      "Idaho Legal Aid Services — Statewide",
    ]);
    expect(resources.some(row => /^https?:\/\//i.test(row.name ?? ""))).toBe(false);
    expect(resources.some(row => /Circle Drive|No dedicated portal/i.test(row.name ?? ""))).toBe(false);

    expect(resources[0]).toMatchObject({
      category: "tribal_indigenous",
      website_url: "http://www.kootenai.org",
      address: "100 Circle Drive, Bonners Ferry, ID 83805",
    });
    expect((resources[0].payload as any).fields.filing_portal).toContain("No dedicated portal");

    expect(resources[1]).toMatchObject({
      category: "legal_aid",
      email: "TwinFalls@idaholegalaid.org",
      website_url: "https://idaholegalaid.org",
    });
    expect((resources[1].payload as any).source_service_type)
      .toBe("Free civil legal aid — housing, benefits, DV, elder law, consumer");
    expect((resources[1].payload as any).canonical_category).toBe("legal_aid");
  });

  it("does not let broad healthcare swallow mental-health category", () => {
    const rows = parseResourceCandidates(context([
      "Idaho Behavioral Health Crisis Line [BHCL] VERIFIED",
      "Service Type: Mental health / behavioral health crisis counseling",
      "Phone: 988",
      "Website: https://988lifeline.org",
      "What it does for people: Mental health crisis support.",
    ].join("\n")));
    const resource = rows.find(row => row.candidate_type === "resource");
    expect(resource?.category).toBe("mental_health");
  });
});
