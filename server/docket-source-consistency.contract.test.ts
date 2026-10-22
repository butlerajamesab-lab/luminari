import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Docket LegiScan source contract", () => {
  it("does not overwrite provider bill URLs with state or Congress overview links", () => {
    const routes = read("server/routes/docket.ts");
    expect(routes).not.toContain("docket_state_official_source_projection");
    expect(routes).not.toContain("official_source_by_bill");
  });

  it("keeps the live bill-level link on the LegiScan provider record", () => {
    const page = read("client/src/pages/DocketRoom.tsx");
    expect(page).toContain("const bill_url = bill.url || bill.source_url");
  });

  it("keeps the detail bill-level link provider-first", () => {
    const detail = read("client/src/components/DocketBillDetailWorkspace.tsx");
    expect(detail).toContain('url: first_value(bill, ["url", "state_link", "source_url"])');
  });

  it("preserves exact text/amendment artifact links from the provider payload", () => {
    const detail = read("client/src/components/DocketBillDetailWorkspace.tsx");
    expect(detail).toContain('first_value(value, ["url", "state_link", "text_url", "doc_url", "source_url"])');
    expect(detail).toContain('Section title="Bill texts and documents"');
    expect(detail).toContain('Section title="Amendments and supplements"');
  });
});
