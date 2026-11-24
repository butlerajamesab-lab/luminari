import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { query_with_diagnostics } from "./db";
import { background_feature_enabled } from "./runtime-role";

/**
 * Native Nations site capture: reads each nation's own public website and
 * stores the raw page, so every word a card later shows can be cited to the
 * exact page and moment it was read. Nothing is rewritten or summarized here.
 *
 * Polite by design: one nation at a time, a pause between pages, robots.txt
 * honored (a disallowed page is recorded as not read), same-site links only,
 * and at most MAX_LINKED_PAGES linked pages per nation.
 *
 * Off unless NATIVE_NATION_SITE_CAPTURE_ENABLED is exactly "true" on a worker.
 */
export const CAPTURE_USER_AGENT =
  "LuminariNativeNationsCapture/1.0 (reads public pages to quote each nation in its own words with citation; honors robots.txt)";

const CYCLE_INTERVAL_MS = 20_000;
const PAGE_PAUSE_MS = 3_000;
const FETCH_DEADLINE_MS = 30_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_LINKED_PAGES = 6;
const RECAPTURE_AFTER_DAYS = 30;

// Link text that points at a nation's own account of itself or its asks.
const LINK_TEXT_PATTERN =
  /\b(about|history|who we are|our story|our people|culture|language|government|council|leadership|sovereign|recognition|treaty|contact|support|donate|volunteer|take action|get involved|stand with)\b/i;

export const NEXT_NATION_SQL = `
  select r.nation_key, r.website_url
  from public.native_nation_registry_v1 r
  where nullif(btrim(r.website_url), '') is not null
    and not exists (
      select 1 from public.native_nation_site_capture_v1 c
      where c.nation_key = r.nation_key
        and c.page_role = 'home'
        and c.captured_at > now() - make_interval(days => ${RECAPTURE_AFTER_DAYS})
    )
  order by r.nation_name, r.nation_key
  limit 1
`;

export const INSERT_CAPTURE_SQL = `
  insert into public.native_nation_site_capture_v1 (
    nation_key, requested_url, final_url, page_role, link_text, http_status,
    content_type, body_gzip, body_bytes, body_sha256, robots_allowed, error_code
  ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  returning capture_id
`;

