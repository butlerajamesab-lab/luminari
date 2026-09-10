import { useEffect, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { trpc } from "@/lib/trpc";

export const VIEWFINDER_REFRESH_MS = 30_000;
const PAGE_SIZE = 50;
type Domain = "live_data" | "legal_pattern";
type Artifact = inferRouterOutputs<AppRouter>["enforcementIntel"]["list_signal_artifacts"]["items"][number];

export function formatViewfinderDate(value: string | null | undefined) {
  if (!value) return "Unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

function readable(value: string) {
  return value.replaceAll("_", " ");
}

function sourceUrls(value: unknown, urls = new Set<string>()): string[] {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) {
    try { urls.add(new URL(value).href); } catch { /* Unusable source locator. */ }
  } else if (Array.isArray(value)) {
    value.forEach((entry) => sourceUrls(entry, urls));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((entry) => sourceUrls(entry, urls));
  }
  return [...urls];
}

export function ViewfinderEvidence({ item }: { item: Artifact }) {
  const detail = trpc.enforcementIntel.get_signal_artifact.useQuery(
    { domain: item.domain_code, record_id: item.record_id },
    {
      staleTime: 0,
      refetchInterval: VIEWFINDER_REFRESH_MS,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  );
  const errorCode = detail.error?.data?.code;
  if (errorCode === "NOT_FOUND") return <p role="alert">This record is no longer current. Refresh the feed to see its replacement.</p>;
  if (errorCode === "UNAUTHORIZED" || errorCode === "FORBIDDEN") return <p role="alert">Evidence access is unavailable. Sign in again to check your access.</p>;
  if (detail.error && !detail.data) return <p role="alert">Evidence could not be loaded. Retry by reopening its evidence.</p>;
  if (!detail.data) return <p role="status">Loading evidence…</p>;
  return (
    <div className="vf-evidence">
      {detail.error ? <p role="alert">Evidence refresh failed. Showing the last successful evidence; it may be out of date.</p> : null}
      {detail.fetchStatus === "paused" ? <p role="status">Connection paused; showing the last successful evidence.</p> : null}
      <p>{detail.data.environmental_effect}</p>
      <div className="vf-badges">
        {sourceUrls(detail.data.evidence).map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer">Source {index + 1} ↗</a>)}
      </div>
      <div>Source: <span className="vf-reference">{detail.data.source_reference ?? "Unknown"}</span></div>
      <div>Input hash: <span className="vf-reference">{detail.data.method.input_hash ?? "Unknown"}</span></div>
      <div>Record hash: <span className="vf-reference">{detail.data.source_hash}</span></div>
      <details>
        <summary>Evidence references and recorded statistics</summary>
        <pre>{JSON.stringify(detail.data.evidence, null, 2)}</pre>
      </details>
      <a href={`/signal-registry?${new URLSearchParams({ signal_domain: item.domain_code, signal_id: item.record_id })}`}>Open full evidence in Signal Registry →</a>
    </div>
  );
}

function ArtifactCard({ item }: { item: Artifact }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className="vf-artifact">
      <div className="vf-badges">
        <span>{readable(item.artifact_type)}</span>
        <span>{item.jurisdiction_id ?? "Jurisdiction unknown"}</span>
      </div>
      <h3>{item.title}</h3>
      <p>{item.description}</p>
      <dl className="vf-facts">
        <div><dt>Verification</dt><dd>{readable(item.status)}</dd></div>
        {item.governance_status ? <div><dt>Review state</dt><dd>{readable(item.governance_status)}</dd></div> : null}
        <div><dt>Observed / detected</dt><dd>{formatViewfinderDate(item.occurred_at)}</dd></div>
        {item.domain_code === "live_data" ? <div><dt>Source freshness</dt><dd>{formatViewfinderDate(item.source_freshness_at)}</dd></div> : null}
        <div><dt>Rule</dt><dd>{item.method.rule_id ?? "Unknown"} · version {item.method.rule_version ?? "Unknown"}</dd></div>
        <div><dt>Engine</dt><dd>{item.method.engine_id ?? "Unknown"} · version {item.method.engine_version ?? "Unknown"}</dd></div>
      </dl>
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        {expanded ? "Hide evidence" : "Inspect evidence"}
      </button>
      {expanded ? <ViewfinderEvidence item={item} /> : null}
    </article>
  );
}

/** Kept below the authenticated component boundary: guests never start these reads. */
export function ViewfinderArtifactFeed({ domain }: { domain: Domain }) {
  const [offset, setOffset] = useState(0);
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const feed = trpc.enforcementIntel.list_signal_artifacts.useQuery(
    { domain, limit: PAGE_SIZE, offset, query: search || undefined },
    {
      staleTime: 0,
      refetchInterval: VIEWFINDER_REFRESH_MS,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
    },
  );
  const accessDenied = feed.error?.data?.code === "UNAUTHORIZED" || feed.error?.data?.code === "FORBIDDEN";
  const data = accessDenied ? undefined : feed.data;
  const items = data?.items ?? [];

  useEffect(() => {
    if (data && offset > 0 && offset >= data.total) {
      setOffset(data.total ? Math.floor((data.total - 1) / PAGE_SIZE) * PAGE_SIZE : 0);
    }
  }, [data, offset]);

  const countText = data
    ? `${items.length ? offset + 1 : 0}–${offset + items.length} of ${data.total.toLocaleString()} results`
    : "Loading results…";
  const navigation = (
    <div className="vf-pagination">
      <span>{countText}</span>
      <div>
        <button type="button" disabled={offset === 0 || feed.isFetching} onClick={() => setOffset(0)}>Newest</button>
        <button type="button" disabled={offset === 0 || feed.isFetching} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Previous</button>
        <button type="button" disabled={!data?.has_more || feed.isFetching} onClick={() => { if (data?.next_offset != null) setOffset(data.next_offset); }}>Next</button>
      </div>
    </div>
  );

  return (
    <section className="viewfinder-feed" aria-label={domain === "live_data" ? "Live anomalies" : "Live patterns"}>
      <div className="vf-heading">
        <div>
          <h2>{domain === "live_data" ? "Live anomaly candidates" : "Live legal patterns"}</h2>
          <p>{domain === "live_data"
            ? "Current Atlas detections from the same records used by Signal Registry. Candidates remain reviewable observations; verification and review state are shown separately."
            : "Current Prism legal-pattern records, with the original rule, evidence, and verification state. New and superseding records appear as the pipeline publishes them."}</p>
          {domain === "legal_pattern" ? <a href="/patterns">Open patterns across your cases →</a> : null}
        </div>
        <button type="button" disabled={feed.isFetching} onClick={() => { void feed.refetch(); }}>{feed.isFetching ? "Refreshing…" : "Refresh now"}</button>
      </div>
      <div className="vf-freshness" role="status">
        Checks every 30 seconds while visible, and when you return. Last successful check: {formatViewfinderDate(data?.checked_at)}.
        {feed.fetchStatus === "paused" ? " Connection paused; showing the last successful result." : ""}
      </div>
      {feed.error ? <div className="vf-error" role="alert">Refresh failed. {accessDenied ? "Your session no longer has access. Sign in again to view detections." : data ? "Showing the last successful result; it may be out of date." : "The live feed is unavailable."} Use Refresh now to retry.</div> : null}
      <form className="vf-search" onSubmit={(event) => { event.preventDefault(); setSearch(draftSearch.trim()); setOffset(0); }}>
        <label htmlFor={`vf-search-${domain}`}>Search all results</label>
        <input id={`vf-search-${domain}`} value={draftSearch} maxLength={200} onChange={(event) => setDraftSearch(event.target.value)} placeholder="Title, type, jurisdiction, or source…" />
        <button type="submit">Search</button>
        {search ? <button type="button" onClick={() => { setDraftSearch(""); setSearch(""); setOffset(0); }}>Clear</button> : null}
      </form>
      {navigation}
      {!feed.isLoading && !feed.error && !items.length ? <p className="vf-empty">{search ? "No current records match this search." : "No current records have been published in this feed."}</p> : null}
      <div className={domain === "live_data" ? "vf-grid" : "vf-list"}>
        {items.map((item) => <ArtifactCard key={`${item.domain_code}:${item.record_id}:${item.source_hash}`} item={item} />)}
      </div>
      {items.length ? navigation : null}
      <style>{`
        .viewfinder-feed { color: #F2EDE4; }
        .viewfinder-feed h2 { font: 29px Georgia, serif; margin: 0 0 10px; }
        .viewfinder-feed h3 { font: 21px/1.3 Georgia, serif; margin: 12px 0; }
        .viewfinder-feed p { color: #B8B0A0; font-size: 13px; line-height: 1.65; }
        .viewfinder-feed a { color: #E8A820; font-size: 13px; }
        .viewfinder-feed button { background: #181820; color: #F2EDE4; border: 1px solid rgba(232,168,32,.3); border-radius: 7px; padding: 9px 12px; font-size: 12px; cursor: pointer; }
        .viewfinder-feed button:disabled { opacity: .45; cursor: default; }
        .viewfinder-feed button:focus-visible, .viewfinder-feed input:focus-visible { outline: 2px solid #E8A820; outline-offset: 3px; }
        .vf-heading, .vf-pagination { display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap; }
        .vf-heading > div { flex: 1; min-width: min(100%, 260px); max-width: 900px; }
        .vf-freshness { font-size: 12px; color: #B8B0A0; line-height: 1.6; margin: 15px 0; }
        .vf-error { padding: 14px; border: 1px solid #C84040; border-radius: 9px; margin: 14px 0; }
        .vf-search { display: flex; flex-wrap: wrap; align-items: center; gap: 9px; margin: 20px 0; }
        .vf-search label { font-size: 12px; }
        .vf-search input { flex: 1; min-width: min(100%, 220px); background: #13131A; color: #F2EDE4; border: 1px solid rgba(255,255,255,.15); border-radius: 8px; padding: 10px; font-size: 13px; }
        .vf-pagination { margin: 16px 0; font-size: 12px; color: #B8B0A0; }
        .vf-pagination > div { display: flex; gap: 7px; }
        .vf-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,340px),1fr)); gap: 14px; align-items: start; }
        .vf-list { display: grid; gap: 14px; }
        .vf-artifact { min-width: 0; overflow-wrap: anywhere; background: #13131A; border: 1px solid rgba(255,255,255,.07); border-top: 2px solid #C87820; border-radius: 12px; padding: 18px; }
        .vf-badges { display: flex; flex-wrap: wrap; gap: 8px; color: #E8A820; font-size: 11px; text-transform: capitalize; }
        .vf-badges span { border: 1px solid rgba(232,168,32,.3); border-radius: 20px; padding: 4px 8px; }
        .vf-facts { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,210px),1fr)); gap: 12px; margin: 16px 0; font-size: 12px; }
        .vf-facts dt { color: #B8B0A0; margin-bottom: 4px; }
        .vf-facts dd { margin: 0; line-height: 1.5; }
        .vf-evidence { border-top: 1px solid rgba(255,255,255,.1); margin-top: 15px; font-size: 12px; line-height: 1.65; }
        .vf-reference { overflow-wrap: anywhere; color: #B8B0A0; }
        .vf-evidence details { margin: 12px 0; }
        .vf-evidence summary { cursor: pointer; color: #E8A820; }
        .vf-evidence pre { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 420px; overflow-y: auto; background: #0D0D0F; padding: 10px; font-size: 11px; }
        .vf-empty { padding: 24px; background: #13131A; border-radius: 12px; }
      `}</style>
    </section>
  );
}
