import { beforeEach, describe, expect, it, vi } from "vitest";

const { query_with_diagnostics_mock } = vi.hoisted(() => ({
  query_with_diagnostics_mock: vi.fn(),
}));

vi.mock("./db", () => ({
  query_with_diagnostics: query_with_diagnostics_mock,
}));

import {
  find_live_filing_template,
  list_live_filing_templates,
  list_live_investigation_guidance,
} from "./architecture-map-live-read-compat";

describe("architecture-map exact-live read compatibility", () => {
  beforeEach(() => {
    query_with_diagnostics_mock.mockReset();
  });

  it("maps snake-case investigation guidance and preserves non-JSON source text", async () => {
    query_with_diagnostics_mock.mockResolvedValue({
      rows: [
        {
          id: 3,
          agency: "Civil Rights Office",
          agency_short: "CRO",
          claim_type: "Disability discrimination",
          pipeline_category: "civil_rights",
          investigation_focus: "Access barriers",
          typical_questions: '["What happened?","When?"]',
          critical_evidence: "Source-authored evidence note",
          secondary_evidence: null,
          common_mistakes: "[]",
          recommended_preparation: '["Preserve records"]',
          investigation_stages: '["Intake","Review"]',
          notes: null,
          created_at: "1776197586298",
          updated_at: 1776197586299,
        },
      ],
      rowCount: 1,
    });

    const rows = await list_live_investigation_guidance({
      agencyShort: "CRO",
      pipelineCategory: "civil_rights",
    });

    expect(rows[0]).toMatchObject({
      id: 3,
      agencyShort: "CRO",
      claimType: "Disability discrimination",
      typicalQuestions: ["What happened?", "When?"],
      criticalEvidence: ["Source-authored evidence note"],
      secondaryEvidence: [],
      recommendedPreparation: ["Preserve records"],
      investigationStages: ["Intake", "Review"],
      createdAt: 1776197586298,
      projectionState: "live_investigation_guidance",
    });

    const [sql, values] = query_with_diagnostics_mock.mock.calls[0];
    expect(sql).toContain("from public.investigation_guidance");
    expect(sql).toContain("agency_short");
    expect(sql).toContain("investigation_focus");
    expect(sql).not.toContain("agencyShort");
    expect(values).toEqual(["CRO", "civil_rights"]);
  });

  it("maps exact filing_generator text columns into the existing client DTO", async () => {
    query_with_diagnostics_mock.mockResolvedValue({
      rows: [
        {
          id: 7,
          claim_type: "Wage theft",
          jurisdiction: "Federal",
          pipeline_category: "employment",
          agency: "Department of Labor",
          agency_short: "DOL",
          form_name: "Wage complaint",
          form_number: "WH-3",
          filing_link: "https://example.gov/file",
          filing_deadline: "Two years",
          required_fields: '["Employer","Dates"]',
          required_evidence: '["Pay stubs"]',
          recommended_attachments: "Source attachment guidance",
          submission_methods: '["Online"]',
          expected_timeline: "90 days",
          intake_warnings: '["Preserve deadline"]',
          priority_flags: "[]",
          next_steps: '["Submit form"]',
          notes: null,
          created_at: 1776197586298,
          updated_at: null,
        },
      ],
      rowCount: 1,
    });

    const rows = await list_live_filing_templates({ agencyShort: "DOL" });

    expect(rows[0]).toMatchObject({
      id: 7,
      claimType: "Wage theft",
      agencyShort: "DOL",
      formName: "Wage complaint",
      requiredFields: ["Employer", "Dates"],
      requiredEvidence: ["Pay stubs"],
      recommendedAttachments: ["Source attachment guidance"],
      submissionMethods: ["Online"],
      nextSteps: ["Submit form"],
      projectionState: "live_filing_generator",
    });

    const [sql] = query_with_diagnostics_mock.mock.calls[0];
    expect(sql).toContain("from public.filing_generator");
    expect(sql).toContain("required_fields");
    expect(sql).not.toContain("requiredFields");
  });

  it("matches filing readiness by normalized exact claim type", async () => {
    query_with_diagnostics_mock.mockResolvedValue({ rows: [], rowCount: 0 });

    await expect(
      find_live_filing_template(" Wage theft ", "DOL"),
    ).resolves.toBeNull();

    const [sql, values] = query_with_diagnostics_mock.mock.calls[0];
    expect(sql).toContain(
      "lower(btrim(claim_type)) = lower(btrim($2))",
    );
    expect(sql).not.toContain("'%' || $2 || '%'");
    expect(values).toEqual(["DOL", " Wage theft "]);
  });
});
