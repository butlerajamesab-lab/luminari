import type { TextSpan } from './parsing-substrate';

export const SMS_BACKUP_FORMAT_VERSION = 'sms-backup-and-restore.v10.xml';

export const SMS_BACKUP_RULE_MANIFEST = {
  root_element: 'smses',
  signature: 'File Created By SMS Backup & Restore',
  supported_records: ['sms', 'mms'],
  sms_text_attribute: 'body',
  mms_text_part_content_type: 'text/plain',
  timestamp_attribute: 'date',
  direction_rules: {
    sms: { received: 'type=1', sent: 'type=2' },
    mms: { received: 'msg_box=1', sent: 'msg_box=2' },
  },
  external_entity_policy: 'reject_doctype_and_entity_declarations',
  raw_transport_metadata_policy: 'preserve_in_source_bytes_not_semantic_text',
  reaction_policy:
    'preserve_in_extracted_text_exclude_from_semantic_projection',
  max_records: 50_000,
  max_text_chars_per_record: 250_000,
} as const;

export type SmsDirection = 'received' | 'sent' | 'unknown';
export type SmsMessageKind = 'message' | 'reaction';

export function isSmsBackupRestoreXml(bytes: Buffer): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(sample);
  } catch {
    return false;
  }
  return (
    /<smses(?:\s|>)/i.test(decoded) &&
    /(?:File Created By SMS Backup & Restore|<(?:sms|mms)(?:\s|>))/i.test(
      decoded,
    )
  );
}

export function parseSmsBackupRestoreXml(
  bytes: Buffer,
  artifactKey: string,
): { text: string; spans: TextSpan[] } {
  const xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(xml)) {
    throw new Error('sms_backup_external_entity_declaration_rejected');
  }

  const rootStart = xml.search(/<smses(?:\s|>)/i);
  if (rootStart < 0) throw new Error('sms_backup_missing_smses_root');
  const rootTag = readStartTag(xml, rootStart);
  const rootAttributes = parseAttributes(rootTag.text);
  const declaredCount = parseBoundedInteger(rootAttributes.count);
  if (declaredCount === null)
    throw new Error('sms_backup_invalid_declared_count');
  if (declaredCount > SMS_BACKUP_RULE_MANIFEST.max_records) {
    throw new Error('sms_backup_record_limit_exceeded');
  }

  const records: Array<{
    text: string;
    occurred_at: string | null;
    direction: SmsDirection;
    contact_name: string | null;
    source_record_index: number;
    source_record_char_offset: number;
    message_kind: SmsMessageKind;
  }> = [];
  const recordPattern = /<(sms|mms)(?:\s|>)/gi;
  recordPattern.lastIndex = rootTag.end;
  let rootEnd = -1;
  for (const closing of xml.matchAll(/<\/smses\s*>/gi)) {
    rootEnd = closing.index;
  }
  if (rootEnd < rootTag.end) throw new Error('sms_backup_unclosed_smses_root');
  let recordMatch: RegExpExecArray | null;
  let seenRecordCount = 0;

  while ((recordMatch = recordPattern.exec(xml)) !== null) {
    if (recordMatch.index >= rootEnd) break;
    seenRecordCount++;
    if (seenRecordCount > SMS_BACKUP_RULE_MANIFEST.max_records) {
      throw new Error('sms_backup_record_limit_exceeded');
    }

    const recordTag = readStartTag(xml, recordMatch.index);
    const attributes = parseAttributes(recordTag.text);
    const recordName = recordMatch[1].toLowerCase();
    let text = '';

    if (recordName === 'sms') {
      text = attributes.body ?? '';
      recordPattern.lastIndex = recordTag.end;
    } else {
      const closeIndex = xml.indexOf('</mms>', recordTag.end);
      if (closeIndex < 0) throw new Error('sms_backup_unclosed_mms_record');
      const body = xml.substring(recordTag.end, closeIndex);
      const parts: string[] = [];
      const partPattern = /<part(?:\s|>)/gi;
      let partMatch: RegExpExecArray | null;
      while ((partMatch = partPattern.exec(body)) !== null) {
        const partTag = readStartTag(body, partMatch.index);
        const partAttributes = parseAttributes(partTag.text);
        if (partAttributes.ct?.toLowerCase() !== 'text/plain') continue;
        const partText = partAttributes.text ?? '';
        if (partText && partText.toLowerCase() !== 'null') parts.push(partText);
      }
      text = parts.join('\n');
      recordPattern.lastIndex = closeIndex + '</mms>'.length;
    }

    text = normalizeMessageText(text);
    if (!text) continue;
    if (text.length > SMS_BACKUP_RULE_MANIFEST.max_text_chars_per_record) {
      throw new Error('sms_backup_record_text_limit_exceeded');
    }

    records.push({
      text,
      occurred_at: normalizeEpochMilliseconds(attributes.date),
      direction: messageDirection(recordName, attributes),
      contact_name: normalizeOptionalMetadata(attributes.contact_name),
      source_record_index: seenRecordCount - 1,
      source_record_char_offset: recordMatch.index,
      message_kind: isReactionText(text) ? 'reaction' : 'message',
    });
  }

  if (seenRecordCount !== declaredCount) {
    throw new Error(
      `sms_backup_count_mismatch:declared=${declaredCount}:observed=${seenRecordCount}`,
    );
  }

  const spans: TextSpan[] = [];
  let extractedText = '';
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (extractedText) extractedText += '\n\n';
    const start = extractedText.length;
    extractedText += record.text;
    spans.push({
      text: record.text,
      start_offset: start,
      end_offset: extractedText.length,
      paragraph_index: index,
      source_artifact_key: artifactKey,
      source_kind: 'sms_message',
      source_record_index: record.source_record_index,
      source_record_char_offset: record.source_record_char_offset,
      message_direction: record.direction,
      message_kind: record.message_kind,
      ...(record.occurred_at ? { occurred_at: record.occurred_at } : {}),
      ...(record.contact_name
        ? { message_contact_name: record.contact_name }
        : {}),
    });
  }

  return { text: extractedText, spans };
}

