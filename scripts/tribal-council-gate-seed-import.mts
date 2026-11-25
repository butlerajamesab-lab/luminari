/**
 * Tribal council gate: turn the Recognition Atlas seed files into field rows.
 *
 * Reads the three seed files that today ship inside the client bundle and
 * prints SQL that opens each nation's page in tribal_council_gate and loads
 * every value as a field in state pending_review: locked, not public, waiting
 * for the nation's own council. Nothing is executed; the output is reviewed
 * first and applied only with Alexander's yes.
 *
 * Run: node --experimental-strip-types scripts/tribal-council-gate-seed-import.mts > out.sql
 */
import { chinook_truth_seed } from "../client/src/data/chinook_truth_seed.ts";
import { duwamish_truth_seed } from "../client/src/data/duwamish_truth_seed.ts";
import { muwekma_truth_seed_corrected } from "../client/src/data/muwekma_truth_seed_corrected.ts";

export type gate_field_row = {
  nation_key: string;
  section_key: string;
  field_key: string;
  value_text: string;
  source_posture: string;
  citation_url: string | null;
  citation_title: string | null;
  display_order: number;
};

const LAYER_TO_SECTION: Record<string, string> = {
  layer_0_identity: "identity_core",
  layer_1_treaty: "treaty_record",
  layer_2_dispossession: "dispossession_record",
  layer_3_recognition_timeline: "recognition_timeline",
  layer_4_lawsuit: "lawsuit_record",
  layer_5_language_vault: "language_vault",
  layer_5_living_culture: "language_vault",
  layer_6_ally_call: "ally_call",
};

const KNOWN_POSTURES = new Set([
  "verbatim_tribal_source",
  "structured_extraction_from_tribal_source",
  "structured_extraction_from_public_record",
  "external_source",
  "lighthouse_analysis_pending_tribal_review",
]);

/** Keys that describe provenance rather than carry the nation's words. */
const PROVENANCE_KEYS = new Set([
  "source", "sources", "tribal_source", "citation", "citations", "source_posture",
  "source_ref", "source_refs", "retrieved_date", "authored_by", "source_domain",
]);

type provenance = { url: string | null; title: string | null; posture: string | null };

function read_provenance(node: Record<string, unknown>, inherited: provenance): provenance {
  let { url, title, posture } = inherited;
  const src = (node.source ?? node.source_ref ?? node.tribal_source) as Record<string, unknown> | undefined;
  if (src && typeof src === "object" && typeof src.url === "string") {
    url = src.url;
    title = typeof src.page_title === "string" ? src.page_title : title;
    if (typeof src.source_posture === "string") posture = src.source_posture;
  }
  // A citation is either a page (URL) or a bibliographic reference that the
  // nation's own page gives; the latter is kept as the title, under the page.
  if (typeof node.citation === "string") {
    if (/^https?:\/\//.test(node.citation)) url = node.citation;
    else title = node.citation;
  }
  if (typeof node.source_posture === "string") posture = node.source_posture;
  return { url, title, posture };
}

function snake(parts: string[]): string {
  const key = parts.join("_").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  const safe = /^[a-z]/.test(key) ? key : `f_${key}`;
  return safe.slice(0, 63);
}

export function flatten_seed(nation_key: string, seed: Record<string, unknown>): { rows: gate_field_row[]; skipped: string[] } {
  const rows: gate_field_row[] = [];
  const skipped: string[] = [];
  let order = 0;

  const walk = (section_key: string, node: unknown, path: string[], prov: provenance) => {
    if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
      const value_text = String(node).trim();
      if (!value_text) return;
      const posture = prov.posture && KNOWN_POSTURES.has(prov.posture)
        ? prov.posture
        : "structured_extraction_from_tribal_source";
      if (!prov.url) {
        skipped.push(`${nation_key}/${section_key}/${path.join(".")}: no citation`);
        return;
      }
      rows.push({
        nation_key,
        section_key,
        field_key: snake(path),
        value_text,
        source_posture: posture,
        citation_url: prov.url,
        citation_title: prov.title,
        display_order: order++,
      });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(section_key, item, [...path, String(i + 1)], prov));
      return;
    }
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      const here = read_provenance(obj, prov);
      for (const [key, value] of Object.entries(obj)) {
        if (PROVENANCE_KEYS.has(key)) continue;
        walk(section_key, value, [...path, key], here);
      }
    }
  };

  for (const [layer_key, layer] of Object.entries(seed)) {
    const section_key = LAYER_TO_SECTION[layer_key];
    if (!section_key) continue;
    walk(section_key, layer, [], read_provenance((layer ?? {}) as Record<string, unknown>, { url: null, title: null, posture: null }));
  }

  // Field keys must be unique per section for review; suffix repeats.
  const seen = new Map<string, number>();
  for (const row of rows) {
    const k = `${row.section_key}/${row.field_key}`;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    if (n > 1) row.field_key = snake([row.field_key.slice(0, 58), String(n)]);
  }
  return { rows, skipped };
}

const lit = (v: string | null) => (v === null ? "null" : `'${v.replace(/'/g, "''")}'`);

export function to_sql(rows: gate_field_row[], nation_keys: string[]): string {
  const out: string[] = ["begin;"];
  for (const key of nation_keys) out.push(`select tribal_council_gate.open_nation_page(${lit(key)});`);
  for (const r of rows) {
    out.push(
      `insert into tribal_council_gate.field (nation_key, section_key, field_key, value_text, source_posture, citation_url, citation_title, display_order) values (${[
        lit(r.nation_key), lit(r.section_key), lit(r.field_key), lit(r.value_text),
        lit(r.source_posture), lit(r.citation_url), lit(r.citation_title), String(r.display_order),
      ].join(", ")});`,
    );
  }
  out.push("commit;");
  return out.join("\n");
}

const SEEDS: Array<[string, Record<string, unknown>]> = [
  ["self:chinook", chinook_truth_seed as unknown as Record<string, unknown>],
  ["self:duwamish", duwamish_truth_seed as unknown as Record<string, unknown>],
  ["self:muwekma", muwekma_truth_seed_corrected as unknown as Record<string, unknown>],
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const all: gate_field_row[] = [];
  const skipped: string[] = [];
  for (const [key, seed] of SEEDS) {
    const r = flatten_seed(key, seed);
    all.push(...r.rows);
    skipped.push(...r.skipped);
  }
  process.stdout.write(to_sql(all, SEEDS.map(([k]) => k)) + "\n");
  for (const s of skipped) process.stderr.write(`skipped ${s}\n`);
  process.stderr.write(`fields ${all.length}, skipped ${skipped.length}\n`);
}
