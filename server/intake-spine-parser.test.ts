import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import PDFDocument from 'pdfkit';
import { describe, expect, it } from 'vitest';

import {
  HEIC_CONVERT_VERSION,
  TESSERACT_ENG_DATA_VERSION,
  TESSERACT_JS_VERSION,
} from './engines/intake-spine/ocr-substrate';
import {
  JSZIP_VERSION,
  PARSER_RULE_MANIFEST_HASH,
  PARSER_VERSION,
  PDF_PARSE_VERSION,
  parseArtifact,
} from './engines/intake-spine/parsing-substrate';
import { semanticSpansForArtifact } from './engines/intake-spine/semantic-substrate';

const OCR_FIXTURE_PNG = Buffer.from(
  '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',
  'base64',
);

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function makePdf(text: string): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      autoFirstPage: true,
      info: {
        Title: 'Intake Spine deterministic parser fixture',
        Author: 'Luminari',
        CreationDate: new Date('2000-01-01T00:00:00.000Z'),
        ModDate: new Date('2000-01-01T00:00:00.000Z'),
      },
    });
    doc.on('data', chunk => chunks.push(Buffer.from(chunk)));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.text(text);
    doc.end();
  });
}

async function makeDocx(): Promise<Buffer> {
  const zip = new JSZip();
  const fixtureDate = new Date('2000-01-01T00:00:00.000Z');
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    { date: fixtureDate },
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Cheryl</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>Thompson</w:t></w:r><w:r><w:br/></w:r><w:r><w:t>was terminated.</w:t></w:r></w:p><w:p><w:r><w:t>January 15, 2025</w:t></w:r></w:p></w:body></w:document>',
    { date: fixtureDate },
  );
  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

