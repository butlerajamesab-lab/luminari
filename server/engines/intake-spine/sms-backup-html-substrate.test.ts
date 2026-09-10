import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseArtifact } from './parsing-substrate';
import { isSmsBackupRestoreHtml, parseSmsBackupRestoreHtml, SMS_BACKUP_HTML_RULE_MANIFEST } from './sms-backup-html-substrate';

const headers = '<tr><th>Type</th><th>Date</th><th>Name / Number</th><th>Content</th></tr>';
function viewer(rows: string, extra = ''): string {
  return `<html><head><meta charset="utf-8"><style>body { color: #333; }</style></head><body><h2>Conversation with: Jordan Reviewer</h2><table>${headers}${rows}</table>${extra}</body></html>`;
}
function row(content: string, type = 'Received<br/>Sent by: Jordan Reviewer', date = 'Oct 7, 2025 11:59:05 AM'): string {
  return `<tr><td>${type}</td><td>${date}</td><td>Jordan Reviewer (+12065550100)</td><td class="dont-break-out">${content}</td></tr>`;
}

afterEach(() => vi.unstubAllGlobals());

describe('SMS Backup viewer HTML parser', () => {
  it('preserves row text and provenance while separating conversation metadata and local time', async () => {
    const first = row('Rowan was admitted to the nursing home &amp; needs water.<br/>Care review follows.');
    const second = row('I can help tomorrow.', 'Sent', 'Oct 7, 2025 12:08:57 PM');
    const html = viewer(first + second);
    const bytes = Buffer.from(html);
    const parsed = await parseArtifact('sha256:synthetic-html-fixture', bytes, 'application/octet-stream', 'messages.html');
    expect(parsed).toMatchObject({
      detected_mime_type: 'application/vnd.sms-backup-restore+html',
      extraction_method: 'sms_backup_html', extraction_status: 'success',
      raw_bytes_sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    expect(parsed.extracted_text).toBe('Rowan was admitted to the nursing home & needs water.\nCare review follows.\n\nI can help tomorrow.');
    expect(parsed.extracted_text).not.toMatch(/<td|<style|Conversation with|12065550100|Oct 7/);
    expect(parsed.spans.map(span => span.source_record_char_offset)).toEqual([html.indexOf(first), html.indexOf(second)]);
    expect(parsed.spans.map(span => span.source_record_index)).toEqual([0, 1]);
    expect(parsed.spans.map(span => span.message_direction)).toEqual(['received', 'sent']);
    expect(parsed.spans.map(span => span.message_contact_name)).toEqual(['Jordan Reviewer', 'Jordan Reviewer']);
    expect(parsed.spans[0]).toMatchObject({
      source_kind: 'sms_message', message_kind: 'message',
      occurred_at_local: '2025-10-07T11:59:05', occurred_at_timezone: 'unknown',
      source_timestamp_text: 'Oct 7, 2025 11:59:05 AM',
    });
    expect(parsed.spans[1].occurred_at_local).toBe('2025-10-07T12:08:57');
    expect(parsed.spans.every(span => span.occurred_at === undefined)).toBe(true);
    for (const span of parsed.spans) expect(parsed.extracted_text.slice(span.start_offset, span.end_offset)).toBe(span.text);
  });

  it('recognizes reactions without removing the quoted source message text', () => {
    const parsed = parseSmsBackupRestoreHtml(Buffer.from(viewer(
      row('Liked &quot;Rowan was admitted&quot;', 'Sent') + row('&#128077; to “Rowan was admitted”'),
    )), 'fixture');
    expect(parsed.spans.map(span => span.message_kind)).toEqual(['reaction', 'reaction']);
    expect(parsed.spans[1].text).toBe('👍 to “Rowan was admitted”');
  });

  it('retains an empty-content record and subsequent row identity', () => {
    const parsed = parseSmsBackupRestoreHtml(Buffer.from(viewer(row('') + row('Follow-up.'))), 'fixture');
    expect(parsed.spans).toHaveLength(2);
    expect(parsed.spans[0]).toMatchObject({ text: '', source_record_index: 0, start_offset: 0, end_offset: 0 });
    expect(parsed.spans[1]).toMatchObject({ text: 'Follow-up.', source_record_index: 1, start_offset: 2 });
  });

  it('does not treat a recipient contact label as a sent-message author assertion', () => {
    const parsed = parseSmsBackupRestoreHtml(Buffer.from(viewer(row('I am the caregiver.', 'Sent'))), 'fixture');
    expect(parsed.spans[0]).toMatchObject({ message_direction: 'sent', message_contact_name: 'Jordan Reviewer' });
    expect(parsed.spans[0]).not.toHaveProperty('author_canonical_name');
    expect(parsed.spans[0]).not.toHaveProperty('binding_provenance_refs');
  });

  it('preserves an unrecognized direction as unknown rather than choosing an author', () => {
    const parsed = parseSmsBackupRestoreHtml(Buffer.from(viewer(row('I am the caregiver.', 'Draft'))), 'fixture');
    expect(parsed.spans[0].message_direction).toBe('unknown');
    expect(parsed.spans[0]).not.toHaveProperty('author_canonical_name');
  });

  it.each([
    ['Jan 2, 2026 12:00:00 AM', '2026-01-02T00:00:00'],
    ['Jan 2, 2026 12:00:00 PM', '2026-01-02T12:00:00'],
    ['Feb 29, 2024 1:02:03 PM', '2024-02-29T13:02:03'],
    ['Nov 1, 2026 1:30:00 AM', '2026-11-01T01:30:00'],
  ])('retains the displayed civil timestamp without choosing a timezone: %s', (date, expected) => {
    const parsed = parseSmsBackupRestoreHtml(Buffer.from(viewer(row('Care review.', 'Received', date))), 'fixture');
    expect(parsed.spans[0].occurred_at_local).toBe(expected);
    expect(parsed.spans[0].occurred_at_timezone).toBe('unknown');
    expect(parsed.spans[0].occurred_at).toBeUndefined();
  });

  it.each(['Feb 29, 2025 1:00:00 PM', 'Oct 7, 2025 25:00:00 AM', 'Oct 7, 2025 1:60:00 PM', 'not a date'])('fails closed for an invalid local timestamp: %s', date => {
    expect(() => parseSmsBackupRestoreHtml(Buffer.from(viewer(row('Care review.', 'Received', date))), 'fixture')).toThrow('sms_html_invalid_local_timestamp');
  });

  it.each([
    ['missing closing row', (html: string) => html.replace('</td></tr>', '</td>'), 'sms_html_invalid_table_structure'],
    ['wrong header', (html: string) => html.replace('<th>Content</th>', '<th>Body</th>'), 'sms_html_invalid_headers'],
    ['extra cell', (html: string) => html.replace('</td></tr>', '</td><td>extra</td></tr>'), 'sms_html_invalid_row_shape'],
    ['nested table', (html: string) => html.replace('Care review.', '<table><tr><td>Nested</td></tr></table>'), 'sms_html_multiple_tables'],
    ['active script', (html: string) => html.replace('Care review.', '<script>fetch("https://invalid.example")</script>'), 'sms_html_active_element_rejected'],
    ['external declaration', (html: string) => '<!DOCTYPE html SYSTEM "https://invalid.example/external">' + html, 'sms_html_declaration_rejected'],
  ])('does not silently fall back to raw HTML for %s', async (_label, corrupt, error) => {
    const parsed = await parseArtifact('fixture', Buffer.from(corrupt(viewer(row('Care review.')))), 'text/html');
    expect(parsed.extraction_status).toBe('extraction_failed');
    expect(parsed.extraction_error).toBe(error);
    expect(parsed.extracted_text).toBe('');
    expect(parsed.spans).toEqual([]);
  });

  it('decodes entities once, handles quoted tag delimiters, and never loads remote resources', async () => {
    const fetch = vi.fn(() => { throw new Error('unexpected network'); });
    vi.stubGlobal('fetch', fetch);
    const content = '<span title="a > b">A &lt; B &amp; &amp;lt;literal&amp;gt;</span><br/><a href="https://invalid.example">Visible link</a><img src="https://invalid.example/image">';
    const parsed = await parseArtifact('fixture', Buffer.from(viewer(row(content))), 'text/html');
    expect(parsed.extracted_text).toBe('A < B & &lt;literal&gt;\nVisible link');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('enforces bounded record text and file size', () => {
    expect(() => parseSmsBackupRestoreHtml(Buffer.from(viewer(row('x'.repeat(SMS_BACKUP_HTML_RULE_MANIFEST.max_text_chars_per_record + 1)))), 'fixture'))
      .toThrow('sms_html_record_text_limit_exceeded');
    expect(() => parseSmsBackupRestoreHtml(Buffer.alloc(SMS_BACKUP_HTML_RULE_MANIFEST.max_bytes + 1), 'fixture'))
      .toThrow('sms_html_byte_limit_exceeded');
  });

  it('does not mistake an unrelated HTML table for the SMS viewer', () => {
    expect(isSmsBackupRestoreHtml(Buffer.from(`<html><table>${headers}${row('Care review.')}</table></html>`))).toBe(false);
  });

  it('extracts structured messages when a long stylesheet precedes the viewer heading and table', async () => {
    const html = viewer(row('Care review.')).replace('body { color: #333; }', `/*${' stylesheet '.repeat(2048)}*/`);
    expect(html.indexOf('Conversation with:')).toBeGreaterThan(8192);
    const parsed = await parseArtifact('fixture', Buffer.from(html), 'text/html', 'messages.html');
    expect(parsed).toMatchObject({
      detected_mime_type: 'application/vnd.sms-backup-restore+html',
      extraction_method: 'sms_backup_html', extraction_status: 'success',
      extracted_text: 'Care review.',
    });
    expect(parsed.spans).toHaveLength(1);
    expect(parsed.spans[0]).toMatchObject({ source_kind: 'sms_message', source_record_index: 0 });
  });

  it.each(['before_header', 'message_body'])('fails closed for recognizable viewer HTML with invalid UTF-8 at %s', async position => {
    const html = viewer(row(position === 'message_body' ? 'TOKEN' : 'Care review.'));
    const offset = position === 'before_header' ? html.indexOf('body {') : html.indexOf('TOKEN');
    const bytes = Buffer.concat([Buffer.from(html.slice(0, offset)), Buffer.from([0xff]), Buffer.from(html.slice(offset))]);
    expect(isSmsBackupRestoreHtml(bytes)).toBe(true);
    const parsed = await parseArtifact('fixture', bytes, 'text/html', 'messages.html');
    expect(parsed).toMatchObject({
      detected_mime_type: 'application/vnd.sms-backup-restore+html',
      extraction_status: 'extraction_failed', extracted_text: '', spans: [],
    });
  });

  it('routes a recognizable oversized viewer to the size failure without raw HTML fallback', async () => {
    const bytes = Buffer.alloc(SMS_BACKUP_HTML_RULE_MANIFEST.max_bytes + 1, ' ');
    bytes.write(viewer(row('Care review.')));
    expect(isSmsBackupRestoreHtml(bytes)).toBe(true);
    const parsed = await parseArtifact('fixture', bytes, 'text/html', 'messages.html');
    expect(parsed).toMatchObject({
      detected_mime_type: 'application/vnd.sms-backup-restore+html',
      extraction_status: 'extraction_failed', extraction_error: 'sms_html_byte_limit_exceeded',
      extracted_text: '', spans: [],
    });
  });

  it('preserves multibyte text beyond the former short detection probe', async () => {
    const template = viewer(row('TOKEN'));
    const prefixBytes = Buffer.byteLength(template.slice(0, template.indexOf('TOKEN')));
    const html = template.replace('TOKEN', `${'x'.repeat(8191 - prefixBytes)}🧪 Care review.`);
    const bytes = Buffer.from(html);
    expect(bytes[8191]).toBe(0xf0);
    expect(isSmsBackupRestoreHtml(bytes)).toBe(true);
    const parsed = await parseArtifact('fixture', bytes, 'text/html');
    expect(parsed.extraction_method).toBe('sms_backup_html');
    expect(parsed.spans[0].text).toContain('🧪 Care review.');
  });
});
