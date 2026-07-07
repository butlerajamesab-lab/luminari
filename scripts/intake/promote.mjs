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

function registry_id(name, state) {
  const key = `${(name ?? '').toLowerCase()}::${(state ?? '').toLowerCase()}`;
  return `lmn_${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
}

const DESTINATION_MAPPERS = {
  registry_programs: (row) => ({
    id: registry_id(row.name, row.state),
    name: row.name,
    acronym: row.acronym,
    program_type: row.record_type,
    state: row.state,
    jurisdiction: row.jurisdiction,
    phone: row.phone,
    email: row.email,
    website: row.website,
    complaint_url: row.complaint_url,
    address: row.address,
    service_description: row.description,
    service_type: row.service_type,
    eligibility: row.eligibility,
    domains: row.domains,
    org_type: row.org_type,
    statutory_authority: row.statutory_authority,
    notes: row.notes,
    source_file: row.source_file,
    intake_staging_id: row.id,
    is_verified: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }),

  contacts: (row) => ({
    id: registry_id(row.name, row.state),
    name: row.name,
    acronym: row.acronym,
    org_type: row.org_type ?? 'agency',
    state: row.state,
    jurisdiction: row.jurisdiction,
    phone: row.phone,
    email: row.email,
    website: row.website,
    address: row.address,
    notes: row.notes,
    source_file: row.source_file,
    intake_staging_id: row.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }),

  legal_statutes: (row) => ({
    id: registry_id(row.name, row.state),
    name: row.name,
    citation: row.citation ?? row.statutory_authority,
    key_language: row.key_language ?? row.description,
    state: row.state,
    source_file: row.source_file,
    intake_staging_id: row.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }),

  claim_element_matrix: (row) => ({
    id: registry_id(row.name, 'claim'),
    name: row.name,
    description: row.description,
    domains: row.domains,
    state: row.state,
    source_file: row.source_file,
    intake_staging_id: row.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }),

  agency_authority_map: (row) => ({
    id: registry_id(row.name, 'federal'),
    name: row.name,
    acronym: row.acronym,
    jurisdiction: 'federal',
    website: row.website,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    source_file: row.source_file,
    intake_staging_id: row.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }),

  regulatory_guidance: (row) => ({
    id: registry_id(row.name, row.state ?? 'federal'),
    name: row.name,
    description: row.description,
    state: row.state,
    source_file: row.source_file,
    intake_staging_id: row.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }),

  coalition_advocacy_orgs: (row) => ({
    id: registry_id(row.name, row.state ?? 'national'),
    name: row.name,
    state: row.state,
    website: row.website,
    phone: row.phone,
    email: row.email,
    source_file: row.source_file,
    intake_staging_id: row.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }),

  advocacy_organizations: (row) => ({
    id: registry_id(row.name, row.state ?? 'national'),
    name: row.name,
    state: row.state,
    website: row.website,
    phone: row.phone,
    email: row.email,
    source_file: row.source_file,
    intake_staging_id: row.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }),

  policy_changes: (row) => ({
    id: registry_id(row.name, row.state),
    name: row.name,
    description: row.description,
    state: row.state,
    source_file: row.source_file,
    intake_staging_id: row.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }),

  weak_joint_registry: (row) => ({
    id: registry_id(row.name, row.state ?? 'national'),
    name: row.name,
    description: row.description,
    state: row.state,
    source_file: row.source_file,
    intake_staging_id: row.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }),
};

function default_mapper(row) {
  return DESTINATION_MAPPERS.registry_programs(row);
}

function build_log_entry(row, registry_record_id, promotion_run_id, dry_run, options = {}) {
  const promoted_hash = content_hash(row.raw_payload);
  const success = options.success ?? true;
  const error_message = options.error_message ?? null;
  return {
    intake_staging_id: row.id,
    registry_record_id,
    destination_table: row.destination_table ?? 'registry_programs',
    source_file: row.source_file,
    source_type: row.source_type,
    record_name: row.name,
    state: row.state,
    content_hash: promoted_hash,
    hash_verified: promoted_hash === row.content_hash,
    promoted_by: 'script',
    promotion_run_id,
    dry_run,
    was_upsert: options.was_upsert ?? (success && !dry_run),
    success,
    error_message,
  };
}

async function insert_log_entries(supabase, log_entries) {
  if (log_entries.length === 0) return;
  const { error } = await supabase.from('intake_promotion_log').insert(log_entries);
  if (!error) return;
  if (!/destination_table/i.test(error.message ?? '')) throw new Error(error.message);
  const fallback_entries = log_entries.map(({ destination_table, error_message, ...entry }) => ({
    ...entry,
    error_message: error_message ? `${error_message} | destination_table=${destination_table}` : `destination_table=${destination_table}`,
  }));
  const { error: fallback_error } = await supabase.from('intake_promotion_log').insert(fallback_entries);
  if (fallback_error) throw new Error(fallback_error.message);
}

async function coalesce_upsert(supabase, dest_table, batch) {
  const { error: insert_error } = await supabase
    .from(dest_table)
    .upsert(batch, { onConflict: 'id', ignoreDuplicates: true });

  if (insert_error) return insert_error;

  for (const row of batch) {
    const update_fields = {};
    for (const [key, value] of Object.entries(row)) {
      if (key === 'id' || key === 'created_at' || value === null || value === undefined) continue;
      update_fields[key] = value;
    }

    if (Object.keys(update_fields).length === 0) continue;

    const { data: existing, error: fetch_error } = await supabase
      .from(dest_table)
      .select('*')
      .eq('id', row.id)
      .single();

    if (fetch_error || !existing) continue;

    const coalesced = {};
    for (const [key, value] of Object.entries(update_fields)) {
      if (existing[key] === null || existing[key] === undefined) {
        coalesced[key] = value;
      }
    }

    if (Object.keys(coalesced).length === 0) continue;

    coalesced.updated_at = new Date().toISOString();

    const { error: update_error } = await supabase
      .from(dest_table)
      .update(coalesced)
      .eq('id', row.id);

    if (update_error) return update_error;
  }

  return null;
}

async function fetch_ready_rows(args) {
  const base_url = process.env.SUPABASE_URL;
  const service_key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = {
    apikey: service_key,
    Authorization: `Bearer ${service_key}`,
  };
  const all = [];
  let offset = 0;
  const page = 500;
  while (true) {
    let url = `${base_url}/rest/v1/intake_staging?intake_status=eq.ready&select=*&limit=${page}&offset=${offset}`;
    if (args.state) url += `&state=ilike.*${encodeURIComponent(args.state)}*`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`fetch_ready_rows failed: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    all.push(...rows);
    if (rows.length < page) break;
    offset += page;
  }
  return args.limit ? all.slice(0, args.limit) : all;
}

