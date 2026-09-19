import { describe, expect, it } from "vitest";
import { normalize_foia_gov_component } from "./foia-gov-refresh";

describe("FOIA.gov component normalization", () => {
  it("preserves stable component identity and actionable access fields", () => {
    const component = normalize_foia_gov_component(
      {
        id: "8216158f-8089-431d-b866-dc334e8d4758",
        attributes: {
          title: "Office of Information Policy",
          abbreviation: "OIP",
          email: "example@agency.gov",
          phone: "202-555-0100",
          website: "https://www.justice.gov/oip",
          reading_room: "https://www.justice.gov/oip/foia-library",
        },
        relationships: { agency: { data: { id: "doj", type: "agency" } } },
      },
      [{ id: "doj", type: "agency", attributes: { name: "Department of Justice", abbreviation: "DOJ" } }],
    );

    expect(component).toMatchObject({
      source_external_id: "8216158f-8089-431d-b866-dc334e8d4758",
      agency_name: "Department of Justice",
      agency_abbreviation: "DOJ",
      component_name: "Office of Information Policy",
      email: "example@agency.gov",
      phone: "202-555-0100",
      website: "https://www.justice.gov/oip",
      reading_room: "https://www.justice.gov/oip/foia-library",
      submission_methods: "email",
    });
    expect(component?.submission_portal).toContain("8216158f-8089-431d-b866-dc334e8d4758");
  });

  it("fails closed when the upstream record lacks stable identity or title", () => {
    expect(normalize_foia_gov_component({ id: "", attributes: { title: "Missing ID" } })).toBeNull();
    expect(normalize_foia_gov_component({ id: "abc", attributes: {} })).toBeNull();
  });
});
