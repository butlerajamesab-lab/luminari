import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./ingestion/entity-deduplicator.ts", import.meta.url)),
  "utf8",
);

describe("detected signal write boundary", () => {
  it("never mutates the read-only detected_signals compatibility view", () => {
    expect(source).not.toContain(".update(detectedSignals)");
    expect(source).not.toContain(".insert(detectedSignals)");
    expect(source).not.toContain(".delete(detectedSignals)");
  });

  it("writes entity classification to detected_signals_base without repurposing signal confidence", () => {
    expect(source).toContain("update public.detected_signals_base");
    expect(source).toContain("entity_role = ${classification.entityType}");
    expect(source).toContain("entity_id = ${classification.canonicalName}");
    expect(source).toContain("IS DISTINCT FROM 'suppressed'");
    expect(source).not.toContain("confidenceScore: Number(classification.confidence");
  });
});
