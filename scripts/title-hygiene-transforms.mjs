// C1 title-hygiene transforms — deterministic, no identity inference.
// Mirrors content-census class definitions (2026-11-11) and the C1 design
// (content-repair-c1/DESIGN.md). Pure functions; the apply runner re-derives
// every proposal from these rules and asserts equality with the plan manifest.

export const PROCESS_TOKENS = [
  "verify remaining fields",
  "not confirmed from",
  "not published for",
  "no dedicated hotline",
  "shortest in",
  "critical:",
  "warning:",
];

const ADDRESS_RE =
  /^[0-9]{1,6}\s+.*\b(street|avenue|road|boulevard|drive|lane|court|plaza|highway|parkway|circle|terrace|place|trail|square|way)\b/i;
const ADDRESS_CITY_STATE_ZIP_RE = /,\s*[A-Za-z][A-Za-z ]+\s+[A-Z]{2}\s+\d{5}/;
const PHONE_ANYWHERE_RE = /\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}/;
const PHONE_LEADING_RE = /^\s*(1-\d{3}-\d{3}-\d{4}|\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4})/;
const ZIP_PREFIX_RE = /^\s*\d{5}(-\d{4})?\s*(—|–|\||-)\s*/;
const BRACKET_TAIL_RE =
  /\s*\[[A-Za-z0-9][A-Za-z0-9.-]*\]\s*(★)?\s*(PARTIAL\s*—\s*verify remaining fields)?\s*(N\/A\s*—\s*no dedicated hotline)?\s*$/i;
const URL_RE = /https?:\/\//i;

// Titles held by enumeration: process text carrying no organization name
// that no deterministic rule can recover. Exact-title matches only.
export const HELD_BY_TITLE = new Map([
  [
    "Meridian HQ address — verify at idahofoodbank.org",
    "process text only — no organization name in the row",
  ],
]);

/** Residue gate: the transformed title must read as a name. */
export function residue_gate(name) {
  const n = String(name ?? "").trim();
  if (n.length < 3) return { ok: false, reason: "residue too short" };
  if (!/[A-Za-z]/.test(n)) return { ok: false, reason: "residue has no letters" };
  if (/[[\]]/.test(n)) return { ok: false, reason: "residue still bracketed" };
  if (URL_RE.test(n)) return { ok: false, reason: "residue contains a URL" };
  const lower = n.toLowerCase();
  for (const token of PROCESS_TOKENS) {
    if (lower.includes(token)) return { ok: false, reason: `residue keeps process token '${token}'` };
  }
  if (/\bverify\b/i.test(n)) return { ok: false, reason: "residue keeps 'verify'" };
  if (ADDRESS_RE.test(n) || ADDRESS_CITY_STATE_ZIP_RE.test(n))
    return { ok: false, reason: "residue is address-shaped" };
  if (PHONE_ANYWHERE_RE.test(n)) return { ok: false, reason: "residue contains a phone number" };
  if (/^\{/.test(n) || /'[a-z_]+':/.test(n)) return { ok: false, reason: "residue still serialized" };
  if (/^\d{5}(-\d{4})?\s/.test(n)) return { ok: false, reason: "residue still ZIP-prefixed" };
  return { ok: true };
}

/** Rule C1: serialized {'english': '…', 'local': '…'} blob -> the english value. */
export function parse_serialized_english(title) {
  const n = String(title ?? "").trim();
  if (!n.startsWith("{")) return null;
  const m = n.match(/'english':\s*'((?:[^'\\]|\\.|'')*)'/s);
  if (!m) return null;
  return m[1].replace(/''/g, "'").replace(/\\'/g, "'").trim();
}

/** Rule B1: 'NNNNN — Name' -> 'Name'. Separator required. */
export function strip_zip_prefix(title) {
  const n = String(title ?? "");
  if (!ZIP_PREFIX_RE.test(n)) return null;
  return n.replace(ZIP_PREFIX_RE, "").trim();
}

/** Rule D1: strip a trailing workbook bracket code and its riders. */
export function strip_bracket_tail(title) {
  const n = String(title ?? "").trim();
  if (!BRACKET_TAIL_RE.test(n)) return null;
  return n.replace(BRACKET_TAIL_RE, "").trim();
}

