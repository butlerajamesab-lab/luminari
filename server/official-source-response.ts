/** Recognizes the observed upstream rejection document, not words in legal text. */
function is_request_rejected_html(bytes: Buffer): boolean {
  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") return false;
  // Both callers enforce the response-size limit before this check. Search
  // the complete bounded document: diagnostics can push either marker far
  // beyond the opening bytes without changing its rejection-page identity.
  const html = bytes.toString("utf8");
  return /^\s*(?:<!doctype\s+html[^>]*>\s*)?<html\b/i.test(html)
    && /<title>\s*Request Rejected\s*<\/title>/i.test(html)
    && /The requested URL was rejected\./i.test(html);
}

export function is_official_source_rejection_error(error_code: string): boolean {
  return /^official_source_request_rejected_html:http_2\d{2}$/.test(error_code);
}

/**
 * A successful HTTP status can carry an upstream block page. Preserve the
 * observed status in the transport error before normalization or persistence.
 */
export function assert_official_source_response(
  status: number,
  bytes: Buffer,
): void {
  if (status >= 200 && status < 300 && is_request_rejected_html(bytes)) {
    throw new Error(`official_source_request_rejected_html:http_${status}`);
  }
}
