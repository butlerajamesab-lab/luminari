import assert from "node:assert/strict";
import {createHash, randomUUID} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const baseline = JSON.parse(read("server/fixtures/prism-v25/observed-v24-history.json"));
const evaluations = JSON.parse(read("server/fixtures/prism-v25/source-backed-v25-evaluations.json"));
const migrationPath = "supabase/migrations/20260913203322_prism_v25_generation_and_modal_correction.sql";
const oldMigrationPath = "supabase/migrations/20260910183321_prism_v24_generation_reconciliation.sql";
const h25 = "26e4ef9f6c0d389154d9a2259c99b6e7eb83a51c096e738a9470fb20ff04ec8b";
const targets = ["91955a17-ecef-483b-b2b6-0fffee738cf6", "e6f0c3b6-8f1c-41fe-9c82-60afd046f122"];
const canonical = value => value === null || typeof value !== "object" ? JSON.stringify(value)
  : Array.isArray(value) ? "[" + value.map(canonical).join(",") + "]"
  : "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
const hash = text => createHash("sha256").update(text).digest("hex");
function functionSql(source, name) {
  const start = source.toLowerCase().indexOf("create or replace function " + name.toLowerCase() + "(");
  assert.ok(start >= 0, "actual source function missing: " + name);
  const open = source.indexOf("$function$", start);
  const close = source.indexOf("$function$", open + 10);
  assert.ok(open >= 0 && close > open);
  return source.slice(start, close + 10) + ";";
}

