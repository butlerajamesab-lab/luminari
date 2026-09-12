import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/core/hooks/useAuth";

export function CaseLegalReferences({ case_id }: { case_id: number }) {
  const { isAuthenticated: is_authenticated } = useAuth();
  const utils = trpc.useUtils();
  const [offset, set_offset] = useState(0);
  const references = trpc.case_state.get_legal_references.useQuery({ case_id, offset }, { enabled: is_authenticated });
  const remove = trpc.case_state.remove_commit.useMutation({ onSuccess: async () => { set_offset(0); await Promise.all([utils.case_state.get_legal_references.invalidate(), utils.case_state.get.invalidate(), utils.luminari.get_action_context.invalidate()]); } });
  if (!is_authenticated) return null;
  return <section className="mt-4 space-y-2 text-sm">
    <h3 className="font-semibold">Saved legal references</h3>
    {references.isLoading && <p>Loading references…</p>}
    {references.error && <p role="alert">References are unavailable. <button onClick={() => references.refetch()}>Retry</button></p>}
    {references.data?.total === 0 && <p className="text-muted-foreground">No legal references attached.</p>}
    {references.data?.items.map(item => <div key={String(item.committed_ref)} className="rounded border p-2 flex flex-wrap gap-2 justify-between">
      <div className="min-w-0 break-words">
        <a className="underline" href={`/legal-library?legal_ref=${encodeURIComponent(String(item.committed_ref))}`}>
          {String(item.record?.name ?? item.record?.case_name ?? item.record?.short_title ?? item.record?.title ?? item.committed_ref)}
        </a>
        <p className="text-xs text-muted-foreground">{item.kind ?? "Saved reference"} · {item.status}{item.reason ? ` — ${item.reason}` : ""}</p>
      </div>
      <button disabled={remove.isPending} onClick={() => remove.mutate({ case_id, item_type: "statute", item_id: item.committed_ref })}>Remove</button>
    </div>)}
    {remove.error && <p role="alert">The reference could not be removed. Please retry.</p>}
    <div className="flex gap-3">
      {offset > 0 && <button onClick={() => set_offset(Math.max(0, offset-25))}>Previous references</button>}
      {references.data?.next_offset != null && <button onClick={() => set_offset(references.data!.next_offset!)}>Next references</button>}
    </div>
  </section>;
}
