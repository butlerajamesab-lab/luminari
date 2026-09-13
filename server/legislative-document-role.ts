export const LEGISLATIVE_NON_LEGISLATIVE_DOCUMENT_ERROR_CODE =
  "legislative_version_non_legislative_document:fiscal_note";

type legislative_document_role_input = {
  source_url: string;
  description: string | null;
};

type legislative_document_role = {
  document_role: "fiscal_note" | "unknown";
  classification_rule: "ky-official-fiscal-note-v1" | null;
};

/**
 * Provider array membership records provenance, not the document's legal role.
 * Kentucky places fiscal notes beside amendments; LegiScan can include both
 * under amendments[]. Require the official note locator AND the provider's
 * explicit fiscal-note description. Body text and bill titles are not inputs.
 * Unrecognized formats stay unknown and follow the existing validation path.
 */
export function classify_legislative_document_role(
  input: legislative_document_role_input,
): legislative_document_role {
  const unknown: legislative_document_role = {
    document_role: "unknown",
    classification_rule: null,
  };
  if (!/^Fiscal (?:Note|Impact Statement)(?:\s|$)/i.test(
    String(input.description ?? "").trim(),
  )) return unknown;

  let source_url: URL;
  try {
    source_url = new URL(input.source_url);
  } catch {
    return unknown;
  }
  if (
    source_url.protocol !== "https:"
    || source_url.hostname !== "apps.legislature.ky.gov"
    || source_url.port !== ""
    || source_url.username !== ""
    || source_url.password !== ""
    || !/^\/recorddocuments\/note\/[^/]+\/[^/]+\/[^/]+FN\.pdf$/i.test(
      source_url.pathname,
    )
  ) return unknown;

  return {
    document_role: "fiscal_note",
    classification_rule: "ky-official-fiscal-note-v1",
  };
}

export function assert_legislative_document_role(
  input: legislative_document_role_input,
): void {
  if (classify_legislative_document_role(input).document_role === "fiscal_note") {
    throw new Error(LEGISLATIVE_NON_LEGISLATIVE_DOCUMENT_ERROR_CODE);
  }
}
