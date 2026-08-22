import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("FOIA live-schema list compatibility", () => {
  const compatibilitySource = readFileSync(
    fileURLToPath(new URL("./foia-requests-live-compat.ts", import.meta.url)),
    "utf8",
  );
  const facadeSource = readFileSync(
    fileURLToPath(new URL("./db.ts", import.meta.url)),
    "utf8",
  );

  it("maps the production status column and leaves unavailable enrichment explicit", () => {
    expect(compatibilitySource).toContain("r.foia_request_status as status");
    expect(compatibilitySource).toContain('null::text as "statuteLawName"');
    expect(compatibilitySource).toContain('null::text as "agencyPortalUrl"');
    expect(compatibilitySource).not.toContain("foiaStatutes.");
    expect(compatibilitySource).not.toContain("foiaAgencies.");
  });

  it("keeps the user, status, and limit values bound", () => {
    expect(compatibilitySource).toContain("where r.user_id = $1");
    expect(compatibilitySource).toContain("params.push(opts.statusFilter)");
    expect(compatibilitySource).toContain("params.push(boundedLimit)");
    expect(compatibilitySource).not.toContain("where r.user_id = ?");
  });

  it("overrides the preserved legacy helper through the compatibility facade", () => {
    expect(facadeSource).toContain(
      'export { listAllUserFoiaRequests } from "./foia-requests-live-compat";',
    );
  });
});
