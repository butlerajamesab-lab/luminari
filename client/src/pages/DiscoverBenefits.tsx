import { FormEvent, useMemo, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileCheck2,
  Globe2,
  Lightbulb,
  Loader2,
  Phone,
  Search,
  Share2,
  Sparkles,
  X,
} from "lucide-react";

const PAGE_SIZE = 60;

function fmt(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toLocaleString() : "0";
}

function label(value: string | null | undefined) {
  if (!value) return "Uncategorized";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function iconFor(category: string | null | undefined) {
  const value = String(category ?? "").toLowerCase();
  if (value.includes("food")) return "🍎";
  if (value.includes("health")) return "🏥";
  if (value.includes("housing")) return "🏠";
  if (value.includes("disability")) return "♿";
  if (value.includes("tribal")) return "🪶";
  if (value.includes("legal") || value.includes("rights")) return "⚖️";
  if (value.includes("employment") || value.includes("labor")) return "💼";
  if (value.includes("crisis") || value.includes("violence")) return "🛟";
  if (value.includes("veteran")) return "🎖️";
  if (value.includes("cash") || value.includes("benefit")) return "💵";
  return "💡";
}

function FactActions({ fact }: { fact: any }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {fact.phone && (
        <a
          href={`tel:${String(fact.phone).replace(/[^0-9+]/g, "")}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200"
        >
          <Phone className="h-3.5 w-3.5" />
          {fact.phone}
        </a>
      )}
      {fact.website && (
        <a
          href={fact.website}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1.5 text-xs font-semibold text-sky-200"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Website
        </a>
      )}
    </div>
  );
}

export default function DiscoverBenefits() {
  const [queryDraft, setQueryDraft] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [page, setPage] = useState(0);
  const [expandedFact, setExpandedFact] = useState<string | null>(null);
  const [showAllCategories, setShowAllCategories] = useState(false);

  const discovery = trpc.canonicalCore.discoveryFacts.useQuery({
    query: query || undefined,
    category: category || undefined,
    jurisdiction: jurisdiction || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const data = discovery.data as any;
  const items = (Array.isArray(data?.items) ? data.items : []) as any[];
  const categories = (Array.isArray(data?.categories) ? data.categories : []) as Array<{ category: string; count: number }>;
  const visibleCategories = showAllCategories ? categories : categories.slice(0, 28);
  const totalPages = Math.max(1, Math.ceil(Number(data?.total ?? 0) / PAGE_SIZE));
  const daily = data?.daily ?? null;
  const hasFilters = Boolean(query || category || jurisdiction);

  const sourceSummary = useMemo(() => {
    if (!data?.summary) return [];
    return [
      ["Current facts", data.summary.total],
      ["Verified", data.summary.verified],
      ["Jurisdictions", data.summary.jurisdictions],
      ["Source lanes", data.summary.source_lanes],
    ];
  }, [data]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(0);
    setQuery(queryDraft.trim());
  }

  function clearFilters() {
    setQueryDraft("");
    setQuery("");
    setCategory("");
    setJurisdiction("");
    setPage(0);
  }

  async function shareFact(fact: any) {
    const text = `Did you know? ${fact.title}\n\n${fact.body || ""}${fact.phone ? `\n\nPhone: ${fact.phone}` : ""}${fact.website ? `\n\n${fact.website}` : ""}\n\n— Shared via Luminari`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Did You Know?", text });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy this fact");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Link href="/lighthouse">
              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                <ArrowLeft className="mr-1 h-4 w-4" /> Lighthouse
              </Button>
            </Link>
            <div className="h-5 w-px bg-white/10" />
            <Lightbulb className="h-5 w-5 shrink-0 text-amber-400" />
            <h1 className="truncate text-base font-semibold sm:text-lg">Did You Know?</h1>
          </div>
          <Link href="/resources">
            <Button variant="outline" size="sm" className="border-white/10 text-slate-300 hover:bg-white/5">
              <Search className="mr-1 h-4 w-4" /> Resources
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6">
        <section>
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-400" />
            <h2 className="text-xs font-bold uppercase tracking-[0.22em] text-amber-400">Current corpus spotlight</h2>
          </div>

          {discovery.isLoading ? (
            <Card className="border-amber-500/20 bg-amber-950/20">
              <CardContent className="grid min-h-48 place-items-center p-8">
                <Loader2 className="h-7 w-7 animate-spin text-amber-300" />
              </CardContent>
            </Card>
          ) : daily ? (
            <Card className="overflow-hidden border-amber-500/20 bg-gradient-to-br from-amber-950/35 to-slate-900">
              <CardContent className="p-0">
                <div className="p-6 sm:p-8">
                  <div className="flex items-start gap-4">
                    <div className="text-4xl">{iconFor(daily.category)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <Badge className="border-amber-500/30 bg-amber-500/20 text-amber-200">Did You Know?</Badge>
                        <Badge variant="outline" className="border-white/10 text-slate-400">{label(daily.category)}</Badge>
                        {daily.jurisdiction_code && <Badge variant="outline" className="border-white/10 text-slate-400">{daily.jurisdiction_code}</Badge>}
                      </div>
                      <h3 className="text-xl font-bold leading-tight text-white sm:text-2xl">{daily.title}</h3>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300 sm:text-base">{daily.body}</p>
                      <FactActions fact={daily} />
                      <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                        <span className="inline-flex items-center gap-1"><FileCheck2 className="h-3 w-3" /> {daily.verification_status || "source attached"}</span>
                        <span>Source lane: {daily.source_lane || "unknown"}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-white/10 bg-white/[0.02] px-6 py-3 sm:px-8">
                  <p className="text-xs text-slate-500">Source-backed current discovery candidate</p>
                  <Button variant="ghost" size="sm" onClick={() => shareFact(daily)} className="text-slate-400 hover:text-amber-300">
                    <Share2 className="mr-1 h-4 w-4" /> Share
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {sourceSummary.map(([name, value]) => (
            <div key={String(name)} className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <div className="font-mono text-2xl font-bold text-white">{fmt(value)}</div>
              <div className="mt-1 text-[11px] text-slate-500">{String(name)}</div>
            </div>
          ))}
        </section>

        <section>
          <form onSubmit={submitSearch} className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-slate-950/60 p-3 sm:flex-row">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-white/[0.04] px-4">
              <Search className="h-4 w-4 text-amber-300" />
              <input
                value={queryDraft}
                onChange={(event) => setQueryDraft(event.target.value)}
                placeholder="Search all current facts, services, organizations, benefits…"
                className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-slate-600"
              />
            </label>
            <input
              value={jurisdiction}
              onChange={(event) => { setJurisdiction(event.target.value.toUpperCase()); setPage(0); }}
              placeholder="State / territory"
              className="h-11 rounded-xl border border-white/10 bg-slate-900 px-3 text-sm outline-none"
            />
            <button type="submit" className="h-11 rounded-xl bg-amber-400 px-5 text-sm font-bold text-slate-950">Search</button>
            {hasFilters && (
              <button type="button" onClick={clearFilters} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 text-slate-400"><X className="h-4 w-4" /></button>
            )}
          </form>
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Browse current categories</h2>
              <p className="mt-1 text-sm text-slate-500">Raw source categories are preserved rather than collapsed into the old 17-category static list.</p>
            </div>
            <span className="font-mono text-xs text-amber-300">{fmt(categories.length)} categories</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            <button
              onClick={() => { setCategory(""); setPage(0); }}
              className={`rounded-xl border p-3 text-left ${!category ? "border-amber-300/40 bg-amber-400/10" : "border-white/10 bg-white/[0.025]"}`}
            >
              <div className="text-xl">✨</div>
              <div className="mt-1 text-xs font-semibold">All current facts</div>
              <div className="mt-1 font-mono text-[10px] text-slate-500">{fmt(data?.summary?.total)}</div>
            </button>
            {visibleCategories.map((entry) => (
              <button
                key={entry.category}
                onClick={() => { setCategory(category === entry.category ? "" : entry.category); setPage(0); }}
                className={`rounded-xl border p-3 text-left ${category === entry.category ? "border-amber-300/40 bg-amber-400/10" : "border-white/10 bg-white/[0.025] hover:bg-white/[0.05]"}`}
              >
                <div className="text-xl">{iconFor(entry.category)}</div>
                <div className="mt-1 truncate text-xs font-semibold">{label(entry.category)}</div>
                <div className="mt-1 font-mono text-[10px] text-slate-500">{fmt(entry.count)}</div>
              </button>
            ))}
          </div>
          {categories.length > 28 && (
            <button onClick={() => setShowAllCategories((value) => !value)} className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400 hover:bg-white/5">
              {showAllCategories ? "Show top categories" : `Show all ${fmt(categories.length)} categories`}
            </button>
          )}
        </section>

        <section>
          <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Current discovery results</h2>
              <h3 className="mt-1 text-2xl font-semibold text-white">{fmt(data?.total)} matching facts</h3>
              <p className="mt-1 text-xs text-slate-500">Showing a {PAGE_SIZE}-record transport window. Paging reaches the full filtered universe.</p>
            </div>
            <div className="text-xs text-slate-500">Page {page + 1} of {totalPages}</div>
          </div>

          {discovery.error && (
            <div className="rounded-xl border border-rose-400/25 bg-rose-400/5 p-5 text-sm text-rose-200">
              Current discovery facts could not load: {discovery.error.message}
            </div>
          )}

          <div className="space-y-3">
            {items.map((fact) => {
              const expanded = expandedFact === fact.fact_id;
              return (
                <Card key={fact.fact_id} className="overflow-hidden border-white/5 bg-slate-900/50 hover:border-white/10">
                  <CardContent className="p-0">
                    <button
                      onClick={() => setExpandedFact(expanded ? null : fact.fact_id)}
                      className="flex w-full items-start gap-3 p-5 text-left"
                    >
                      <div className="text-2xl">{iconFor(fact.category)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap gap-1.5">
                          <Badge variant="outline" className="border-white/10 text-[9px] text-slate-400">{label(fact.category)}</Badge>
                          {fact.jurisdiction_code && <Badge variant="outline" className="border-white/10 text-[9px] text-slate-400">{fact.jurisdiction_code}</Badge>}
                          {fact.verification_status && <Badge variant="outline" className="border-emerald-400/20 text-[9px] text-emerald-300">{fact.verification_status}</Badge>}
                        </div>
                        <h4 className="text-sm font-semibold leading-snug text-white sm:text-base">{fact.title}</h4>
                        {!expanded && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{fact.body}</p>}
                      </div>
                      <ChevronRight className={`mt-1 h-4 w-4 shrink-0 text-slate-600 transition-transform ${expanded ? "rotate-90" : ""}`} />
                    </button>
                    {expanded && (
                      <div className="border-t border-white/5 px-5 pb-5 pt-4 sm:ml-11">
                        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-300">{fact.body}</p>
                        <FactActions fact={fact} />
                        <div className="mt-4 grid gap-1 text-[10px] text-slate-500 sm:grid-cols-2">
                          <div>Source lane: <code>{fact.source_lane || "unknown"}</code></div>
                          <div>Source ID: <code className="break-all">{fact.source_id || "unknown"}</code></div>
                          <div>Fact type: <code>{fact.fact_type || "unknown"}</code></div>
                          <div>Priority: <code>{fact.display_priority ?? "—"}</code></div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => shareFact(fact)} className="mt-3 h-8 text-xs text-slate-400 hover:text-amber-300">
                          <Share2 className="mr-1 h-3.5 w-3.5" /> Share this fact
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <Button
              variant="outline"
              disabled={page === 0 || discovery.isFetching}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
              className="border-white/10"
            >
              <ChevronLeft className="mr-1 h-4 w-4" /> Previous
            </Button>
            <span className="text-xs text-slate-500">{fmt(page * PAGE_SIZE + 1)}–{fmt(Math.min((page + 1) * PAGE_SIZE, Number(data?.total ?? 0)))}</span>
            <Button
              variant="outline"
              disabled={page + 1 >= totalPages || discovery.isFetching}
              onClick={() => setPage((value) => value + 1)}
              className="border-white/10"
            >
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 text-xs leading-5 text-slate-500">
          <div className="flex items-center gap-2 text-slate-300"><Globe2 className="h-4 w-4" /> Current source-bound discovery</div>
          <p className="mt-2">This page now reads <code>v_lighthouse_did_you_know_candidates_v1</code>. The previous 45 static spotlights remain preserved in the application as a legacy/reference collection but no longer define the visible universe.</p>
        </section>
      </main>
    </div>
  );
}
