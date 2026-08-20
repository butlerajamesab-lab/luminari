import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

const main = read("../client/src/main.tsx");
const public_shell = read("../client/src/CivicGenomePublicApp.tsx");
const html = read("../client/index.html");
const robots = read("../client/public/robots.txt");
const llms = read("../client/public/llms.txt");

describe("Civic Genome public delivery source contract", () => {
  it("keeps the full Luminari application out of the Civic Genome initial static import graph", () => {
    expect(main).not.toContain('import App from "./App"');
    expect(main).toContain('import("./CivicGenomePublicApp")');
    expect(main).toContain('import("./App")');
    expect(main).toContain('pathname === "/civic-genome" || pathname.startsWith("/civic-genome/")');
    expect(public_shell).toContain('import CivicGenome from "./pages/CivicGenome"');
    expect(public_shell).not.toContain('from "./pages/MissionControl"');
    expect(public_shell).not.toContain('from "./pages/WorkbenchDashboard"');
  });

  it("preserves the Civic Genome routes and falls back to the full application after navigation leaves the public shell", () => {
    expect(public_shell).toContain('<Route path="/civic-genome" component={CivicGenome} />');
    expect(public_shell).toContain('<Route path="/civic-genome/bill/:bill_id" component={CivicGenome} />');
    expect(public_shell).toContain("window.location.reload();");
  });

  it("does not disable browser zoom and provides public search metadata", () => {
    expect(html).toContain('content="width=device-width, initial-scale=1.0"');
    expect(html).not.toContain("maximum-scale=1");
    expect(html).toContain('name="description"');
    expect(html).toContain("deterministic civic information environment");
  });

  it("keeps the upload transport compatibility patch available without parser blocking", () => {
    expect(html).toContain('<script defer src="/upload-transport-compat.js"></script>');
  });

  it("serves explicit crawler and agent-readable root files", () => {
    expect(robots).toMatch(/^User-agent: \*/m);
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Disallow: /api/");
    expect(llms).toMatch(/^# Luminari Lighthouse/m);
    expect(llms).toContain("[Living Civic Genome](https://lighthouse.columbiacitycustomllc.com/civic-genome)");
    expect(llms).toContain("[Docket Room](https://lighthouse.columbiacitycustomllc.com/docket)");
  });
});
