#!/usr/bin/env node
import { createHash, randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';

function parse_args() {
  const args = process.argv.slice(2);
  const parsed = { dry_run: false };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--dry-run') parsed.dry_run = true;
    else if (args[i] === '--limit') parsed.limit = Number(args[++i]);
    else if (args[i] === '--state') parsed.state = args[++i];
  }
  return parsed;
}

function content_hash(raw_payload) {
  const canonical = JSON.stringify(raw_payload, Object.keys(raw_payload ?? {}).sort());
  return createHash('sha256').update(canonical).digest('hex');
}

function registry_id(row) {
  const key = `${(row.name ?? '').toLowerCase()}::${(row.state ?? '').toLowerCase()}`;
  return `lmn_${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
}

function map_registry_row(row) {
  return {
    id: registry_id(row),
    name: row.name,
    acronym: row.acronym,
    record_type: row.record_type,
    phone: row.phone,
    email: row.email,
    website: row.website,
    complaint_url: row.complaint_url,
    address: row.address,
    state: row.state,
    jurisdiction: row.jurisdiction,
    domains: row.domains,
    org_type: row.org_type,
    description: row.description,
    service_type: row.service_type,
    eligibility: row.eligibility,
    statutory_authority: row.statutory_authority,
    notes: row.notes,
    is_verified: false,
    source_file: row.source_file,
    intake_staging_id: row.id,
  };
}

function log_row(row, registry_row, promotion_run_id, dry_run, success = true, error_message = null) {
  const promoted_hash = content_hash(row.raw_payload);
  return {
    intake_staging_id: row.id,
    registry_record_id: registry_row.id,
    source_file: row.source_file,
    source_type: row.source_type,
    record_name: row.name,
    state: row.state,
    content_hash: promoted_hash,
    hash_verified: promoted_hash === row.content_hash,
    promoted_by: 'script',
    promotion_run_id,
    dry_run,
    was_upsert: success && !dry_run,
    success,
    error_message,
  };
}

async function fetch_ready_rows(supabase, args) {
  let query = supabase.from('intake_staging').select('*').eq('intake_status', 'ready');
  if (args.state) query = query.ilike('state', args.state);
  if (args.limit) query = query.limit(args.limit);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function main() {
  const args = parse_args();
  const promotion_run_id = randomUUID();
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const rows = await fetch_ready_rows(supabase, args);
  const mapped_rows = rows.map(map_registry_row);

  if (args.dry_run) {
    console.log(`Dry-run mapped rows: ${mapped_rows.length}`);
    console.log(JSON.stringify(mapped_rows[0] ?? null, null, 2));
  }

  let promoted_count = 0;
  let failed_count = 0;
  const batch_size = 100;
  for (let i = 0; i < rows.length; i += batch_size) {
    const batch_rows = rows.slice(i, i + batch_size);
    const batch_mapped = mapped_rows.slice(i, i + batch_size);
    if (args.dry_run) continue;
    const { error } = await supabase.from('registry_programs').upsert(batch_mapped, { onConflict: 'id' });
    const logs = batch_rows.map((row, index) => log_row(row, batch_mapped[index], promotion_run_id, false, !error, error?.message ?? null));
    await supabase.from('intake_promotion_log').insert(logs);
    if (error) {
      failed_count += batch_rows.length;
      continue;
    }
    promoted_count += batch_rows.length;
    await Promise.all(batch_rows.map((row, index) => supabase.from('intake_staging').update({ intake_status: 'promoted', promoted_at: new Date().toISOString(), promoted_record_id: batch_mapped[index].id, updated_at: new Date().toISOString() }).eq('id', row.id)));
  }

  console.log(`Promoted: ${args.dry_run ? 0 : promoted_count}, Failed: ${failed_count}`);
  console.log(`promotion_run_id: ${promotion_run_id}`);
  console.log(`SELECT * FROM intake_promotion_log WHERE promotion_run_id = '${promotion_run_id}';`);
  console.log("SELECT * FROM registry_record_provenance WHERE promoted_at > now() - interval '1 hour';");
}

main().catch((error) => { console.error(error.message); process.exit(1); });
