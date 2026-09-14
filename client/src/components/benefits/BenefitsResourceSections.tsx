import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function benefits_directory_href(category: string, state_code?: string | null, query?: string) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (state_code) params.set("jurisdiction", state_code);
  if (query) params.set("query", query);
  return `/resources?${params.toString()}`;
}

export function Benefits_directory_categories({ state_code }: { state_code: string | null }) {
  const result = trpc.resourceDirectory.summary.useQuery();
  return <Card><CardHeader><CardTitle className="text-sm">Browse available resource categories</CardTitle></CardHeader>
    <CardContent>
      <p className="text-xs text-muted-foreground mb-3">Counts cover the whole directory. {state_code ? `Links open with ${state_code} selected.` : "Choose a jurisdiction in the directory to narrow the results."} A listing does not establish eligibility or availability.</p>
      {result.isLoading ? <p role="status">Loading resource categories…</p> : result.error ? <p role="alert">Resource categories could not load. <Button variant="link" onClick={() => result.refetch()}>Retry</Button></p> :
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{result.data?.categories?.map((category: { id: string; count: number }) =>
          <Link key={category.id} href={benefits_directory_href(category.id, state_code)} className="rounded border p-3 text-sm hover:bg-muted/30">
            {category.id.replaceAll("_", " ")} <span className="text-muted-foreground">({category.count})</span>
          </Link>)}</div>}
    </CardContent>
  </Card>;
}

export type benefits_proof_result = {
  data?: { ok: boolean; total: number | null; mapped: number | null; rows: any[]; has_more: boolean | null;
    precision_breakdown: { rooftop: number; street: number; other: number } | null; warning: string | null };
  isLoading: boolean;
  error: unknown;
  refetch: () => unknown;
};

function safe_website(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}

export function Benefits_resource_cards({ result, kind }: { result: benefits_proof_result; kind: "food_bank" | "benefits_office" }) {
  const is_office = kind === "benefits_office";
  const payload = result.data;
  const available = !result.error && payload?.ok === true;
  const rows = available ? payload.rows : [];
  return <Card><CardHeader>
    <CardTitle className="text-sm">{is_office ? "Washington DSHS offices" : "Food bank source records"}</CardTitle>
    <p className="text-xs text-muted-foreground">{is_office ? "Washington office source, with contact and location details as recorded." : "Food bank records currently returned by this source. This is one part of the resource directory."}</p>
  </CardHeader><CardContent className="space-y-3">
    {result.isLoading ? <p role="status">Loading resource records…</p> : !available ?
      <div role="alert"><p>Resource records are temporarily unavailable.</p><Button variant="outline" onClick={() => result.refetch()}>Retry resource records</Button></div> : <>
        <p role="status" className="text-xs text-muted-foreground">Showing {rows.length} of {payload.total} source records. Eligibility, current contact details and service availability still need confirmation.</p>
        {is_office && payload.precision_breakdown && <p className="text-xs text-muted-foreground">{payload.mapped} records have coordinates: {payload.precision_breakdown.rooftop} rooftop, {payload.precision_breakdown.street} street, {payload.precision_breakdown.other} other or unspecified precision.</p>}
        {rows.length === 0 && <p className="text-sm">No records were returned by this source. You can also search the resource directory below.</p>}
        <div className="max-h-[420px] overflow-y-auto space-y-2">{rows.map(row => {
          const website = safe_website(row.website_url);
          return <article key={row.id} data-resource-id={row.id} className="rounded border p-3 space-y-1">
            <h3 className="font-medium text-sm">{row.name || "Unnamed source record"}</h3>
            <p className="text-xs text-muted-foreground">{[row.address_line1, row.address_line2, row.city, row.state, row.postal_code].filter(Boolean).join(", ") || "Address not recorded"}</p>
            {row.eligibility_summary && <p className="text-xs">Recorded eligibility: {row.eligibility_summary}</p>}
            {row.phone && <p className="text-xs">Phone: <a href={`tel:${String(row.phone).replace(/[^+\d,;#*]/g, "")}`} className="underline">{row.phone}</a></p>}
            {website && <a href={website} target="_blank" rel="noreferrer" className="text-xs underline">Open organization website</a>}
            {(row.languages?.length > 0 || row.accessibility_features?.length > 0) && <p className="text-xs">{[row.languages?.join(", "), row.accessibility_features?.join(", ")].filter(Boolean).join(" · ")}</p>}
            {row.source_snapshot_hash && <details className="text-xs text-muted-foreground"><summary>Source version</summary><code className="break-all">{row.source_snapshot_hash}</code></details>}
          </article>;
        })}</div>
      </>}
    <Link href={benefits_directory_href(is_office ? "" : "food_nutrition", is_office ? "WA" : null)} className="inline-block text-sm underline">Search the resource directory</Link>
  </CardContent></Card>;
}

export function Benefits_resource_sections() {
  const food = trpc.civicMapResourceProof.useQuery();
  const offices = trpc.benefitsDshsOfficeProof.useQuery();
  return <><Benefits_resource_cards result={food} kind="food_bank" /><Benefits_resource_cards result={offices} kind="benefits_office" /></>;
}
