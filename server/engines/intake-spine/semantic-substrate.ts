import type { ParsedArtifact, TextSpan } from "./parsing-substrate";

export const SEMANTIC_SUBSTRATE_VERSION = "2.2.0";

export type SemanticArtifactClass =
  | "cms_2567"
  | "billing_invoice"
  | "property_insurance_notice"
  | "sms_backup_xml"
  | "generic";

export type SemanticPurpose =
  | "chronology"
  | "entities"
  | "relationships"
  | "state_timeline";

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
  if (artifact.extraction_method === "sms_backup_xml") return "sms_backup_xml";
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
  if (
    /\bState Farm\b/i.test(text) &&
    /\bHomeowners Policy\b/i.test(text) &&
    /\b(?:underwriting requirement|survey company visited|property and liability losses)\b/i.test(
      text,
    )
  ) {
    return "property_insurance_notice";
  }
  return "generic";
}

export function corpusHasCms2567(artifacts: ParsedArtifact[]): boolean {
  return artifacts.some(
    (artifact) => classifySemanticArtifact(artifact) === "cms_2567",
  );
}

/**
 * Clearly unrelated billing or property-insurance artifacts are preserved by
 * Layers 2/3 but cannot contaminate a CMS-2567 inspection corpus's semantics.
 */
export function isExcludedFromDominantSemanticLane(
  artifact: ParsedArtifact,
  corpus: ParsedArtifact[],
): boolean {
  return (
    corpusHasCms2567(corpus) &&
    ["billing_invoice", "property_insurance_notice"].includes(
      classifySemanticArtifact(artifact),
    )
  );
}

export function semanticSpansForArtifact(
  artifact: ParsedArtifact,
  corpus: ParsedArtifact[],
  purpose: SemanticPurpose = "entities",
): TextSpan[] {
  if (isExcludedFromDominantSemanticLane(artifact, corpus)) return [];
  if (classifySemanticArtifact(artifact) === "cms_2567")
    return cmsNarrativeSpans(artifact);

  let spans = removeDuplicateArchiveMembers(artifact, corpus);
  if (classifySemanticArtifact(artifact) === "sms_backup_xml") {
    spans = spans.filter(
      (span) =>
        span.message_kind !== "reaction" &&
        isSmsCaseRelevant(span.text, corpus),
    );
  }
  if (corpusHasCms2567(corpus)) spans = removeOcrReferencePages(spans);

  const sentences = spans.flatMap(splitSpanIntoSentences);
  return purpose === "chronology" &&
    classifySemanticArtifact(artifact) === "sms_backup_xml"
    ? sentences.filter((span) => isSmsChronologySentence(span.text, corpus))
    : sentences;
}

export function isSmsTransportMetadataLeak(text: string): boolean {
  return (
    /<(?:sms|mms|part|addr)(?:\s|>)/i.test(text) ||
    /\b(?:protocol|date_sent|sub_id|readable_date|contact_name|m_type|msg_box|ctt_s|sef_type|service_center)\s*=/i.test(
      text,
    ) ||
    /\bproto:[A-Za-z0-9+/=_-]{16,}/.test(text)
  );
}

function removeDuplicateArchiveMembers(
  artifact: ParsedArtifact,
  corpus: ParsedArtifact[],
): TextSpan[] {
  if (artifact.extraction_method !== "tesseract_archive_ocr") {
    return artifact.spans;
  }
  const standaloneTextByFilename = new Map<string, string[]>();
  for (const candidate of corpus) {
    if (
      candidate.artifact_key === artifact.artifact_key ||
      candidate.extraction_method !== "tesseract_ocr" ||
      candidate.extraction_status !== "success" ||
      !candidate.source_filename
    ) {
      continue;
    }
    const filename = normalizeFilename(candidate.source_filename);
    const texts = standaloneTextByFilename.get(filename) ?? [];
    texts.push(candidate.extracted_text);
    standaloneTextByFilename.set(filename, texts);
  }

  const archiveTextByMember = new Map<string, string[]>();
  for (const span of artifact.spans) {
    if (!span.archive_member_path) continue;
    const texts = archiveTextByMember.get(span.archive_member_path) ?? [];
    texts.push(span.text);
    archiveTextByMember.set(span.archive_member_path, texts);
  }
  const duplicateMembers = new Set<string>();
  for (const [memberPath, lines] of archiveTextByMember) {
    const filename = normalizeFilename(memberPath);
    const standaloneTexts = standaloneTextByFilename.get(filename) ?? [];
    if (
      standaloneTexts.some((standaloneText) =>
        isOcrSemanticDuplicate(lines.join("\n"), standaloneText),
      )
    ) {
      duplicateMembers.add(memberPath);
    }
  }

  return artifact.spans.filter(
    (span) =>
      !span.archive_member_path ||
      !duplicateMembers.has(span.archive_member_path),
  );
}

