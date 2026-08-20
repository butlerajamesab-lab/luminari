import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

const main = read("../client/src/main.tsx");
const public_shell = read("../client/src/DocketPublicApp.tsx");
const docket = read("../client/src/pages/DocketRoom.tsx");

describe("Docket public delivery source contract", () => {
  it("keeps direct Docket visits out of the full App initial static graph", () => {
    expect(main).toContain('pathname === "/docket" || pathname.startsWith("/docket/")');
    expect(main).toContain('import("./DocketPublicApp")');
    expect(public_shell).toContain('import DocketRoom from "./pages/DocketRoom"');
    expect(public_shell).not.toContain('from "./pages/MissionControl"');
    expect(public_shell).not.toContain('from "./pages/CivicGenome"');
  });

  it("preserves both Docket routes and reloads the complete shell when navigation leaves them", () => {
    expect(public_shell).toContain('<Route path="/docket" component={DocketRoom} />');
    expect(public_shell).toContain('<Route path="/docket/:slug" component={DocketRoom} />');
    expect(public_shell).toContain("window.location.reload();");
  });

  it("supplies one explicit main landmark around the direct public Docket surface", () => {
    expect(public_shell).toContain('<main aria-label="The Docket Room"');
  });

  it("does not alter Docket deterministic query or source semantics", () => {
    expect(docket).toContain("trpc.docket.list.useQuery");
    expect(docket).toContain("trpc.docket.legistarFeed.useQuery");
    expect(docket).toContain("DocketBillDetailWorkspace");
  });
});
