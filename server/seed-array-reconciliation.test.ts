import { mkdtempSync as make_temp, readFileSync as read_file, rmSync as remove } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync as spawn_sync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("checks PostgreSQL text array types and preserves exact values in rollback-only reconciliation", async () => {
  const directory = make_temp(join(tmpdir(), "seed-array-reconciliation-"));
  const database = new PGlite();
  const tags = ["O'Brien", "one,two", "back\\slash", '"quoted"', "", null];
  try {
    const generated = spawn_sync("python3", ["-c", `
from pathlib import Path
import json,sys
sys.path.insert(0, sys.argv[1])
from advocacy_lane_import import prepare_reconciliation,canonical_json,digest
root=Path(sys.argv[2]); tags=json.loads(sys.argv[3])
record={'id':'existing','category_tags':tags,'emails':[],'phone_numbers':['555-555-1212'],'notes':'source note'}
raw=canonical_json(record).encode(); (root/'source.json').write_bytes(raw)
columns={'id':{'type':'text','required':True},'notes':{'type':'text','required':False}}
columns.update({key:{'type':'text[]','required':True} for key in ['category_tags','emails','phone_numbers']})
schema={'tables':{'public.array_fixture':{'primary_key':['id'],'columns':columns}}}
baseline={key:record[key] for key in ['category_tags','emails','phone_numbers']}; baseline['notes']=None
manifest={'sources':[{'source_id':'array_source','path':'source.json','sha256':digest(raw)}], 'bindings':[{
  'source_id':'array_source','source_record_id':'existing','source_pointer':'','source_record_sha256':digest(raw),
  'target_table':'public.array_fixture','canonical_identity':{'id':'existing'},
  'identity_evidence':{'category_tags':'/category_tags'},'expected_existing':baseline,
  'field_mapping':{key:{'source_pointer':'/'+key} for key in baseline}}]}
sql,receipt=prepare_reconciliation(root,manifest,schema)
(root/'preview.sql').write_text(sql)
`, resolve("scripts"), directory, JSON.stringify(tags)], { encoding: "utf8" });
    expect(generated.status, generated.stderr).toBe(0);
    await database.exec(`CREATE TABLE public.array_fixture (
      id text PRIMARY KEY, category_tags text[] NOT NULL, emails text[] NOT NULL,
      phone_numbers text[] NOT NULL, notes text);`);
    await database.query("INSERT INTO array_fixture VALUES($1,$2::text[],$3::text[],$4::text[],NULL)",
      ["existing", tags, [], ["555-555-1212"]]);
    const sql = read_file(join(directory, "preview.sql"), "utf8");
    expect(sql.endsWith("ROLLBACK;\n")).toBe(true);
    await database.exec(sql.slice(0, -"ROLLBACK;\n".length));
    expect((await database.query("SELECT category_tags,emails,phone_numbers,notes FROM array_fixture")).rows)
      .toEqual([{ category_tags: tags, emails: [], phone_numbers: ["555-555-1212"], notes: "source note" }]);
    await database.exec("ROLLBACK;");
    expect((await database.query("SELECT notes FROM array_fixture")).rows).toEqual([{ notes: null }]);
    await database.exec("ALTER TABLE array_fixture ALTER COLUMN category_tags TYPE integer[] USING ARRAY[1];");
    await expect(database.exec(sql)).rejects.toThrow("schema contract changed");
    await database.exec("ROLLBACK;");
  } finally {
    await database.close();
    remove(directory, { recursive: true, force: true });
  }
}, 30_000);
