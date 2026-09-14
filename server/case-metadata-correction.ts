import { z } from "zod";

export const editable_case_metadata_patch_schema = z.object({
  name: z.string().trim().min(1).max(240).optional(),
  description: z.string().trim().max(40_000).optional(),
  status: z.enum(["active", "archived"]).optional(),
  domain: z.string().trim().max(120).optional(),
  container: z.string().trim().max(240).optional(),
}).strict();

export type editable_case_metadata_patch = z.infer<
  typeof editable_case_metadata_patch_schema
>;

export type normalized_case_metadata_patch = {
  name?: string;
  description?: string | null;
  status?: "active" | "archived";
  domain?: string | null;
  container?: string | null;
};

export type case_metadata_snapshot = {
  name: string | null;
  description: string | null;
  status: string | null;
  domain: string | null;
  container: string | null;
};

export type case_metadata_change = {
  before: string | null;
  after: string | null;
};

function nullable_metadata_value(value: string) {
  return value.length > 0 ? value : null;
}

export function normalize_case_metadata_patch(
  patch: editable_case_metadata_patch,
): normalized_case_metadata_patch {
  return {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.description !== undefined
      ? { description: nullable_metadata_value(patch.description) }
      : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.domain !== undefined
      ? { domain: nullable_metadata_value(patch.domain)?.toLowerCase() ?? null }
      : {}),
    ...(patch.container !== undefined
      ? { container: nullable_metadata_value(patch.container) }
      : {}),
  };
}

export function describe_case_metadata_changes(
  before: case_metadata_snapshot,
  patch: normalized_case_metadata_patch,
): Record<string, case_metadata_change> {
  const changes: Record<string, case_metadata_change> = {};

  for (const field of ["name", "description", "status", "domain", "container"] as const) {
    if (patch[field] === undefined) continue;
    const previous = before[field] ?? null;
    const next = patch[field] ?? null;
    if (previous !== next) {
      changes[field] = { before: previous, after: next };
    }
  }

  return changes;
}
