import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, BarChart3, CheckCircle2,
  ChevronDown, ChevronRight, CircleDot, Clock3, Database, Download, Eye,
  FileCheck2, FileSearch, Fingerprint, Gauge, GitBranch, Home, Layers3,
  Link2, ListFilter, LockKeyhole, MapPin, Menu, Network, PanelLeftClose,
  PanelLeftOpen, Route, Search, Shield, ShieldCheck, SlidersHorizontal,
  Sparkles, Target, X, Zap,
} from "lucide-react";
import { type PrismInstance } from "./prism-v2-data";
import { MiniMetric, SectionCard, StatusPill, percent } from "./prism-v2-shared";
export function ProvenancePanel({ instance }: { instance: PrismInstance }) {
  return (
    <div className="space-y-4">
      <SectionCard title="Traceability manifest" icon={<Fingerprint className="h-4 w-4" />}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniMetric label="Created" value={new Date(instance.traceability.created_at).toLocaleDateString()} />
          <MiniMetric label="Updated" value={new Date(instance.traceability.updated_at).toLocaleDateString()} />
          <MiniMetric label="Source refs" value={String(instance.traceability.source_refs.length)} />
          <MiniMetric label="Evidence" value={String(instance.evidence.length)} />
        </div>
      </SectionCard>
      <SectionCard title="Source-reference chain" icon={<Link2 className="h-4 w-4" />}>
        <div className="space-y-2">
          {instance.traceability.source_refs.map((reference, index) => (
            <div key={`${reference}-${index}`} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/45 px-3 py-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-700 font-mono text-[10px] text-slate-500">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-300">{reference}</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Evidence provenance hashes" icon={<Database className="h-4 w-4" />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="font-mono uppercase tracking-wider text-slate-600">
              <tr>
                <th className="pb-2 pr-3">Source</th>
                <th className="pb-2 pr-3">Type</th>
                <th className="pb-2 pr-3">Hash</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {instance.evidence.map((evidence) => (
                <tr key={evidence.id}>
                  <td className="py-3 pr-3 font-mono text-slate-300">{evidence.source_document}</td>
                  <td className="py-3 pr-3 text-slate-500">{evidence.evidence_type}</td>
                  <td className="max-w-[280px] truncate py-3 pr-3 font-mono text-slate-500">{evidence.provenance_hash}</td>
                  <td className="py-3"><StatusPill tone={evidence.status === "ACTIVE" ? "green" : "slate"}>{evidence.status}</StatusPill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

const ESCALATION_STATES = ["READY", "PREPARED", "APPROVED", "QUEUED", "SENT", "ACKNOWLEDGED", "COMPLETED"];

export function EscalationPanel({ instance }: { instance: PrismInstance }) {
  return (
    <div className="space-y-4">
      <SectionCard title="Escalation state machine" icon={<Activity className="h-4 w-4" />}>
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-[840px] items-center">
            {ESCALATION_STATES.map((state, index) => (
              <div key={state} className="flex flex-1 items-center">
                <div className="flex min-w-[104px] flex-col items-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-500">
                    <LockKeyhole className="h-4 w-4" />
                  </div>
                  <div className="mt-2 font-mono text-[10px] text-slate-500">{state}</div>
                </div>
                {index < ESCALATION_STATES.length - 1 && <div className="h-px flex-1 bg-slate-800" />}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4 text-sm leading-6 text-slate-400">
          <div className="flex items-start gap-3">
            <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <p>
              The batch record does not carry a bound escalation-state receipt. The frontend therefore shows the workflow without inferring a current stage or exposing a browser mutation.
            </p>
          </div>
        </div>
      </SectionCard>
      <SectionCard title={`Recorded actions (${instance.actions.length})`} icon={<Route className="h-4 w-4" />}>
        <div className="space-y-3">
          {instance.actions.map((action) => (
            <article key={action.id} className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StatusPill tone="amber">{action.action_type}</StatusPill>
                <StatusPill tone={action.status === "COMPLETED" ? "green" : "slate"}>{action.status}</StatusPill>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">{action.description}</p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <MiniMetric label="Priority" value={String(action.priority)} />
                <MiniMetric label="Timeline" value={`${action.estimated_timeline}d`} />
                <MiniMetric label="Probability" value={percent(action.success_probability)} />
              </div>
            </article>
          ))}
          {!instance.actions.length && <div className="rounded-lg border border-dashed border-slate-800 p-8 text-center text-sm text-slate-600">No actions are present in this record.</div>}
        </div>
      </SectionCard>
    </div>
  );
}
