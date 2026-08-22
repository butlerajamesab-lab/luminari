import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("jurisdiction-aware registry query contract", () => {
  const registrySource = readFileSync(
    fileURLToPath(new URL("./routers/registry-router.ts", import.meta.url)),
    "utf8",
  );
  const benefitsSource = readFileSync(
    fileURLToPath(new URL("../client/src/pages/BenefitsNavigator.tsx", import.meta.url)),
    "utf8",
  );

  it("uses PostgreSQL placeholders and pg result rows throughout the registry router", () => {
    expect(registrySource).not.toMatch(/(?:LIKE|=|LIMIT|OFFSET) \?/);
    expect(registrySource).not.toContain("VALUES (?,");
    expect(registrySource).not.toMatch(/const \[[^\]]+\] = await pool\.query/);
    expect(registrySource).toContain("rowsResult.rows");
    expect(registrySource).toContain("countResult.rows");
  });

  it("passes the canonical stateCode contract from Benefits Navigator", () => {
    expect(benefitsSource).toContain(
      '{ query: browseCategoryKeyword ?? "", stateCode: selectedState ?? undefined }',
    );
    expect(benefitsSource).not.toContain(
      '{ query: browseCategoryKeyword ?? "", state: selectedState ?? undefined }',
    );
  });

  it("keeps jurisdiction filters bound instead of interpolated", () => {
    expect(registrySource).toContain(
      'conditions.push(\`j.abbreviation = \${bind(input.stateCode.toUpperCase())}\`)',
    );
    expect(registrySource).toContain(
      'stateFilter = \`AND j.abbreviation = $\${params.length}\`',
    );
  });
});
