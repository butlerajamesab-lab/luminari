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
    const has_blocker = issues.includes('name_too_short');
    if (has_blocker) {
      blocked_count += 1;
      if (!args.dry_run) await supabase.from('intake_staging').update({ notes: 'blocked: name_too_short', updated_at: new Date().toISOString() }).eq('id', row.id);
    } else if (issues.length === 0) {
      ready_count += 1;
      if (!args.dry_run) await supabase.from('intake_staging').update({ intake_status: 'ready', updated_at: new Date().toISOString() }).eq('id', row.id);
    } else {
      flagged_count += 1;
      if (!args.dry_run) await supabase.from('intake_staging').update({ intake_status: 'ready', notes: append_notes(row.notes, issues), updated_at: new Date().toISOString() }).eq('id', row.id);
    }
  }

  console.log(`Ready: ${ready_count}, Flagged-but-promoted: ${flagged_count}, Blocked: ${blocked_count}`);
}

main().catch((error) => { console.error(error.message); process.exit(1); });
