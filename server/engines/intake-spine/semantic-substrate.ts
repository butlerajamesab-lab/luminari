import type { ParsedArtifact, TextSpan } from "./parsing-substrate";

export type SemanticArtifactClass = "cms_2567" | "billing_invoice" | "generic";

const CMS_HEADER_MARKERS = [
  /STATEMENT OF DEFICIENCIES/i,
  /PROVIDER\/SUPPLIER\/CLIA/i,
  /FORM CMS-2567/i,
] as const;

const CMS_TRAILING_FURNITURE = [
  /^\s*\(continued on next page\)\s*$/i,
  /^\s*FORM CMS-2567\b/i,
  /^\s*Previous Versions Obsolete\b/i,
  /^\s*Event ID:\s*/i,
  /^\s*Page\s+\d+\s+of\s+\d+\s*$/i,
  /^\s*\d+\s+\d+\s+\d{6}\s*$/,
  /^\s*\d{6}\s+\d+\s*$/,
] as const;

const CMS_NON_NARRATIVE_SENTENCES = [
  /^\s*Findings included\s*\.?\s*$/i,
  /^\s*\.?\s*$/,
] as const;

export function classifySemanticArtifact(
  artifact: ParsedArtifact,
): SemanticArtifactClass {
  const text = artifact.extracted_text || "";
  const cmsMarkerCount = CMS_HEADER_MARKERS.filter((pattern) =>
    pattern.test(text),
  ).length;
  if (cmsMarkerCount >= 2) return "cms_2567";
  if (
    /(?:^|\n)\s*Invoice\s*(?:\n|$)/i.test(text) &&
    /\bInvoice number\b/i.test(text) &&
    /\b(?:Billing period|Amount due|Workspace Subscription)\b/i.test(text)
  ) {
    return "billing_invoice";
  }
  return "generic";
}

export function corpusHasCms2567(artifacts: ParsedArtifact[]): boolean {
  return artifacts.some(
    (artifact) => classifySemanticArtifact(artifact) === "cms_2567",
  );
}

/**
 * A clearly unrelated billing artifact is preserved by Layers 2/3 but is not
 * allowed to contaminate a CMS-2567 inspection corpus's semantic graph.
 */
export function isExcludedFromDominantSemanticLane(
  artifact: ParsedArtifact,
  corpus: ParsedArtifact[],
): boolean {
  return (
    corpusHasCms2567(corpus) &&
    classifySemanticArtifact(artifact) === "billing_invoice"
  );
}

export function semanticSpansForArtifact(
  artifact: ParsedArtifact,
  corpus: ParsedArtifact[],
): TextSpan[] {
  if (isExcludedFromDominantSemanticLane(artifact, corpus)) return [];
  if (classifySemanticArtifact(artifact) === "cms_2567")
    return cmsNarrativeSpans(artifact);
  return artifact.spans.flatMap(splitSpanIntoSentences);
}

export function cmsSurveyDate(artifact: ParsedArtifact): string | null {
  if (classifySemanticArtifact(artifact) !== "cms_2567") return null;
  const text = artifact.extracted_text;
  const direct =
    /DATE SURVEY(?:\s|\n|\r|\t)*COMPLETED\s+(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(
      text,
    );
  if (direct) return normalizeUsDate(direct[1]);

  // pdf-parse commonly reorders the CMS form columns so the provider number
  // and survey date become the most reliable adjacent pair.
  const providerBound = /\b\d{6}[\t ]+(\d{1,2}\/\d{1,2}\/\d{4})\b/.exec(text);
  return providerBound ? normalizeUsDate(providerBound[1]) : null;
}

export function isDateOutsideCmsRecordRange(
  date: string,
  surveyDate: string | null,
): boolean {
  if (!surveyDate) return Number(date.slice(0, 4)) > 2100;
  const parsed = Date.parse(`${date}T00:00:00.000Z`);
  const survey = Date.parse(`${surveyDate}T00:00:00.000Z`);
  if (!Number.isFinite(parsed) || !Number.isFinite(survey)) return true;
  // CMS findings may cite later correction material, so keep a one-year
  // allowance while rejecting obvious OCR/source typos such as 2028/2032/2204.
  return parsed > survey + 366 * 24 * 60 * 60 * 1000;
}

export function isCmsHeaderOrFooterText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  return (
    CMS_HEADER_MARKERS.some((pattern) => pattern.test(normalized)) ||
    /\bForm Approved OMB\b/i.test(normalized) ||
    /\bDATE SURVEY COMPLETED\b/i.test(normalized) ||
    /\bLABORATORY DIRECTOR'S OR PROVIDER\/SUPPLIER\b/i.test(normalized) ||
    /\bPrevious Versions Obsolete\b/i.test(normalized)
  );
}

