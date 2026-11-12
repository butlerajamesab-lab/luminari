// Content projection core — pure planning for the C2 repair wave.
//
// The content census (luminari-recovery/content-census/REPORT.md,
// 2026-11-11) found that the site / remainder / bundle projections
// minted catalog entities, locations, and categories but never
// copied the text and contacts sitting on the entities' own linked
// source rows. This module plans the repair: for each entity, given
// ONLY the transcribed rows its own link tables point at, decide
// which text fields to project and which contact points to mint —
// under the fidelity gate and the shape guards below. No I/O lives
// here; the runner (scripts/apply-content-projection.mjs) loads the
// rows, calls planEntity, and writes what the plan approves.
//
// Fidelity gate (mirrors the naming repair, PR #801; verdicts from
// luminari-recovery/workbook-fidelity/REPORT.md, 2026-11-10):
//   - DOCX-generation rows may contribute: they are transcriptions
//     of the source documents themselves.
//   - v3_13-generation rows may contribute only when their
//     section_name is a workbook sheet the fidelity audit proved
//     FAITHFUL (the two master sheets are honest unions — 99.6% /
//     100% of names traceable to lane sheets; admitted on the
//     naming gate's precedent).
//   - (9)-generation rows NEVER contribute: the (9).xlsx is the
//     sibling-generation backbone copy, text-degraded, and carries
//     nearly all of the bare-junk phone cells.
//   - LOSSY and UNVERIFIABLE sheets never contribute, and any
//     section not on the FAITHFUL list is held by default.
//
// Shape guards (measured in luminari-recovery/content-repair-c2/
// DESIGN.md): websites must be whole-cell http(s) URLs; emails must
// be whole-cell single addresses; phones are EXTRACTED from rich
// multi-number cells (main line + hotline + toll-free is the house
// style in the source documents), skipping fax-labeled candidates
// and anything that is not a full NANP number; text values carrying
// DOCX markup, a literal 'undefined', or a bare source filename are
// rejected. Every rejection and gate-hold is returned in the plan
// for the ledger — a named queue, never a silent skip.

export const REPAIR_VERSION = "content_projection_v1";

export const FAITHFUL_SHEETS = [
  "program_master",
  "resource_master",
  "pass3_program_card",
  "mh_resource",
  "disability_deep_dive",
  "deep_dive_resource",
  "resource",
  "domain_deep_dive_records_v3_13",
];

export const TEXT_FIELDS = ["description", "eligibility_summary", "apply_notes"];
export const CONTACT_CAPS = { phone: 3, website: 3, email: 2, portal: 1 };
export const CONTACT_LABELS = {
  phone: "Phone",
  website: "Website",
  email: "Email",
  portal: "Filing / complaint portal",
};

/** Which workbook generation an artifact belongs to. */
export function generationOf(artifactKey) {
  const key = String(artifactKey ?? "");
  if (/\.docx$/i.test(key)) return "docx";
  if (/\(9\)\.xlsx$/i.test(key)) return "nine";
  if (/v3_13\.xlsx$/i.test(key)) return "v3_13";
  return "other";
}

const GENERATION_RANK = { v3_13: 0, docx: 1, nine: 2, other: 3 };

/** The fidelity gate: may this linked row contribute to the page? */
export function isAdmissibleRow(row) {
  const generation = generationOf(row?.artifact_key);
  if (generation === "docx") return true;
  if (generation === "v3_13") {
    return FAITHFUL_SHEETS.includes(row?.section_name ?? "");
  }
  return false;
}

/** Deterministic row order for value selection (best evidence first). */
export function rowPrecedence(a, b) {
  const rank =
    GENERATION_RANK[generationOf(a?.artifact_key)] -
    GENERATION_RANK[generationOf(b?.artifact_key)];
  if (rank !== 0) return rank;
  const loc = String(a?.source_locator ?? "").localeCompare(
    String(b?.source_locator ?? ""),
  );
  if (loc !== 0) return loc;
  return String(a?.civic_object_uid ?? "").localeCompare(
    String(b?.civic_object_uid ?? ""),
  );
}

