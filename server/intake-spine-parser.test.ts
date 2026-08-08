import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import PDFDocument from 'pdfkit';
import { describe, expect, it } from 'vitest';

import {
  JSZIP_VERSION,
  PARSER_RULE_MANIFEST_HASH,
  PARSER_VERSION,
  PDF_PARSE_VERSION,
  parseArtifact,
} from './engines/intake-spine/parsing-substrate';

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
    expect(PARSER_VERSION).toContain('pdf-parse@2.4.5');
    expect(PARSER_VERSION).toContain('jszip@3.10.1');
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
});
