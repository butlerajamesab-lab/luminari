import { describe, expect, it } from "vitest";
import { build_council_letter } from "./tribal-council-letter";
import { read_session_aal } from "./routers/tribal-council-gate-router";
// Real seed content, as it ships today.
import { flatten_seed } from "../scripts/tribal-council-gate-seed-import.mts";
import { chinook_truth_seed } from "../client/src/data/chinook_truth_seed";
import { duwamish_truth_seed } from "../client/src/data/duwamish_truth_seed";
import { muwekma_truth_seed_corrected } from "../client/src/data/muwekma_truth_seed_corrected";

const token = (claims: Record<string, unknown>) =>
  ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "sig"].join(".");

describe("read_session_aal", () => {
  it("reads aal2 from a bearer token", () => {
    const req = { headers: { authorization: `Bearer ${token({ aal: "aal2" })}` } } as never;
    expect(read_session_aal(req)).toBe("aal2");
  });
  it("prefers the lighthouse session header", () => {
    const req = {
      headers: {
        "x-lighthouse-supabase-session": token({ aal: "aal2" }),
        authorization: `Bearer ${token({ aal: "aal1" })}`,
      },
    } as never;
    expect(read_session_aal(req)).toBe("aal2");
  });
  it("returns null for single-factor, missing or malformed tokens", () => {
    expect(read_session_aal({ headers: { authorization: `Bearer ${token({ aal: "aal1" })}` } } as never)).toBe("aal1");
    expect(read_session_aal({ headers: {} } as never)).toBeNull();
    expect(read_session_aal({ headers: { authorization: "Bearer not-a-jwt" } } as never)).toBeNull();
    expect(read_session_aal(undefined)).toBeNull();
  });
});

describe("seed import (real Recognition Atlas seeds)", () => {
  const seeds: Array<[string, unknown]> = [
    ["self:chinook", chinook_truth_seed],
    ["self:duwamish", duwamish_truth_seed],
    ["self:muwekma", muwekma_truth_seed_corrected],
  ];
  for (const [key, seed] of seeds) {
    it(`${key}: every value is cited, kept in the seven sections, and never Luminari analysis`, () => {
      const { rows, skipped } = flatten_seed(key, seed as Record<string, unknown>);
      expect(rows.length).toBeGreaterThan(50);
      expect(skipped).toEqual([]);
      for (const row of rows) {
        expect(row.citation_url).toMatch(/^https?:\/\//);
        expect(row.source_posture).not.toBe("lighthouse_analysis_pending_tribal_review");
        expect([
          "identity_core", "treaty_record", "dispossession_record", "recognition_timeline",
          "lawsuit_record", "language_vault", "ally_call",
        ]).toContain(row.section_key);
        expect(row.field_key).toMatch(/^[a-z][a-z0-9_]{1,62}$/);
      }
      const keys = rows.map((r) => `${r.section_key}/${r.field_key}`);
      expect(new Set(keys).size).toBe(keys.length);
    });
  }
  it("keeps the nation's own words verbatim", () => {
    const { rows } = flatten_seed("self:chinook", chinook_truth_seed as unknown as Record<string, unknown>);
    const self_name = rows.find((r) => r.field_key === "tribe_self_name");
    expect(self_name?.value_text).toBe("Chinook Indian Nation");
    expect(self_name?.source_posture).toBe("verbatim_tribal_source");
  });
});

describe("build_council_letter", () => {
  const base = {
    nation_name: "Chinook Indian Nation",
    addressee: "Chinook Tribal Council",
    mailing_address: "Chinook Indian Nation • 3 Park Street • P.O. Box 368 • Bay Center, WA 98527",
    sections: [
      { section_title: "Identity", field_count: 11, source_pages: ["https://chinooknation.org/government/"] },
      { section_title: "Ally Call", field_count: 0, source_pages: [] },
    ],
    sender_name: "Sender Name",
    sender_contact: "sender@example.org",
    letter_date: "2026-11-25",
  };

  it("invitation lists what is held, says nothing is public, and lists every council power", () => {
    const { body_text, body_sha256 } = build_council_letter({ ...base, letter_kind: "initial_invitation" });
    expect(body_text).toContain("Dear members of the Chinook Tribal Council");
    expect(body_text).toContain("Bay Center, WA 98527");
    expect(body_text).toContain("Identity: 11 items (drawn from: https://chinooknation.org/government/)");
    expect(body_text).not.toContain("Ally Call: 0");
    expect(body_text).toContain("Nothing on this page is public");
    expect(body_text).toContain("withdraw entirely");
    expect(body_text).toContain("A pseudonym is fine");
    expect(body_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("names no organisation other than Luminari", () => {
    for (const letter_kind of ["initial_invitation", "follow_up", "decision_confirmation", "withdrawal_confirmation"] as const) {
      const { body_text } = build_council_letter({ ...base, letter_kind });
      expect(body_text).not.toMatch(/foundation/i);
    }
  });

  it("refuses to draft without an addressee or a sender", () => {
    expect(() => build_council_letter({ ...base, addressee: " ", letter_kind: "follow_up" })).toThrow();
    expect(() => build_council_letter({ ...base, sender_name: "", letter_kind: "follow_up" })).toThrow();
  });
});
