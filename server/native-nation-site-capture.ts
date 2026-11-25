import { create_idle_backoff, type idle_backoff } from "./_core/idle-backoff";
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
const ROBOTS_RETRY_AFTER_DAYS = 1;
const MAX_REDIRECTS = 5;

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
        and c.captured_at > now() - make_interval(days => case
          when c.error_code = 'robots_unreachable' then ${ROBOTS_RETRY_AFTER_DAYS}
          else ${RECAPTURE_AFTER_DAYS} end)
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
  robots_allowed: boolean;
  error_code: string | null;
};

type raw_response = {
  http_status: number;
  content_type: string | null;
  location: string | null;
  body: Buffer | null;
  error_code: string | null;
};

/** Read a body, stopping as soon as it passes MAX_BODY_BYTES. */
async function read_bounded(response: Response): Promise<{ body: Buffer | null; too_large: boolean }> {
  if (!response.body) return { body: Buffer.alloc(0), too_large: false };
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return { body: null, too_large: true };
    }
    chunks.push(Buffer.from(value));
  }
  return { body: Buffer.concat(chunks), too_large: false };
}

/** One request, no redirect following. */
async function request_once(url: string, signal: AbortSignal): Promise<raw_response> {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": CAPTURE_USER_AGENT, accept: "text/html,text/plain;q=0.9,*/*;q=0.1" },
      signal: AbortSignal.any([signal, AbortSignal.timeout(FETCH_DEADLINE_MS)]),
    });
    const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
    if (location) {
      await response.body?.cancel().catch(() => undefined);
      return { http_status: response.status, content_type: null, location, body: null, error_code: null };
    }
    const { body, too_large } = await read_bounded(response);
    return {
      http_status: response.status,
      content_type: response.headers.get("content-type"),
      location: null,
      body,
      error_code: too_large ? "body_too_large" : response.ok ? null : `http_${response.status}`,
    };
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    return { http_status: 0, content_type: null, location: null, body: null, error_code: `fetch_${name}`.slice(0, 80) };
  }
}

export type robots_state = { status: "rules"; rules: robots_rule[] } | { status: "unreachable" };

/**
 * RFC 9309: a 4xx robots.txt (other than 429) means no rules; a 5xx, 429,
 * network failure or redirect loop means the site's wishes are unknown, so
 * nothing is read until it can be checked.
 */
export function robots_state_from(http_status: number, body: Buffer | null): robots_state {
  if (http_status === 200 && body) return { status: "rules", rules: parse_robots(body.toString("utf8")) };
  if (http_status >= 400 && http_status < 500 && http_status !== 429) return { status: "rules", rules: [] };
  return { status: "unreachable" };
}

export function same_site(a: URL, b: URL): boolean {
  return a.hostname.replace(/^www\./, "") === b.hostname.replace(/^www\./, "");
}

export class robots_cache {
  private readonly by_origin = new Map<string, robots_state>();
  constructor(private readonly signal: AbortSignal) {}

  async for_url(url: URL): Promise<robots_state> {
    const known = this.by_origin.get(url.origin);
    if (known) return known;
    let target = new URL("/robots.txt", url);
    let state: robots_state = { status: "unreachable" };
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const response = await request_once(target.toString(), this.signal);
      if (response.location) {
        target = new URL(response.location, target);
        continue;
      }
      state = robots_state_from(response.http_status, response.body);
      break;
    }
    this.by_origin.set(url.origin, state);
    return state;
  }
}

/**
 * Fetch a page, following redirects by hand so every hop is checked against
 * its own site's robots.txt, and (when site_lock is given) stays on that site.
 */
