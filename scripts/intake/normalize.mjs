#!/usr/bin/env node
async function fetch_staged_rows(base_url, service_key) {
  const headers = {
    apikey: service_key,
    Authorization: `Bearer ${service_key}`,
  };
  const all = [];
  let offset = 0;
  const page = 500;
  while (true) {
    const res = await fetch(
      `${base_url}/rest/v1/intake_staging?intake_status=eq.staged&select=*&limit=${page}&offset=${offset}`,
      { headers }
    );
    if (!res.ok) throw new Error(`fetch_staged_rows failed: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    all.push(...rows);
    if (rows.length < page) break;
    offset += page;
  }
  return all;
}

async function patch_staging_row(base_url, service_key, id, patch) {
  const headers = {
    apikey: service_key,
    Authorization: `Bearer ${service_key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };
  const res = await fetch(
    `${base_url}/rest/v1/intake_staging?id=eq.${id}`,
    { method: 'PATCH', headers, body: JSON.stringify(patch) }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`patch_staging_row failed for id=${id}: ${txt}`);
  }
}

function parse_args() {
  return { dry_run: process.argv.slice(2).includes('--dry-run') };
}

function valid_url(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function row_issues(row) {
  const issues = [];
  if (!row.name || row.name.trim().length < 3) issues.push('name_too_short');
  if (row.phone && row.phone.replace(/\D/g, '').length < 10) issues.push('invalid_phone');
  if ((row.website && !valid_url(row.website)) || (row.complaint_url && !valid_url(row.complaint_url))) issues.push('invalid_url');
  return issues;
}

function append_notes(notes, issues) {
  const issue_note = `issues: ${issues.join(', ')}`;
  return notes ? `${notes}\n${issue_note}` : issue_note;
}

function assign_destination(row) {
  const source_file = row.source_file ?? '';
  if (/CLAIM-CATALOG/i.test(source_file)) return 'claim_element_matrix';
  if (/FEDERAL-MASTER/i.test(source_file)) return 'agency_authority_map';
  if (/SOL-COLLISION/i.test(source_file)) return 'legal_statutes';
  if (/TRIBAL-ADDENDUM/i.test(source_file)) return 'contacts';
  if (/UNRECOGNIZED-TRIBES/i.test(source_file)) return 'registry_programs';
  if (/ENRICHED-PASS3/i.test(source_file)) return 'registry_programs';

  // Intake spine source types (SYSTEM_INGESTION_EXTRACTION_MAP) route to
  // chronology_events as the primary L3 destination. These represent
  // case-level evidence documents that feed into the chronology-first spine.
  // Power dynamics and cascade entries are derived downstream once chronology
  // is established via the guided intake submit path or manual enrichment.
  switch (row.source_type) {
    case 'sms':
    case 'email':
    case 'pdf':
    case 'care_plan':
    case 'medical_record':
    case 'contract':
    case 'notice':
    case 'agency_correspondence':
    case 'inspection_record':
    case 'grievance_response':
      return 'chronology_events';
    default:
      break;
  }

  switch (row.record_type) {
    case 'agency':
      return 'contacts';
    case 'statute':
      return 'legal_statutes';
    case 'claim':
      return 'claim_element_matrix';
    case 'federal_agency':
      return 'agency_authority_map';
    case 'regulatory':
      return 'regulatory_guidance';
    case 'coalition_org':
      return 'coalition_advocacy_orgs';
    case 'advocacy_org':
      return 'advocacy_organizations';
    case 'legislator':
      return 'contacts';
    case 'tribal_agency':
      return 'contacts';
    case 'program':
      return 'registry_programs';
    case 'policy_change':
      return 'policy_changes';
    case 'weak_joint':
      return 'weak_joint_registry';
    default:
      return 'registry_programs';
  }
}

async function main() {
  const args = parse_args();
  const data = await fetch_staged_rows(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  let ready_count = 0;
  let flagged_count = 0;
  let blocked_count = 0;

  for (const row of data ?? []) {
    const issues = row_issues(row);
    const destination_table = assign_destination(row);
    if (args.dry_run) console.log(`${row.id}: ${row.name ?? '(unnamed)'} → ${destination_table}`);
    const has_blocker = issues.includes('name_too_short');
    if (has_blocker) {
      blocked_count += 1;
      if (!args.dry_run) await patch_staging_row(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, row.id, { destination_table, notes: 'blocked: name_too_short', updated_at: new Date().toISOString() });
    } else if (issues.length === 0) {
      ready_count += 1;
      if (!args.dry_run) await patch_staging_row(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, row.id, { intake_status: 'ready', destination_table, updated_at: new Date().toISOString() });
    } else {
      flagged_count += 1;
      if (!args.dry_run) await patch_staging_row(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, row.id, { intake_status: 'ready', destination_table, notes: append_notes(row.notes, issues), updated_at: new Date().toISOString() });
    }
  }

  console.log(`Ready: ${ready_count}, Flagged-but-promoted: ${flagged_count}, Blocked: ${blocked_count}`);
}

main().catch((error) => { console.error(error.message); process.exit(1); });
