import { createHash } from "crypto";
import {
  build_rosetta_authority_basis,
  build_rosetta_authority_fingerprint,
  type rosetta_law_view,
} from "./rosetta-law-view-contract";

export type authority_layer_name =
  | "protections"
  | "workflow_pipelines"
  | "accountability_routes"
  | "overrides"
  | "definitions";

export type authority_mutation_kind = "added" | "removed" | "modified" | "unchanged";

export type authority_mutation_record = {
  layer_name: authority_layer_name;
  mutation_kind: authority_mutation_kind;
  identity_key: string;
  before: unknown | null;
  after: unknown | null;
  before_hash: string | null;
  after_hash: string | null;
};

export type authority_mutation_summary = {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
  total: number;
};

export type authority_mutation_report = {
  previous_extraction_run_id: number;
  current_extraction_run_id: number;
  previous_authority_fingerprint: string;
  current_authority_fingerprint: string;
  mutation_fingerprint: string;
  structural_similarity: number;
  summary: authority_mutation_summary;
  mutations: authority_mutation_record[];
};

const hash_value = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const get_identity_key = (layer_name: authority_layer_name, row: unknown): string => {
  const record = row as Record<string, unknown>;

  const candidate_keys: Record<authority_layer_name, string[]> = {
    protections: ["id", "entity_name", "governing_section"],
    workflow_pipelines: ["pipeline_id", "pipeline_name", "governing_section"],
    accountability_routes: ["id", "route_name", "trigger_condition"],
    overrides: ["id", "override_type", "overridden_authority", "override_scope"],
    definitions: ["id", "term", "scope"],
  };

  const parts = candidate_keys[layer_name]
    .map((key) => record[key])
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map(String);

  if (parts.length > 0) return `${layer_name}:${parts.join("|")}`;
  return `${layer_name}:sha256:${hash_value(row)}`;
};

const map_layer = (layer_name: authority_layer_name, rows: unknown[]) =>
  new Map(rows.map((row) => [get_identity_key(layer_name, row), row] as const));

const compare_layer = (
  layer_name: authority_layer_name,
  previous_rows: unknown[],
  current_rows: unknown[],
): authority_mutation_record[] => {
  const previous_map = map_layer(layer_name, previous_rows);
  const current_map = map_layer(layer_name, current_rows);
  const keys = Array.from(new Set([...previous_map.keys(), ...current_map.keys()])).sort();

  return keys.map((identity_key) => {
    const before = previous_map.get(identity_key) ?? null;
    const after = current_map.get(identity_key) ?? null;
    const before_hash = before === null ? null : hash_value(before);
    const after_hash = after === null ? null : hash_value(after);

    let mutation_kind: authority_mutation_kind;
    if (before === null) mutation_kind = "added";
    else if (after === null) mutation_kind = "removed";
    else if (before_hash === after_hash) mutation_kind = "unchanged";
    else mutation_kind = "modified";

    return {
      layer_name,
      mutation_kind,
      identity_key,
      before,
      after,
      before_hash,
      after_hash,
    };
  });
};

const calculate_similarity = (summary: authority_mutation_summary): number => {
  if (summary.total === 0) return 1;
  return Number((summary.unchanged / summary.total).toFixed(6));
};

export const build_authority_mutation_report = (
  previous_view: rosetta_law_view,
  current_view: rosetta_law_view,
): authority_mutation_report => {
  const previous_basis = build_rosetta_authority_basis(previous_view) as Record<authority_layer_name, unknown[]>;
  const current_basis = build_rosetta_authority_basis(current_view) as Record<authority_layer_name, unknown[]>;

  const layer_names: authority_layer_name[] = [
    "protections",
    "workflow_pipelines",
    "accountability_routes",
    "overrides",
    "definitions",
  ];

  const mutations = layer_names.flatMap((layer_name) =>
    compare_layer(layer_name, previous_basis[layer_name] ?? [], current_basis[layer_name] ?? []),
  );

  const summary = mutations.reduce<authority_mutation_summary>(
    (accumulator, mutation) => {
      accumulator[mutation.mutation_kind] += 1;
      accumulator.total += 1;
      return accumulator;
    },
    { added: 0, removed: 0, modified: 0, unchanged: 0, total: 0 },
  );

  const previous_authority_fingerprint = build_rosetta_authority_fingerprint(previous_view);
  const current_authority_fingerprint = build_rosetta_authority_fingerprint(current_view);
  const mutation_fingerprint = hash_value({
    previous_authority_fingerprint,
    current_authority_fingerprint,
    mutations: mutations.map(({ before, after, ...mutation }) => mutation),
  });

  return {
    previous_extraction_run_id: previous_view.context.rosetta_extraction_run_id,
    current_extraction_run_id: current_view.context.rosetta_extraction_run_id,
    previous_authority_fingerprint,
    current_authority_fingerprint,
    mutation_fingerprint,
    structural_similarity: calculate_similarity(summary),
    summary,
    mutations,
  };
};
