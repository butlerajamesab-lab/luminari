import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

describe("Lighthouse navigation parity", () => {
  const desktop = read("../client/src/components/DashboardLayout.tsx");
  const mobile = read("../client/src/components/MobileBottomNav.tsx");
  const canonical = read("../client/src/components/navigation.ts");

  it("defines workflow and admin navigation once", () => {
    expect(canonical).toContain("export const allNavSections");
    expect(canonical).toContain("export const adminSection");
    expect(canonical).toContain("Network Graph");
    expect(canonical).toContain("Living Civic Genome");
    expect(canonical).toContain("Sovereign Control");
  });

  it("requires desktop and mobile renderers to consume the canonical navigation contract", () => {
    expect(desktop).toContain('from "./navigation"');
    expect(mobile).toContain('from "./navigation"');
  });
});
