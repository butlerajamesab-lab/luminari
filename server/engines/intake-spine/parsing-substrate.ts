import crypto from 'crypto';

// ─── Types ───────────────────────────────────────────────────────────────────

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
  /** SHA-256 of the raw bytes (not canonical JSON — actual binary hash) */
  raw_bytes_sha256: string;
  mime_type: string;
  byte_size: number;
  extracted_text: string;
  spans: TextSpan[];
  extraction_status: 'success' | 'unsupported_format' | 'extraction_failed';
  extraction_error?: string;
  parser_version: string;
  rule_version: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const PARSER_VERSION = '2.0.0';
export const RULE_VERSION = '2.0.0';

// ─── Core Parser ─────────────────────────────────────────────────────────────

/**
 * Shared Parsing Substrate
 * 
 * Accepts raw artifact bytes and produces a canonical parsed representation.
 * This is the ONLY place document parsing happens. All downstream layers
 * consume this output — they never independently parse source bytes.
 * 
 * Contract: same bytes + same mime_type + same parser_version → identical output
 */
export async function parseArtifact(
  artifact_key: string,
  bytes: Buffer,
  declared_mime_type: string
): Promise<ParsedArtifact> {
  // SHA-256 over exact raw bytes — not canonical JSON, not UTF-8 conversion
  const raw_bytes_sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const byte_size = bytes.length;

  // Validate MIME from magic bytes (not trusting declared type alone)
  const detected_mime = detectMimeFromBytes(bytes);
  const effective_mime = detected_mime || declared_mime_type;

  try {
    if (effective_mime === 'application/pdf') {
      const result = await parsePdf(bytes, artifact_key);
      return {
        artifact_key,
        raw_bytes_sha256,
        mime_type: effective_mime,
        byte_size,
        extracted_text: result.text,
        spans: result.spans,
        extraction_status: 'success',
        parser_version: PARSER_VERSION,
        rule_version: RULE_VERSION,
      };
    }

    if (effective_mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await parseDocx(bytes, artifact_key);
      return {
        artifact_key,
        raw_bytes_sha256,
        mime_type: effective_mime,
        byte_size,
        extracted_text: result.text,
        spans: result.spans,
        extraction_status: 'success',
        parser_version: PARSER_VERSION,
        rule_version: RULE_VERSION,
      };
    }

    if (effective_mime.startsWith('text/')) {
      const text = bytes.toString('utf-8');
      const spans: TextSpan[] = text.split('\n').map((line, i, arr) => {
        const start = arr.slice(0, i).join('\n').length + (i > 0 ? 1 : 0);
        return {
          text: line,
          start_offset: start,
          end_offset: start + line.length,
          paragraph_index: i,
          source_artifact_key: artifact_key,
        };
      }).filter(s => s.text.trim().length > 0);

      return {
        artifact_key,
        raw_bytes_sha256,
        mime_type: effective_mime,
        byte_size,
        extracted_text: text,
        spans,
        extraction_status: 'success',
        parser_version: PARSER_VERSION,
        rule_version: RULE_VERSION,
      };
    }

    // Unsupported format — preserve honestly
    return {
      artifact_key,
      raw_bytes_sha256,
      mime_type: effective_mime,
      byte_size,
      extracted_text: '',
      spans: [],
      extraction_status: 'unsupported_format',
      parser_version: PARSER_VERSION,
      rule_version: RULE_VERSION,
    };
  } catch (error: any) {
    return {
      artifact_key,
      raw_bytes_sha256,
      mime_type: effective_mime,
      byte_size,
      extracted_text: '',
      spans: [],
      extraction_status: 'extraction_failed',
      extraction_error: error?.message || 'unknown error',
      parser_version: PARSER_VERSION,
      rule_version: RULE_VERSION,
    };
  }
}

// ─── PDF Parser ──────────────────────────────────────────────────────────────

