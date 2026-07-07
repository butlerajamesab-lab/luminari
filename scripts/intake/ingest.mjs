#!/usr/bin/env node
import { createHash } from 'crypto';
import { execFile } from 'child_process';
import { readdir, readFile, stat } from 'fs/promises';
import { promisify } from 'util';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const exec_file = promisify(execFile);

const batch_size = 100;
const null_values = new Set(['', 'not published']);

function parse_args() {
  const args = process.argv.slice(2);
  const parsed = { dry_run: false };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--source') parsed.source = args[++i];
    else if (args[i] === '--dry-run') parsed.dry_run = true;
  }
  if (!parsed.source) throw new Error('Usage: node ingest.mjs --source <file_or_directory> [--dry-run]');
  return parsed;
}

function clean_value(value) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.map(clean_value).filter(Boolean);
  const text = String(value).trim();
  return null_values.has(text.toLowerCase()) ? null : text;
}

function parse_domains(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value.map(clean_value).filter(Boolean);
  if (typeof value === 'string') {
    const cleaned = clean_value(value);
    if (!cleaned) return null;
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return parsed.map(clean_value).filter(Boolean);
    } catch {}
    return cleaned.split(',').map((item) => clean_value(item)).filter(Boolean);
  }
  return null;
}

function content_hash(raw_payload) {
  const canonical = JSON.stringify(raw_payload, Object.keys(raw_payload ?? {}).sort());
  return createHash('sha256').update(canonical).digest('hex');
}

function staging_row(row) {
  const raw_payload = row.raw_payload ?? row;
  return { ...row, raw_payload, content_hash: content_hash(raw_payload), ingested_by: 'script' };
}

async function list_files(source) {
  const source_stat = await stat(source);
  if (!source_stat.isDirectory()) return [source];
  const entries = await readdir(source, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && ['.docx', '.json'].includes(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(source, entry.name));
}

function state_from_docx_file(file_path) {
  const base = path.basename(file_path, path.extname(file_path));
  const match = base.match(/luminari-([A-Z\s-]+)-RESOURCE-DIRECTORY/i);
  return clean_value(match?.[1]?.replaceAll('-', ' '));
}

function table_value(lines, field_names) {
  for (const field_name of field_names) {
    const pattern = new RegExp(`^${field_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:|]?\\s*(.+)$`, 'i');
    const line = lines.find((candidate) => pattern.test(candidate));
    if (line) return clean_value(line.match(pattern)?.[1]);
    const index = lines.findIndex((candidate) => candidate.toLowerCase() === field_name.toLowerCase());
    if (index >= 0) return clean_value(lines[index + 1]);
  }
  return null;
}

function parse_docx_blocks(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const heading_indexes = [];
  lines.forEach((line, index) => {
    if (/\b(VERIFIED|UNVERIFIED)\b/i.test(line)) heading_indexes.push(index);
  });
  return heading_indexes.map((start, block_index) => {
    const end = heading_indexes[block_index + 1] ?? lines.length;
    return lines.slice(start, end);
  });
}

async function extract_docx_text(file_path) {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.default.extractRawText({ path: file_path });
    return result.value;
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    const { stdout } = await exec_file('unzip', ['-p', file_path, 'word/document.xml'], { maxBuffer: 20 * 1024 * 1024 });
    return stdout
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }
}

async function parse_docx_file(file_path) {
  const text = await extract_docx_text(file_path);
  const state = state_from_docx_file(file_path);
  const source_file = path.basename(file_path);
  const all_lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows = parse_docx_blocks(text).map((lines, index) => {
    const heading = lines[0];
    const acronym = clean_value(heading.match(/\[([^\]]+)\]/)?.[1]);
    const name = clean_value(heading.replace(/\[[^\]]+\]/g, '').replace(/\b(UNVERIFIED|VERIFIED).*$/i, ''));
    const raw_payload = { verified: /\bVERIFIED\b/i.test(heading) && !/\bUNVERIFIED\b/i.test(heading), raw_block: lines.join('\n').slice(0, 500) };
    return staging_row({
      source_file, source_type: 'docx', source_record_id: String(index + 1), name, acronym,
      record_type: 'resource', phone: table_value(lines, ['Phone']), email: table_value(lines, ['Email']),
      website: table_value(lines, ['Website']), complaint_url: table_value(lines, ['Filing / Complaint Portal']),
      address: table_value(lines, ['Address']), state, service_type: table_value(lines, ['Service Type']),
      description: table_value(lines, ['What it does for people']), statutory_authority: table_value(lines, ['Statutory Authority']),
      raw_payload,
    });
  });

  // Parse statutory quick-reference table at bottom of each state doc
  const statute_rows = parse_docx_statutes(all_lines, state, source_file);
  rows.push(...statute_rows);

  return rows;
}

