import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { makeExecuteResultTupleCompatible } from "../db-execute-compat";
import { execute_rows } from "./export-spine-engine";

describe("export spine execute_rows", () => {
  it("reads rows from the driver result the export engine actually receives", async () => {
    const database = new PGlite();
    await database.exec("create table public.export_spine_runs (id integer primary key)");
    const native = await database.query("select tablename from pg_tables where schemaname = 'public'");
    const wrapped = makeExecuteResultTupleCompatible(native);
    expect((wrapped as any)[0]).toBeUndefined();
    expect(execute_rows(wrapped)).toEqual([{ tablename: "export_spine_runs" }]);
    await database.close();
  });
});
