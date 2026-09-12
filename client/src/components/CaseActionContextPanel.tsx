import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/core/hooks/useAuth";

export function CaseActionContextPanel({ case_id }: { case_id: number }) {
  const { isAuthenticated: is_authenticated } = useAuth();
  const [opened, set_opened] = useState(false);
  const [jurisdiction, set_jurisdiction] = useState("");
  const [search, set_search] = useState("");
  const context = trpc.luminari.get_action_context.useQuery({ case_id, jurisdiction: jurisdiction || undefined,
    problem_context: search || undefined, limit_per_surface: 6 }, { enabled: opened && is_authenticated });
  if (!is_authenticated) return null;
  const data = context.data;
  const listed = (items: unknown[] | null, unavailable = false) => ({ items,
    availability: { status: unavailable || items === null ? "unavailable" : items.length ? "populated" : "empty" },
    returned: items?.length ?? null, has_more: null });
  const surfaces = data ? [
    ["Legal source references", listed(data.legal.source_authorities, data.diagnostics.unavailable_surfaces.includes("legal.source_authorities"))],
    ["Resource directory", listed(data.resources.directory_results, data.diagnostics.unavailable_surfaces.includes("resources.directory"))],
    ["Saved resources", listed(data.resources.attached_to_case)],
    ["Saved legal references", data.legal.attachments],
    ["Saved signal relationships", listed(data.signals.lineage)],
    ["Sealed intake action paths", listed(data.workflow.intake_action_paths?.outputs ?? null)],
    ["Workflows with declared claim bindings", data.workflow.source_candidates],
    ["Source deadline rules", data.workflow.deadline_sources],
    ["Enforcement references", listed(data.legal.enforcement, data.diagnostics.unavailable_surfaces.includes("legal.enforcement"))],
  ] as const : [];
  return <details className="mt-4 rounded border p-3" onToggle={event => set_opened(event.currentTarget.open)}>
    <summary className="cursor-pointer font-semibold">Explore source context for this case</summary>
    <p className="my-2 text-xs text-muted-foreground">Browse related sources and inspect saved links. Search results do not establish applicability, a finding, or a filing deadline.</p>
    <div className="flex flex-wrap gap-2 my-3">
      <input aria-label="Context jurisdiction" placeholder="State or territory (uses saved jurisdiction if blank)" value={jurisdiction} onChange={event => set_jurisdiction(event.target.value)} className="border rounded bg-background p-2 text-sm flex-1 min-w-0" />
      <input aria-label="Context source search" placeholder="Search legal and resource text" value={search} onChange={event => set_search(event.target.value)} className="border rounded bg-background p-2 text-sm flex-1 min-w-0" />
    </div>
    {context.isLoading && <p>Loading context…</p>}
    {context.error && <p role="alert">Case context is unavailable. <button onClick={() => context.refetch()}>Retry</button></p>}
    {data && <p className="text-xs mb-2">Browsing jurisdiction: {data.request.jurisdiction ?? "not established"} · Claim binding: {data.request.claim_type ?? "not recorded"}. Sealed intake output keeps its original case jurisdiction.</p>}
    {surfaces.map(([label, value]) => <section key={label} className="border-t py-2 text-sm">
      <h4 className="font-semibold">{label}</h4>
      <p className="text-xs text-muted-foreground">{value.availability.status}{value.returned != null ? ` · ${value.returned} shown` : ""}{value.has_more ? " · additional records available" : ""}</p>
      {value.items?.map((item, index) => {
        const row = item as Record<string, unknown>;
        const title = String(row.name ?? row.resource_name ?? row.workflow_name ?? row.artifact_title_snapshot ?? row.source_citation ?? row.deadline_description ?? row.resource_ref ?? row.object_ref ?? row.committed_ref ?? "Source record");
        return <details key={String(row.object_ref ?? row.workflow_key ?? row.link_id ?? row.resource_ref ?? index)} className="ml-2 py-1 break-words">
          <summary className="cursor-pointer">{title}</summary>
          {row.object_class === "legal_authority" && typeof row.object_ref === "string" && <a className="underline" href={`/legal-library?legal_ref=${encodeURIComponent(`legal_authority:${row.object_ref}`)}`}>Open source reference</a>}
          <pre className="text-xs whitespace-pre-wrap break-all mt-2">{JSON.stringify(row, null, 2)}</pre>
        </details>;
      })}
    </section>)}
  </details>;
}
