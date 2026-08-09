import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { map_chat_message } from "./chat-runtime-compat";

describe("chat live-schema mapping", () => {
  it("maps snake_case physical columns and parses valid citations", () => {
    expect(map_chat_message({
      id: 1,
      case_id: 3,
      user_id: 4,
      chat_role: "assistant",
      content: "Receipt-bound response",
      citations: '[{"artifact_key":"sha256:abc"}]',
      created_at: 123,
    })).toEqual({
      id: 1,
      caseId: 3,
      userId: 4,
      role: "assistant",
      content: "Receipt-bound response",
      citations: [{ artifact_key: "sha256:abc" }],
      createdAt: 123,
    });
  });

  it("does not treat arbitrary citation text as structured evidence", () => {
    expect(map_chat_message({
      id: 1,
      case_id: 3,
      user_id: 4,
      chat_role: "user",
      content: "Question",
      citations: "not-json",
      created_at: 123,
    }).citations).toEqual([]);
  });

  it("answers finding questions only from the sealed verification projection", () => {
    const router_source = readFileSync(
      fileURLToPath(new URL("./routers.ts", import.meta.url)),
      "utf8",
    );
    const chat_source = router_source.slice(
      router_source.indexOf("const chatRouter"),
      router_source.indexOf("const auditRouter"),
    );
    expect(chat_source).toContain("read_canonical_case_layer_outputs");
    expect(chat_source).toContain('"verification_gate"');
    expect(chat_source).not.toContain("listFindings");
    expect(chat_source).toContain("source-bound documents");
    expect(chat_source).not.toContain("preserved source documents");
  });
});
