import type { TextSpan } from './parsing-substrate';
import { isReactionText } from './sms-backup-substrate';

export const SMS_BACKUP_HTML_FORMAT_VERSION = 'sms-backup-and-restore.viewer-html.v1';
export const SMS_BACKUP_HTML_RULE_MANIFEST = {
  format_version: SMS_BACKUP_HTML_FORMAT_VERSION,
  signature: 'Conversation with:',
  headers: ['Type', 'Date', 'Name / Number', 'Content'],
  max_bytes: 25 * 1024 * 1024,
  detection_policy: 'scan_entire_document_up_to_max_bytes_utf8_replacement_for_signature_only_then_strict_full_document_parse',
  max_records: 50_000,
  max_text_chars_per_record: 250_000,
  timestamp_format: 'English_Mmm_D_YYYY_h_mm_ss_AM_PM',
  timestamp_policy: 'preserve_local_datetime_timezone_unknown_no_utc_inference',
  contact_policy: 'row_contact_is_correspondent_not_automatically_message_author',
  external_content_policy: 'never_load_images_links_or_other_resources_reject_active_elements',
  empty_record_policy: 'preserve_empty_row_span',
  reaction_policy: 'same_as_sms_backup_xml',
  named_entities: {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
    ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
    hellip: '…', copy: '©', reg: '®', trade: '™', bull: '•',
  },
} as const;

export function isSmsBackupRestoreHtml(bytes: Buffer): boolean {
  // Viewer styles can precede the table by far more than a small MIME probe.
  // Cap detection at the supported file size, including for oversized input.
  // Replacement decoding is only for recognition: the parser enforces both
  // the size limit and strict UTF-8, so malformed viewers cannot fall back to
  // generic HTML text merely because their encoding is invalid.
  const sample = new TextDecoder('utf-8').decode(bytes.subarray(0, SMS_BACKUP_HTML_RULE_MANIFEST.max_bytes));
  return /<html(?:\s|>)/i.test(sample)
    && /Conversation with:/i.test(sample)
    && /<table(?:\s|>)/i.test(sample)
    && /<th(?:\s[^>]*)?>\s*Type\s*<\/th\s*>/i.test(sample);
}

type HtmlToken = { text: string; start: number } | { tag: string; closing: boolean; selfClosing: boolean; start: number };

// A bounded structural tokenizer, not a browser: attributes are never executed
// or fetched. Quoted attribute delimiters cannot become table delimiters.
function* tokens(html: string): Generator<HtmlToken> {
  let position = 0;
  while (position < html.length) {
    const start = html.indexOf('<', position);
    if (start < 0) {
      yield { text: html.slice(position), start: position };
      return;
    }
    if (start > position) yield { text: html.slice(position, start), start: position };
    if (html.startsWith('<!--', start)) {
      const end = html.indexOf('-->', start + 4);
      if (end < 0) throw new Error('sms_html_unclosed_comment');
      position = end + 3;
      continue;
    }
    const match = /^<(\/)?([A-Za-z][A-Za-z0-9:-]*)(?=[\s/>])/.exec(html.slice(start));
    if (!match) {
      if (/^<!doctype\s+html\s*>/i.test(html.slice(start))) {
        position = html.indexOf('>', start) + 1;
        continue;
      }
      if (/^<!/i.test(html.slice(start))) throw new Error('sms_html_declaration_rejected');
      yield { text: '<', start };
      position = start + 1;
      continue;
    }
    let quote: string | null = null;
    let end = start + match[0].length;
    for (; end < html.length; end++) {
      const char = html[end];
      if (quote) { if (char === quote) quote = null; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end >= html.length) throw new Error('sms_html_unclosed_tag');
    const tag = match[2].toLowerCase();
    const closing = Boolean(match[1]);
    position = end + 1;
    if (['script', 'iframe', 'object', 'embed'].includes(tag)) throw new Error('sms_html_active_element_rejected');
    if (tag === 'style' && !closing) {
      const close = /<\/style\s*>/gi;
      close.lastIndex = position;
      const found = close.exec(html);
      if (!found) throw new Error('sms_html_unclosed_style');
      position = close.lastIndex;
      continue;
    }
    yield { tag, closing, selfClosing: /\/\s*>$/.test(html.slice(start, end + 1)), start };
  }
}

function decode_entities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (original, entity: string) => {
    if (entity.startsWith('#')) {
      const hexadecimal = /^#x/i.test(entity);
      const code = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '\uFFFD';
      return String.fromCodePoint(code);
    }
    return SMS_BACKUP_HTML_RULE_MANIFEST.named_entities[entity as keyof typeof SMS_BACKUP_HTML_RULE_MANIFEST.named_entities] ?? original;
  });
}

function normalize_text(value: string): string {
  return decode_entities(value).replace(/\r\n?/g, '\n').replace(/\u0000/g, '')
    .split('\n').map(line => line.trimEnd()).join('\n').trim();
}

