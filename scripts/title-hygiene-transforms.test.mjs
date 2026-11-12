import { describe, it, expect } from "vitest";
import {
  plan_title,
  parse_serialized_english,
  strip_zip_prefix,
  strip_bracket_tail,
  strip_editorial,
  invert_phone_paren,
  residue_gate,
  is_bare_filename,
} from "./title-hygiene-transforms.mjs";

describe("B1 zip strip", () => {
  it("strips ZIP + em dash", () => {
    expect(strip_zip_prefix("08625 — New Jersey Department of Human Services (DMHAS)"))
      .toBe("New Jersey Department of Human Services (DMHAS)");
  });
  it("strips ZIP+4", () => {
    expect(strip_zip_prefix("12203-3526 — New York State OASAS")).toBe("New York State OASAS");
  });
  it("refuses without a separator (address titles are not this rule)", () => {
    expect(strip_zip_prefix("10225 Grand Avenue, Franklin Park, IL 60131")).toBeNull();
  });
});

describe("C1 serialized english", () => {
  it("takes the english value", () => {
    expect(parse_serialized_english("{'english': 'Guam Behavioral Health and Wellness Center (GBHWC)', 'local': 'Dipattamenton'}"))
      .toBe("Guam Behavioral Health and Wellness Center (GBHWC)");
  });
  it("ignores non-blobs", () => {
    expect(parse_serialized_english("ACLU of Guam")).toBeNull();
  });
});

describe("D1 bracket tail", () => {
  it("strips code + star", () => {
    expect(strip_bracket_tail("ACLU of Guam [ACLU-GU] ★")).toBe("ACLU of Guam");
  });
  it("strips code + PARTIAL rider", () => {
    expect(strip_bracket_tail("Bazelon Center for Mental Health Law [ADV-BAZELON-SUD] PARTIAL — verify remaining fields"))
      .toBe("Bazelon Center for Mental Health Law");
  });
  it("strips code + N/A rider", () => {
    expect(strip_bracket_tail("SMART Recovery [CRISIS-SMART] N/A — no dedicated hotline"))
      .toBe("SMART Recovery");
  });
  it("strips a no-hyphen code", () => {
    expect(strip_bracket_tail("National Institute on Alcohol Abuse and Alcoholism (NIAAA) [NIAAA] PARTIAL — verify remaining fields"))
      .toBe("National Institute on Alcohol Abuse and Alcoholism (NIAAA)");
  });
  it("strips a citation-style dotted court code", () => {
    expect(strip_bracket_tail("U.S. District Court — District of New Hampshire (Concord) [D.NH] ★"))
      .toBe("U.S. District Court — District of New Hampshire (Concord)");
    expect(strip_bracket_tail("603 Legal Aid — Statewide Centralized Intake Gateway [603-LegalAid] ★"))
      .toBe("603 Legal Aid — Statewide Centralized Intake Gateway");
  });
  it("does not strip a bracketed qualifier containing a space", () => {
    expect(strip_bracket_tail("Aria Community Health Center Hanford 103 [Wee Dental]")).toBeNull();
  });
  it("leaves a name with no bracket alone", () => {
    expect(strip_bracket_tail("Learn to Cope")).toBeNull();
  });
});

describe("D2 editorial strip", () => {
  it("strips a CRITICAL suffix", () => {
    expect(strip_editorial("State Programs — CRITICAL: FL Opted Out of Summer EBT 2025"))
      .toBe("State Programs");
  });
  it("strips a CRITICAL parenthetical", () => {
    expect(strip_editorial("Social Security Administration -- American Samoa (CRITICAL: Limited SSI and SSDI Coverage)"))
      .toBe("Social Security Administration -- American Samoa");
  });
  it("strips an SSI coverage parenthetical", () => {
    expect(strip_editorial("Social Security Administration -- Guam (SSDI YES -- SSI CRITICAL NOTE)"))
      .toBe("Social Security Administration -- Guam");
  });
  it("strips a SHORTEST parenthetical", () => {
    expect(strip_editorial("MCCR Civil Rights (180-day SOL — SHORTEST IN MID-ATLANTIC!)"))
      .toBe("MCCR Civil Rights");
  });
  it("strips a verify-year parenthetical", () => {
    expect(strip_editorial("Nebraska DOL Wage (State wages — verify year: $12→$13.50→$15!)"))
      .toBe("Nebraska DOL Wage");
  });
  it("strips a trailing (verify)", () => {
    expect(strip_editorial("Some Org (verify)")).toBe("Some Org");
  });
});

describe("D3 phone-paren inversion", () => {
  it("inverts the vanity quitline form", () => {
    expect(invert_phone_paren("1-800-QUIT-NOW (National Network of Tobacco Cessation Quitlines)"))
      .toBe("National Network of Tobacco Cessation Quitlines (1-800-QUIT-NOW)");
  });
  it("does not invert ordinary names", () => {
    expect(invert_phone_paren("ACLU of Guam")).toBeNull();
  });
});

describe("residue gate", () => {
  it("accepts a clean name", () => {
    expect(residue_gate("ACLU of Guam").ok).toBe(true);
  });
  it("rejects an address+phone residue", () => {
    expect(residue_gate("Knud Hansen Complex, 1303 Hospital Ground, St. Croix VI 00820 | 340-773-2323").ok).toBe(false);
  });
  it("rejects a warning residue", () => {
    expect(residue_gate("NEDA -- WARNING: HELPLINE PERMANENTLY CLOSED").ok).toBe(false);
  });
  it("rejects a process residue", () => {
    expect(residue_gate("Not confirmed from official site").ok).toBe(false);
  });
  it("rejects a phone-leading residue", () => {
    expect(residue_gate("800-799-7233 Hotline").ok).toBe(false);
  });
});

describe("plan_title end to end", () => {
  it("chains bracket strip + inversion for QUIT-NOW", () => {
    const p = plan_title("1-800-QUIT-NOW (National Network of Tobacco Cessation Quitlines) [CRISIS-QUITNOW] PARTIAL — verify remaining fields");
    expect(p.action).toBe("rename");
    expect(p.new_name).toBe("National Network of Tobacco Cessation Quitlines (1-800-QUIT-NOW)");
  });
  it("holds the enumerated process-text title", () => {
    expect(plan_title("Meridian HQ address — verify at idahofoodbank.org").action).toBe("held");
  });
  it("holds the address+phone title at the gate", () => {
    expect(plan_title("Knud Hansen Complex, 1303 Hospital Ground, St. Croix VI 00820 | 340-773-2323 (verify)").action).toBe("held");
  });
  it("holds NEDA (warning preserved, no rename)", () => {
    expect(plan_title("NEDA -- WARNING: HELPLINE PERMANENTLY CLOSED [MH-ED-002] ★").action).toBe("held");
  });
  it("leaves an ordinary name untouched", () => {
    expect(plan_title("Alameda County Community Food Bank").action).toBe("none");
  });
  it("renames the serialized blob", () => {
    const p = plan_title("{'english': 'Mental Health and Addiction Services Administration', 'local': 'ASSMCA'}");
    expect(p.action).toBe("rename");
    expect(p.new_name).toBe("Mental Health and Addiction Services Administration");
  });
});

describe("F1 bare filename", () => {
  it("matches a bare docx filename", () => {
    expect(is_bare_filename("luminari-michigan-registry.docx")).toBe(true);
  });
  it("does not match prose", () => {
    expect(is_bare_filename("See the attached luminari-michigan-registry.docx for details")).toBe(false);
    expect(is_bare_filename("Connects Kansans to private attorneys.")).toBe(false);
    expect(is_bare_filename(null)).toBe(false);
  });
});
