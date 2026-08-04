import { describe, expect, it } from "vitest";

import {
  derive_california_official_text_url,
  extract_california_official_pdf_url,
  merge_cookie_headers,
} from "./california-legislative-source";

const provider_state_link =
  "https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202520260AB635#97AMD";
const bill_page_url =
  "https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202520260AB635";

describe("California official legislative PDF source", () => {
  it("maps the exact JSF wrapper to the official bill page", () => {
    expect(derive_california_official_text_url(provider_state_link)).toBe(bill_page_url);
  });

  it("extracts the exact same-version official PDF link", () => {
    const html = `
      <html><body>
        <a href="/faces/billPdf.xhtml?bill_id=202520260AB635&amp;version=20250AB63597AMD">
          Bill PDF
        </a>
      </body></html>
    `;
    expect(extract_california_official_pdf_url(
      html,
      bill_page_url,
      provider_state_link,
    )).toBe(
      "https://leginfo.legislature.ca.gov/faces/billPdf.xhtml?bill_id=202520260AB635&version=20250AB63597AMD",
    );
  });

  it("rejects another bill or another document version", () => {
    const other_bill = `
      <a href="/faces/billPdf.xhtml?bill_id=202520260AB636&amp;version=20250AB63697AMD">PDF</a>
    `;
    const other_version = `
      <a href="/faces/billPdf.xhtml?bill_id=202520260AB635&amp;version=20250AB63598AMD">PDF</a>
    `;
    expect(extract_california_official_pdf_url(
      other_bill,
      bill_page_url,
      provider_state_link,
    )).toBeNull();
    expect(extract_california_official_pdf_url(
      other_version,
      bill_page_url,
      provider_state_link,
    )).toBeNull();
  });

  it("merges session cookies without exposing attributes", () => {
    expect(merge_cookie_headers(
      "JSESSIONID=one; ROUTE=a",
      "JSESSIONID=two; BIGipServerpool=three",
    )).toBe("JSESSIONID=two; ROUTE=a; BIGipServerpool=three");
  });
});
