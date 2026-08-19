import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root=process.cwd();
const supersession=readFileSync(join(root,"supabase","migrations","20260816004428_civic_genome_rosetta_target_supersession_v1.sql"),"utf8");
const targetFence=readFileSync(join(root,"supabase","migrations","20260816042731_civic_genome_rosetta_generation_target_fence_v2.sql"),"utf8");
const transactionFence=readFileSync(join(root,"supabase","migrations","20260816042900_civic_genome_rosetta_generation_transaction_fence_v2.sql"),"utf8");
const satisfiedReconciliation=readFileSync(join(root,"supabase","migration_sources","civic_genome_rosetta_satisfied_upgrade_reconciliation_v1.sql"),"utf8");
const satisfiedReconciliationLedger=readFileSync(join(root,"supabase","migrations","20260819103927_civic_genome_rosetta_satisfied_upgrade_reconciliation_v1.sql"),"utf8");
const v22Recovery=readFileSync(join(root,"supabase","migration_sources","civic_genome_rosetta_v22_terminal_recovery_sweep_v1.sql"),"utf8");
const sync=readFileSync(join(root,"server","civic-genome-rosetta-generation-target-sync.ts"),"utf8");

function satisfiedSegment():string{
 const marker="-- Same-target work may become unnecessary";
 const start=satisfiedReconciliation.indexOf(marker);
 const end=satisfiedReconciliation.indexOf("get diagnostics v_satisfied=row_count;",start);
 expect(start).toBeGreaterThanOrEqual(0);
 expect(end).toBeGreaterThan(start);
 return satisfiedReconciliation.slice(start,end);
}

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

 it("keeps the reviewed source byte-identical to the production ledger migration",()=>{
  expect(satisfiedReconciliationLedger).toBe(satisfiedReconciliation);
 });

 it("preserves the six-field monotonic target fence in the satisfied-work reconciliation",()=>{
  expect(satisfiedReconciliation).toContain("if p_promoted_at < v_current.promoted_at then");
  expect(satisfiedReconciliation).toContain("civic_genome_rosetta_generation_target_same_promotion_conflict");
  expect(satisfiedReconciliation).toContain("queue.queue_state in ('eligible','retry','running')");
  expect(satisfiedReconciliation).toContain("rosetta_generation_target_superseded");
 });

 it("reconciles only non-running work for the exact current target",()=>{
  const segment=satisfiedSegment();
  expect(segment).toContain("queue.queue_state in ('eligible','retry','dead_letter')");
  expect(segment).not.toContain("'running'");
  expect(segment).toContain("queue.target_engine_version=p_engine_version");
  expect(segment).toContain("queue.target_rule_set_version=p_rule_set_version");
  expect(segment).toContain("queue.target_rule_manifest_hash=p_rule_manifest_hash");
  expect(segment).toContain("queue.target_validation_test_name=p_validation_test_name");
  expect(segment).toContain("queue.target_promoted_at=p_promoted_at");
 });

 it("requires the queue source to remain the bill current source",()=>{
  const segment=satisfiedSegment();
  expect(segment).toContain("row_number() over(");
  expect(segment).toContain("partition by version.genome_bill_id");
  expect(segment).toContain("version.stage_rank desc");
  expect(segment).toContain("version.provider_sequence desc");
  expect(segment).toContain("version.created_at desc");
  expect(segment).toContain("version.bill_version_id desc");
  expect(segment).toContain("where rn=1");
  expect(segment).toContain("version.rosetta_source_document_id=queue.source_document_id");
 });

 it("requires exact binding identity and a completed verified target assembly",()=>{
  const segment=satisfiedSegment();
  expect(segment).toContain("binding.source_identity_hash=queue.source_identity_hash");
  expect(segment).toContain("binding.rosetta_engine_version=queue.target_engine_version");
  expect(segment).toContain("binding.rosetta_rule_set_version=queue.target_rule_set_version");
  expect(segment).toContain("binding.rosetta_rule_manifest_hash=queue.target_rule_manifest_hash");
  expect(segment).toContain("version.processing_state='assembled'");
  expect(segment).toContain("version.failure_code is null");
  expect(segment).toContain("assembly.run_status='completed'");
  expect(segment).toContain("assembly.verification_state='complete'");
  expect(segment).toContain("assembly.rosetta_engine_version=queue.target_engine_version");
  expect(segment).toContain("assembly.rosetta_rule_set_version=queue.target_rule_set_version");
  expect(segment).toContain("assembly.rosetta_rule_manifest_hash=queue.target_rule_manifest_hash");
  expect(segment).toContain("assembly.rosetta_source_identity_hash=queue.source_identity_hash");
 });

 it("marks satisfied work superseded without erasing its prior failure receipt",()=>{
  const segment=satisfiedSegment();
  expect(segment).toContain("set queue_state='superseded'");
  expect(segment).not.toContain("queue_state='completed'");
  expect(segment).not.toContain("last_error_code=");
  expect(segment).not.toContain("last_error_detail=");
  expect(segment).not.toContain("completed_at=");
  expect(satisfiedReconciliation).toContain("'satisfied_job_count',v_satisfied");
 });

 it("does not rewrite canonical bill, binding, or assembly history",()=>{
  expect(satisfiedReconciliation).not.toMatch(/delete\s+from\s+public\.civic_genome/i);
  expect(satisfiedReconciliation).not.toMatch(/truncate\s+/i);
  expect(satisfiedReconciliation).not.toMatch(/update\s+public\.civic_genome_bill_version/i);
  expect(satisfiedReconciliation).not.toMatch(/update\s+public\.civic_genome_rosetta_source_binding/i);
  expect(satisfiedReconciliation).not.toMatch(/update\s+public\.civic_genome_assembly_run/i);
 });

 it("gates the obsolete v2.2 terminal recovery sweep to the exact current Rosetta 2.5.11 generation",()=>{
  expect(v22Recovery).toContain("v_target.engine_version <> 'rosetta-v3-deterministic-sql-2.5.11'");
  expect(v22Recovery).toContain("v_target.rule_set_version <> 'rosetta-five-layer-structural-correctness-2.5.11'");
  expect(v22Recovery).toContain("3602eb80fee71a4009bf7a04c521fec62e2d1f17f8ea5b027500905cd8366639");
  expect(v22Recovery).toContain("v_target.validation_test_name <> 'independent_structure_v2511'");
  expect(v22Recovery).toContain("civic_genome_rosetta_v22_recovery_unexpected_current_generation");
 });

 it("selects only current amendment versions with the exact obsolete terminal failure and usable Docket custody",()=>{
  expect(v22Recovery).toContain("partition by version.genome_bill_id");
  expect(v22Recovery).toContain("order by version.stage_rank desc");
  expect(v22Recovery).toContain("version.provider_sequence desc");
  expect(v22Recovery).toContain("version.created_at desc");
  expect(v22Recovery).toContain("version.bill_version_id desc");
  expect(v22Recovery).toContain("where version.rn=1");
  expect(v22Recovery).toContain("queue.queue_state='permanent_failure'");
  expect(v22Recovery).toContain("queue.last_failure_class='unknown'");
  expect(v22Recovery).toContain("rosetta_v22_amendment_operation_not_found");
  expect(v22Recovery).toContain("version.document_family='amendment'");
  expect(v22Recovery).toContain("version.rosetta_source_document_id is not null");
  expect(v22Recovery).toContain("nullif(docket.source_url,'') is not null or nullif(docket.provider_url,'') is not null");
 });

 it("hard-bounds the one-time obsolete terminal recovery population",()=>{
  expect(v22Recovery).toContain("if v_target_count=0 then");
  expect(v22Recovery).toContain("if v_target_count>100 then");
  expect(v22Recovery).toContain("civic_genome_rosetta_v22_recovery_target_count_exceeds_bound");
 });

 it("preserves old failure evidence before resetting only the queue retry budget",()=>{
  expect(v22Recovery).toContain("'legislative_version_recovery_previous_failure_code',target.prior_failure_code");
  expect(v22Recovery).toContain("'legislative_version_recovery_previous_queue_failure_class',target.prior_failure_class");
  expect(v22Recovery).toContain("'legislative_version_recovery_previous_queue_error_code',target.prior_error_code");
  expect(v22Recovery).toContain("'legislative_version_recovery_previous_queue_attempt_count',target.prior_attempt_count");
  expect(v22Recovery).toContain("'legislative_version_recovery_contract','civic-genome-rosetta-v22-terminal-recovery-sweep-v1'");
  expect(v22Recovery).toContain("set queue_state='eligible'");
  expect(v22Recovery).toContain("attempt_count=0");
  expect(v22Recovery).toContain("last_failure_class=null");
  expect(v22Recovery).toContain("last_error_code=null");
 });

 it("fails the transaction if receipt and queue update counts diverge",()=>{
  expect(v22Recovery).toContain("if v_receipt_count<>v_target_count then");
  expect(v22Recovery).toContain("civic_genome_rosetta_v22_recovery_receipt_count_mismatch");
  expect(v22Recovery).toContain("if v_queue_count<>v_target_count then");
  expect(v22Recovery).toContain("civic_genome_rosetta_v22_recovery_queue_count_mismatch");
 });

 it("does not delete history or select current 2.5.11 rejection classes for recovery",()=>{
  expect(v22Recovery).not.toMatch(/delete\s+from\s+public\.civic_genome/i);
  expect(v22Recovery).not.toMatch(/truncate\s+/i);
  expect(v22Recovery).not.toContain("rosetta_v2511_amendment_structure_not_recognized");
  expect(v22Recovery).not.toContain("legislative_version_extraction_not_admissible:failed:rejected");
 });
});