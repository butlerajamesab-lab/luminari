import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root=process.cwd();
const migration=readFileSync(join(root,"supabase","migrations","20260816004428_civic_genome_rosetta_target_supersession_v1.sql"),"utf8");
const sync=readFileSync(join(root,"server","civic-genome-rosetta-generation-target-sync.ts"),"utf8");

describe("Rosetta target supersession",()=>{
 it("adds an explicit superseded queue state",()=>{
  expect(migration).toContain("'superseded'");
  expect(migration).toContain("queue.queue_state in ('eligible','retry','running')");
  expect(migration).toContain("target_rule_manifest_hash is distinct from p_rule_manifest_hash");
 });
 it("observes target and supersedes old work in one database function",()=>{
  expect(sync).toContain("civic_genome_observe_rosetta_generation_target_v1");
  expect(sync).not.toContain("insert into public.civic_genome_rosetta_generation_target");
 });
 it("blocks a late old-generation receipt from advancing a current bill version",()=>{
  expect(migration).toContain("civic_genome_guard_rosetta_generation_upgrade_version_v1");
  expect(migration).toContain("civic_genome_rosetta_generation_upgrade_target_mismatch");
  expect(migration).toContain("new.receipt_json->>'rosetta_rule_manifest_hash'");
 });
});