function isOcrSemanticDuplicate(left: string, right: string): boolean {
  const leftTokens = ocrSemanticTokens(left);
  const rightTokens = ocrSemanticTokens(right);
  if (leftTokens.size < 20 || rightTokens.size < 20) return false;
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection++;
  }
  const diceSimilarity =
    (2 * intersection) / (leftTokens.size + rightTokens.size);
  return diceSimilarity >= 0.6;
}

function ocrSemanticTokens(value: string): Set<string> {
  return new Set(
    (value.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
      (token) => token.length >= 3,
    ),
  );
}

function removeOcrReferencePages(spans: TextSpan[]): TextSpan[] {
  const pageText = new Map<string, string[]>();
  for (const span of spans) {
    if (
      span.source_kind !== "ocr_page" &&
      span.source_kind !== "archive_ocr_page"
    )
      continue;
    const key = `${span.source_artifact_key}:${span.page ?? 0}:${span.archive_member_path ?? ""}`;
    const text = pageText.get(key) ?? [];
    text.push(span.text);
    pageText.set(key, text);
  }
  const excluded = new Set<string>(
    [...pageText.entries()]
      .filter(([, lines]) => isOcrReferencePage(lines.join("\n")))
      .map(([key]) => key),
  );
  return spans.filter((span) => {
    const key = `${span.source_artifact_key}:${span.page ?? 0}:${span.archive_member_path ?? ""}`;
    return !excluded.has(key);
  });
}

function isOcrReferencePage(text: string): boolean {
  return [
    /Grievance Policy\s*&\s*Procedure/i,
    /Notice Regarding Grievances/i,
    /OBJECTIVE OF GRIEVANCE POLICY/i,
    /\bwritten grievance decisions?\b/i,
    /\bGrievance Official(?: or Grievance Official Designee)?\b/i,
    /\bFiling a Complaint\b/i,
    /Required Contact Information\s*\(pursuant to 42 CFR 483\.10\)/i,
    /\bWashington State Contacts\b/i,
    /Washington Nursing Home Survey Agency/i,
    /\bKing County Resources\b/i,
    /\bKing County Caregiver Support Network\b/i,
    /\bLong Term Care Ombudsman\b/i,
    /\bAdult Protective Services\b/i,
    /Senior Information\s*&\s*Assistance/i,
    /Pathways Information and Assistance Program/i,
  ].some((pattern) => pattern.test(text));
}

function isSmsCaseRelevant(text: string, corpus: ParsedArtifact[]): boolean {
  if (
    /\b(?:nursing home|long[ -]term care|care conference|family council|ombudsman|Medicare inspector|CMS|social worker|resident|caregiver|POA|power of attorney|in[ -]house PCP)\b/i.test(
      text,
    )
  ) {
    return true;
  }
  if (containsAnyAlias(text, deriveFacilityAliases(corpus))) return true;
  return (
    containsAnyAlias(text, deriveSubjectAliases(corpus)) &&
    /\b(?:care|facility|unit|staff|doctor|PCP|NP|nurse|medical|Medicaid|Medicare|dementia|wheelchair|fell|fall|food|eat(?:ing)?|dinner|water|liquids?|hydrat(?:e|ion)|medication|hospital|appointment|assessment|procedure|headache|chemical|cleaner|waxed|floor|grievance|complaint|inspectors?)\b/i.test(
      text,
    )
  );
}

function isSmsChronologySentence(
  text: string,
  corpus: ParsedArtifact[],
): boolean {
  return (
    isSmsCaseRelevant(text, corpus) &&
    /\b(?:fell|fall|moved|moving|admitted|transferred|hospital|not (?:been )?(?:getting|given|receiving)|refus(?:e|ed|ing|al)|dehydrat(?:ed|ion)|liquids?|water|food|eating|dinner|medication|care conference|social worker|called|contacted|invited|less than 24|POA|power of attorney|complaint|grievance|ombudsman|inspector|cleaned|waxed|Robusto|chemical exposure|headache|procedure|assessment|restrict(?:ed|ing)|avoiding|rude|difficult)\b/i.test(
      text,
    )
  );
}