const MARKUP_PATTERN = /<\/?w:/i;
const BARE_FILENAME_PATTERN = /^[\w .()&'-]+\.(docx|xlsx|pdf)$/i;

/**
 * Validate a text value for projection. Returns the trimmed value,
 * or null with a rejection reason.
 */
export function cleanTextValue(value) {
  if (value == null) return { value: null, reason: "empty" };
  const text = String(value).trim();
  if (!text) return { value: null, reason: "empty" };
  if (MARKUP_PATTERN.test(text)) return { value: null, reason: "rejected_markup" };
  if (text.toLowerCase() === "undefined") {
    return { value: null, reason: "rejected_filename_or_undefined" };
  }
  if (BARE_FILENAME_PATTERN.test(text) && !text.includes("\n")) {
    return { value: null, reason: "rejected_filename_or_undefined" };
  }
  return { value: text, reason: null };
}

const PHONE_CANDIDATE_PATTERN =
  /(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}/g;

/**
 * Extract dialable NANP numbers from a phone cell. Source cells are
 * rich ("(202) 547-9204; National Problem Gambling Helpline
 * 1-800-522-4700", main + toll-free pairs, office labels). Returns
 * display-formatted numbers in cell order, deduped by 10-digit
 * core; a candidate whose preceding characters mention a fax is
 * skipped. A markup-contaminated cell yields nothing and is
 * reported, never mined.
 */
export function extractPhones(cell) {
  if (cell == null) return { numbers: [], rejected: null };
  const text = String(cell);
  if (MARKUP_PATTERN.test(text)) return { numbers: [], rejected: "rejected_markup" };
  const numbers = [];
  const seen = new Set();
  for (const match of text.matchAll(PHONE_CANDIDATE_PATTERN)) {
    const start = match.index ?? 0;
    const before = text.slice(Math.max(0, start - 14), start).toLowerCase();
    if (before.includes("fax")) continue;
    const prevChar = start > 0 ? text[start - 1] : "";
    const nextChar = text[start + match[0].length] ?? "";
    if (/\d/.test(prevChar) || /\d/.test(nextChar)) continue;
    const digits = match[0].replace(/\D/g, "");
    const core = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    if (core.length !== 10) continue;
    // NANP: area code and exchange cannot start with 0 or 1.
    if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(core)) continue;
    if (seen.has(core)) continue;
    seen.add(core);
    const display =
      digits.length === 11 && digits.startsWith("1")
        ? `1-${core.slice(0, 3)}-${core.slice(3, 6)}-${core.slice(6)}`
        : `${core.slice(0, 3)}-${core.slice(3, 6)}-${core.slice(6)}`;
    numbers.push(display);
  }
  return { numbers, rejected: null };
}

/** Whole-cell website validation: a trimmed http(s) URL, nothing else. */
export function cleanWebsite(value) {
  if (value == null) return { value: null, reason: "empty" };
  const text = String(value).trim();
  if (!text) return { value: null, reason: "empty" };
  if (MARKUP_PATTERN.test(text) || text.includes(",true,")) {
    return { value: null, reason: "rejected_markup" };
  }
  // A comma means a multi-value cell or CSV bleed, not one URL.
  if (/\s/.test(text) || text.includes(",") || !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(text)) {
    return { value: null, reason: "rejected_bad_shape" };
  }
  return { value: text, reason: null };
}

const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** Whole-cell email validation: one shaped address, nothing else. */
export function cleanEmail(value) {
  if (value == null) return { value: null, reason: "empty" };
  const text = String(value).trim();
  if (!text) return { value: null, reason: "empty" };
  if (MARKUP_PATTERN.test(text)) return { value: null, reason: "rejected_markup" };
  if (!EMAIL_PATTERN.test(text)) return { value: null, reason: "rejected_bad_shape" };
  return { value: text, reason: null };
}

function sourceStamp(row) {
  return {
    source_civic_object_uid: row?.civic_object_uid ?? null,
    source_artifact_key: row?.artifact_key ?? null,
    source_section_name: row?.section_name ?? null,
  };
}

/**
 * Plan one entity.
 *
 * entity: { resource_entity_id, description, eligibility_summary,
 *           apply_notes } — current values; only NULL text fields
 *           are filled, never overwritten.
 * linkedRows: the entity's transcribed rows (any generation/sheet).
 * existingTypes: Set/array of contact types the entity already has
 *           in luminari_resource_contact_points; those types are
 *           not minted again.
 *
 * Returns { textSets, contactMints, held, rejections }.
 */
