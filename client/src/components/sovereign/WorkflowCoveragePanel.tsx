import { useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const status_labels = {
  all: 'All registry records',
  missing_claim_binding: 'Needs claim binding',
  held: 'Held source connection',
  claim_type_matched: 'Claim type matched',
};

export default function WorkflowCoveragePanel() {
  const [status, set_status] = useState<keyof typeof status_labels>('missing_claim_binding');
  const [search, set_search] = useState('');
  const [offset, set_offset] = useState(0);
  const coverage = trpc.analyze.get_workflow_coverage.useQuery(
    { status, search, offset, limit: 50 },
    { retry: false, refetchOnWindowFocus: false },
  );
  const result = coverage.data;

  return <section className="space-y-4" aria-label="Intake workflow coverage">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-lg font-semibold">Intake workflow coverage</h3>
        <p className="text-sm text-muted-foreground">Inspect the workflow records Intake reads and the connections still needed.</p>
      </div>
      <Button variant="outline" disabled={coverage.isFetching} onClick={() => void coverage.refetch()}>
        <RefreshCw className="mr-2 h-4 w-4" /> Refresh coverage
      </Button>
    </div>
    <p className="text-sm text-muted-foreground">
      A claim type match records an existing routing connection. Case jurisdiction, legal applicability and required procedural details still need evaluation. Source deadline text remains uncalculated.
    </p>
    <div className="flex flex-wrap gap-2">
      <select className="rounded-md border border-input bg-background px-3 py-2 text-sm" aria-label="Workflow connection status"
        value={status} onChange={event => { set_status(event.target.value as keyof typeof status_labels); set_offset(0); }}>
        {Object.entries(status_labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <Input className="min-w-48 flex-1" aria-label="Search workflows" placeholder="Search ID, workflow, state or source file"
        value={search} onChange={event => { set_search(event.target.value); set_offset(0); }} />
    </div>
    {coverage.error ? <div role="alert" className="rounded-md border border-destructive p-4 text-sm">
      Coverage could not be read. Counts are unavailable. {coverage.error.message}
    </div> : coverage.isLoading ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Reading the current intake registry…</p> : result && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ['Existing master workflows', result.summary.existing_master_workflows],
          ['Source-bound workflows', result.summary.source_bound_workflows],
          ['Claim type matched', result.summary.claim_type_matched],
          ['Needs claim binding', result.summary.missing_claim_binding],
          ['Held source connection', result.summary.held_registry_records],
        ].map(([label, value]) => <Card key={label}><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold">{value}</p>
        </CardContent></Card>)}
      </div>
      <p className="text-xs text-muted-foreground">
        Registry accounting: {result.summary.source_registry_records} records = {result.summary.source_bound_workflows} source-bound + {result.summary.held_registry_records} held. Claim matches and missing bindings divide the source-bound group. Existing master workflows are separate.
      </p>
      {Object.keys(result.summary.holds_by_reason).length > 0 && <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm">Source connection holds by reason</summary>
        <ul className="mt-2 space-y-1 text-xs">{Object.entries(result.summary.holds_by_reason).map(([reason, count]) =>
          <li key={reason}><code>{reason}</code>: {count}</li>)}</ul>
      </details>}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>{result.filtered_count === 0 ? 'No records match these filters.' : `Showing ${result.offset + 1}–${result.offset + result.records.length} of ${result.filtered_count} matching records`}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={offset === 0 || coverage.isFetching} onClick={() => set_offset(Math.max(0, offset - 50))}>Previous</Button>
          <Button size="sm" variant="outline" disabled={!result.has_more || coverage.isFetching} onClick={() => set_offset(offset + 50)}>Next</Button>
        </div>
      </div>
      <div className="space-y-3">{result.records.map(record => <Card key={record.source_id}>
        <CardHeader className="pb-2"><CardTitle className="text-sm">{record.workflow_name ?? record.source_id}</CardTitle>
          <p className="text-xs text-muted-foreground">{status_labels[record.status]} · {record.jurisdiction ?? 'Jurisdiction unavailable in the admitted manifest'}</p>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <p><span className="text-muted-foreground">Source identity: </span><code className="break-all">{record.source_table}:{record.source_id}</code></p>
          <p><span className="text-muted-foreground">Reason: </span><code>{record.reason}</code></p>
          {record.status !== 'held' && <>
            <p>Workflow types: {record.issue_types.join(', ') || 'None recorded'} · Ordered steps: {record.ordered_step_count}</p>
            <p>Matching claim types: {record.matching_claim_type_ids.join(', ') || 'No existing binding'}</p>
            <p>Source verification: {record.verification_status ?? 'Unknown'} · Deadline state: {record.deadline_state}</p>
          </>}
          <details><summary className="cursor-pointer">Source references</summary>
            {record.source_files === null ? <p className="mt-2 text-muted-foreground">Source bindings were not admitted by Intake. Use the preserved registry identity and hold reason to trace the original record.</p> : <div className="mt-2 space-y-1 break-all">
              <p>Files: {record.source_files.join('; ')}</p>
              <p>Logical records: {record.source_logical_record_ids?.join(', ')}</p>
              <p>Stage rows: {record.source_stage_row_ids?.join(', ')}</p>
            </div>}
          </details>
        </CardContent>
      </Card>)}</div>
      <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Registry receipt</summary>
        <p className="mt-2">{result.registry_contract_version} · {result.summary.source_workflow_steps} source steps · {result.summary.source_jurisdictions} source jurisdictions</p>
        <code className="break-all">{result.registry_hash}</code>
      </details>
    </>}
  </section>;
}