function deriveSubjectAliases(corpus: ParsedArtifact[]): string[] {
  const aliases = new Set<string>();
  const nicknameMap: Record<string, string[]> = {
    richard: ["Rick"],
    robert: ["Bob", "Rob"],
    william: ["Bill", "Will"],
    james: ["Jim"],
    elizabeth: ["Beth", "Liz"],
    margaret: ["Maggie", "Peggy"],
  };
  for (const artifact of corpus) {
    const pattern =
      /^\s*([A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){1,3})\s+Care Conference Agenda\b/gim;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(artifact.extracted_text)) !== null) {
      aliases.add(match[1]);
      const firstName = match[1].split(/\s+/)[0];
      aliases.add(firstName);
      for (const nickname of nicknameMap[firstName.toLowerCase()] ?? []) {
        aliases.add(nickname);
      }
    }
  }
  return [...aliases].sort();
}

function deriveFacilityAliases(corpus: ParsedArtifact[]): string[] {
  const aliases = new Set<string>();
  const pattern =
    /\b([A-Z][A-Za-z'’-]+(?:[ \t]+[A-Z][A-Za-z'’-]+){1,6}[ \t]+(?:Home|Hospital|Center|Centre|Clinic|Facility))\b/g;
  for (const artifact of corpus) {
    if (classifySemanticArtifact(artifact) !== "cms_2567") continue;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(artifact.extracted_text)) !== null) {
      const fullName = match[1].replace(/\s+/g, " ").trim();
      aliases.add(fullName);
      const shortName = fullName.replace(
        /\s+(?:Home|Hospital|Center|Centre|Clinic|Facility)$/,
        "",
      );
      if (shortName.split(" ").length >= 2) {
        aliases.add(shortName);
        const acronym = shortName
          .split(" ")
          .map((token) => token[0])
          .join("")
          .toUpperCase();
        if (acronym.length >= 2) aliases.add(acronym);
      }
    }
  }
  return [...aliases].sort();
}