export async function fetch_page(
  start_url: string,
  robots: robots_cache,
  signal: AbortSignal,
  site_lock: URL | null,
): Promise<fetched_page> {
  let url = new URL(start_url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return { final_url: url.toString(), http_status: null, content_type: null, body: null, robots_allowed: false, error_code: "redirect_bad_scheme" };
    }
    if (site_lock && !same_site(url, site_lock)) {
      return { final_url: url.toString(), http_status: null, content_type: null, body: null, robots_allowed: false, error_code: "redirect_off_site" };
    }
    const state = await robots.for_url(url);
    if (state.status === "unreachable") {
      return { final_url: url.toString(), http_status: null, content_type: null, body: null, robots_allowed: false, error_code: "robots_unreachable" };
    }
    if (!robots_allows(state.rules, url.pathname + url.search)) {
      return { final_url: url.toString(), http_status: null, content_type: null, body: null, robots_allowed: false, error_code: "robots_disallowed" };
    }
    const response = await request_once(url.toString(), signal);
    if (response.location) {
      url = new URL(response.location, url);
      url.hash = "";
      continue;
    }
    return {
      final_url: url.toString(),
      http_status: response.http_status || null,
      content_type: response.content_type,
      body: response.body,
      robots_allowed: true,
      error_code: response.error_code,
    };
  }
  return { final_url: url.toString(), http_status: null, content_type: null, body: null, robots_allowed: true, error_code: "too_many_redirects" };
}

async function record(
  nation_key: string,
  requested_url: string,
  page_role: "home" | "linked",
  link_text: string | null,
  page: fetched_page,
): Promise<void> {
  const body = page.error_code ? null : page.body;
  await query_with_diagnostics(INSERT_CAPTURE_SQL, [
    nation_key,
    requested_url,
    page.final_url,
    page_role,
    link_text,
    page.http_status,
    page.content_type,
    body ? gzipSync(body) : null,
    body ? body.length : null,
    body ? createHash("sha256").update(body).digest("hex") : null,
    page.robots_allowed,
    page.error_code,
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
    await record(nation.nation_key, nation.website_url, "home", null, {
      final_url: null, http_status: null, content_type: null, body: null, robots_allowed: false, error_code: "invalid_url",
    });
    return nation.nation_key;
  }
  const robots = new robots_cache(signal);
  // The home page may move to the nation's newer domain; its linked pages
  // must then stay on wherever the home page landed.
  const home = await fetch_page(home_url, robots, signal, null);
  await record(nation.nation_key, home_url, "home", null, home);
  if (!home.body || home.error_code || !home.final_url) return nation.nation_key;

  const landed = new URL(home.final_url);
  for (const link of select_linked_pages(home.body.toString("utf8"), home.final_url)) {
    if (signal.aborted) break;
    await pause(PAGE_PAUSE_MS, signal);
    const page = await fetch_page(link.url, robots, signal, landed);
    await record(nation.nation_key, link.url, "linked", link.link_text, page);
  }
  return nation.nation_key;
}

function enabled(): boolean {
  return background_feature_enabled("NATIVE_NATION_SITE_CAPTURE_ENABLED");
}

let timer: NodeJS.Timeout | null = null;
let backoff: idle_backoff | null = null;
let active: Promise<unknown> | null = null;
let controller = new AbortController();

function run_guarded(): void {
  if (active) return;
  if (backoff?.should_run() === false) return;
  active = capture_next_nation(controller.signal)
    .then(nation_key => {
      backoff?.record(nation_key !== null);
      if (nation_key) console.log("[NativeNationSiteCapture] captured", { nation_key });
    })
    .catch(error => {
      backoff?.record(false);
      console.error("[NativeNationSiteCapture] failed", {
        error_code: error instanceof Error ? error.message.slice(0, 160) : "unknown",
      });
    })
    .finally(() => { active = null; });
}

export function start_native_nation_site_capture(): void {
  if (timer || !enabled()) return;
  controller = new AbortController();
  console.log("[NativeNationSiteCapture] started", { cycle_interval_ms: CYCLE_INTERVAL_MS });
  backoff = create_idle_backoff("native_nation_site_capture", CYCLE_INTERVAL_MS, {
    watch_tables: ["public.native_nation_registry_v1"],
  });
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