describe('Universal Intake Spine parser substrate', () => {
  it('uses exact pinned parser dependency identities', () => {
    expect(PDF_PARSE_VERSION).toBe('2.4.5');
    expect(JSZIP_VERSION).toBe('3.10.1');
    expect(TESSERACT_JS_VERSION).toBe('7.0.0');
    expect(TESSERACT_ENG_DATA_VERSION).toBe('1.0.0');
    expect(HEIC_CONVERT_VERSION).toBe('2.1.0');
    expect(PARSER_VERSION).toContain('pdf-parse@2.4.5');
    expect(PARSER_VERSION).toContain('jszip@3.10.1');
    expect(PARSER_VERSION).toContain('tesseract.js@7.0.0');
    expect(PARSER_VERSION).toContain('eng@1.0.0');
    expect(PARSER_VERSION).toContain('heic-convert@2.1.0');
    expect(PARSER_RULE_MANIFEST_HASH).toMatch(/^[0-9a-f]{64}$/);
  });

  it('parses and replays real PDF bytes through pdf-parse 2.4.5', async () => {
    const bytes = await makePdf('Cheryl Thompson was terminated on January 15, 2025.');
    const first = await parseArtifact('pdf_fixture', bytes, 'application/octet-stream');
    const replay = await parseArtifact('pdf_fixture', bytes, 'application/octet-stream');

    expect(first.raw_bytes_sha256).toBe(sha256(bytes));
    expect(first.detected_mime_type).toBe('application/pdf');
    expect(first.mime_type).toBe('application/pdf');
    expect(first.extraction_status).toBe('success');
    expect(first.extracted_text).toContain('Cheryl Thompson');
    expect(first.extracted_text).toContain('January 15, 2025');
    expect(first.spans.length).toBeGreaterThan(0);
    expect(first.spans.every(span => span.source_artifact_key === 'pdf_fixture')).toBe(true);
    expect(replay).toEqual(first);
  });

  it('detects DOCX from ZIP directory entries and preserves token order', async () => {
    const bytes = await makeDocx();
    const parsed = await parseArtifact('docx_fixture', bytes, 'application/zip');

    expect(parsed.raw_bytes_sha256).toBe(sha256(bytes));
    expect(parsed.detected_mime_type).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(parsed.extraction_status).toBe('success');
    expect(parsed.extracted_text).toBe('Cheryl\tThompson\nwas terminated.\nJanuary 15, 2025');
    expect(parsed.spans).toEqual([
      {
        text: 'Cheryl\tThompson\nwas terminated.',
        start_offset: 0,
        end_offset: 'Cheryl\tThompson\nwas terminated.'.length,
        paragraph_index: 0,
        source_artifact_key: 'docx_fixture',
      },
      {
        text: 'January 15, 2025',
        start_offset: 'Cheryl\tThompson\nwas terminated.'.length + 1,
        end_offset: 'Cheryl\tThompson\nwas terminated.'.length + 1 + 'January 15, 2025'.length,
        paragraph_index: 1,
        source_artifact_key: 'docx_fixture',
      },
    ]);
  });

  it('preserves a valid generic ZIP as unsupported instead of converting preservation into an error', async () => {
    const zip = new JSZip();
    zip.file('photo-metadata.json', '{"fixture":true}', { date: new Date('2000-01-01T00:00:00.000Z') });
    const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const parsed = await parseArtifact('zip_fixture', bytes, 'application/zip');

    expect(parsed.detected_mime_type).toBe('application/zip');
    expect(parsed.mime_type).toBe('application/zip');
    expect(parsed.extraction_status).toBe('unsupported_format');
    expect(parsed.extracted_text).toBe('');
    expect(parsed.spans).toEqual([]);
  });

  it('parses SMS Backup & Restore XML into message-only text with exact provenance', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<!--File Created By SMS Backup & Restore v10.21.004-->
<smses count="3">
  <sms protocol="0" address="+12065550100" date="1788134400000" type="1" body="Rick was admitted to the nursing home &amp; needs water." contact_name="Cheryl" />
  <sms protocol="0" address="+12065550100" date="1788134460000" type="2" body="Liked &quot;Rick was admitted to the nursing home&quot;" contact_name="Cheryl" />
  <mms date="1788134520000" msg_box="2" contact_name="Cheryl"><parts><part seq="0" ct="text/plain" text="The nursing home scheduled a care conference."/><part seq="1" ct="image/jpeg" text="null"/></parts><addrs><addr address="+12065550100"/></addrs></mms>
</smses>`;
    const parsed = await parseArtifact(
      'sms_fixture',
      Buffer.from(xml, 'utf8'),
      'application/octet-stream',
      'messages.xml',
    );

    expect(parsed.detected_mime_type).toBe('application/vnd.sms-backup-restore+xml');
    expect(parsed.extraction_status).toBe('success');
    expect(parsed.extraction_method).toBe('sms_backup_xml');
    expect(parsed.source_filename).toBe('messages.xml');
    expect(parsed.extracted_text).toContain('nursing home & needs water');
    expect(parsed.extracted_text).not.toMatch(/<(?:sms|mms|part|addr)(?:\s|>)/i);
    expect(parsed.extracted_text).not.toContain('+12065550100');
    expect(parsed.extracted_text).not.toContain('protocol=');
    expect(parsed.spans.map(span => span.source_record_index)).toEqual([0, 1, 2]);
    expect(parsed.spans.map(span => span.message_direction)).toEqual(['received', 'sent', 'sent']);
    expect(parsed.spans.map(span => span.message_kind)).toEqual(['message', 'reaction', 'message']);
    expect(parsed.spans[0]).toMatchObject({
      source_kind: 'sms_message',
      occurred_at: '2026-08-31T00:00:00.000Z',
      message_contact_name: 'Cheryl',
    });
    const semantic = semanticSpansForArtifact(parsed, [parsed], 'entities');
    expect(semantic.some(span => span.message_kind === 'reaction')).toBe(false);
    expect(semantic.map(span => span.text).join(' ')).toContain('care conference');
  });

  it('fails closed for external entity declarations and record-count mismatch', async () => {
    const externalEntity = Buffer.from(
      '<?xml version="1.0"?><!DOCTYPE smses [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><smses count="1"><sms body="&xxe;" date="1788134400000" type="1"/></smses>',
      'utf8',
    );
    const countMismatch = Buffer.from(
      '<?xml version="1.0"?><!--File Created By SMS Backup & Restore--><smses count="2"><sms body="care conference" date="1788134400000" type="1"/></smses>',
      'utf8',
    );

    const rejectedEntity = await parseArtifact('sms_xxe', externalEntity, 'text/xml');
    const rejectedCount = await parseArtifact('sms_count', countMismatch, 'text/xml');

    expect(rejectedEntity.extraction_status).toBe('extraction_failed');
    expect(rejectedEntity.extraction_error).toBe('sms_backup_external_entity_declaration_rejected');
    expect(rejectedEntity.extracted_text).toBe('');
    expect(rejectedCount.extraction_status).toBe('extraction_failed');
    expect(rejectedCount.extraction_error).toBe('sms_backup_count_mismatch:declared=2:observed=1');
  });

  it('OCRs standalone PNG evidence with page provenance', async () => {
    const parsed = await parseArtifact(
      'ocr_fixture',
      OCR_FIXTURE_PNG,
      'application/octet-stream',
      'lighthouse.png',
    );

    expect(parsed.detected_mime_type).toBe('image/png');
    expect(parsed.extraction_status).toBe('success');
    expect(parsed.extraction_method).toBe('tesseract_ocr');
    expect(parsed.extracted_text).toMatch(/LIGHTHOUSE OCR/i);
    expect(parsed.spans.length).toBeGreaterThan(0);
    expect(parsed.spans.every(span => span.source_kind === 'ocr_page' && span.page === 1)).toBe(true);
  }, 30_000);

  it('OCRs safe image archives and rejects traversal members before extraction', async () => {
    const safe = new JSZip();
    safe.file('evidence/lighthouse.png', OCR_FIXTURE_PNG, { date: new Date('2000-01-01T00:00:00.000Z') });
    const safeBytes = await safe.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const parsed = await parseArtifact('ocr_archive', safeBytes, 'application/zip', 'evidence.zip');

    expect(parsed.extraction_status).toBe('success');
    expect(parsed.extraction_method).toBe('tesseract_archive_ocr');
    expect(parsed.extracted_text).toMatch(/LIGHTHOUSE OCR/i);
    expect(parsed.spans.every(span => span.source_kind === 'archive_ocr_page')).toBe(true);
    expect(parsed.spans[0]).toMatchObject({
      archive_member_path: 'evidence/lighthouse.png',
      archive_member_filename: 'lighthouse.png',
      page: 1,
    });

    const unsafe = new JSZip();
    unsafe.file('../escape.png', OCR_FIXTURE_PNG, { date: new Date('2000-01-01T00:00:00.000Z') });
    const unsafeBytes = await unsafe.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const rejected = await parseArtifact('ocr_archive_unsafe', unsafeBytes, 'application/zip');
    expect(rejected.extraction_status).toBe('extraction_failed');
    expect(rejected.extraction_error).toBe('ocr_archive_unsafe_member_path');
  }, 30_000);
});
