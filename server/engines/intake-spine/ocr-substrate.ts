import { createRequire } from 'node:module';
import { extname, posix } from 'node:path';

import JSZip, { type JSZipObject } from 'jszip';
import { createWorker, OEM } from 'tesseract.js';

import type { TextSpan } from './parsing-substrate';

const require = createRequire(import.meta.url);
const ENGLISH_LANGUAGE_DATA = require('@tesseract.js-data/eng') as {
  code: string;
  gzip: boolean;
  langPath: string;
};
const convertHeic = require('heic-convert') as (options: {
  buffer: Buffer;
  format: 'JPEG';
  quality: number;
}) => Promise<ArrayBuffer | Uint8Array | Buffer>;

export const TESSERACT_JS_VERSION = '7.0.0';
export const TESSERACT_ENG_DATA_VERSION = '1.0.0';
export const HEIC_CONVERT_VERSION = '2.1.0';

export const OCR_RULE_MANIFEST = {
  engine: `tesseract.js@${TESSERACT_JS_VERSION}`,
  language: 'eng',
  language_data: `@tesseract.js-data/eng@${TESSERACT_ENG_DATA_VERSION}:4.0.0`,
  oem: 'LSTM_ONLY',
  rotate_auto: true,
  cache_method: 'none',
  line_endings: 'lf',
  heic_converter: `heic-convert@${HEIC_CONVERT_VERSION}`,
  heic_output: { format: 'JPEG', quality: 0.92 },
  archive: {
    parser: 'jszip@3.10.1',
    supported_extensions: ['.jpg', '.jpeg', '.png', '.heic', '.heif'],
    supported_image_mimes: [
      'image/jpeg',
      'image/png',
      'image/heic',
      'image/heif',
    ],
    path_policy: 'relative_no_parent_segments_no_symlinks',
    max_members: 50,
    max_member_bytes: 20 * 1024 * 1024,
    max_total_uncompressed_bytes: 64 * 1024 * 1024,
  },
} as const;

type SupportedImageMime =
  | 'image/jpeg'
  | 'image/png'
  | 'image/heic'
  | 'image/heif';

type OcrPage = {
  bytes: Buffer;
  mime_type: SupportedImageMime;
  page: number;
  archive_member_path?: string;
  archive_member_filename?: string;
};

export function detectSupportedImageMime(
  bytes: Buffer,
): SupportedImageMime | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = bytes.subarray(8, 12).toString('ascii').toLowerCase();
    if (['heic', 'heix', 'hevc', 'hevx'].includes(brand)) return 'image/heic';
    if (['mif1', 'msf1'].includes(brand)) return 'image/heif';
  }
  return null;
}

export async function parseImageWithOcr(
  bytes: Buffer,
  mimeType: SupportedImageMime,
  artifactKey: string,
): Promise<{ text: string; spans: TextSpan[] }> {
  return recognizePages(
    [{ bytes, mime_type: mimeType, page: 1 }],
    artifactKey,
    'ocr_page',
  );
}

export async function parseImageArchiveWithOcr(
  bytes: Buffer,
  artifactKey: string,
): Promise<{ text: string; spans: TextSpan[] } | null> {
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const candidates = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => describeArchiveEntry(entry))
    .filter((entry) => isSupportedArchiveExtension(entry.normalized_name))
    .sort((left, right) =>
      compareText(left.normalized_name, right.normalized_name),
    );

  if (candidates.length === 0) return null;
  if (candidates.length > OCR_RULE_MANIFEST.archive.max_members) {
    throw new Error('ocr_archive_member_limit_exceeded');
  }

  let declaredTotal = 0;
  for (const candidate of candidates) {
    validateArchiveEntry(candidate);
    const declaredSize = candidate.uncompressed_size;
    if (declaredSize === null)
      throw new Error('ocr_archive_member_size_missing');
    if (declaredSize > OCR_RULE_MANIFEST.archive.max_member_bytes) {
      throw new Error('ocr_archive_member_size_limit_exceeded');
    }
    declaredTotal += declaredSize;
    if (
      declaredTotal > OCR_RULE_MANIFEST.archive.max_total_uncompressed_bytes
    ) {
      throw new Error('ocr_archive_total_size_limit_exceeded');
    }
  }

  const pages: OcrPage[] = [];
  let observedTotal = 0;
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    const memberBytes = await candidate.entry.async('nodebuffer');
    observedTotal += memberBytes.length;
    if (
      memberBytes.length > OCR_RULE_MANIFEST.archive.max_member_bytes ||
      observedTotal > OCR_RULE_MANIFEST.archive.max_total_uncompressed_bytes
    ) {
      throw new Error('ocr_archive_observed_size_limit_exceeded');
    }
    const mimeType = detectSupportedImageMime(memberBytes);
    if (!mimeType) throw new Error('ocr_archive_member_magic_mismatch');
    pages.push({
      bytes: memberBytes,
      mime_type: mimeType,
      page: index + 1,
      archive_member_path: candidate.normalized_name,
      archive_member_filename: posix.basename(candidate.normalized_name),
    });
  }

  return recognizePages(pages, artifactKey, 'archive_ocr_page');
}