function containsAnyAlias(text: string, aliases: string[]): boolean {
  return aliases.some((alias) => {
    const pattern = new RegExp(
      `(?:^|[^\\p{L}\\p{N}])${escapeRegex(alias)}(?:$|[^\\p{L}\\p{N}])`,
      "iu",
    );
    return pattern.test(text);
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeFilename(value: string): string {
  return value.replaceAll("\\", "/").split("/").pop()!.trim().toLowerCase();
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
    const residentStarts = [
      ...page.text.matchAll(/Residents Affected\s*-\s*[^\n]*/gi),
    ];
    const summaryStarts = [
      ...page.text.matchAll(
        /\(X4\)[^\n]*SUMMARY STATEMENT OF DEFICIENCIES[^\n]*/gi,
      ),
    ];
    // Prefer Residents Affected within each X4 block, but retain an X4-only
    // continuation block even when a different block exposes that marker.
    // This matters when an unpaged DOCX/text conversion collapses several
    // original pages into one document-local view.
    const narrativeStarts = selectCmsNarrativeStarts(
      residentStarts,
      summaryStarts,
      page.text.length,
    );
    if (narrativeStarts.length === 0) continue;

    // A page (and especially an unpaged DOCX/text conversion) may contain
    // several deficiency blocks. Every later X4/Residents boundary closes the
    // current block so an earlier narrative cannot be overwritten by the last.
    const sectionBoundaries = [...residentStarts, ...summaryStarts]
      .map((match) => match.index)
      .filter((index): index is number => index !== undefined)
      .sort((left, right) => left - right);

    for (const narrativeStart of narrativeStarts) {
      if (narrativeStart.index === undefined) continue;
      let bodyStart = narrativeStart.index + narrativeStart[0].length;
      while (
        bodyStart < page.text.length &&
        /[\r\n\t ]/.test(page.text[bodyStart])
      )
        bodyStart++;
      let bodyEnd =
        sectionBoundaries.find((boundary) => boundary >= bodyStart) ??
        page.text.length;

      const explicitFooter = page.text.indexOf(
        "Any deficiency statement ending with an asterisk",
        bodyStart,
      );
      if (explicitFooter >= 0 && explicitFooter < bodyEnd)
        bodyEnd = explicitFooter;
      const continuation = page.text.indexOf(
        "(continued on next page)",
        bodyStart,
      );
      if (continuation >= 0 && continuation < bodyEnd) bodyEnd = continuation;

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
  }
  return output;
}

function selectCmsNarrativeStarts(
  residentStarts: RegExpMatchArray[],
  summaryStarts: RegExpMatchArray[],
  textLength: number,
): RegExpMatchArray[] {
  if (summaryStarts.length === 0) return residentStarts;

  const selected: RegExpMatchArray[] = [];
  const firstSummaryIndex = summaryStarts[0].index ?? 0;
  selected.push(
    ...residentStarts.filter(
      (resident) => (resident.index ?? textLength) < firstSummaryIndex,
    ),
  );

  for (let index = 0; index < summaryStarts.length; index++) {
    const summary = summaryStarts[index];
    const sectionStart = summary.index ?? 0;
    const sectionEnd = summaryStarts[index + 1]?.index ?? textLength;
    const sectionResidents = residentStarts.filter((resident) => {
      const residentIndex = resident.index ?? textLength;
      return residentIndex >= sectionStart && residentIndex < sectionEnd;
    });
    selected.push(
      ...(sectionResidents.length > 0 ? sectionResidents : [summary]),
    );
  }

  return selected.sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
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
      // DOCX/text parsers have paragraph offsets but no page boundary. Collect
      // them into one bounded document-local view below so a CMS heading can
      // govern the narrative paragraphs that follow it.
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

  const unpagedDocument =
    unpaged.length > 0
      ? (() => {
          const start = Math.min(...unpaged.map((span) => span.start_offset));
          const end = Math.max(...unpaged.map((span) => span.end_offset));
          return {
            text: artifact.extracted_text.substring(start, end),
            start_offset: start,
            end_offset: end,
            paragraph_index: Math.min(
              ...unpaged.map((span) => span.paragraph_index ?? 0),
            ),
            source_artifact_key: artifact.artifact_key,
          } satisfies TextSpan;
        })()
      : null;

  return [...pages, ...(unpagedDocument ? [unpagedDocument] : [])].sort(
    (left, right) => left.start_offset - right.start_offset,
  );
}

function splitSpanIntoSentences(span: TextSpan): TextSpan[] {
  const output: TextSpan[] = [];
  const protectedText = protectSupportedNonterminalPeriods(span.text);
  const pattern = /[^.!?]+(?:[.!?]+|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(protectedText)) !== null) {
    const raw = span.text.substring(match.index, match.index + match[0].length);
    const leading = raw.search(/\S/);
    if (leading < 0) continue;
    const trimmedEnd = raw.trimEnd().length;
    const start = match.index + leading;
    const end = match.index + trimmedEnd;
    const text = span.text.substring(start, end);
    if (text.replace(/\s+/g, " ").trim().length < 3) continue;
    output.push({
      ...span,
      text,
      start_offset: span.start_offset + start,
      end_offset: span.start_offset + end,
    });
  }
  return output;
}

/**
 * The downstream manifests explicitly consume these period-bearing forms.
 * Protect only uses that are demonstrably nonterminal, then split a same-length
 * shadow string so source text and offsets remain byte-for-byte untouched.
 */
function protectSupportedNonterminalPeriods(text: string): string {
  const patterns = [
    /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
    /\b\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    /\b\d+(?:\.\d+)+\b/g,
    /\b(?:Mr|Mrs|Ms|Dr|Prof)\.(?=\s+[A-Z])/gi,
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.(?=\s+\d{1,4}\b)/gi,
    /\b(?:Inc|Corp|Co)\.(?=\s+(?:[a-z]|and\b|or\b|&))/g,
    /\b(?:St|Ave|Blvd|Dr|Rd|Ln|Ct|Pl|Cir)\.(?=\s*,|\s+[a-z])/g,
  ] as const;
  return patterns.reduce(
    (protectedText, pattern) =>
      protectedText.replace(pattern, (abbreviation) =>
        abbreviation.replaceAll(".", "\uE000"),
      ),
    text,
  );
}

export function semanticSentenceBounds(
  text: string,
  position: number,
): { start: number; end: number } {
  const protectedText = protectSupportedNonterminalPeriods(text);
  let start = 0;
  for (let index = position - 1; index >= 0; index--) {
    if (
      protectedText[index] === "." ||
      protectedText[index] === "!" ||
      protectedText[index] === "?" ||
      protectedText[index] === "\n"
    ) {
      start = index + 1;
      break;
    }
  }
  let end = protectedText.length;
  for (let index = position; index < protectedText.length; index++) {
    if (
      protectedText[index] === "." ||
      protectedText[index] === "!" ||
      protectedText[index] === "?" ||
      protectedText[index] === "\n"
    ) {
      end = index + 1;
      break;
    }
  }
  return { start, end };
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