export async function verifyPrismV25Projection(db) {
  const results = [];
  const rows = async (sql, params=[]) => (await db.query(sql, params)).rows;
  const scalar = async (sql, params=[]) => Object.values((await rows(sql,params))[0])[0];
  const insert = async (table, records) => {
    for (const record of records) {
      await db.query("insert into public." + table + " select * from jsonb_populate_record(null::public." + table + ",$1::jsonb)", [JSON.stringify(record)]);
    }
  };
  const snapshot = async () => {
    const output = {};
    for (const [table, records] of Object.entries(baseline.tables)) {
      const key = Object.keys(records[0]).find(name => name === ({
        legal_patterns:"pattern_id", civic_genome_bill:"genome_bill_id",
        civic_genome_bill_version:"bill_version_id", civic_genome_assembly_run:"assembly_run_id",
        civic_genome_trait:"trait_id", civic_genome_prism_verification_run:"verification_run_id",
        civic_genome_prism_verification_binding:"binding_id",
        lighthouse_prism_verification_requests:"request_id",
        lighthouse_prism_verification_receipts:"prism_verification_receipt_id",
      })[table]);
      const expression = table === "legal_patterns" ? "(to_jsonb(t)-'is_current')" : "to_jsonb(t)";
      output[table] = await rows("select "+expression+" as row from public."+table+" t where "+key+"::text=any($1::text[]) order by "+key, [records.map(record=>record[key])]);
    }
    return output;
  };
  async function scenario(name, test) {
    await db.exec("begin");
    try { await test(); results.push(name); console.log("PASS " + name); }
    finally { await db.exec("rollback"); }
  }
  async function rejects(sql, pattern, params=[]) {
    await db.exec("savepoint rejected_probe");
    try { await assert.rejects(() => db.query(sql, params), error=>pattern.test(error.message)); }
    finally { await db.exec("rollback to rejected_probe"); }
  }

  assert.equal(baseline.fixture_only,true);
  assert.equal(evaluations.fixture_only,true);
  assert.equal(evaluations.not_a_production_receipt,true);
  for (const result of evaluations.rows) {
    assert.equal(result.rule_set_hash,h25);
    assert.equal(hash(canonical(result.semantic_output)),result.output_hash);
  }
  await db.exec(read("server/fixtures/prism-v25/projection-schema.sql"));
  const original = read("supabase/migrations/20260731185401_signal_architecture_ground_truth.sql");
  for (const name of ["public.signal_architecture_hash_v1","public.register_legal_pattern_v1","public.guard_signal_architecture_immutable_v1"]) {
    await db.exec(functionSql(original,name));
  }
  await db.exec(read(oldMigrationPath));
  for (const [table, records] of Object.entries(baseline.tables)) await insert(table,records);
  await db.exec("create trigger pattern_immutable before update or delete on public.legal_patterns for each row execute function public.guard_signal_architecture_immutable_v1()");
  const oldNames = ["private.prism_v24_complete_receipt_set_v1(uuid)","private.prism_v24_modal_prior_covered_v1(uuid,uuid)","private.project_prism_v24_modal_successors_v1(uuid)"];
  const oldDefinitions = await rows("select pg_get_functiondef(signature::regprocedure) as definition from unnest($1::text[]) signature", [oldNames]);
  const beforeInstall = await snapshot();
  await db.exec(read(migrationPath));
  assert.deepEqual(await snapshot(),beforeInstall);
  assert.equal(await scalar("select count(*)::integer from public.civic_genome_prism_verification_queue"),0);
  assert.deepEqual(await rows("select pg_get_functiondef(signature::regprocedure) as definition from unnest($1::text[]) signature",[oldNames]),oldDefinitions);
  results.push("Installing the actual forward migration preserves all observed history and queues");
  console.log("PASS " + results.at(-1));

  const fixtureRuns = [];
  for (const evaluated of evaluations.rows) {
    const oldBinding = baseline.tables.civic_genome_prism_verification_binding.find(binding=>binding.trait_id===evaluated.trait_id);
    const oldRun = baseline.tables.civic_genome_prism_verification_run.find(run=>run.assembly_run_id===oldBinding.assembly_run_id);
    const oldRequest = baseline.tables.lighthouse_prism_verification_requests.find(request=>request.request_id===oldBinding.request_id);
    const oldReceipt = baseline.tables.lighthouse_prism_verification_receipts.find(receipt=>receipt.prism_verification_receipt_id===oldBinding.prism_verification_receipt_id);
    const receiptId = randomUUID();
    const runId = randomUUID();
    const replay = hash(h25 + ":" + evaluated.input_hash);
    const completion = "2026-09-13T23:00:00.000Z";
    const output = evaluated.semantic_output;
    await insert("lighthouse_prism_verification_requests",[{...oldRequest,request_id:evaluated.request_id,rule_set_version:"2.5.0",input_hash:evaluated.input_hash}]);
    await insert("lighthouse_prism_verification_receipts",[{...oldReceipt,
      prism_verification_receipt_id:receiptId,request_id:evaluated.request_id,
      prism_engine_version:"2.5.0",rule_set_version:"2.5.0",rule_set_hash:h25,
      input_hash:evaluated.input_hash,output_hash:evaluated.output_hash,
      verification_status:output.status,supported_findings:output.supported_findings,
      contradictions:output.contradictions,missing_evidence:output.missing_evidence,
      unresolved_conditions:output.unresolved_conditions,cited_evidence_identifiers:output.cited_evidence_identifiers,
      deterministic_replay_key:replay,prism_completion_timestamp:completion}]);
    await insert("civic_genome_prism_verification_binding",[{...oldBinding,
      binding_id:randomUUID(),request_id:evaluated.request_id,prism_verification_receipt_id:receiptId,
      prism_engine_version:"2.5.0",prism_rule_set_version:"2.5.0",prism_rule_set_hash:h25,
      input_hash:evaluated.input_hash,output_hash:evaluated.output_hash,verification_status:output.status,
      deterministic_replay_key:replay}]);
    const newRun={...oldRun,verification_run_id:runId,prism_engine_version:"2.5.0",prism_rule_set_version:"2.5.0",completed_at:completion};
    await insert("civic_genome_prism_verification_run",[newRun]);
    fixtureRuns.push({runId,oldRunId:oldRun.verification_run_id,assemblyId:oldRun.assembly_run_id,receiptId,requestId:evaluated.request_id,newRun,
      target:baseline.tables.legal_patterns.find(pattern=>targets.includes(pattern.pattern_id)&&pattern.authority_refs[0].assembly_run_id===oldRun.assembly_run_id).pattern_id});
  }
  const first=fixtureRuns[0];
  const project=fixture=>scalar("select private.project_prism_legal_patterns_v1($1::uuid)",[fixture.runId]);
  const current=target=>rows("select pattern_id,supersedes_id,is_current,rule_version,verification_state,authority_refs from public.legal_patterns where pattern_id=$1::uuid or supersedes_id=$1::uuid order by created_at,pattern_id",[target]);

  await scenario("Canonical complete 2.5 receipts bind both observed sources",async()=>{
    for (const fixture of fixtureRuns) {
      assert.equal(await scalar("select private.prism_v25_complete_receipt_set_v1($1::uuid)",[fixture.runId]),true,'complete receipt identity '+fixture.runId);
      assert.equal(await scalar("select private.prism_v25_modal_prior_covered_v1($1::uuid,$2::uuid)",[fixture.runId,fixture.target]),true,'prior coverage '+fixture.runId);
    }
  });
  for (const [name,sql] of [
    ["wrong immutable ruleset hash","update public.lighthouse_prism_verification_receipts set rule_set_hash=repeat('0',64) where prism_verification_receipt_id=$1::uuid"],
    ["mismatched receipt status","update public.lighthouse_prism_verification_receipts set verification_status='supported_by_one_source' where prism_verification_receipt_id=$1::uuid"],
    ["missing receipt","delete from public.lighthouse_prism_verification_receipts where prism_verification_receipt_id=$1::uuid"],
  ]) await scenario("Rejects "+name+" before any correction",async()=>{
    await db.query(sql,[first.receiptId]);
    await rejects("select private.project_prism_legal_patterns_v1($1::uuid)",/prism_v25_complete_receipt_set_required/,[first.runId]);
    assert.equal((await current(first.target))[0].is_current,true);
  });
  await scenario("Rejects a source-hash mismatch even when request and receipt agree",async()=>{
    await db.query("update public.lighthouse_prism_verification_requests set source_content_hash=repeat('0',64) where request_id=$1",[first.requestId]);
    await rejects("select private.project_prism_legal_patterns_v1($1::uuid)",/prism_v25_complete_receipt_set_required/,[first.runId]);
  });
  await scenario("Rejects an incomplete receipt population",async()=>{
    await db.query("update public.civic_genome_prism_verification_run set receipt_count=0 where verification_run_id=$1::uuid",[first.runId]);
    await rejects("select private.prism_v25_calendar_correction_evidence_v1($1::uuid,$2::uuid)",/complete_same_source_proof_required/,[first.runId,first.target]);
    assert.equal(await project(first),0);
  });
  await scenario("Changed historical evidence fails the exact correction precondition",async()=>{
    await db.exec("alter table public.legal_patterns disable trigger pattern_immutable");
    await db.query("update public.legal_patterns set title=title||' changed fixture' where pattern_id=$1::uuid",[first.target]);
    await db.exec("alter table public.legal_patterns enable trigger pattern_immutable");
    await rejects("select private.project_prism_legal_patterns_v1($1::uuid)",/prior_identity_mismatch/,[first.runId]);
  });
  await scenario("Changing the older parent current flag fails the lineage precondition",async()=>{
    await db.query("update public.legal_patterns set is_current=true where pattern_id=(select supersedes_id from public.legal_patterns where pattern_id=$1::uuid)",[first.target]);
    await rejects("select private.prism_v25_calendar_correction_evidence_v1($1::uuid,$2::uuid)",/prior_identity_mismatch/,[first.runId,first.target]);
  });
  await scenario("Wrong source offsets cannot correct the known calendar-May successor",async()=>{
    await db.query("update public.lighthouse_prism_verification_receipts set contradictions=(select jsonb_agg(case when x->>'check'='workflow_modal_present' then x||jsonb_build_object('source_offset_start','0') else x end) from jsonb_array_elements(contradictions) x) where prism_verification_receipt_id=$1::uuid",[first.receiptId]);
    await rejects("select private.project_prism_legal_patterns_v1($1::uuid)",/exact_negative_modal_proof_required/,[first.runId]);
  });
  await scenario("A missing old trait/step proof holds its prior pattern",async()=>{
    await db.query("update public.lighthouse_prism_verification_receipts set contradictions=(select jsonb_agg(case when x->>'check'='workflow_modal_present' then x||jsonb_build_object('step_order','99') else x end) from jsonb_array_elements(contradictions) x) where prism_verification_receipt_id=$1::uuid",[first.receiptId]);
    await project(first);
    assert.equal(await scalar("select is_current from public.legal_patterns where pattern_id=$1::uuid",[first.target]),true);
  });
  await scenario("Actual source-backed 2.5 outcomes append both corrections and preserve history",async()=>{
    const before=await snapshot();
    for(const fixture of fixtureRuns) {
      assert.ok(await project(fixture)>0);
      const lineage=await current(fixture.target);
      const prior=lineage.find(row=>row.pattern_id===fixture.target);
      const successor=lineage.find(row=>row.supersedes_id===fixture.target);
      assert.equal(prior.is_current,false);
      assert.ok(successor);
      assert.equal(successor.is_current,true);
      assert.equal(successor.rule_version,"2.5.0");
      assert.equal(successor.verification_state,"contradicted");
      assert.equal(successor.authority_refs[0].correction_code,"calendar_may_is_not_an_operative_modal");
      assert.equal(successor.authority_refs[0].correction_evidence[0].prism_verification_receipt_id,fixture.receiptId);
    }
    assert.deepEqual(await snapshot(),before);
    const all=await rows("select to_jsonb(p) row from public.legal_patterns p order by pattern_id");
    for(const fixture of fixtureRuns) {
      assert.equal(await scalar("select private.project_prism_legal_patterns_v1($1::uuid)",[fixture.oldRunId]),0);
    }
    assert.deepEqual(await rows("select to_jsonb(p) row from public.legal_patterns p order by pattern_id"),all);
    for(const fixture of fixtureRuns) await project(fixture);
    assert.deepEqual(await rows("select to_jsonb(p) row from public.legal_patterns p order by pattern_id"),all);
  });
  await scenario("A positive modal reassessment cannot resolve a different old source span",async()=>{
    const prior=baseline.tables.legal_patterns.find(row=>row.pattern_id===first.target);
    const oldRef=prior.authority_refs[0].reassessment_evidence[0];
    await db.exec("alter table public.legal_patterns disable trigger pattern_immutable");
    await db.query("update public.legal_patterns set verification_state='contradicted',contradiction_refs=$2::jsonb where pattern_id=$1::uuid",[first.target,JSON.stringify([{trait_id:oldRef.trait_id,contradiction:{...oldRef.check_evaluation}}])]);
    await db.exec("alter table public.legal_patterns enable trigger pattern_immutable");
    await db.query("update public.lighthouse_prism_verification_receipts set contradictions='[]'::jsonb,supported_findings=$2::jsonb where prism_verification_receipt_id=$1::uuid",[first.receiptId,JSON.stringify([{...oldRef.check_evaluation,evaluated_span:'The agency must act in a different clause.',matched_modal:'must'}])]);
    assert.equal(await scalar("select private.project_prism_v25_modal_successors_v1($1::uuid)",[first.runId]),0);
    assert.equal(await scalar("select is_current from public.legal_patterns where pattern_id=$1::uuid",[first.target]),true);
  });
  await scenario("The actual run-completion trigger invokes the guarded correction",async()=>{
    const triggerSource=read("supabase/migrations/20260818084145_prism_domain2_legal_pattern_pullthrough.sql");
    await db.exec(functionSql(triggerSource,"private.project_prism_legal_patterns_after_run_v1"));
    await db.query("delete from public.civic_genome_prism_verification_run where verification_run_id=$1::uuid",[first.runId]);
    await db.exec("create trigger test_prism_after_run after insert on public.civic_genome_prism_verification_run for each row execute function private.project_prism_legal_patterns_after_run_v1()");
    await insert("civic_genome_prism_verification_run",[first.newRun]);
    assert.equal(await scalar("select is_current from public.legal_patterns where pattern_id=$1::uuid",[first.target]),false);
  });
  await scenario("Explicit assembly scope creates only new 2.5 queues and is idempotent",async()=>{
    const ids=fixtureRuns.map(row=>row.assemblyId);
    await db.query("insert into public.civic_genome_prism_verification_queue(assembly_run_id,genome_bill_id,prism_rule_set_id,prism_rule_set_version,queue_state,expected_trait_count,receipt_count) select assembly_run_id,genome_bill_id,'prism-rosetta-structural-binding','2.4.0','completed',trait_count,trait_count from public.civic_genome_assembly_run");
    const old=await rows("select to_jsonb(q) row from public.civic_genome_prism_verification_queue q order by queue_id");
    const result=await rows("select * from public.enqueue_civic_genome_prism_v25_scope_v1($1::uuid[])",[ids]);
    assert.equal(result.length,2);
    assert.deepEqual(new Set(result.map(row=>row.assembly_run_id)),new Set(ids));
    assert.ok(result.every(row=>row.prism_rule_set_version==="2.5.0"));
    assert.deepEqual(await rows("select * from public.enqueue_civic_genome_prism_v25_scope_v1($1::uuid[])",[ids]),result);
    assert.deepEqual(await rows("select to_jsonb(q) row from public.civic_genome_prism_verification_queue q where prism_rule_set_version='2.4.0' order by queue_id"),old);
    for(const invalid of [null,[],[ids[0],ids[0]],[null],Array.from({length:26},()=>randomUUID())]) {
      await rejects("select * from public.enqueue_civic_genome_prism_v25_scope_v1($1::uuid[])",/scope_requires/,[invalid]);
    }
    await rejects("select * from public.enqueue_civic_genome_prism_v25_scope_v1($1::uuid[])",/assembly_not_complete/,[[ids[0],randomUUID()]]);
    assert.equal(await scalar("select count(*)::integer from public.civic_genome_prism_verification_queue"),4);
  });
  await scenario("Both new-assembly and late-version enqueue triggers select 2.5",async()=>{
    await db.exec("create trigger test_late_version after insert on public.civic_genome_bill_version for each row execute function public.enqueue_civic_genome_bill_version_prism_v22()");
    const version={...baseline.tables.civic_genome_bill_version[0],bill_version_id:randomUUID()};
    await insert("civic_genome_bill_version",[version]);
    assert.equal(await scalar("select prism_rule_set_version from public.civic_genome_prism_verification_queue where assembly_run_id=$1::uuid",[version.assembly_run_id]),"2.5.0");
    await db.exec("create trigger test_new_assembly after insert on public.civic_genome_assembly_run for each row execute function public.enqueue_civic_genome_prism_verification()");
    const assembly={...baseline.tables.civic_genome_assembly_run[1],assembly_run_id:randomUUID()};
    await insert("civic_genome_assembly_run",[assembly]);
    assert.equal(await scalar("select prism_rule_set_version from public.civic_genome_prism_verification_queue where assembly_run_id=$1::uuid",[assembly.assembly_run_id]),"2.5.0");
  });
  await scenario("Existing pattern immutability rejects evidence rewrites and deletion",async()=>{
    await rejects("update public.legal_patterns set description='unsupported rewrite' where pattern_id=$1::uuid",/immutable/,[first.target]);
    await rejects("delete from public.legal_patterns where pattern_id=$1::uuid",/append-only/,[first.target]);
  });
  await scenario("Projection helpers retain the intended owner and execution boundary",async()=>{
    const permissions=await rows("select p.oid::regprocedure::text signature,pg_get_userbyid(p.proowner) owner,has_function_privilege('anon',p.oid,'EXECUTE') anon_allowed,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and (p.proname like 'prism_v25_%' or p.proname like 'project_prism%')");
    assert.ok(permissions.length>=5);
    assert.ok(permissions.every(row=>row.owner==="postgres"&&!row.anon_allowed&&!row.authenticated_allowed));
    assert.equal(await scalar("select has_function_privilege('service_role','private.prism_v25_calendar_correction_evidence_v1(uuid,uuid)','EXECUTE')"),false);
    assert.equal(await scalar("select has_function_privilege('service_role','private.project_prism_legal_patterns_v1(uuid)','EXECUTE')"),true);
  });
  console.log(JSON.stringify({result:"passed",scenarios:results.length,migration:migrationPath,source_fixture_cases:evaluations.rows.length}));
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const connectionString=process.env.PRISM_PROJECTION_TEST_DATABASE_URL;
  assert.ok(connectionString,"PRISM_PROJECTION_TEST_DATABASE_URL is required");
  const target=new URL(connectionString);
  assert.ok(["localhost","127.0.0.1"].includes(target.hostname)&&target.pathname==="/prism_v25_test","Use the disposable local prism_v25_test database only");
  const {Client}=await import("pg");
  const client=new Client({connectionString});
  await client.connect();
  try {
    assert.equal((await client.query("select count(*)::integer n from information_schema.tables where table_schema='public'")).rows[0].n,0,"Projection test database must be empty");
    await client.query("create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions");
    await verifyPrismV25Projection({query:(sql,params)=>client.query(sql,params),exec:sql=>client.query(sql)});
  } finally { await client.end(); }
}
