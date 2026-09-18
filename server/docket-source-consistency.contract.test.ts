import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Docket official-source consistency", () => {
  it("projects the detail-cache official state link onto state-feed source_url", () => {
    const routes = read("server/routes/docket.ts");
    expect(routes).toContain("docket_state_official_source_projection");
    expect(routes).toContain("nullif(bill ->> 'state_link', '') as official_source_url");
    expect(routes).toContain("source_url ? { ...bill, source_url } : { ...bill }");
  });

  it("keeps provider URL as fallback provenance on the live card", () => {
    const page = read("client/src/pages/DocketRoom.tsx");
    expect(page).toContain("const bill_url = bill.source_url || bill.url");
  });

  it("uses the same official state link first in the detail workspace", () => {
    const detail = read("client/src/components/DocketBillDetailWorkspace.tsx");
    expect(detail).toContain('url: first_value(bill, ["state_link", "url", "source_url"])');
  });
});