async function recognizePages(
  pages: OcrPage[],
  artifactKey: string,
  sourceKind: 'ocr_page' | 'archive_ocr_page',
): Promise<{ text: string; spans: TextSpan[] }> {
  const worker = await createWorker(ENGLISH_LANGUAGE_DATA.code, OEM.LSTM_ONLY, {
    cacheMethod: 'none',
    gzip: ENGLISH_LANGUAGE_DATA.gzip,
    langPath: ENGLISH_LANGUAGE_DATA.langPath,
  });
  try {
    const recognized: Array<{ page: OcrPage; text: string }> = [];
    for (const page of pages) {
      const inputBytes = await normalizeOcrInput(page.bytes, page.mime_type);
      const result = await worker.recognize(inputBytes, { rotateAuto: true });
      recognized.push({ page, text: normalizeOcrText(result.data.text || '') });
    }
    return assembleRecognizedPages(recognized, artifactKey, sourceKind);
  } finally {
    await worker.terminate();
  }
}

async function normalizeOcrInput(
  bytes: Buffer,
  mimeType: SupportedImageMime,
): Promise<Buffer> {
  if (mimeType !== 'image/heic' && mimeType !== 'image/heif') return bytes;
  const converted = await convertHeic({
    buffer: bytes,
    format: OCR_RULE_MANIFEST.heic_output.format,
    quality: OCR_RULE_MANIFEST.heic_output.quality,
  });
  return converted instanceof ArrayBuffer
    ? Buffer.from(converted)
    : Buffer.from(converted);
}

function assembleRecognizedPages(
  pages: Array<{ page: OcrPage; text: string }>,
  artifactKey: string,
  sourceKind: 'ocr_page' | 'archive_ocr_page',
): { text: string; spans: TextSpan[] } {
  let text = '';
  const spans: TextSpan[] = [];
  let paragraphIndex = 0;

  for (const recognized of pages) {
    if (text) text += '\n\f\n';
    const pageStart = text.length;
    text += recognized.text;
    const lines = recognized.text.split('\n');
    let lineOffset = 0;
    for (const line of lines) {
      if (line.trim()) {
        spans.push({
          text: line,
          start_offset: pageStart + lineOffset,
          end_offset: pageStart + lineOffset + line.length,
          page: recognized.page.page,
          paragraph_index: paragraphIndex,
          source_artifact_key: artifactKey,
          source_kind: sourceKind,
          ...(recognized.page.archive_member_path
            ? { archive_member_path: recognized.page.archive_member_path }
            : {}),
          ...(recognized.page.archive_member_filename
            ? {
                archive_member_filename:
                  recognized.page.archive_member_filename,
              }
            : {}),
        });
        paragraphIndex++;
      }
      lineOffset += line.length + 1;
    }
  }

  return { text, spans };
}

function normalizeOcrText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000\u000c]/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type DescribedArchiveEntry = {
  entry: JSZipObject;
  normalized_name: string;
  original_name: string;
  unix_permissions: number | null;
  uncompressed_size: number | null;
};

function describeArchiveEntry(entry: JSZipObject): DescribedArchiveEntry {
  const internal = entry as JSZipObject & {
    unsafeOriginalName?: string;
    unixPermissions?: number | string | null;
    _data?: { uncompressedSize?: number };
  };
  const permissionValue = internal.unixPermissions;
  const unixPermissions =
    typeof permissionValue === 'number'
      ? permissionValue
      : typeof permissionValue === 'string'
        ? Number.parseInt(permissionValue, 8)
        : null;
  return {
    entry,
    normalized_name: entry.name.replaceAll('\\', '/'),
    original_name: (internal.unsafeOriginalName ?? entry.name).replaceAll(
      '\\',
      '/',
    ),
    unix_permissions: Number.isInteger(unixPermissions)
      ? unixPermissions
      : null,
    uncompressed_size: Number.isSafeInteger(internal._data?.uncompressedSize)
      ? internal._data!.uncompressedSize!
      : null,
  };
}

function validateArchiveEntry(entry: DescribedArchiveEntry): void {
  for (const candidate of [entry.original_name, entry.normalized_name]) {
    if (
      !candidate ||
      candidate.includes('\u0000') ||
      candidate.startsWith('/') ||
      /^[A-Za-z]:\//.test(candidate) ||
      candidate
        .split('/')
        .some((segment) => segment === '..' || segment === '.')
    ) {
      throw new Error('ocr_archive_unsafe_member_path');
    }
  }
  if (
    entry.unix_permissions !== null &&
    (entry.unix_permissions & 0o170000) === 0o120000
  ) {
    throw new Error('ocr_archive_symlink_rejected');
  }
}

function isSupportedArchiveExtension(filename: string): boolean {
  const extension = extname(filename).toLowerCase();
  return OCR_RULE_MANIFEST.archive.supported_extensions.includes(
    extension as (typeof OCR_RULE_MANIFEST.archive.supported_extensions)[number],
  );
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
