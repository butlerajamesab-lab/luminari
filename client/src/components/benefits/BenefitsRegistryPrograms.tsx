import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Loader2 } from 'lucide-react';

export function normalize_registry_website(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return null;
}

export function schedule_registry_search(query: string, publish: (query: string) => void) {
  const timer = setTimeout(() => publish(query), 300);
  return () => clearTimeout(timer);
}

export const REGISTRY_PAGE_SIZE = 20;
type Registry_search_page = { query: string; state_code: string | null; offset: number };

export function registry_search_offset(page: Registry_search_page, query: string, state_code: string | null) {
  return page.query === query && page.state_code === state_code ? page.offset : 0;
}

/** Free text searches existing records; category labels remain literal browse terms. */
export default function Benefits_registry_programs({ search_query, browse_category_keyword, state_code }: {
  search_query: string;
  browse_category_keyword: string | null;
  state_code: string | null;
}) {
  const target_query = search_query.trim() || browse_category_keyword?.trim() || '';
  const [query, set_query] = useState(target_query);
  const [page, set_page] = useState<Registry_search_page>({ query: target_query, state_code, offset: 0 });
  // Resolve the new scope to page one before effects run, avoiding a request
  // for the old page under the new query or state.
  const offset = registry_search_offset(page, target_query, state_code);
  useEffect(() => set_page({ query: target_query, state_code, offset: 0 }), [target_query, state_code]);
  useEffect(() => schedule_registry_search(target_query, set_query), [target_query]);
  const is_debouncing = query !== target_query;
  const enabled = query.length > 0 && !is_debouncing;
  const { data: registry_programs, error, isFetching: is_fetching, isLoading: is_loading, refetch } = trpc.canonicalRegistry.searchPrograms.useQuery(
    { query, state_code: state_code ?? undefined, federal_only: state_code === null, limit: REGISTRY_PAGE_SIZE, offset },
    { enabled, placeholderData: undefined },
  );
  const pending = is_debouncing || (enabled && (is_fetching || is_loading));
  // Never relabel the previous query's rows as results for newly entered text.
  const registry_program_rows = enabled && !pending && !error ? registry_programs?.programs ?? [] : [];
  const registry_program_total = registry_programs?.total ?? 0;

  if (!target_query) return null;
  return (
    <section aria-label="Registry reference results" aria-busy={pending} className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Registry references</h2>
      <p className="text-xs text-muted-foreground">
        Searching for “{target_query}”{state_code ? ` with a recorded ${state_code} jurisdiction` : ' with a recorded federal jurisdiction'}.
        {!search_query.trim() && ' Category names are search terms; try an organization or program name for more results.'}
      </p>
      <p className="text-xs text-muted-foreground">
        These records include programs, agencies, advocacy groups, and legislators. Recorded categories and jurisdictions are unverified; they do not establish benefit eligibility or current officeholder status.
      </p>
      {pending ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Searching registry references…
        </p>
      ) : error ? (
        <div role="alert" className="rounded-lg border border-amber-500/30 p-3 text-sm">
          <p>Registry results are unavailable. {error.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">Retry registry search</Button>
        </div>
      ) : registry_programs ? (
        <>
          <p role="status" className="text-xs text-muted-foreground">
            {registry_program_total === 0
              ? 'No registry references match this search. Try a different program or organization name, or change the state.'
              : registry_program_rows.length === 0
                ? 'No registry references on this page. Try the previous page.'
                : `Showing ${offset + 1}–${offset + registry_program_rows.length} of ${registry_program_total} registry references.`}
          </p>
          {registry_program_rows.map((p: any) => {
            const registry_website = normalize_registry_website(p.website);
            return (
              <div key={p.id} data-program-id={p.id} className="p-3 rounded-lg bg-card/30 border border-border/30 hover:border-border/60 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground/90 leading-tight">{p.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Recorded category: {p.category?.trim() || 'Unknown'}</p>
                    {p.agency && <p className="text-xs text-muted-foreground mt-0.5">{p.agency}</p>}
                    {p.contact && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">Contact: {p.contact}</p>}
                    {(p.eligibility || p.apply_notes) && <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">{p.eligibility || p.apply_notes}</p>}
                    {p.resource_contacts?.length > 0 && (
                      <details className="mt-2 text-xs text-muted-foreground">
                        <summary className="cursor-pointer">Contact details ({p.resource_contacts.length})</summary>
                        <ul className="mt-1 space-y-1">
                          {p.resource_contacts.map((contact: any) => (
                            <li key={contact.contact_point_id} className="break-words">{contact.contact_type}: {contact.contact_value}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">Recorded: {p.jurisdiction_id?.trim() || p.state_code || p.jurisdiction_name || 'Unknown'}</Badge>
                    <span className="text-[10px] text-muted-foreground">Jurisdiction unverified</span>
                    {registry_website ? (
                      <a href={registry_website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-primary hover:text-primary/80">
                        Visit website <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    ) : <span className="text-[10px] text-muted-foreground">No verified external link available</span>}
                  </div>
                </div>
              </div>
            );
          })}
          {(registry_program_total > REGISTRY_PAGE_SIZE || offset > 0) && (
            <nav aria-label="Registry result pages" className="flex items-center justify-between gap-3">
              <Button variant="outline" size="sm" disabled={offset === 0}
                onClick={() => set_page({ query: target_query, state_code, offset: Math.max(0, offset - REGISTRY_PAGE_SIZE) })}>
                Previous references
              </Button>
              <span className="text-xs text-muted-foreground">Page {Math.floor(offset / REGISTRY_PAGE_SIZE) + 1}</span>
              <Button variant="outline" size="sm" disabled={offset + REGISTRY_PAGE_SIZE >= registry_program_total}
                onClick={() => set_page({ query: target_query, state_code, offset: offset + REGISTRY_PAGE_SIZE })}>
                Next references
              </Button>
            </nav>
          )}
        </>
      ) : <p role="status" className="text-sm text-muted-foreground">Registry results have not loaded yet.</p>}
    </section>
  );
}
