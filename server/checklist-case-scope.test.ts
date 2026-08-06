import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read_source(relative_path: string): string {
  return readFileSync(
    fileURLToPath(new URL(relative_path, import.meta.url)),
    "utf8",
  );
}

function source_between(source: string, start_marker: string, end_marker: string): string {
  const start = source.indexOf(start_marker);
  const end = source.indexOf(end_marker, start + start_marker.length);

  expect(start, `${start_marker} must exist`).toBeGreaterThanOrEqual(0);
  expect(end, `${end_marker} must follow ${start_marker}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("checklist item case scope", () => {
  it("updates an item only when both item and case identities match", () => {
    const db_source = read_source("./db.ts");
    const helper = source_between(
      db_source,
      "export async function toggleChecklistItem",
      "// ─── User Feedback Helpers",
    );

    expect(helper).toContain(
      "toggleChecklistItem(itemId: number, caseId: number, checked: boolean)",
    );
    expect(helper).toContain("eq(checklistItems.id, itemId)");
    expect(helper).toContain("eq(checklistItems.caseId, caseId)");
    expect(helper).toContain(".returning({ id: checklistItems.id })");
    expect(helper).toContain("return updated ? { success: true } : null");
  });

  it("passes the owned case id into the helper and rejects a mismatched item", () => {
    const router_source = read_source("./routers.ts");
    const checklist_router = source_between(
      router_source,
      "const checklistRouter = router({",
      "// ─── Feedback Router",
    );

    expect(checklist_router).toContain("input.itemId,\n        input.caseId,\n        input.checked");
    expect(checklist_router).toContain("if (!updated)");
    expect(checklist_router).toContain(
      'code: "NOT_FOUND", message: "Checklist item not found for this case"',
    );
  });
});