async function parsePdf(
  bytes: Buffer,
  artifact_key: string
): Promise<{ text: string; spans: TextSpan[] }> {
  // pdf-parse 2.4.5 uses class-based API:
  // new PDFParse({ data }) → getText() → destroy()
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  const result = await parser.getText();
  await parser.destroy();

  const spans: TextSpan[] = [];
  let offset = 0;

  // getText() returns { pages: [{num, text}], text: string, total: number }
  for (let pageIdx = 0; pageIdx < result.pages.length; pageIdx++) {
    const pageText = result.pages[pageIdx].text;
    const paragraphs = pageText.split(/\n\n+/);

    for (let paraIdx = 0; paraIdx < paragraphs.length; paraIdx++) {
      const para = paragraphs[paraIdx].trim();
      if (para.length === 0) continue;

      const paraStart = result.text.indexOf(para, offset);
      const start = paraStart >= 0 ? paraStart : offset;

      spans.push({
        text: para,
        start_offset: start,
        end_offset: start + para.length,
        page: pageIdx + 1,
        paragraph_index: paraIdx,
        source_artifact_key: artifact_key,
      });

      offset = start + para.length;
    }
  }

  return { text: result.text, spans };
}

// ─── DOCX Parser ─────────────────────────────────────────────────────────────

async function parseDocx(
  bytes: Buffer,
  artifact_key: string
): Promise<{ text: string; spans: TextSpan[] }> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(bytes);

  const docXml = zip.file('word/document.xml');
  if (!docXml) {
    throw new Error('DOCX missing word/document.xml');
  }

  const xmlContent = await docXml.async('string');

  // Extract text from XML paragraph elements (<w:p>...</w:p>)
  // Parse text/tab/break tokens in XML DOCUMENT ORDER.
  // <w:t> = text content, <w:tab/> = tab, <w:br/> = line break
  // These must be processed as they appear in the XML, not post-hoc.
  const paragraphs: string[] = [];
  const pRegex = /<w:p[^>]*>([\s\S]*?)<\/w:p>/g;
  // Token regex matches text runs, tabs, and breaks in document order
  const tokenRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g;

  let pMatch: RegExpExecArray | null;
  while ((pMatch = pRegex.exec(xmlContent)) !== null) {
    const pContent = pMatch[1];
    let paraText = '';
    let tokenMatch: RegExpExecArray | null;
    tokenRegex.lastIndex = 0;
    while ((tokenMatch = tokenRegex.exec(pContent)) !== null) {
      const fullMatch = tokenMatch[0];
      if (fullMatch.startsWith('<w:t')) {
        // Text run — decode XML entities
        paraText += decodeXmlEntities(tokenMatch[1]);
      } else if (fullMatch.includes('w:tab')) {
        paraText += '\t';
      } else if (fullMatch.includes('w:br')) {
        paraText += '\n';
      }
    }
    if (paraText.trim().length > 0) {
      paragraphs.push(paraText);
    }
  }

  const fullText = paragraphs.join('\n');
  const spans: TextSpan[] = [];
  let offset = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    spans.push({
      text: para,
      start_offset: offset,
      end_offset: offset + para.length,
      paragraph_index: i,
      source_artifact_key: artifact_key,
    });
    offset += para.length + 1;
  }

  return { text: fullText, spans };
}

// ─── XML Entity Decoding ────────────────────────────────────────────────────

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

// ─── MIME Detection ──────────────────────────────────────────────────────────

function detectMimeFromBytes(bytes: Buffer): string | null {
  if (bytes.length < 4) return null;

  // PDF: starts with %PDF
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'application/pdf';
  }

  // ZIP (DOCX, XLSX, etc.): starts with PK\x03\x04
  if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) {
    // Use JSZip to inspect the archive for word/document.xml directly
    // This avoids the 4KB header scan that can miss valid DOCX files
    // depending on ZIP layout. Synchronous check via central directory.
    try {
      const JSZip = require('jszip');
      // We can't do async in a sync function, so check the raw bytes
      // for the central directory entry 'word/document.xml'
      const fullStr = bytes.toString('binary');
      if (fullStr.includes('word/document.xml')) {
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      }
    } catch {
      // Fallback: scan the full binary for the path
      const fullStr = bytes.toString('binary');
      if (fullStr.includes('word/document.xml')) {
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      }
    }
    return 'application/zip';
  }

  // Plain text heuristic: first 512 bytes are all printable ASCII/UTF-8
  const sample = bytes.slice(0, Math.min(512, bytes.length));
  const isPrintable = sample.every((b: number) =>
    (b >= 0x20 && b <= 0x7E) || b === 0x0A || b === 0x0D || b === 0x09
  );
  if (isPrintable) {
    return 'text/plain';
  }

  return null;
}
