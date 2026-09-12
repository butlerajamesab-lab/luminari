import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Loader2 } from 'lucide-react';

export function normalizeRegistryWebsite(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return null;
}

export function scheduleRegistrySearch(query: string, publish: (query: string) => void) {
  const timer = setTimeout(() => publish(query), 300);
  return () => clearTimeout(timer);
}

export const REGISTRY_PAGE_SIZE = 20;
type RegistrySearchPage = { query: string; stateCode: string | null; offset: number };

export function registrySearchOffset(page: RegistrySearchPage, query: string, stateCode: string | null) {
  return page.query === query && page.stateCode === stateCode ? page.offset : 0;
}

/** Free text searches existing records; category labels remain literal browse terms. */
export default function BenefitsRegistryPrograms({ searchQuery, browseCategoryKeyword, stateCode }: {
  searchQuery: string;
  browseCategoryKeyword: string | null;
  stateCode: string | null;
}) {
  const targetQuery = searchQuery.trim() || browseCategoryKeyword?.trim() || '';
  const [query, setQuery] = useState(targetQuery);
  const [page, setPage] = useState<RegistrySearchPage>({ query: targetQuery, stateCode, offset: 0 });
  // Resolve the new scope to page one before effects run, avoiding a request
  // for the old page under the new query or state.
  const offset = registrySearchOffset(page, targetQuery, stateCode);
  useEffect(() => setPage({ query: targetQuery, stateCode, offset: 0 }), [targetQuery, stateCode]);
  useEffect(() => scheduleRegistrySearch(targetQuery, setQuery), [targetQuery]);
  const isDebouncing = query !== targetQuery;
  const enabled = query.length > 0 && !isDebouncing;
  const { data: registryPrograms, error, isFetching, isLoading, refetch } = trpc.canonicalRegistry.searchPrograms.useQuery(
    { query, stateCode: stateCode ?? undefined, limit: REGISTRY_PAGE_SIZE, offset },
    { enabled, placeholderData: undefined },
  );
  const pending = isDebouncing || (enabled && (isFetching || isLoading));
  // Never relabel the previous query's rows as results for newly entered text.
  const registryProgramRows = enabled && !pending && !error ? registryPrograms?.programs ?? [] : [];
  const registryProgramTotal = registryPrograms?.total ?? 0;

  if (!targetQuery) return null;
  return (
    <section aria-label="Registry program results" aria-busy={pending} className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Registry programs</h2>
      <p className="text-xs text-muted-foreground">
        Searching for “{targetQuery}”{stateCode ? ` in ${stateCode}` : ' across all jurisdictions'}.
        {!searchQuery.trim() && ' Category names are search terms; try an organization or program name for more results.'}
      </p>
      {pending ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Searching registry programs…
        </p>
      ) : error ? (
        <div role="alert" className="rounded-lg border border-amber-500/30 p-3 text-sm">
          <p>Registry results are unavailable. {error.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">Retry registry search</Button>
        </div>
      ) : registryPrograms ? (
        <>
          <p role="status" className="text-xs text-muted-foreground">
            {registryProgramTotal === 0
              ? 'No registry programs match this search. Try a different program or organization name, or change the state.'
              : registryProgramRows.length === 0
                ? 'No registry programs on this page. Try the previous page.'
                : `Showing ${offset + 1}–${offset + registryProgramRows.length} of ${registryProgramTotal} registry programs.`}
          </p>
          {registryProgramRows.map((p: any) => {
            const registryWebsite = normalizeRegistryWebsite(p.website);
            return (
              <div key={p.id} data-program-id={p.id} className="p-3 rounded-lg bg-card/30 border border-border/30 hover:border-border/60 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground/90 leading-tight">{p.name}</p>
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
                    {(p.state_code || p.jurisdiction_name || p.jurisdiction_id) && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{p.state_code || p.jurisdiction_name || p.jurisdiction_id}</Badge>}
                    {registryWebsite ? (
                      <a href={registryWebsite} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-primary hover:text-primary/80">
                        Visit website <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    ) : <span className="text-[10px] text-muted-foreground">No verified external link available</span>}
                  </div>
                </div>
              </div>
            );
          })}
          {(registryProgramTotal > REGISTRY_PAGE_SIZE || offset > 0) && (
            <nav aria-label="Registry result pages" className="flex items-center justify-between gap-3">
              <Button variant="outline" size="sm" disabled={offset === 0}
                onClick={() => setPage({ query: targetQuery, stateCode, offset: Math.max(0, offset - REGISTRY_PAGE_SIZE) })}>
                Previous programs
              </Button>
              <span className="text-xs text-muted-foreground">Page {Math.floor(offset / REGISTRY_PAGE_SIZE) + 1}</span>
              <Button variant="outline" size="sm" disabled={offset + REGISTRY_PAGE_SIZE >= registryProgramTotal}
                onClick={() => setPage({ query: targetQuery, stateCode, offset: offset + REGISTRY_PAGE_SIZE })}>
                Next programs
              </Button>
            </nav>
          )}
        </>
      ) : <p role="status" className="text-sm text-muted-foreground">Registry results have not loaded yet.</p>}
    </section>
  );
}
