import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf-8");
}

describe("Resource record drill-through", () => {
  const app = source("client/src/App.tsx");
  const directory = source("client/src/pages/ResourceDirectory.tsx");
  const recordPage = source("client/src/pages/ResourceRecord.tsx");
  const map = source("client/public/civicmap.html");
  const directoryRouter = source("server/routers/resource-directory.ts");
  const caseState = source("server/routers/case-state.ts");
  const commitButton = source("client/src/components/CommitToCase.tsx");

  it("registers an addressable route for the canonical record page", () => {
    expect(app).toContain('path="/resource/:id"');
    expect(app).toContain('from "./pages/ResourceRecord"');
  });

  it("links directory card titles to the record page", () => {
    expect(directory).toContain("/resource/${resource.resource_entity_id}");
  });

  it("links map sidebar details to the record page", () => {
    expect(map).toContain("/resource/${encodeURIComponent(resource.resource_entity_id)}");
  });

  it("serves both identity shapes from one detail endpoint", () => {
    expect(directoryRouter).toContain("gof_");
    expect(directoryRouter).toContain("getGovOfficeDetail");
    expect(directoryRouter).toContain("getPublishableResourceDirectoryDetail");
  });

  it("carries attach-to-case through the commitment layer, hash-keyed and soft-remove", () => {
    expect(caseState).toContain("commit_resource");
    expect(caseState).toContain("case_resource_links");
    expect(caseState).toContain("removed_at");
    expect(commitButton).toContain('"resource"');
    expect(recordPage).toContain('type="resource"');
  });
});
