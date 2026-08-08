import crypto from 'crypto';
import { computeRuleManifestHash } from './utils';

export interface TextSpan {
  text: string;
  start_offset: number;
  end_offset: number;
  page?: number;
  paragraph_index?: number;
  source_artifact_key: string;
}

export interface ParsedArtifact {
  artifact_key: string;
  raw_bytes_sha256: string;
  declared_mime_type: string;
  detected_mime_type: string | null;
  mime_type: string;
  byte_size: number;
  extracted_text: string;
  spans: TextSpan[];
  extraction_status: 'success' | 'unsupported_format' | 'extraction_failed';
  extraction_error?: string;
  parser_version: string;
  rule_version: string;
  parser_rule_manifest_hash: string;
}

export const PDF_PARSE_VERSION = '2.4.5';
export const JSZIP_VERSION = '3.10.1';
export const PARSER_VERSION = `luminari.intake.parser.v2.1.0+pdf-parse@${PDF_PARSE_VERSION}+jszip@${JSZIP_VERSION}`;
export const RULE_VERSION = '2.1.0';

export const PARSER_RULE_MANIFEST = {
  mime_detection: {
    pdf_magic: [0x25, 0x50, 0x44, 0x46],
    zip_magic: [0x50, 0x4b, 0x03, 0x04],
    docx_required_entries: ['[Content_Types].xml', 'word/document.xml'],
    text_probe_bytes: 4096,
    text_encoding: 'utf-8-fatal',
    disallowed_text_controls: 'u0000-u0008,u000b,u000c,u000e-u001f',
  },
  pdf: {
    dependency: `pdf-parse@${PDF_PARSE_VERSION}`,
    api: 'new PDFParse({data}) -> getText() -> destroy()',
    paragraph_separator: '\\n\\n+',
  },
  docx: {
    dependency: `jszip@${JSZIP_VERSION}`,
    document_entry: 'word/document.xml',
    paragraph_tag: 'w:p',
    token_order: ['w:t', 'w:tab', 'w:br', 'w:cr'],
    paragraph_separator: '\\n',
  },
  unsupported_format_policy: 'preserve_with_unsupported_format',
  extraction_failure_policy: 'preserve_with_extraction_failed',
} as const;

export const PARSER_RULE_MANIFEST_HASH = computeRuleManifestHash(PARSER_RULE_MANIFEST);

export async function parseArtifact(
  artifact_key: string,
  bytes: Buffer,
  declared_mime_type: string,
): Promise<ParsedArtifact> {
  const raw_bytes_sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const byte_size = bytes.length;
  const normalizedDeclaredMime = declared_mime_type.trim().toLowerCase() || 'application/octet-stream';
  const detected_mime_type = await detectMimeFromBytes(bytes);
  const effective_mime = detected_mime_type || normalizedDeclaredMime;

  const base = {
    artifact_key,
    raw_bytes_sha256,
    declared_mime_type: normalizedDeclaredMime,
    detected_mime_type,
    mime_type: effective_mime,
    byte_size,
    parser_version: PARSER_VERSION,
    rule_version: RULE_VERSION,
    parser_rule_manifest_hash: PARSER_RULE_MANIFEST_HASH,
  };

  try {
    if (effective_mime === 'application/pdf') {
      const result = await parsePdf(bytes, artifact_key);
      return {
        ...base,
        extracted_text: result.text,
        spans: result.spans,
        extraction_status: 'success',
      };
    }

    if (effective_mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await parseDocx(bytes, artifact_key);
      return {
        ...base,
        extracted_text: result.text,
        spans: result.spans,
        extraction_status: 'success',
      };
    }

    if (effective_mime.startsWith('text/')) {
      const text = decodeUtf8(bytes);
      return {
        ...base,
        extracted_text: text,
        spans: textLineSpans(text, artifact_key),
        extraction_status: 'success',
      };
    }

    return {
      ...base,
      extracted_text: '',
      spans: [],
      extraction_status: 'unsupported_format',
    };
  } catch (error: unknown) {
    return {
      ...base,
      extracted_text: '',
      spans: [],
      extraction_status: 'extraction_failed',
      extraction_error: error instanceof Error ? error.message : 'unknown_extraction_error',
    };
  }
}

