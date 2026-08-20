import { describe, expect, it } from "vitest";

import {
  LEGISLATIVE_PDF_TEXT_NORMALIZATION_VERSION,
  normalize_legislative_pdf_text,
} from "./legislative-pdf-text-normalizer";

function with_line_numbers(lines: string[]): string {
  return lines.map((line, index) => `${line}\t${(index % 51) + 1}`).join("\n");
}

describe("legislative PDF text normalization v2", () => {
  it("preserves subsection-style section identity while removing repeated line-number columns", () => {
    const source = with_line_numbers([
      "PART I. COOPERATION WITH FEDERAL IMMIGRATION OFFICIALS",
      "SECTION 1.(a) The Secretary shall do each of the following:",
      "(1) Enter into a Memorandum of Agreement.",
      "(2) Develop departmental policies.",
      "SECTION 1.(b) The Secretary of Adult Correction shall do each of the following:",
      "(1) Enter into a Memorandum of Agreement.",
      "(2) Develop departmental policies.",
      "SECTION 1.(c) The Commander shall do each of the following:",
      "(1) Enter into a Memorandum of Agreement.",
      "(2) Develop State Highway Patrol policies.",
      "SECTION 1.(d) The Director shall do each of the following:",
      "(1) Enter into a Memorandum of Agreement.",
      "SECTION 1.(e) The State Auditor shall perform an audit.",
      "SECTION 1.(f) This section is effective when it becomes law.",
      "PART II. DEPARTMENT OF HEALTH AND HUMAN SERVICES",
    ]);

    const normalized = normalize_legislative_pdf_text(source);
    expect(normalized).toContain("SECTION 1.(a)");
    expect(normalized).toContain("SECTION 1.(f)");
    expect(normalized).not.toMatch(/\t\d{1,3}(?:\n|$)/);
  });

  it("removes a page counter and only adjacent recognized legislative headers", () => {
    const source = [
      "The designated officers shall receive appropriate training.",
      "-- 2 of 7 --",
      "",
      "General Assembly Of North Carolina Session 2025",
      "Senate Bill 153-Third Edition Page 3",
      "function under the supervision of ICE officers.",
    ].join("\n");

    const normalized = normalize_legislative_pdf_text(source);
    expect(normalized).toContain("The designated officers shall receive appropriate training.");
    expect(normalized).toContain("function under the supervision of ICE officers.");
    expect(normalized).not.toContain("-- 2 of 7 --");
    expect(normalized).not.toContain("General Assembly Of North Carolina Session 2025");
    expect(normalized).not.toContain("Senate Bill 153-Third Edition Page 3");
  });

  it("does not treat ordinary legal uses of Page as layout furniture", () => {
    const source = [
      "The applicant shall file the certification described on Page 12 of the incorporated manual.",
      "Page County shall retain all authority granted by this section.",
    ].join("\n");
    expect(normalize_legislative_pdf_text(source)).toBe(source);
  });

  it("does not strip occasional tab-delimited legal numbers when no line-number layout is established", () => {
    const source = "Amount due\t25\nSection text without a repeated numbered margin.";
    expect(normalize_legislative_pdf_text(source)).toBe(source);
  });

  it("declares a versioned normalization contract", () => {
    expect(LEGISLATIVE_PDF_TEXT_NORMALIZATION_VERSION).toBe("legislative-pdf-layout-v2");
  });
});
