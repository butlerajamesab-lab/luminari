import type {
  case_intake_continuity_origin_context,
  case_intake_continuity_related_subject,
  case_intake_continuity_surface,
} from "@shared/case-intake-continuity";

const STORAGE_KEY = "luminari-case-intake-origin-context";

export function case_intake_surface_for_path(
  path: string,
): case_intake_continuity_surface | null {
  if (path.startsWith("/documents")) return "documents";
  if (path.startsWith("/entities")) return "entities";
  if (path.startsWith("/timeline")) return "timeline";
  if (path.startsWith("/network")) return "network";
  if (path.startsWith("/findings")) return "findings";
  if (
    path.startsWith("/control-room")
    || path.startsWith("/integrity")
    || path.startsWith("/provenance")
    || path.startsWith("/cda")
  ) {
    return "review";
  }
  if (
    path.startsWith("/guide/")
    || path.startsWith("/filing-generator")
    || path.startsWith("/templates")
    || path.startsWith("/lumensend")
    || path.startsWith("/foia")
    || path.startsWith("/narrative")
    || path.startsWith("/exports")
    || path.startsWith("/presentations")
    || path.startsWith("/enforcement-pathway")
  ) {
    return "act";
  }
  if (path.startsWith("/case-overview") || path === "/") return "case_overview";
  return null;
}

export function write_case_intake_origin_context(
  value: case_intake_continuity_origin_context,
) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function read_case_intake_origin_context(
  case_id?: number | null,
): case_intake_continuity_origin_context | null {
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as case_intake_continuity_origin_context;
    if (case_id && parsed.case_id !== case_id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clear_case_intake_origin_context(case_id?: number | null) {
  const stored = read_case_intake_origin_context(case_id);
  if (!stored) return;
  sessionStorage.removeItem(STORAGE_KEY);
}

export function related_subject_label(
  related_subject?: case_intake_continuity_related_subject,
) {
  return related_subject?.label ?? related_subject?.type ?? null;
}
