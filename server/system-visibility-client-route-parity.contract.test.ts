import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isRegisteredClientRoute,
  REGISTERED_CLIENT_ROUTE_PATTERNS,
} from "../shared/client-route-registry";

describe("system visibility client route parity", () => {
  const app = readFileSync("client/src/App.tsx", "utf8");
  const system_visibility_router = readFileSync(
    "server/routes/system-visibility-router.ts",
    "utf8",
  );

  it("keeps the route registry equal to the routes App.tsx actually registers", () => {
    const app_route_patterns = [
      ...new Set(
        [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((match) => match[1]),
      ),
    ];

    expect(new Set(REGISTERED_CLIENT_ROUTE_PATTERNS)).toEqual(
      new Set(app_route_patterns),
    );
  });

  it("labels stale inventory entries instead of presenting them as live routes", () => {
    expect(isRegisteredClientRoute("/action-path")).toBe(false);
    expect(isRegisteredClientRoute("/activation-control")).toBe(false);
    expect(isRegisteredClientRoute("/network-graph")).toBe(false);
    expect(isRegisteredClientRoute("/foia-tracking")).toBe(false);
    expect(isRegisteredClientRoute("/network")).toBe(true);
    expect(isRegisteredClientRoute("/foia")).toBe(true);
    expect(system_visibility_router).toContain(
      "registered: isRegisteredClientRoute(route.path)",
    );
  });
});
