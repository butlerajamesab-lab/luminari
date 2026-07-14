import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { cases } from "../../../drizzle/schema";

describe("cases schema production contract", () => {
  it("matches the numeric Lighthouse Supabase cases runtime contract", () => {
    const columns = getTableColumns(cases);

    expect(Object.keys(columns).sort()).toEqual([
      "container",
      "createdAt",
      "description",
      "domain",
      "id",
      "manualLensOverrides",
      "name",
      "pipelineType",
      "status",
      "updatedAt",
      "userId",
    ].sort());

    expect(columns.id.name).toBe("id");
    expect(columns.id.dataType).toBe("number");
    expect(columns.id.columnType).toBe("PgSerial");
    expect(columns.userId.name).toBe("user_id");
    expect(columns.userId.dataType).toBe("number");
    expect(columns.container.name).toBe("container");
    expect(columns.container.dataType).toBe("string");
    expect(columns.container.columnType).toBe("PgText");
    expect(columns.createdAt.name).toBe("created_at");
    expect(columns.createdAt.dataType).toBe("number");
    expect(columns.createdAt.columnType).toBe("PgBigInt53");
    expect(columns.updatedAt.name).toBe("updated_at");
    expect(columns.updatedAt.dataType).toBe("number");
    expect(columns.updatedAt.columnType).toBe("PgBigInt53");
  });
});