function readStartTag(
  source: string,
  start: number,
): { text: string; end: number } {
  let quote: '"' | "'" | null = null;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') {
      return { text: source.substring(start, index + 1), end: index + 1 };
    }
  }
  throw new Error('sms_backup_unclosed_start_tag');
}

function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(tag)) !== null) {
    attributes[match[1]] = decodeXmlEntities(match[2] ?? match[3] ?? '');
  }
  return attributes;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) =>
      safeCodePoint(code, 16),
    )
    .replace(/&#(\d+);/g, (_, code: string) => safeCodePoint(code, 10))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function safeCodePoint(value: string, radix: number): string {
  const codePoint = Number.parseInt(value, radix);
  if (
    !Number.isInteger(codePoint) ||
    codePoint < 0 ||
    codePoint > 0x10ffff ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) {
    return '\uFFFD';
  }
  return String.fromCodePoint(codePoint);
}

function normalizeMessageText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

function normalizeEpochMilliseconds(value: string | undefined): string | null {
  if (!value || !/^\d{10,16}$/.test(value)) return null;
  const milliseconds = Number(value);
  if (!Number.isSafeInteger(milliseconds)) return null;
  const date = new Date(milliseconds);
  const year = date.getUTCFullYear();
  if (!Number.isFinite(date.getTime()) || year < 2000 || year > 2100)
    return null;
  return date.toISOString();
}

function messageDirection(
  recordName: string,
  attributes: Record<string, string>,
): SmsDirection {
  const value = recordName === 'sms' ? attributes.type : attributes.msg_box;
  if (value === '1') return 'received';
  if (value === '2') return 'sent';
  return 'unknown';
}

function normalizeOptionalMetadata(value: string | undefined): string | null {
  if (!value || value.toLowerCase() === 'null') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized || null;
}

function isReactionText(text: string): boolean {
  const normalized = text.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim();
  return (
    /^(?:Liked|Loved|Disliked|Emphasized|Questioned|Laughed at)\s+[“"]/i.test(
      normalized,
    ) || /^[^\p{L}\p{N}]{1,16}\s+to\s+[“"]/u.test(normalized)
  );
}

function parseBoundedInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
