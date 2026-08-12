import { describe, expect, it } from "vitest";
import { parseSqlAtomic } from "./services/fresh-corpus-atomic-v1";

const HASH = "b".repeat(64);

describe("atomic SQL row parsing", () => {
  it("keeps commas and parentheses inside quoted values inside one INSERT tuple", () => {
    const rows = parseSqlAtomic(
      "INSERT INTO public.registry_programs (id,name,notes) VALUES ('1','Alpha, Inc.','Call (today)'),('2','Beta','ok');",
      HASH,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].values_json).toMatchObject({ id: "1", name: "Alpha, Inc.", notes: "Call (today)" });
  });
});