function parse_docx_statutes(lines, state_name, source_file) {
  const table_start = lines.findIndex((line) => line === 'Statute / Law');
  if (table_start === -1) return [];

  const data_start = table_start + 4; // skip 4-line header row
  const statutes = [];

  for (let i = data_start; i < lines.length - 2; i += 4) {
    const statute_name = lines[i];
    const citation = lines[i + 1];
    const key_language = lines[i + 2];

    // Stop at footer
    if (!citation || citation.startsWith('Every contact verified')) break;
    // Must look like a real citation
    if (!/§|U\.S\.C\.|Del\. Code|INA/.test(citation)) break;

    const raw_payload = { statute_name, citation, key_language };

    statutes.push({
      source_file,
      source_type: 'docx_statute',
      source_record_id: citation,
      name: statute_name,
      record_type: 'statutory_reference',
      state: state_name,
      jurisdiction: `State (${state_name})`,
      description: key_language,
      statutory_authority: citation,
      domains: [],
      raw_payload,
      content_hash: content_hash(raw_payload),
      ingested_by: 'script',
      intake_status: 'staged',
    });
  }

  return statutes;
}

function parse_json_record(record, file_path, index) {
  const source_file = path.basename(file_path);
  const base = { source_file, source_record_id: clean_value(record.id ?? record.source_record_id ?? index + 1), raw_payload: record };
  if (record.full_name && record.title) {
    return staging_row({ ...base, source_type: 'json_legislator', record_type: 'legislator', name: clean_value(record.full_name), description: clean_value(record.title), phone: clean_value(record.contact_phone), email: clean_value(record.contact_email), state: clean_value(record.state), jurisdiction: clean_value(record.jurisdiction), website: clean_value(record.website), domains: parse_domains(record.domains), notes: clean_value(record.notes) });
  }
  if (record.agency_type || record.acronym) {
    return staging_row({ ...base, source_type: 'json_agency', record_type: 'agency', name: clean_value(record.name), acronym: clean_value(record.acronym), org_type: clean_value(record.agency_type), state: clean_value(record.state), phone: clean_value(record.contact_phone), email: clean_value(record.contact_email), website: clean_value(record.website), complaint_url: clean_value(record.complaint_url), domains: parse_domains(record.domains), description: clean_value(record.notes) });
  }
  return staging_row({ ...base, source_type: 'json_advocacy', record_type: 'advocacy_org', name: clean_value(record.name), state: clean_value(record.state), jurisdiction: clean_value(record.jurisdiction), phone: clean_value(record.contact_phone), website: clean_value(record.website), complaint_url: clean_value(record.intake_url), address: clean_value(record.address), description: clean_value(record.description), eligibility: clean_value(record.eligibility_criteria), org_type: clean_value(record.org_type), domains: parse_domains(record.domains) });
}

async function parse_json_file(file_path) {
  const parsed = JSON.parse(await readFile(file_path, 'utf8'));
  const records = Array.isArray(parsed) ? parsed : Array.isArray(parsed.records) ? parsed.records : [parsed];
  return records.map((record, index) => parse_json_record(record, file_path, index));
}

async function insert_batches(supabase, file_path, rows) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batch_size) {
    const batch = rows.slice(i, i + batch_size);
    const { error } = await supabase.from('intake_staging').insert(batch);
    if (error) throw new Error(`${path.basename(file_path)} insert failed: ${error.message}`);
    inserted += batch.length;
  }
  return inserted;
}

async function main() {
  const args = parse_args();
  const files = await list_files(args.source);
  const supabase = args.dry_run ? null : createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  for (const file_path of files) {
    const ext = path.extname(file_path).toLowerCase();
    const rows = ext === '.docx' ? await parse_docx_file(file_path) : await parse_json_file(file_path);
    const inserted = args.dry_run ? 0 : await insert_batches(supabase, file_path, rows);
    console.log(`${path.basename(file_path)}: ${rows.length} records parsed, ${inserted} inserted`);
    if (args.dry_run) console.log(JSON.stringify(rows[0] ?? null, null, 2));
  }
}

main().catch((error) => { console.error(error.message); process.exit(1); });