export function planEntity(entity, linkedRows, existingTypes) {
  const entityId = entity?.resource_entity_id ?? null;
  const existing = new Set(existingTypes ?? []);
  const rows = [...(linkedRows ?? [])];
  const admissible = rows.filter(isAdmissibleRow).sort(rowPrecedence);
  const textSets = [];
  const contactMints = [];
  const rejections = [];

  // ---- Text: one field at a time, best row first. The primary
  // ordering prefers the row with the longest description (the
  // fullest card), so a field's value comes from the most complete
  // source row that carries a valid one.
  const textOrder = [...admissible].sort((a, b) => {
    const byLength =
      String(b?.description ?? "").length - String(a?.description ?? "").length;
    return byLength !== 0 ? byLength : rowPrecedence(a, b);
  });
  for (const field of TEXT_FIELDS) {
    if (entity?.[field] != null && String(entity[field]).trim() !== "") continue;
    for (const row of textOrder) {
      const raw = row?.[field];
      if (raw == null || String(raw).trim() === "") continue;
      const cleaned = cleanTextValue(raw);
      if (cleaned.value != null) {
        textSets.push({
          entity_id: entityId,
          field,
          new_value: cleaned.value,
          rule: "C2-text-projection",
          ...sourceStamp(row),
        });
        break;
      }
      rejections.push({
        entity_id: entityId,
        field,
        rule: cleaned.reason,
        source_value: String(raw),
        ...sourceStamp(row),
      });
    }
  }

  // ---- Contacts: walk admissible rows in precedence order, per
  // type, until the type's cap fills.
  const mint = (type, value, row, rawCell) => {
    contactMints.push({
      entity_id: entityId,
      contact_type: type,
      contact_value: value,
      label: CONTACT_LABELS[type],
      is_primary:
        contactMints.filter((m) => m.contact_type === type).length === 0,
      rule: "C2-contact-projection",
      source_value: rawCell == null ? null : String(rawCell),
      source_content_sha256: row?.source_content_sha256 ?? null,
      ...sourceStamp(row),
    });
  };

  if (!existing.has("phone")) {
    const seen = new Set();
    for (const row of admissible) {
      if (contactMints.filter((m) => m.contact_type === "phone").length >= CONTACT_CAPS.phone) break;
      const raw = row?.phone;
      if (raw == null || String(raw).trim() === "") continue;
      const { numbers, rejected } = extractPhones(raw);
      if (rejected) {
        rejections.push({
          entity_id: entityId, field: "phone", rule: rejected,
          source_value: String(raw), ...sourceStamp(row),
        });
        continue;
      }
      if (numbers.length === 0) {
        if (/\d/.test(String(raw))) {
          rejections.push({
            entity_id: entityId, field: "phone", rule: "rejected_no_valid_nanp",
            source_value: String(raw), ...sourceStamp(row),
          });
        }
        continue;
      }
      for (const number of numbers) {
        if (contactMints.filter((m) => m.contact_type === "phone").length >= CONTACT_CAPS.phone) break;
        const coreKey = number.replace(/\D/g, "").slice(-10);
        if (seen.has(coreKey)) continue;
        seen.add(coreKey);
        mint("phone", number, row, raw);
      }
    }
  }

  const collectSimple = (type, field, cleaner) => {
    if (existing.has(type)) return;
    const seen = new Set();
    for (const row of admissible) {
      if (contactMints.filter((m) => m.contact_type === type).length >= CONTACT_CAPS[type]) break;
      const raw = row?.[field];
      if (raw == null || String(raw).trim() === "") continue;
      const cleaned = cleaner(raw);
      if (cleaned.value == null) {
        if (cleaned.reason !== "empty") {
          rejections.push({
            entity_id: entityId, field, rule: cleaned.reason,
            source_value: String(raw), ...sourceStamp(row),
          });
        }
        continue;
      }
      const dedupeKey =
        type === "website"
          ? cleaned.value.toLowerCase().replace(/\/$/, "")
          : cleaned.value.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      mint(type, cleaned.value, row, raw);
    }
  };
  collectSimple("website", "website_url", cleanWebsite);
  collectSimple("email", "email", cleanEmail);
  collectSimple("portal", "filing_portal_url", cleanWebsite);

  // ---- Held: an in-scope entity that receives nothing is recorded
  // with the reason, so the gate's cost is a named queue.
  let held = null;
  if (textSets.length === 0 && contactMints.length === 0) {
    let rule;
    if (rows.length === 0) rule = "held_no_linked_rows";
    else if (admissible.length === 0) {
      rule = rows.every((r) => generationOf(r?.artifact_key) === "nine")
        ? "held_no_admissible_rows_only_nine"
        : "held_no_admissible_rows_held_sheets";
    } else rule = "held_no_valid_values";
    held = { entity_id: entityId, rule };
  }

  return { textSets, contactMints, held, rejections };
}
