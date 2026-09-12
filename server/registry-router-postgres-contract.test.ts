import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { registryJurisdictionJoin } from "./services/registry-jurisdiction-sql";

describe("jurisdiction-aware registry query contract", () => {
  const registrySource = readFileSync(
    fileURLToPath(new URL("./routers/registry-router.ts", import.meta.url)),
    "utf8",
  );
  const benefitsSource = readFileSync(
    fileURLToPath(new URL("../client/src/pages/BenefitsNavigator.tsx", import.meta.url)),
    "utf8",
  );

  const benefitsRegistrySource = readFileSync(
    fileURLToPath(new URL("../client/src/components/benefits/BenefitsRegistryPrograms.tsx", import.meta.url)),
    "utf8",
  );

  it("uses PostgreSQL placeholders and pg result rows throughout the registry router", () => {
    expect(registrySource).not.toMatch(/(?:LIKE|=|LIMIT|OFFSET) \?/);
    expect(registrySource).not.toContain("VALUES (?,");
    expect(registrySource).not.toMatch(/const \[[^\]]+\] = await pool\.query/);
    expect(registrySource).toContain("rowsResult.rows");
    expect(registrySource).toContain("countResult.rows");
  });

  it("uses the live program columns and normalizes legacy jurisdiction references", () => {
    expect(registrySource).toContain("p.name ILIKE");
    expect(registrySource).toContain("p.category ILIKE");
    expect(registrySource).toContain("p.contact_website_norm");
    expect(registrySource).not.toContain("p.name_rp");
    expect(registrySource).not.toContain("p.website_rp");
    expect(registrySource).toContain('registryJurisdictionJoin(');
    const jurisdictionSql = registryJurisdictionJoin('p.jurisdiction_id');
    expect(jurisdictionSql).toContain("LOWER('us-' || rj.abbreviation)");
    expect(jurisdictionSql).toContain("LOWER('j_' || rj.abbreviation)");
  });

  it("connects the visible program search to the canonical stateCode contract", () => {
    expect(benefitsSource).toContain('aria-label="Search programs"');
    expect(benefitsSource).toContain('searchQuery={searchQuery}');
    expect(benefitsSource).toContain('stateCode={selectedState}');
    expect(benefitsRegistrySource).toContain('trpc.canonicalRegistry.searchPrograms.useQuery');
    expect(benefitsRegistrySource).toContain('{ query, stateCode: stateCode ?? undefined, limit: REGISTRY_PAGE_SIZE, offset }');
  });

  it("uses program identity to break equal-name ties across search pages", () => {
    const programSearch = registrySource.split('searchPrograms: publicProcedure')[1].split('getProgramChain: publicProcedure')[0];
    expect(programSearch).toMatch(/ORDER BY p\.name, p\.id\s+LIMIT \$\{limitPlaceholder\} OFFSET \$\{offsetPlaceholder\}/);
  });

  it("renders the canonical registry response envelope and fails closed on bad links", () => {
    expect(benefitsRegistrySource).toContain("registryPrograms?.programs ?? []");
    expect(benefitsRegistrySource).toContain("registryPrograms?.total ?? 0");
    expect(benefitsRegistrySource).not.toContain("registryPrograms.length");
    expect(benefitsRegistrySource).not.toContain("registryPrograms.map");
    expect(benefitsRegistrySource).toContain("normalizeRegistryWebsite");
    expect(benefitsRegistrySource).toContain("No verified external link available");
  });

  it("keeps jurisdiction filters bound instead of interpolated", () => {
    expect(registrySource).toContain(
      'conditions.push(`j.abbreviation = ${bind(input.stateCode.toUpperCase())}`)',
    );
    expect(registrySource).toContain(
      'stateFilter = `AND j.abbreviation = $${params.length}`',
    );
  });
});
