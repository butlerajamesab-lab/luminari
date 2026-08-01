import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, BarChart3, CheckCircle2,
  ChevronDown, ChevronRight, CircleDot, Clock3, Database, Download, Eye,
  FileCheck2, FileSearch, Fingerprint, Gauge, GitBranch, Home, Layers3,
  Link2, ListFilter, LockKeyhole, MapPin, Menu, Network, PanelLeftClose,
  PanelLeftOpen, Route, Search, Shield, ShieldCheck, SlidersHorizontal,
  Sparkles, Target, X, Zap,
} from "lucide-react";
import { useMemo } from "react";
import { correlationsForInstance, type PrismInstance } from "./prism-v2-data";
import { MiniMetric, ProblemBadge, RiskBadge, SectionCard, StatusPill, classNames, navigateInstance, percent } from "./prism-v2-shared";
export function InstanceCorrelations({
  instance,
  instances,
  navigate,
}: {
  instance: PrismInstance;
  instances: PrismInstance[];
  navigate: (path: string) => void;
}) {
  const matches = useMemo(() => correlationsForInstance(instance, instances), [instance, instances]);
  const jurisdictions = new Set(matches.map((match) => match.matched.jurisdiction));
  const systems = new Set(matches.map((match) => match.matched.system_primary));
  const density = instances.length > 1 ? matches.length / (instances.length - 1) : 0;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniMetric label="Direct matches" value={String(matches.length)} />
        <MiniMetric label="Network density" value={percent(density)} />
        <MiniMetric label="Jurisdictions" value={String(jurisdictions.size)} />
        <MiniMetric label="Systems" value={String(systems.size)} />
      </div>
      <SectionCard title="Deterministic correlation matches" icon={<Network className="h-4 w-4" />}>
        <div className="space-y-2">
          {matches.length ? matches.slice(0, 30).map((match) => (
            <button
              type="button"
              key={match.matched.record_id}
              onClick={() => navigateInstance(navigate, match.matched.record_id, "correlations")}
              className="grid w-full gap-3 rounded-xl border border-slate-800 bg-slate-950/45 p-4 text-left transition hover:border-cyan-500/30 md:grid-cols-[auto_1fr_auto] md:items-center"
            >
              <ProblemBadge type={match.matched.problem_type} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-slate-200">{match.matched.record_id}</span>
                  <span className="text-xs text-slate-600">{match.matched.jurisdiction} · {match.matched.system_primary}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {match.shared_reasons.map((reason) => (
                    <span key={reason} className="rounded border border-slate-800 bg-slate-900 px-2 py-0.5 font-mono text-[9px] text-slate-500">{reason}</span>
                  ))}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-lg font-semibold text-cyan-300">{percent(match.total_score)}</div>
                <div className="font-mono text-[9px] uppercase tracking-wider text-slate-600">match score</div>
              </div>
            </button>
          )) : (
            <div className="rounded-lg border border-dashed border-slate-800 p-8 text-center text-sm text-slate-600">No deterministic matches met the 0.25 threshold.</div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

export function PathwaysPanel({ instance }: { instance: PrismInstance }) {
  return (
    <div className="space-y-4">
      {instance.resolution_pathways.map((pathway, index) => (
        <SectionCard
          key={`${pathway.type}-${index}`}
          title={`${pathway.type} pathway`}
          icon={<Route className="h-4 w-4" />}
          action={<span className="font-mono text-xs text-emerald-300">{percent(pathway.probability)}</span>}
        >
          <h3 className="text-base font-semibold text-slate-100">{pathway.action}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <MiniMetric label="Timeline" value={pathway.timeline} />
            <MiniMetric label="Probability" value={percent(pathway.probability)} />
          </div>
          <ol className="mt-4 space-y-2">
            {pathway.steps.map((step, stepIndex) => (
              <li key={`${step}-${stepIndex}`} className="flex gap-3 text-sm leading-6 text-slate-400">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-500/25 bg-cyan-500/5 font-mono text-[10px] text-cyan-300">{stepIndex + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-3">
              <div className="font-mono text-[9px] uppercase tracking-widest text-slate-600">Resource cost</div>
              <p className="mt-2 text-xs leading-5 text-slate-400">{pathway.resource_cost}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-3">
              <div className="font-mono text-[9px] uppercase tracking-widest text-slate-600">Cascade impact</div>
              <p className="mt-2 text-xs leading-5 text-slate-400">{pathway.cascade_impact}</p>
            </div>
          </div>
        </SectionCard>
      ))}
      {!instance.resolution_pathways.length && (
        <SectionCard title="Resolution pathways" icon={<Route className="h-4 w-4" />}>
          <div className="rounded-lg border border-dashed border-slate-800 p-8 text-center text-sm text-slate-600">No pathways are present in this batch record.</div>
        </SectionCard>
      )}
    </div>
  );
}

export function VerificationPanel({ instance }: { instance: PrismInstance }) {
  const allEvidenceBound = instance.findings.every((finding) => finding.evidence_links.length > 0);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SectionCard title="Record validation" icon={<ShieldCheck className="h-4 w-4" />}>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="font-semibold text-emerald-200">{instance.traceability.validation_status}</div>
              <div className="mt-1 text-xs text-slate-500">Batch traceability classification</div>
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <VerificationRow label="Findings have evidence links" value={allEvidenceBound ? "YES" : "NO"} positive={allEvidenceBound} />
          <VerificationRow label="Evidence source references" value={String(instance.traceability.source_refs.length)} positive={instance.traceability.source_refs.length > 0} />
          <VerificationRow label="Intake-ready state" value={instance.intake_ready ? "YES" : "NO"} positive={instance.intake_ready} />
          <VerificationRow label="Coordination deadlock" value={instance.coordination.deadlock ? "YES" : "NO"} positive={!instance.coordination.deadlock} />
        </div>
      </SectionCard>
      <SectionCard title="Prism receipt boundary" icon={<Fingerprint className="h-4 w-4" />}>
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04] p-4">
          <div className="flex items-start gap-3">
            <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" />
            <div>
              <div className="font-semibold text-slate-100">No canonical Prism receipt is embedded in this batch export.</div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                This frontend preserves the distinction between batch validation and Prism’s immutable source-binding receipts. It does not manufacture a receipt or upgrade this record to verified.
              </p>
            </div>
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/45 p-3 font-mono text-xs text-slate-500">
          <div>record_id: <span className="text-slate-300">{instance.record_id}</span></div>
          <div className="mt-1">validation_status: <span className="text-slate-300">{instance.traceability.validation_status}</span></div>
          <div className="mt-1">prism_receipt: <span className="text-amber-300">not_observed_in_batch</span></div>
        </div>
      </SectionCard>
    </div>
  );
}

export function VerificationRow({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/45 px-3 py-2">
      <span className="text-sm text-slate-400">{label}</span>
      <span className={classNames("font-mono text-xs", positive ? "text-emerald-300" : "text-amber-300")}>{value}</span>
    </div>
  );
}
