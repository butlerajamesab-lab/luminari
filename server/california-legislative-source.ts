const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const CALIFORNIA_HOST = "leginfo.legislature.ca.gov";
const CALIFORNIA_HOME_URL = `https://${CALIFORNIA_HOST}/faces/home.xhtml`;
const BROWSER_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

type fetched_response = {
  bytes: Buffer;
  content_type: string | null;
  cookie_header: string | null;
};

export type california_official_pdf_receipt = {
  bytes: Buffer;
  source_url: string;
  bill_page_url: string;
  provider_state_link: string;
  session_bootstrapped: boolean;
};

function decode_html_entities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'");
}

function cookie_pairs(headers: Headers): string[] {
  const extended = headers as Headers & { getSetCookie?: () => string[] };
  const values = typeof extended.getSetCookie === "function"
    ? extended.getSetCookie()
    : [headers.get("set-cookie")].filter((value): value is string => Boolean(value));

  return values
    .flatMap(value => value.split(/,(?=\s*[^;,=\s]+=[^;,]*)/g))
    .map(value => value.split(";", 1)[0]?.trim() ?? "")
    .filter(value => /^[^=;\s]+=[^;]*$/.test(value));
}

export function merge_cookie_headers(...headers: Array<string | null | undefined>): string | null {
  const cookies = new Map<string, string>();
  for (const header of headers) {
    if (!header) continue;
    for (const pair of header.split(/;\s*/g)) {
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }
  if (cookies.size === 0) return null;
  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function fetch_bounded(
  url: string,
  headers: Record<string, string>,
): Promise<fetched_response> {
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers,
  });
  if (!response.ok) throw new Error(`california_source_fetch_failed:${response.status}`);

  const content_length = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(content_length) && content_length > MAX_SOURCE_BYTES) {
    throw new Error("california_source_exceeds_max_bytes");
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error("california_source_empty");
  if (bytes.length > MAX_SOURCE_BYTES) throw new Error("california_source_exceeds_max_bytes");

  const pairs = cookie_pairs(response.headers);
  return {
    bytes,
    content_type: response.headers.get("content-type"),
    cookie_header: pairs.length > 0 ? pairs.join("; ") : null,
  };
}

function page_headers(cookie_header?: string | null): Record<string, string> {
  return {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    pragma: "no-cache",
    "user-agent": BROWSER_USER_AGENT,
    ...(cookie_header ? { cookie: cookie_header } : {}),
  };
}

function pdf_headers(
  bill_page_url: string,
  cookie_header?: string | null,
): Record<string, string> {
  return {
    accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.1",
    "accept-language": "en-US,en;q=0.9",
    referer: bill_page_url,
    "user-agent": BROWSER_USER_AGENT,
    ...(cookie_header ? { cookie: cookie_header } : {}),
  };
}

export function derive_california_official_text_url(source_url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(source_url);
  } catch {
    return null;
  }
  if (parsed.hostname.toLowerCase() !== CALIFORNIA_HOST) return null;
  if (!/\/faces\/billTextClient\.xhtml$/i.test(parsed.pathname)) return null;
  const bill_id = parsed.searchParams.get("bill_id")?.trim();
  if (!bill_id) return null;
  const canonical = new URL(`https://${CALIFORNIA_HOST}/faces/billNavClient.xhtml`);
  canonical.searchParams.set("bill_id", bill_id);
  return canonical.toString();
}

export function extract_california_official_pdf_url(
  html: string,
  bill_page_url: string,
  provider_state_link: string,
): string | null {
  const attribute_match = html.match(
    /(?:href|src)\s*=\s*["']([^"']*billPdf\.xhtml\?[^"']+)["']/i,
  );
  const quoted_match = html.match(/["']([^"']*billPdf\.xhtml\?[^"']+)["']/i);
  const candidate = attribute_match?.[1] ?? quoted_match?.[1];
  if (!candidate) return null;

  let parsed: URL;
  try {
    parsed = new URL(decode_html_entities(candidate), bill_page_url);
  } catch {
    return null;
  }
  if (parsed.hostname.toLowerCase() !== CALIFORNIA_HOST) return null;
  if (!/\/faces\/billPdf\.xhtml$/i.test(parsed.pathname)) return null;

  const bill_id = parsed.searchParams.get("bill_id")?.trim();
  const version = parsed.searchParams.get("version")?.trim();
  if (!bill_id || !version) return null;

  const provider = new URL(provider_state_link);
  if (provider.searchParams.get("bill_id") !== bill_id) return null;
  const expected_version = provider.hash.replace(/^#/, "").trim();
  if (expected_version && !version.endsWith(expected_version)) return null;

  return parsed.toString();
}

async function fetch_bill_page(
  bill_page_url: string,
  provider_state_link: string,
  cookie_header?: string | null,
): Promise<{
  pdf_url: string | null;
  cookie_header: string | null;
  page_html: string;
}> {
  const response = await fetch_bounded(bill_page_url, page_headers(cookie_header));
  const merged_cookie = merge_cookie_headers(cookie_header, response.cookie_header);
  const page_html = response.bytes.toString("utf8");
  return {
    pdf_url: extract_california_official_pdf_url(page_html, bill_page_url, provider_state_link),
    cookie_header: merged_cookie,
    page_html,
  };
}

/**
 * Resolve a California JSF bill-text identity to the exact official PDF.
 * Cookies are held in memory for this request only and are never returned,
 * persisted, logged, or included in source identity.
 */
export async function fetch_california_official_pdf(
  provider_state_link: string,
): Promise<california_official_pdf_receipt> {
  const bill_page_url = derive_california_official_text_url(provider_state_link);
  if (!bill_page_url) throw new Error("california_bill_page_identity_invalid");

  let session_bootstrapped = false;
  let page = await fetch_bill_page(bill_page_url, provider_state_link);

  if (!page.pdf_url && page.cookie_header) {
    page = await fetch_bill_page(
      bill_page_url,
      provider_state_link,
      page.cookie_header,
    );
    session_bootstrapped = true;
  }

  if (!page.pdf_url) {
    const home = await fetch_bounded(CALIFORNIA_HOME_URL, page_headers(page.cookie_header));
    const cookie_header = merge_cookie_headers(page.cookie_header, home.cookie_header);
    page = await fetch_bill_page(bill_page_url, provider_state_link, cookie_header);
    session_bootstrapped = true;
  }

  if (!page.pdf_url) throw new Error("california_official_pdf_link_not_found");

  const pdf = await fetch_bounded(
    page.pdf_url,
    pdf_headers(bill_page_url, page.cookie_header),
  );
  if (pdf.bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error(`california_official_pdf_unavailable:${pdf.content_type ?? "unknown"}`);
  }

  return {
    bytes: pdf.bytes,
    source_url: page.pdf_url,
    bill_page_url,
    provider_state_link,
    session_bootstrapped,
  };
}