async function mark_promoted(base_url, service_key, ids, dest_table) {
  const headers = {
    apikey: service_key,
    Authorization: `Bearer ${service_key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };
  const id_list = ids.join(',');
  const res = await fetch(
    `${base_url}/rest/v1/intake_staging?id=in.(${id_list})`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        intake_status: 'promoted',
        destination_table: dest_table,
        promoted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    }
  );
  if (!res.ok) throw new Error(`mark_promoted failed: ${res.status} ${await res.text()}`);
}

async function main() {
  const args = parse_args();
  const promotion_run_id = randomUUID();
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { fetch },
    realtime: { transport: typeof WebSocket !== 'undefined' ? WebSocket : undefined },
  });
  const rows = await fetch_ready_rows(args);

  const groups = {};
  for (const row of rows) {
    const requested_dest = row.destination_table ?? 'registry_programs';
    const dest = DESTINATION_MAPPERS[requested_dest] ? requested_dest : 'registry_programs';
    const routed_row = { ...row, destination_table: dest };
    if (!groups[dest]) groups[dest] = [];
    groups[dest].push(routed_row);
  }

  let promoted_count = 0;
  let failed_count = 0;
  const log_entries = [];

  for (const [dest_table, dest_rows] of Object.entries(groups)) {
    const mapper = DESTINATION_MAPPERS[dest_table] ?? default_mapper;
    const mapped = dest_rows.map(mapper);

    console.log(`${args.dry_run ? '[DRY RUN] ' : ''}Routing ${dest_rows.length} rows → ${dest_table}`);

    for (let i = 0; i < mapped.length; i += 50) {
      const batch = mapped.slice(i, i + 50);
      const batch_rows = dest_rows.slice(i, i + 50);

      if (args.dry_run) {
        console.log(`    [DRY RUN] would upsert ${batch.length} rows to ${dest_table}`);
        console.log('    Sample:', JSON.stringify(batch[0], null, 2));
        continue;
      }

      const upsert_error = await coalesce_upsert(supabase, dest_table, batch);

      if (upsert_error) {
        console.error(`    Batch error (${dest_table}):`, upsert_error.message);
        for (let j = 0; j < batch_rows.length; j += 1) {
          log_entries.push(build_log_entry(batch_rows[j], batch[j].id, promotion_run_id, false, {
            success: false,
            error_message: `[${dest_table}] ${upsert_error.message}`,
          }));
        }
        failed_count += batch.length;
        continue;
      }

      const staging_ids = batch_rows.map((row) => row.id);
      await mark_promoted(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, staging_ids, dest_table);

      for (let j = 0; j < batch_rows.length; j += 1) {
        log_entries.push(build_log_entry(batch_rows[j], batch[j].id, promotion_run_id, false, {
          success: true,
          was_upsert: false,
        }));
      }

      promoted_count += batch.length;
      console.log(`    Promoted batch ${i}–${i + batch.length - 1} → ${dest_table}`);
    }
  }

  if (!args.dry_run) await insert_log_entries(supabase, log_entries);

  console.log(`Promoted: ${args.dry_run ? 0 : promoted_count}, Failed: ${failed_count}`);
  console.log(`promotion_run_id: ${promotion_run_id}`);
  console.log(`SELECT * FROM intake_promotion_log WHERE promotion_run_id = '${promotion_run_id}';`);
  console.log("SELECT * FROM registry_record_provenance WHERE promoted_at > now() - interval '1 hour';");
}

main().catch((error) => { console.error(error.message); process.exit(1); });
