const {spawnSync}=require('node:child_process');
const fs=require('node:fs');const assert=require('node:assert/strict');
assert.equal(process.env.PGDATABASE,'genome_quarantine_test');assert.equal(process.env.PGHOST,'localhost');
function q(sql,ok=true,reason){const r=spawnSync('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});if(ok)assert.equal(r.status,0,r.stderr);else{assert.notEqual(r.status,0,'expected SQL rejection');if(reason)assert.match(r.stderr,reason);}return r.stdout.trim();}
const lit=s=>"'"+s.replaceAll("'","''")+"'";
q(fs.readFileSync('supabase/verification/civic_genome_sql_quarantine_fixture_v1.sql','utf8'));
q('create role anon;create role authenticated;create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text,name text,statements text[]);');
const prior=fs.readFileSync('supabase/migration_sources/civic_genome_rosetta_sql_write_quarantine_v1.sql','utf8');q(prior);
q("insert into supabase_migrations.schema_migrations values('20261015135444','civic_genome_rosetta_sql_write_quarantine_v1',array["+lit(prior)+"]);");
const m=JSON.parse(fs.readFileSync('supabase/verification/genome_legacy_structural_views_20261016.json','utf8'));
for(const v of m.views)q('create view public.'+v.name+' as select id from public.civic_genome_trait;grant '+(v.name==='v_civic_genome_prism_verification_status'?'select':'all privileges')+' on table public.'+v.name+' to service_role;');
let cut=fs.readFileSync('supabase/migration_sources/retire_genome_legacy_structural_view_access_20261016.sql','utf8');
let rollback=fs.readFileSync('supabase/verification/retire_genome_legacy_structural_view_access_20261016_ROLLBACK.sql','utf8');
for(const v of m.views){const h=q("select md5(pg_get_viewdef('public."+v.name+"'::regclass,true));");cut=cut.replaceAll(v.definition_md5,h);rollback=rollback.replaceAll(v.definition_md5,h);}
for(const t of m.writer_fence.fence){const h=q("select md5(pg_get_functiondef(tgfoid)) from pg_trigger where tgrelid="+lit(t.table)+"::regclass and tgname="+lit(t.name)+";");cut=cut.replaceAll(t.body_md5,h);}
cut=cut.replaceAll('68ad3ca961b016b0a6a37c94f2861199',q("select md5(statements[1]) from supabase_migrations.schema_migrations;"));
const tx=s=>'begin;\n'+s+'\ncommit;';
function state(){return q("select jsonb_agg(jsonb_build_object('name',c.relname,'acl',c.relacl::text,'definition',pg_get_viewdef(c.oid,true)) order by c.relname) from pg_class c where c.relname in ("+m.views.map(x=>lit(x.name)).join(',')+");");}
const before=state();
q(tx('grant select on public.docket_bill_drift_delta to anon;'+cut),false,/original structural view ACL differs/);
q(tx('create or replace view public.docket_bill_drift_delta as select 999 as id;'+cut),false,/view definition or ownership changed/);
q(tx('alter table public.civic_genome_trait disable trigger zz_civic_genome_block_rosetta_trait_write_v1;'+cut),false,/write quarantine changed/);
q(tx(cut.replace('END $view_cut$;',"RAISE EXCEPTION 'forced after all revocations';END $view_cut$;")),false,/forced after all revocations/);
assert.equal(state(),before,'failed pre/postflight restores exact ACLs and definitions');
q(cut);
for(const v of m.views){for(const role of ['anon','authenticated','service_role'])q('set role '+role+';select * from public.'+v.name+';',false,/permission denied/);assert.equal(q('select count(*) from public.'+v.name+';'),'1','privileged forensic access remains separate');}
q("update public.civic_genome_bill set structural_dna_json=jsonb_set(structural_dna_json,'{source_last_action}','\"Docket metadata remains writable\"');");
assert.equal(q("select structural_dna_json->>'source_last_action' from public.civic_genome_bill;"),'Docket metadata remains writable');
q('insert into public.civic_genome_trait(id) values(99);',false,/quarantin/);
q(rollback);assert.equal(state(),before,'bounded rollback restores exact prior ACLs');
console.log('PASS: four views deny application roles; source metadata remains writable and derivative INSERT blocked; definition/ACL/fence drift rejected; forced post-cut rollback and exact original ACL restoration verified');
