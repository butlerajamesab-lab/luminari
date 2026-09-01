import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

describe("governed export route registration", () => {
  it("mounts the governed case export route before every SPA fallback", () => {
    const packageJson = JSON.parse(readSource("../package.json")) as {
      scripts: { build: string };
    };
    const productionEntry = readSource("./_core/index.ts");
    const developmentEntry = readSource("./core/index.ts");

    expect(packageJson.scripts.build).toContain("server/_core/index.ts");

    const importIndex = productionEntry.indexOf(
      'import { registerExportRoute } from "../export-production-route";',
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

    const developmentImportIndex = developmentEntry.indexOf(
      'import { registerExportRoute } from "../export-production-route";',
    );
    const developmentRegistrationIndex = developmentEntry.indexOf(
      "registerExportRoute(app);",
    );
    const viteFallbackIndex = developmentEntry.indexOf(
      "await setupVite(app, server);",
    );

    expect(developmentImportIndex).toBeGreaterThanOrEqual(0);
    expect(developmentRegistrationIndex).toBeGreaterThan(
      developmentImportIndex,
    );
    expect(viteFallbackIndex).toBeGreaterThan(developmentRegistrationIndex);
  });
});
