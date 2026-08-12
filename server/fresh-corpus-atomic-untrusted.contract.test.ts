import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic untrusted source handling", () => {
  it("stores parsed source values as JSON/text rather than dispatching them as commands", () => {
    expect(service).toContain("values_json");
    expect(service).not.toContain("eval(");
    expect(service).not.toContain("new Function");
  });
});
