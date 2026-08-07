import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const activation = readFileSync(
  new URL("./prism-rosetta-activation.ts", import.meta.url),
  "utf8",
);
const client = readFileSync(
  new URL("./prism-rosetta-client.ts", import.meta.url),
  "utf8",
);

describe("PRISM 2.2 bounded runtime pressure", () => {
  it("limits concurrent deep verification requests to two", () => {
    expect(activation).toContain("const PRISM_CONCURRENCY = 2;");
    expect(activation).toContain("PRISM_CONCURRENCY,");
  });

  it("allows the deep verification endpoint up to sixty seconds per attempt", () => {
    expect(client).toContain("const PRISM_REQUEST_TIMEOUT_MS = 60_000;");
    expect(client).toContain("const PRISM_MAX_ATTEMPTS = 3;");
    expect(client).toContain("const PRISM_MAX_REQUEST_BYTES = 4 * 1024 * 1024;");
  });
});