function local_datetime(value: string): string {
  const match = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}), (\d{4}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$/.exec(value);
  if (!match) throw new Error('sms_html_invalid_local_timestamp');
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(match[1]) + 1;
  const day = Number(match[2]);
  const year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (year < 2000 || year > 2100 || day < 1 || calendar.getUTCMonth() !== month - 1
    || hour < 1 || hour > 12 || minute > 59 || second > 59) throw new Error('sms_html_invalid_local_timestamp');
  const localHour = hour % 12 + (match[7] === 'PM' ? 12 : 0);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(localHour)}:${pad(minute)}:${pad(second)}`;
}

export function parseSmsBackupRestoreHtml(bytes: Buffer, artifactKey: string): { text: string; spans: TextSpan[] } {
  if (bytes.length > SMS_BACKUP_HTML_RULE_MANIFEST.max_bytes) throw new Error('sms_html_byte_limit_exceeded');
  const html = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  let inTable = false;
  let tables = 0;
  let headerSeen = false;
  let heading: string | null = null;
  let conversationHeading = false;
  let row: { start: number; cells: Array<{ kind: string; text: string }> } | null = null;
  let cell: { kind: string; text: string } | null = null;
  let text = '';
  const spans: TextSpan[] = [];

  for (const token of tokens(html)) {
    if ('text' in token) {
      if (cell) {
        cell.text += token.text;
        if (cell.text.length > SMS_BACKUP_HTML_RULE_MANIFEST.max_text_chars_per_record) throw new Error('sms_html_record_text_limit_exceeded');
      } else if (heading !== null) heading += token.text;
      else if (row && token.text.trim()) throw new Error('sms_html_text_outside_cell');
      continue;
    }
    const { tag, closing } = token;
    if (tag === 'h2' && !inTable) {
      if (!closing) heading = '';
      else { conversationHeading ||= /^Conversation with:\s*\S/i.test(normalize_text(heading ?? '')); heading = null; }
    } else if (tag === 'table') {
      if (!closing) {
        if (inTable || ++tables > 1) throw new Error('sms_html_multiple_tables');
        inTable = true;
      } else {
        if (!inTable || row || cell) throw new Error('sms_html_invalid_table_structure');
        inTable = false;
      }
    } else if (tag === 'tr') {
      if (!inTable) throw new Error('sms_html_row_outside_table');
      if (!closing) {
        if (row || cell) throw new Error('sms_html_nested_row');
        row = { start: token.start, cells: [] };
      } else {
        if (!row || cell || row.cells.length !== 4) throw new Error('sms_html_invalid_row_shape');
        const values = row.cells.map(value => normalize_text(value.text));
        if (!headerSeen) {
          if (row.cells.some(value => value.kind !== 'th') || values.some((value, index) => value !== SMS_BACKUP_HTML_RULE_MANIFEST.headers[index])) throw new Error('sms_html_invalid_headers');
          headerSeen = true;
        } else {
          if (row.cells.some(value => value.kind !== 'td')) throw new Error('sms_html_invalid_data_cells');
          if (spans.length >= SMS_BACKUP_HTML_RULE_MANIFEST.max_records) throw new Error('sms_html_record_limit_exceeded');
          const directionText = values[0].replace(/\s+/g, ' ');
          const direction = /^Received(?: Sent by: .+)?$/i.test(directionText) ? 'received'
            : /^Sent(?: Sent by: .+)?$/i.test(directionText) ? 'sent' : 'unknown';
          const contact = values[2].replace(/\s*\(\+?[\d ()-]{7,}\)\s*$/, '').replace(/\s+/g, ' ').trim();
          const occurredAtLocal = local_datetime(values[1]);
          if (spans.length) text += '\n\n';
          const start = text.length;
          text += values[3];
          spans.push({
            text: values[3], start_offset: start, end_offset: text.length,
            paragraph_index: spans.length, source_artifact_key: artifactKey,
            source_kind: 'sms_message', source_record_index: spans.length,
            source_record_char_offset: row.start,
            message_direction: direction, message_kind: isReactionText(values[3]) ? 'reaction' : 'message',
            ...(contact ? { message_contact_name: contact } : {}),
            occurred_at_local: occurredAtLocal, occurred_at_timezone: 'unknown', source_timestamp_text: values[1],
          });
        }
        row = null;
      }
    } else if (tag === 'td' || tag === 'th') {
      if (!row) throw new Error('sms_html_cell_outside_row');
      if (!closing) {
        if (cell) throw new Error('sms_html_nested_cell');
        cell = { kind: tag, text: '' };
      } else {
        if (!cell || cell.kind !== tag) throw new Error('sms_html_mismatched_cell');
        row.cells.push(cell);
        cell = null;
      }
    } else if (tag === 'br' && !closing) {
      if (cell) cell.text += '\n';
      else if (heading !== null) heading += '\n';
    } else if (cell && ['p', 'div'].includes(tag)) {
      cell.text += '\n';
    }
  }
  if (inTable || row || cell || !headerSeen || !conversationHeading || tables !== 1) throw new Error('sms_html_incomplete_viewer');
  return { text, spans };
}
