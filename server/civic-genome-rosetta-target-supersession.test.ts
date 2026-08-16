import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root=process.cwd();
const supersession=readFileSync(join(root,"supabase","migrations","20260816004428_civic_genome_rosetta_target_supersession_v1.sql"),"utf8");
const targetFence=readFileSync(join(root,"supabase","migrations","20260816042731_civic_genome_rosetta_generation_target_fence_v2.sql"),"utf8");
const transactionFence=readFileSync(join(root,"supabase","migrations","20260816042900_civic_genome_rosetta_generation_transaction_fence_v2.sql"),"utf8");
const sync=readFileSync(join(root,"server","civic-genome-rosetta-generation-target-sync.ts"),"utf8");

describe("Rosetta target supersession",()=>{
 it("adds an explicit superseded queue state",()=>{
  expect(supersession).toContain("'superseded'");
  expect(supersession).toContain("queue.queue_state in ('eligible','retry','running')");
 });

 it("orders target observations monotonically by Rosetta promoted_at and binds the validation contract",()=>{
  expect(targetFence).toContain("validation_test_name text");
  expect(targetFence).toContain("promoted_at timestamptz");
  expect(targetFence).toContain("if p_promoted_at < v_current.promoted_at then");
  expect(targetFence).toContain("stale_observation_ignored");
  expect(targetFence).toContain("civic_genome_rosetta_generation_target_same_promotion_conflict");
  expect(targetFence).toContain("target_validation_test_name");
  expect(targetFence).toContain("target_promoted_at");
 });

 it("prevents stale discovery from enqueueing work after a target transition",()=>{
  expect(targetFence).toContain("civic_genome_guard_rosetta_upgrade_queue_target_v1");
  expect(targetFence).toContain("civic_genome_rosetta_upgrade_queue_target_mismatch");
  expect(transactionFence).toContain("civic_genome_rosetta_generation_upgrade_queue_legacy_generation_unique");
 });

 it("prevents stale queue work from entering running state",()=>{
  expect(transactionFence).toContain("civic_genome_guard_rosetta_upgrade_queue_claim_v1");
  expect(transactionFence).toContain("civic_genome_rosetta_upgrade_queue_claim_target_mismatch");
  expect(transactionFence).toContain("before update of queue_state");
 });

 it("fences Rosetta-backed assembly inside its transaction before commit",()=>{
  expect(transactionFence).toContain("civic_genome_guard_rosetta_assembly_target_v1");
  expect(transactionFence).toContain("on public.civic_genome_assembly_run");
  expect(transactionFence).toContain("for share");
  expect(transactionFence).toContain("civic_genome_rosetta_assembly_target_mismatch");
 });

 it("blocks a late old-generation receipt from activating a current bill version",()=>{
  expect(transactionFence).toContain("civic_genome_guard_rosetta_generation_upgrade_version_v1");
  expect(transactionFence).toContain("civic_genome_rosetta_generation_upgrade_target_mismatch");
  expect(transactionFence).toContain("for share");
 });

 it("syncs the exact Rosetta target through one database observer rather than an inline upsert",()=>{
  expect(sync).toContain("fetch_rosetta_current_generation");
  expect(sync).toContain("civic_genome_observe_rosetta_generation_target_v1($1,$2,$3,$4,$5,$6::timestamptz)");
  expect(sync).toContain("validation_test_name");
  expect(sync).toContain("promoted_at");
  expect(sync).not.toContain("insert into public.civic_genome_rosetta_generation_target");
 });
});
