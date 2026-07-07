#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

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
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase.from('intake_staging').select('*').eq('intake_status', 'staged');
  if (error) throw new Error(error.message);

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
      if (!args.dry_run) await supabase.from('intake_staging').update({ destination_table, notes: 'blocked: name_too_short', updated_at: new Date().toISOString() }).eq('id', row.id);
    } else if (issues.length === 0) {
      ready_count += 1;
      if (!args.dry_run) await supabase.from('intake_staging').update({ intake_status: 'ready', destination_table, updated_at: new Date().toISOString() }).eq('id', row.id);
    } else {
      flagged_count += 1;
      if (!args.dry_run) await supabase.from('intake_staging').update({ intake_status: 'ready', destination_table, notes: append_notes(row.notes, issues), updated_at: new Date().toISOString() }).eq('id', row.id);
    }
  }

  console.log(`Ready: ${ready_count}, Flagged-but-promoted: ${flagged_count}, Blocked: ${blocked_count}`);
}

main().catch((error) => { console.error(error.message); process.exit(1); });
