import { describe, expect, it } from "vitest";
import { should_forward_session } from "./session-forwarding";

const origin = "https://lighthouse.columbiacitycustomllc.com";

describe("session forwarding for plain fetch", () => {
  it("forwards on every same-origin /api call the invite gate covers", () => {
    expect(should_forward_session("/api/docket/archive?state=AL", origin)).toBe(true);
    expect(should_forward_session("/api/docket/archive/sessions", origin)).toBe(true);
    expect(should_forward_session("/api/offices/nearby?address=x", origin)).toBe(true);
    expect(should_forward_session(`${origin}/api/system/health`, origin)).toBe(true);
    expect(should_forward_session("/API//docket/archive", origin)).toBe(true);
    expect(should_forward_session(new URL("/api/db-diagnostic", origin), origin)).toBe(true);
  });

  it("never sends the token to another origin", () => {
    expect(should_forward_session("https://services1.arcgis.com/api/query", origin)).toBe(false);
    expect(should_forward_session("https://data.seattle.gov/api/views/x", origin)).toBe(false);
    expect(should_forward_session("//evil.example/api/docket", origin)).toBe(false);
  });

  it("leaves non-API same-origin requests alone", () => {
    expect(should_forward_session("/assets/index.js", origin)).toBe(false);
    expect(should_forward_session("/apis", origin)).toBe(false);
    expect(should_forward_session("/", origin)).toBe(false);
  });
});
