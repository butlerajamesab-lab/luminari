import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

describe("production export route registration", () => {
  it("mounts the case export route before the SPA fallback in the built entrypoint", () => {
    const packageJson = JSON.parse(readSource("../package.json")) as {
      scripts: { build: string };
    };
    const productionEntry = readSource("./_core/index.ts");

    expect(packageJson.scripts.build).toContain("server/_core/index.ts");

    const importIndex = productionEntry.indexOf(
      'import { registerExportRoute } from "../export-route";',
    );
    const registrationIndex = productionEntry.indexOf(
      "registerExportRoute(app);",
    );
    const staticFallbackIndex = productionEntry.indexOf(
      "else serveStatic(app);",
    );

    expect(importIndex).toBeGreaterThanOrEqual(0);
    expect(registrationIndex).toBeGreaterThan(importIndex);
    expect(staticFallbackIndex).toBeGreaterThan(registrationIndex);
  });
});
