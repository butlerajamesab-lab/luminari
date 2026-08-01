import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, BarChart3, CheckCircle2,
  ChevronDown, ChevronRight, CircleDot, Clock3, Database, Download, Eye,
  FileCheck2, FileSearch, Fingerprint, Gauge, GitBranch, Home, Layers3,
  Link2, ListFilter, LockKeyhole, MapPin, Menu, Network, PanelLeftClose,
  PanelLeftOpen, Route, Search, Shield, ShieldCheck, SlidersHorizontal,
  Sparkles, Target, X, Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { downloadJson, type PrismBatch } from "./prism-v2-data";
import { MiniMetric, ProblemBadge, RiskBadge, SectionCard, StatusPill, navigateInstance } from "./prism-v2-shared";
import { FilterSelect } from "./prism-v2-control-room";
export function ProvenanceIndexView({ batch, navigate }: { batch: PrismBatch; navigate: (path: string) => void }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return batch.instances;
    return batch.instances.filter((instance) => [instance.record_id, instance.jurisdiction, instance.system_primary, ...instance.traceability.source_refs].some((value) => value.toLowerCase().includes(query)));
  }, [batch.instances, search]);
  return (
    <div className="space-y-4">
      <SectionCard title="Traceability index" icon={<Fingerprint className="h-4 w-4" />}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
          <input value={search} onChange={(event: { target: { value: string } }) => setSearch(event.target.value)} placeholder="Search record, jurisdiction, system, or source hash..." className="h-11 w-full rounded-lg border border-slate-800 bg-slate-950 pl-10 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-700 focus:border-cyan-500/50" />
        </div>
      </SectionCard>
      <SectionCard title={`${filtered.length} validated records`} icon={<ShieldCheck className="h-4 w-4" />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-xs">
            <thead className="font-mono uppercase tracking-wider text-slate-600"><tr><th className="pb-2 pr-3">Record</th><th className="pb-2 pr-3">Scope</th><th className="pb-2 pr-3">Sources</th><th className="pb-2 pr-3">Evidence</th><th className="pb-2 pr-3">Validation</th><th className="pb-2">Updated</th></tr></thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((instance) => (
                <tr key={instance.record_id} className="cursor-pointer hover:bg-cyan-500/[0.025]" onClick={() => navigateInstance(navigate, instance.record_id, "provenance")}>
                  <td className="py-3 pr-3"><div className="font-mono text-slate-200">{instance.record_id}</div><div className="mt-1"><ProblemBadge type={instance.problem_type} /></div></td>
                  <td className="py-3 pr-3 text-slate-400">{instance.jurisdiction}<div className="text-slate-600">{instance.system_primary}</div></td>
                  <td className="py-3 pr-3 font-mono text-slate-300">{instance.traceability.source_refs.length}</td>
                  <td className="py-3 pr-3 font-mono text-slate-300">{instance.evidence.length}</td>
                  <td className="py-3 pr-3"><StatusPill tone="green">{instance.traceability.validation_status}</StatusPill></td>
                  <td className="py-3 text-slate-500">{new Date(instance.traceability.updated_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

export function ExportView({ batch }: { batch: PrismBatch }) {
  const [type, setType] = useState("ALL");
  const [risk, setRisk] = useState("ALL");
  const [jurisdiction, setJurisdiction] = useState("ALL");
  const jurisdictions = useMemo(() => Array.from(new Set(batch.instances.map((item) => item.jurisdiction))).sort(), [batch.instances]);
  const selected = useMemo(() => batch.instances.filter((instance) =>
    (type === "ALL" || instance.problem_type === type) &&
    (risk === "ALL" || instance.risk_level === risk) &&
    (jurisdiction === "ALL" || instance.jurisdiction === jurisdiction),
  ), [batch.instances, type, risk, jurisdiction]);

  const payload = useMemo<PrismBatch>(() => ({
    ...batch,
    exported_at: new Date().toISOString(),
    filters: {
      jurisdiction: jurisdiction === "ALL" ? null : jurisdiction,
      problem_type: type === "ALL" ? null : type,
      risk_level: risk === "ALL" ? null : risk,
    },
    total_records: selected.length,
    instances: selected,
  }), [batch, jurisdiction, risk, selected, type]);

  return (
    <div className="grid gap-4 xl:grid-cols-[.75fr_1.25fr]">
      <SectionCard title="Export controls" icon={<Download className="h-4 w-4" />}>
        <div className="space-y-3">
          <FilterSelect value={type} onChange={setType} options={["ALL", "DENIAL", "ESCALATION", "GAP", "CONTRADICTION", "SIGNAL"]} label="Type" />
          <FilterSelect value={risk} onChange={setRisk} options={["ALL", "RED", "ORANGE", "YELLOW", "GREEN"]} label="Risk" />
          <FilterSelect value={jurisdiction} onChange={setJurisdiction} options={["ALL", ...jurisdictions]} label="Jurisdiction" />
          <button type="button" onClick={() => downloadJson(`prism-v2-${new Date().toISOString().slice(0, 10)}.json`, payload)} className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/15"><Download className="h-4 w-4" /> Download {selected.length} records</button>
        </div>
      </SectionCard>
      <SectionCard title="Export manifest" icon={<Database className="h-4 w-4" />}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniMetric label="Schema" value={batch.schema_version} />
          <MiniMetric label="Source" value={batch.source_system} />
          <MiniMetric label="Records" value={String(selected.length)} />
          <MiniMetric label="Mode" value="read-only" />
        </div>
        <pre className="mt-4 max-h-[440px] overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-500">{JSON.stringify({
          schema_version: payload.schema_version,
          export_type: payload.export_type,
          source_system: payload.source_system,
          exported_at: payload.exported_at,
          filters: payload.filters,
          total_records: payload.total_records,
          first_record_ids: payload.instances.slice(0, 10).map((item) => item.record_id),
        }, null, 2)}</pre>
      </SectionCard>
    </div>
  );
}
