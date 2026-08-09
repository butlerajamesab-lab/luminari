import { beforeEach, describe, expect, it, vi } from "vitest";

const { query_with_diagnostics_mock } = vi.hoisted(() => ({
  query_with_diagnostics_mock: vi.fn(),
}));

vi.mock("./db", () => ({
  query_with_diagnostics: query_with_diagnostics_mock,
}));

import {
  list_live_escalation_paths,
  list_live_registry_agencies,
  list_live_registry_forms,
  mental_health_resources_unavailable,
} from "./registry-live-read-compat";

describe("registry exact-live read compatibility", () => {
  beforeEach(() => {
    query_with_diagnostics_mock.mockReset();
  });

  it("maps only physical forms_registry fields and binds an unambiguous agency", async () => {
    query_with_diagnostics_mock.mockResolvedValue({
      rows: [
        {
          id: "c254875b-1cae-4466-89d7-779a627f44be",
          form_name: "Benefits appeal",
          issuing_agency: "Benefits Office",
          jurisdiction: "National",
          metadata: {
            domain: "BENEFITS_DOMAIN",
            source_url: "https://example.gov/form",
            original_record: {
              filing_instructions: {
                deadline: "Within 30 days",
                form_of_delivery: "Online or mail",
              },
            },
          },
          created_at: new Date("2026-08-01T12:00:00.000Z"),
          agency_id: "agency-1",
        },
      ],
      rowCount: 1,
    });

    const forms = await list_live_registry_forms({
      domain: "benefits",
      jurisdiction: "National",
    });

    expect(forms[0]).toMatchObject({
      id: "c254875b-1cae-4466-89d7-779a627f44be",
      agencyId: "agency-1",
      formName: "Benefits appeal",
      domain: "benefits",
      url: "https://example.gov/form",
      filingDeadline: "Within 30 days",
      accessMethods: ["Online or mail"],
      isActive: null,
      activeStateAvailable: false,
      createdAt: "2026-08-01T12:00:00.000Z",
    });

    const [sql, values] = query_with_diagnostics_mock.mock.calls[0];
    expect(sql).toContain("from public.forms_registry f");
    expect(sql).toContain("f.form_name");
    expect(sql).toContain("f.issuing_agency");
    expect(sql).toContain("having count(*) = 1");
    expect(sql).not.toContain("is_active");
    expect(sql).not.toContain("agency_id =");
    expect(values).toEqual(["benefits", "National", null, null, 100]);
  });

  it("parses the live agencies_registry contact_methods text without inventing notes", async () => {
    query_with_diagnostics_mock.mockResolvedValue({
      rows: [
        {
          id: "agency-1",
          agency_name: "Benefits Office",
          jurisdiction: "National",
          domain: "[\"benefits\"]",
          agency_type: "federal",
          website: "https://example.gov",
          contact_methods:
            '{"phone":"800-555-0100","email":"help@example.gov","physical_address":"1 Main St"}',
          official_status: "active",
          notes: "2026-08-01T12:00:00.000Z",
          created_at: "1770000000000",
          updated_at: 1770000000001,
          metadata: {},
        },
      ],
      rowCount: 1,
    });

    const agencies = await list_live_registry_agencies({ domain: "benefits" });

    expect(agencies[0]).toMatchObject({
      id: "agency-1",
      agencyName: "Benefits Office",
      notes: null,
      notesObservedAt: "2026-08-01T12:00:00.000Z",
      createdAt: 1770000000000,
      contactMethods: {
        phone: "800-555-0100",
        web: "https://example.gov",
        email: "help@example.gov",
        walk_in: "1 Main St",
      },
    });
  });

  it("returns an explicit unavailable envelope for unsupported escalation bindings", async () => {
    const result = await list_live_escalation_paths({
      domain: "benefits",
      jurisdiction: "WA",
      agencyId: "agency-1",
      direction: "from",
    });

    expect(result).toMatchObject({
      available: false,
      state: "unavailable",
      reason: "escalation_filter_identity_not_available",
      source: "escalation_registry",
      unsupportedFilters: ["domain", "jurisdiction", "agencyId", "direction"],
      paths: [],
    });
    expect(query_with_diagnostics_mock).not.toHaveBeenCalled();
  });

  it("lists unfiltered escalation rows without inferring agency or domain identity", async () => {
    query_with_diagnostics_mock.mockResolvedValue({
      rows: [
        {
          uuid: "esc_001",
          issue_type: "Benefits denial",
          initial_route: "Internal appeal",
          secondary_route: "Administrative hearing",
          federal_escalation: null,
          civil_escalation: null,
          federal_agencies: ["SSA"],
          related_statutes: ["42 U.S.C. § 405"],
          verification_status: "verified",
          created_at: "2026-08-01T12:00:00.000Z",
        },
      ],
      rowCount: 1,
    });

    const result = await list_live_escalation_paths();

    expect(result.available).toBe(true);
    expect(result.paths[0]).toMatchObject({
      id: "esc_001",
      uuid: "esc_001",
      issueType: "Benefits denial",
      federalAgencies: ["SSA"],
      relatedStatutes: ["42 U.S.C. § 405"],
      fromAgencyId: null,
      toAgencyId: null,
      domain: null,
      jurisdiction: null,
      agencyIdentityAvailable: false,
    });
    const [sql] = query_with_diagnostics_mock.mock.calls[0];
    expect(sql).toContain("from public.escalation_registry");
    expect(sql).not.toContain("requested_agency");
    expect(sql.toLowerCase()).not.toContain(" ilike ");
  });

  it("truthfully exposes the absent mental-health table", () => {
    expect(mental_health_resources_unavailable).toEqual({
      available: false,
      state: "unavailable",
      reason: "mental_health_resources_table_not_established",
      tableEstablished: false,
      resources: [],
      message:
        "Mental health resource storage is unavailable because no authoritative live table is established.",
    });
  });
});
