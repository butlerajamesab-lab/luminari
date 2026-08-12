import { ATOMIC_CORPUS_ENGINE_VERSION, ATOMIC_CORPUS_PARSER_VERSION } from "./services/fresh-corpus-atomic-v1";
import { describe, expect, it } from "vitest";

describe("atomic versioning", () => {
  it("declares immutable engine/parser version identifiers", () => {
    expect(ATOMIC_CORPUS_ENGINE_VERSION).toBe("fresh_atomic_corpus_v1.0.0");
    expect(ATOMIC_CORPUS_PARSER_VERSION).toBe("fresh_atomic_parser_v1.0.0");
  });
});