async function parsePdf(
  bytes: Buffer,
  artifact_key: string,
): Promise<{ text: string; spans: TextSpan[] }> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const result = await parser.getText();
    const fullText = result.text || '';
    const spans: TextSpan[] = [];
    let searchOffset = 0;

    for (let pageIdx = 0; pageIdx < result.pages.length; pageIdx++) {
      const page = result.pages[pageIdx];
      const pageText = page.text || '';
      const paragraphs = pageText.split(/\n\n+/);
      for (let paraIdx = 0; paraIdx < paragraphs.length; paraIdx++) {
        const para = paragraphs[paraIdx].trim();
        if (!para) continue;
        const located = fullText.indexOf(para, searchOffset);
        if (located < 0) {
          throw new Error(`pdf_span_alignment_failed:page=${pageIdx + 1}:paragraph=${paraIdx}`);
        }
        spans.push({
          text: para,
          start_offset: located,
          end_offset: located + para.length,
          page: typeof page.num === 'number' ? page.num : pageIdx + 1,
          paragraph_index: paraIdx,
          source_artifact_key: artifact_key,
        });
        searchOffset = located + para.length;
      }
    }
    return { text: fullText, spans };
  } finally {
    await parser.destroy();
  }
}

async function parseDocx(
  bytes: Buffer,
  artifact_key: string,
): Promise<{ text: string; spans: TextSpan[] }> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const docXml = zip.file('word/document.xml');
  if (!docXml) throw new Error('docx_missing_word_document_xml');

  const xmlContent = await docXml.async('string');
  const paragraphs: string[] = [];
  const paragraphRegex = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g;
  const tokenRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br(?:\s[^>]*)?\s*\/>|<w:cr\s*\/>/g;

  let paragraphMatch: RegExpExecArray | null;
  while ((paragraphMatch = paragraphRegex.exec(xmlContent)) !== null) {
    let paragraphText = '';
    tokenRegex.lastIndex = 0;
    let tokenMatch: RegExpExecArray | null;
    while ((tokenMatch = tokenRegex.exec(paragraphMatch[1])) !== null) {
      const token = tokenMatch[0];
      if (token.startsWith('<w:t')) paragraphText += decodeXmlEntities(tokenMatch[1] || '');
      else if (token.startsWith('<w:tab')) paragraphText += '\t';
      else paragraphText += '\n';
    }
    if (paragraphText.trim()) paragraphs.push(paragraphText);
  }

  const text = paragraphs.join('\n');
  const spans: TextSpan[] = [];
  let offset = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];
    spans.push({
      text: paragraph,
      start_offset: offset,
      end_offset: offset + paragraph.length,
      paragraph_index: i,
      source_artifact_key: artifact_key,
    });
    offset += paragraph.length + (i < paragraphs.length - 1 ? 1 : 0);
  }
  return { text, spans };
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

async function detectMimeFromBytes(bytes: Buffer): Promise<string | null> {
  if (bytes.length < 4) return detectTextMime(bytes);

  if (matchesMagic(bytes, PARSER_RULE_MANIFEST.mime_detection.pdf_magic)) {
    return 'application/pdf';
  }

  if (matchesMagic(bytes, PARSER_RULE_MANIFEST.mime_detection.zip_magic)) {
    const JSZip = (await import('jszip')).default;
    try {
      const zip = await JSZip.loadAsync(bytes);
      const hasDocxEntries = PARSER_RULE_MANIFEST.mime_detection.docx_required_entries.every(entry => Boolean(zip.file(entry)));
      return hasDocxEntries
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/zip';
    } catch {
      // ZIP magic is source truth even when the central directory is damaged.
      // Parsing is unsupported here; preservation remains intact.
      return 'application/zip';
    }
  }

  return detectTextMime(bytes);
}

function detectTextMime(bytes: Buffer): string | null {
  const sample = bytes.subarray(0, Math.min(PARSER_RULE_MANIFEST.mime_detection.text_probe_bytes, bytes.length));
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(sample);
    if (/[ --]/.test(decoded)) return null;
    return 'text/plain';
  } catch {
    return null;
  }
}

function matchesMagic(bytes: Buffer, magic: readonly number[]): boolean {
  return magic.every((value, index) => bytes[index] === value);
}

function decodeUtf8(bytes: Buffer): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function textLineSpans(text: string, artifact_key: string): TextSpan[] {
  const spans: TextSpan[] = [];
  let offset = 0;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim()) {
      spans.push({
        text: line,
        start_offset: offset,
        end_offset: offset + line.length,
        paragraph_index: i,
        source_artifact_key: artifact_key,
      });
    }
    offset += line.length + (i < lines.length - 1 ? 1 : 0);
  }
  return spans;
}
