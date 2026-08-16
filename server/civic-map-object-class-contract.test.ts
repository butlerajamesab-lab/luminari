import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("Civic Map resource/program boundary", () => {
  it("keeps direct resources and programs distinct in the coverage projection", () => {
    const service = read("server/services/resource-directory-fast-current.ts");

    expect(service).toContain("active_directory_records");
    expect(service).toContain("direct_resource_count");
    expect(service).toContain("program_count");
    expect(service).toContain("sum(direct_resource_count)::int");
    expect(service).toContain("sum(program_count)::int");
  });

  it("labels combined jurisdiction totals as directory records", () => {
    const page = read("client/public/civicmap.html");

    expect(page).toContain("Resource and program geography");
    expect(page).toContain("All directory records");
    expect(page).toContain("directResourceTotal");
    expect(page).toContain("programTotal");
    expect(page).toContain("directory records");
    expect(page).not.toContain("All active resources");
    expect(page).not.toContain("resources shown");
    expect(page).not.toContain("directory resources");
  });

  it("keeps exact pins on the separately reviewed physical-site route", () => {
    const router = read("server/routes/civic-map-router.ts");

    expect(router).toContain("reviewed_v3_13_exact_public_sites");
    expect(router).toContain("getResourceDirectoryMapPoints");
    expect(router).toContain("exact_mappable_resources");
  });
});
