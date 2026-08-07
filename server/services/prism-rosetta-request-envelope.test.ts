import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const client = readFileSync(
  new URL("./prism-rosetta-client.ts", import.meta.url),
  "utf8",
);

describe("Lighthouse PRISM deep request envelope", () => {
  it("keeps the deep Rosetta client bounded at 4 MB", () => {
    expect(client).toContain(
      "const PRISM_MAX_REQUEST_BYTES = 4 * 1024 * 1024;",
    );
    expect(client).toContain("prism_request_too_large");
  });
});
