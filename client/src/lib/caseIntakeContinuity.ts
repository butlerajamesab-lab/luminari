import type {
  case_intake_continuity_origin_context,
  case_intake_continuity_related_subject,
  case_intake_continuity_surface,
} from "@shared/case-intake-continuity";
import { case_intake_continuity_origin_context_schema } from "@shared/case-intake-continuity";

const STORAGE_KEY_PREFIX = "luminari-case-intake-origin-context:";
const LEGACY_STORAGE_KEY = "luminari-case-intake-origin-context";

function storage_key(case_id?: number | null) {
  return case_id ? `${STORAGE_KEY_PREFIX}${case_id}` : null;
}

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
  if (path.startsWith("/case-overview")) return "case_overview";
  return null;
}

export function write_case_intake_origin_context(
  value: case_intake_continuity_origin_context,
) {
  sessionStorage.setItem(storage_key(value.case_id)!, JSON.stringify(value));
  sessionStorage.removeItem(LEGACY_STORAGE_KEY);
}

export function read_case_intake_origin_context(
  case_id?: number | null,
): case_intake_continuity_origin_context | null {
  const key = storage_key(case_id);
  if (!key) return null;
  const stored = sessionStorage.getItem(key);
  if (!stored) return null;
  try {
    const parsed = case_intake_continuity_origin_context_schema.parse(
      JSON.parse(stored),
    );
    if (case_id && parsed.case_id !== case_id) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

export function clear_case_intake_origin_context(case_id?: number | null) {
  const key = storage_key(case_id);
  if (!key) return;
  sessionStorage.removeItem(key);
  sessionStorage.removeItem(LEGACY_STORAGE_KEY);
}

export function related_subject_label(
  related_subject?: case_intake_continuity_related_subject,
) {
  return related_subject?.label ?? related_subject?.type ?? null;
}
