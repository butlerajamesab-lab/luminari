import { describe, expect, it } from "vitest";
import { clear_private_intake_drafts } from "./intakeDraftPrivacy";

function create_storage(entries: Record<string, string>) {
  const values = new Map(Object.entries(entries));
  return {
    get length() {
      return values.size;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    has(key: string) {
      return values.has(key);
    },
  };
}

describe("private intake draft privacy", () => {
  it("purges guided and conversational drafts without touching unrelated session state", () => {
    const storage = create_storage({
      "luminari-guided-intake-draft:v1": "guided",
      "luminari-conversation-intake-draft:v1:new:other": "conversation",
      "unrelated-session-key": "keep",
    });

    expect(clear_private_intake_drafts(storage)).toBe(2);
    expect(storage.has("luminari-guided-intake-draft:v1")).toBe(false);
    expect(storage.has("luminari-conversation-intake-draft:v1:new:other")).toBe(
      false,
    );
    expect(storage.has("unrelated-session-key")).toBe(true);
  });
});