/** Rule D2: strip editorial annotations (CRITICAL / SHORTEST / verify forms). */
export function strip_editorial(title) {
  let n = String(title ?? "").trim();
  let changed = false;
  const steps = [
    // ' — CRITICAL: …' suffix
    (s) => s.replace(/\s+—\s+CRITICAL:.*$/i, ""),
    // '(CRITICAL: …)' parenthetical
    (s) => s.replace(/\s*\((?:[^()]*\b)?CRITICAL:[^()]*\)/i, ""),
    // SSA-territory coverage-annotation parentheticals: '(…CRITICAL NOTE…)'
    // and '(SSI APPLIES …)' / '(SSDI YES …)' forms
    (s) => s.replace(/\s*\([^()]*\bCRITICAL\b[^()]*\)/i, ""),
    (s) => s.replace(/\s*\((?:SSI APPLIES|SSDI YES)\b[^()]*\)/i, ""),
    // editorial parentheticals carrying SHORTEST IN / verify-year annotations
    (s) => s.replace(/\s*\([^()]*\b(SHORTEST IN|verify year)\b[^()]*\)/i, ""),
    // ' — verify …' suffix (incl. '— verify at host')
    (s) => s.replace(/\s+—\s+verify\b.*$/i, ""),
    // ' (verify)' suffix
    (s) => s.replace(/\s*\(verify\)\s*$/i, ""),
    // trailing ' PARTIAL — verify remaining fields' with no bracket code
    (s) => s.replace(/\s+PARTIAL\s*—\s*verify remaining fields\s*$/i, ""),
  ];
  for (const step of steps) {
    const next = step(n).trim();
    if (next !== n) { n = next; changed = true; }
  }
  return changed ? n : null;
}

/** Enumerated inversion: '1-800-QUIT-NOW (Org)' -> 'Org (1-800-QUIT-NOW)'.
 *  Fires on digit phone-leading and vanity-number-leading shapes alike. */
export function invert_phone_paren(title) {
  const m = String(title ?? "").trim().match(/^((?:1-\d{3}-[A-Z0-9-]+)|(?:\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}))\s*\((.+)\)$/);
  if (!m) return null;
  return `${m[2].trim()} (${m[1].trim()})`;
}

/**
 * Full C1 pipeline for one title. Returns {action:'rename', rule, new_name}
 * or {action:'held', reason} or {action:'none'} when no rule applies.
 */
export function plan_title(title) {
  const original = String(title ?? "");
  if (HELD_BY_TITLE.has(original.trim()))
    return { action: "held", reason: HELD_BY_TITLE.get(original.trim()) };

  let name = original.trim();
  const rules = [];

  const english = parse_serialized_english(name);
  if (english != null) { name = english; rules.push("C1-serialized-english"); }

  const unzipped = strip_zip_prefix(name);
  if (unzipped != null) { name = unzipped; rules.push("B1-zip-strip"); }

  const unbracketed = strip_bracket_tail(name);
  if (unbracketed != null) { name = unbracketed; rules.push("D1-bracket-strip"); }

  const cleaned = strip_editorial(name);
  if (cleaned != null) { name = cleaned; rules.push("D2-editorial-strip"); }

  if (PHONE_LEADING_RE.test(name) || /^1-\d{3}-[A-Z0-9-]+\s*\(/.test(name)) {
    const inverted = invert_phone_paren(name);
    if (inverted != null) { name = inverted; rules.push("D3-phone-paren-invert"); }
  }

  if (rules.length === 0) return { action: "none" };
  const gate = residue_gate(name);
  if (!gate.ok) return { action: "held", reason: gate.reason, rules };
  if (name === original.trim()) return { action: "none" };
  return { action: "rename", rule: rules.join("+"), new_name: name };
}

/** Rule F1: a text field whose whole value is a bare source filename. */
export function is_bare_filename(value) {
  const v = String(value ?? "").trim();
  return /^[^\s/\\]+\.(docx|md|xlsx)$/i.test(v);
}