function cmsNarrativeSpans(artifact: ParsedArtifact): TextSpan[] {
  const output: TextSpan[] = [];
  for (const page of groupCmsSpansByPage(artifact)) {
    const startMatch = /Residents Affected\s*-\s*[^\n]*/gi;
    let lastStart: RegExpExecArray | null = null;
    let current: RegExpExecArray | null;
    while ((current = startMatch.exec(page.text)) !== null) lastStart = current;
    const summaryHeading =
      /\(X4\)[^\n]*SUMMARY STATEMENT OF DEFICIENCIES[^\n]*/gi;
    let lastHeading: RegExpExecArray | null = null;
    while ((current = summaryHeading.exec(page.text)) !== null)
      lastHeading = current;
    if (!lastStart && !lastHeading) continue;

    const narrativeStart = lastStart || lastHeading!;
    let bodyStart = narrativeStart.index + narrativeStart[0].length;
    while (
      bodyStart < page.text.length &&
      /[\r\n\t ]/.test(page.text[bodyStart])
    )
      bodyStart++;
    let bodyEnd = page.text.length;

    const explicitFooter = page.text.indexOf(
      "Any deficiency statement ending with an asterisk",
      bodyStart,
    );
    if (explicitFooter >= 0) bodyEnd = Math.min(bodyEnd, explicitFooter);
    const continuation = page.text.indexOf(
      "(continued on next page)",
      bodyStart,
    );
    if (continuation >= 0) bodyEnd = Math.min(bodyEnd, continuation);

    // Strip extraction-order footer crumbs that pdf-parse places after the
    // narrative even though they are visually in the page footer.
    const lines = linesWithOffsets(
      page.text.substring(bodyStart, bodyEnd),
      bodyStart,
    );
    while (lines.length > 0) {
      const line = lines[lines.length - 1].text;
      if (
        CMS_TRAILING_FURNITURE.some((pattern) => pattern.test(line)) ||
        /^\s*\d{1,2}\/\d{1,2}\/\d{4}\s*$/.test(line)
      ) {
        bodyEnd = lines.pop()!.start;
        continue;
      }
      break;
    }

    if (bodyEnd <= bodyStart) continue;
    const body: TextSpan = {
      text: page.text.substring(bodyStart, bodyEnd),
      start_offset: page.start_offset + bodyStart,
      end_offset: page.start_offset + bodyEnd,
      page: page.page,
      paragraph_index: page.paragraph_index,
      source_artifact_key: artifact.artifact_key,
    };
    for (const sentence of splitSpanIntoSentences(body)) {
      if (
        CMS_NON_NARRATIVE_SENTENCES.some((pattern) =>
          pattern.test(sentence.text),
        )
      )
        continue;
      if (isCmsHeaderOrFooterText(sentence.text)) continue;
      output.push(sentence);
    }
  }
  return output;
}

/**
 * pdf-parse exposes a page as several paragraph spans whenever the source has
 * blank lines. CMS narrative headings and their body therefore do not
 * necessarily share one span. Rebuild a page-local view from the original
 * extracted text so the narrative boundary carries across those spans while
 * every emitted sentence keeps its exact artifact offset.
 */
function groupCmsSpansByPage(artifact: ParsedArtifact): TextSpan[] {
  const sorted = [...artifact.spans].sort(
    (left, right) => left.start_offset - right.start_offset,
  );
  const pageGroups = new Map<number, TextSpan[]>();
  const unpaged: TextSpan[] = [];

  for (const span of sorted) {
    if (span.page === undefined) {
      // Non-PDF parsers do not provide a reliable page boundary. Keep those
      // spans isolated rather than accidentally carrying CMS state across an
      // entire document.
      unpaged.push(span);
      continue;
    }
    const group = pageGroups.get(span.page) ?? [];
    group.push(span);
    pageGroups.set(span.page, group);
  }

  const pages = [...pageGroups.entries()].map(([pageNumber, spans]) => {
    const start = Math.min(...spans.map((span) => span.start_offset));
    const end = Math.max(...spans.map((span) => span.end_offset));
    return {
      text: artifact.extracted_text.substring(start, end),
      start_offset: start,
      end_offset: end,
      page: pageNumber,
      paragraph_index: Math.min(
        ...spans.map((span) => span.paragraph_index ?? 0),
      ),
      source_artifact_key: artifact.artifact_key,
    } satisfies TextSpan;
  });

  return [...pages, ...unpaged].sort(
    (left, right) => left.start_offset - right.start_offset,
  );
}

function splitSpanIntoSentences(span: TextSpan): TextSpan[] {
  const output: TextSpan[] = [];
  const pattern = /[^.!?]+(?:[.!?]+|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(span.text)) !== null) {
    const raw = match[0];
    const leading = raw.search(/\S/);
    if (leading < 0) continue;
    const trimmedEnd = raw.trimEnd().length;
    const start = match.index + leading;
    const end = match.index + trimmedEnd;
    const text = span.text.substring(start, end);
    if (text.replace(/\s+/g, " ").trim().length < 3) continue;
    output.push({
      text,
      start_offset: span.start_offset + start,
      end_offset: span.start_offset + end,
      page: span.page,
      paragraph_index: span.paragraph_index,
      source_artifact_key: span.source_artifact_key,
    });
  }
  return output;
}

function linesWithOffsets(
  text: string,
  baseOffset: number,
): Array<{ text: string; start: number; end: number }> {
  const lines: Array<{ text: string; start: number; end: number }> = [];
  let cursor = 0;
  for (const line of text.split("\n")) {
    lines.push({
      text: line,
      start: baseOffset + cursor,
      end: baseOffset + cursor + line.length,
    });
    cursor += line.length + 1;
  }
  return lines;
}

function normalizeUsDate(value: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return date.toISOString().slice(0, 10);
}
