import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("whole-corpus civic object runtime boundary", () => {
  const tools = read("./engines/sunam-service-only-tools.ts");
  const dispatcher = read("./engines/sunam-service-dispatcher.ts");
  const service = read("./services/civic-object-service.ts");
  const executor = read("./engines/sunam-executor.ts");

  it("keeps whole-corpus reads behind the already-governed get_entities tool", () => {
    expect(tools).toContain('name: "get_entities"');
    expect(tools).toContain('"civic_state"');
    expect(tools).toContain('"civic_search"');
    expect(tools).not.toContain('name: "get_civic_object_state"');
    expect(tools).not.toContain('name: "search_civic_objects"');
    expect(executor).toContain('case "get_entities":');
    expect(executor).toContain("dispatchServiceTool(toolName, args)");
  });

  it("preserves legacy registry entity reads while adding whole-corpus modes", () => {
    expect(dispatcher).toContain('const mode = String(args.mode ?? "registry")');
    expect(dispatcher).toContain('mode === "civic_state"');
    expect(dispatcher).toContain('mode === "civic_search"');
    expect(dispatcher).toContain("registryService.getEntities(");
    expect(dispatcher).toContain("civicObjectService.getCivicObjectState()");
    expect(dispatcher).toContain("civicObjectService.searchCivicObjects({");
  });

  it("uses only bounded parameterized backend database contracts", () => {
    expect(service).toContain("query_with_diagnostics");
    expect(service).toContain("get_lighthouse_civic_object_snapshot_v1()");
    expect(service).toContain("search_lighthouse_civic_objects_v1(");
    expect(service).toContain("$1::text");
    expect(service).toContain("$6::integer");
    expect(service).toContain("Math.min(200");
    expect(service).not.toContain("createClient(");
    expect(service).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(service).not.toContain("execute_sql");
  });

  it("does not relabel policy context as a canonical signal", () => {
    expect(tools).toContain("Policy context is not a canonical signal");
  });
});
