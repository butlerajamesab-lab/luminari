export const LEGISLATIVE_PDF_TEXT_NORMALIZATION_VERSION = "legislative-pdf-layout-v2";

const PAGE_COUNTER = /^\s*--\s*\d{1,4}\s+of\s+\d{1,4}\s*--\s*$/i;
const TRAILING_LINE_NUMBER = /\t\s*\d{1,3}\s*$/;

const PAGE_HEADER_PATTERNS = [
  /^\s*(?:general\s+assembly\s+of\s+.+?\s+session\s+\d{4}|.+?\s+general\s+assembly\s+session\s+\d{4})\s*$/i,
  /^\s*(?:page\s+\d+\s+)?(?:house|senate)\s+bill\b.*(?:page\s+\d+)?\s*$/i,
  /^\s*(?:original\s+)?(?:house|senate)\s+bill\s+no\.?\s+.*$/i,
  /^\s*(?:enrolled\s+act\s+no\.?|act\s+no\.?|chapter\s+no\.?)\s+.*$/i,
];

function has_legislative_line_number_column(lines: string[]): boolean {
  const nonempty = lines.filter(line => line.trim().length > 0);
  const numbered = nonempty.filter(line => TRAILING_LINE_NUMBER.test(line));
  return numbered.length >= 12 && numbered.length / Math.max(1, nonempty.length) >= 0.2;
}

function is_page_header(line: string): boolean {
  return PAGE_HEADER_PATTERNS.some(pattern => pattern.test(line));
}

/**
 * Remove only deterministic PDF layout furniture that is not part of the
 * authoritative legislative text. Raw PDF bytes and their SHA-256 remain
 * separately preserved by the legislative-version intake path.
 */
export function normalize_legislative_pdf_text(input: string): string {
  const normalized_newlines = input.replace(/\r\n?/g, "\n");
  let lines = normalized_newlines.split("\n");

  if (has_legislative_line_number_column(lines)) {
    lines = lines.map(line => line.replace(TRAILING_LINE_NUMBER, ""));
  }

  const kept: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!PAGE_COUNTER.test(line)) {
      kept.push(line);
      continue;
    }

    // The page counter itself is layout furniture. Immediately following
    // legislative session / bill page headers are also furniture, but only in
    // this tightly bounded adjacency window. Stop at the first legal-content
    // line rather than deleting by broad vocabulary.
    let cursor = index + 1;
    while (cursor < lines.length && lines[cursor].trim().length === 0) cursor += 1;
    let removed_headers = 0;
    while (cursor < lines.length && removed_headers < 3 && is_page_header(lines[cursor])) {
      removed_headers += 1;
      cursor += 1;
      while (cursor < lines.length && lines[cursor].trim().length === 0) cursor += 1;
    }
    index = cursor - 1;

    // Preserve a single structural newline at the removed page boundary so
    // words from opposite pages can never be concatenated.
    if (kept.length > 0 && kept[kept.length - 1] !== "") kept.push("");
  }

  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}