export function normalize_site_url(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

type robots_rule = { allow: boolean; path: string };

/** Rules for our agent, else for "*", from a robots.txt body. */
export function parse_robots(body: string, agent_token = "luminarinativenationscapture"): robots_rule[] {
  const groups: { agents: string[]; rules: robots_rule[] }[] = [];
  let current: { agents: string[]; rules: robots_rule[] } | null = null;
  let last_was_agent = false;
  for (const raw_line of body.split(/\r?\n/)) {
    const line = raw_line.replace(/#.*$/, "").trim();
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const field = match[1].toLowerCase();
    const value = match[2].trim();
    if (field === "user-agent") {
      if (!current || !last_was_agent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      last_was_agent = true;
      continue;
    }
    last_was_agent = false;
    if (!current) continue;
    if (field === "disallow" && value !== "") current.rules.push({ allow: false, path: value });
    if (field === "allow" && value !== "") current.rules.push({ allow: true, path: value });
  }
  const own = groups.find(group => group.agents.some(agent => agent_token.startsWith(agent) && agent !== "*"));
  const any = groups.find(group => group.agents.includes("*"));
  return (own ?? any)?.rules ?? [];
}

function rule_matches(rule_path: string, path: string): boolean {
  const anchored = rule_path.endsWith("$");
  const pattern = (anchored ? rule_path.slice(0, -1) : rule_path)
    .split("*")
    .map(part => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(path);
}

/** Longest matching rule wins; ties go to allow; no rule means allowed. */
export function robots_allows(rules: robots_rule[], path: string): boolean {
  let best: robots_rule | null = null;
  for (const rule of rules) {
    if (!rule_matches(rule.path, path)) continue;
    if (!best || rule.path.length > best.path.length
      || (rule.path.length === best.path.length && rule.allow)) best = rule;
  }
  return best ? best.allow : true;
}

/** Same-site links whose visible text names the nation's own account or asks. */
export function select_linked_pages(html: string, base_url: string): { url: string; link_text: string }[] {
  const base = new URL(base_url);
  const host = base.hostname.replace(/^www\./, "");
  const seen = new Set<string>([new URL(base_url).toString()]);
  const picked: { url: string; link_text: string }[] = [];
  const anchor = /<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchor)) {
    const link_text = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!link_text || !LINK_TEXT_PATTERN.test(link_text)) continue;
    let url: URL;
    try {
      url = new URL(match[1], base);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    if (url.hostname.replace(/^www\./, "") !== host) continue;
    url.hash = "";
    const key = url.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push({ url: key, link_text: link_text.slice(0, 200) });
    if (picked.length >= MAX_LINKED_PAGES) break;
  }
  return picked;
}

type fetched_page = {
  final_url: string | null;
  http_status: number | null;
  content_type: string | null;
  body: Buffer | null;
  error_code: string | null;
};

async function fetch_page(url: string, signal: AbortSignal): Promise<fetched_page> {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": CAPTURE_USER_AGENT, accept: "text/html,text/plain;q=0.9,*/*;q=0.1" },
      signal: AbortSignal.any([signal, AbortSignal.timeout(FETCH_DEADLINE_MS)]),
    });
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > MAX_BODY_BYTES) {
      return { final_url: response.url, http_status: response.status, content_type: response.headers.get("content-type"), body: null, error_code: "body_too_large" };
    }
    return {
      final_url: response.url,
      http_status: response.status,
      content_type: response.headers.get("content-type"),
      body,
      error_code: response.ok ? null : `http_${response.status}`,
    };
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    return { final_url: null, http_status: null, content_type: null, body: null, error_code: `fetch_${name}`.slice(0, 80) };
  }
}

async function load_robots(site: URL, signal: AbortSignal): Promise<robots_rule[]> {
  const page = await fetch_page(new URL("/robots.txt", site).toString(), signal);
  if (!page.body || page.http_status !== 200) return [];
  return parse_robots(page.body.toString("utf8"));
}

async function record(
  nation_key: string,
  requested_url: string,
  page_role: "home" | "linked",
  link_text: string | null,
  robots_allowed: boolean,
  page: fetched_page | null,
): Promise<void> {
  const body = page?.body ?? null;
  await query_with_diagnostics(INSERT_CAPTURE_SQL, [
    nation_key,
    requested_url,
    page?.final_url ?? null,
    page_role,
    link_text,
    page?.http_status ?? null,
    page?.content_type ?? null,
    body ? gzipSync(body) : null,
    body ? body.length : null,
    body ? createHash("sha256").update(body).digest("hex") : null,
    robots_allowed,
    robots_allowed ? page?.error_code ?? null : "robots_disallowed",
  ], { label: "native_nation_site_capture_insert", query_timeout_ms: 10_000 });
}

const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>(resolve => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });

/** Capture one nation's home page and its own linked pages. */
export async function capture_next_nation(signal: AbortSignal): Promise<string | null> {
  const next = await query_with_diagnostics<{ nation_key: string; website_url: string }>(
    NEXT_NATION_SQL, [], { label: "native_nation_site_capture_next", query_timeout_ms: 10_000 },
  );
  const nation = next.rows[0];
  if (!nation) return null;
  const home_url = normalize_site_url(nation.website_url);
  if (!home_url) {
    await record(nation.nation_key, nation.website_url, "home", null, true, {
      final_url: null, http_status: null, content_type: null, body: null, error_code: "invalid_url",
    });
    return nation.nation_key;
  }
  const site = new URL(home_url);
  const rules = await load_robots(site, signal);
  const home_allowed = robots_allows(rules, site.pathname || "/");
  const home = home_allowed ? await fetch_page(home_url, signal) : null;
  await record(nation.nation_key, home_url, "home", null, home_allowed, home);
  if (!home?.body || home.error_code) return nation.nation_key;

  const html = home.body.toString("utf8");
  for (const link of select_linked_pages(html, home.final_url ?? home_url)) {
    if (signal.aborted) break;
    await pause(PAGE_PAUSE_MS, signal);
    const path = new URL(link.url);
    const allowed = robots_allows(rules, path.pathname + path.search);
    const page = allowed ? await fetch_page(link.url, signal) : null;
    await record(nation.nation_key, link.url, "linked", link.link_text, allowed, page);
  }
  return nation.nation_key;
}

function enabled(): boolean {
  return background_feature_enabled("NATIVE_NATION_SITE_CAPTURE_ENABLED");
}

let timer: NodeJS.Timeout | null = null;
let active: Promise<unknown> | null = null;
let controller = new AbortController();

function run_guarded(): void {
  if (active) return;
  active = capture_next_nation(controller.signal)
    .then(nation_key => {
      if (nation_key) console.log("[NativeNationSiteCapture] captured", { nation_key });
    })
    .catch(error => console.error("[NativeNationSiteCapture] failed", {
      error_code: error instanceof Error ? error.message.slice(0, 160) : "unknown",
    }))
    .finally(() => { active = null; });
}

export function start_native_nation_site_capture(): void {
  if (timer || !enabled()) return;
  controller = new AbortController();
  console.log("[NativeNationSiteCapture] started", { cycle_interval_ms: CYCLE_INTERVAL_MS });
  run_guarded();
  timer = setInterval(run_guarded, CYCLE_INTERVAL_MS);
  timer.unref?.();
}

export async function stop_native_nation_site_capture(): Promise<void> {
  if (timer) clearInterval(timer);
  timer = null;
  controller.abort();
  await active;
}
