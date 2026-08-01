import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, BarChart3, CheckCircle2,
  ChevronDown, ChevronRight, CircleDot, Clock3, Database, Download, Eye,
  FileCheck2, FileSearch, Fingerprint, Gauge, GitBranch, Home, Layers3,
  Link2, ListFilter, LockKeyhole, MapPin, Menu, Network, PanelLeftClose,
  PanelLeftOpen, Route, Search, Shield, ShieldCheck, SlidersHorizontal,
  Sparkles, Target, X, Zap,
} from "lucide-react";
import { useMemo } from "react";
import {
  correlationsForInstance,
  type PrismInstance,
} from "./prism-v2-data";
import {
  FrictionBar, MiniMetric, ProblemBadge, RiskBadge, SectionCard, StatusPill,
  TABS, classNames, navigateInstance, percent, type WorkspaceTab,
} from "./prism-v2-shared";
import { InstanceCorrelations, PathwaysPanel, VerificationPanel } from "./prism-v2-instance-analysis";
import { EscalationPanel, ProvenancePanel } from "./prism-v2-instance-provenance";
export function InstanceWorkspace({
  instance,
  instances,
  tab,
  navigate,
}: {
  instance: PrismInstance;
  instances: PrismInstance[];
  tab: WorkspaceTab;
  navigate: (path: string) => void;
}) {
  const setTab = (next: WorkspaceTab) => navigateInstance(navigate, instance.record_id, next);
  return (
    <div>
      <header className="border-b border-slate-800 bg-[#050c12]/90 px-4 py-4 backdrop-blur md:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ProblemBadge type={instance.problem_type} />
              <RiskBadge risk={instance.risk_level} />
              <StatusPill tone={instance.traceability.validation_status === "VALIDATED" ? "green" : "amber"}>
                {instance.traceability.validation_status}
              </StatusPill>
            </div>
            <h1 className="mt-3 font-mono text-xl font-semibold text-slate-100 md:text-2xl">{instance.record_id}</h1>
            <p className="mt-1 text-sm text-slate-500">{instance.jurisdiction} · {instance.system_primary}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
            <MiniMetric label="Friction" value={percent(instance.friction.coefficient)} />
            <MiniMetric label="Alignment" value={percent(instance.alignment.composite)} />
            <MiniMetric label="Evidence" value={String(instance.evidence.length)} />
          </div>
        </div>
        <nav className="mt-4 flex gap-1 overflow-x-auto pb-1">
          {TABS.map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => setTab(item)}
              className={classNames(
                "shrink-0 rounded-lg px-3 py-2 text-xs font-medium capitalize transition",
                item === tab
                  ? "bg-cyan-500/15 text-cyan-200 shadow-[inset_0_0_0_1px_rgba(34,211,238,.25)]"
                  : "text-slate-500 hover:bg-slate-900 hover:text-slate-300",
              )}
            >
              {item}
            </button>
          ))}
        </nav>
      </header>
      <div className="p-4 md:p-6">
        {tab === "friction" && <FrictionPanel instance={instance} />}
        {tab === "evidence" && <EvidencePanel instance={instance} />}
        {tab === "correlations" && <InstanceCorrelations instance={instance} instances={instances} navigate={navigate} />}
        {tab === "pathways" && <PathwaysPanel instance={instance} />}
        {tab === "verification" && <VerificationPanel instance={instance} />}
        {tab === "provenance" && <ProvenancePanel instance={instance} />}
        {tab === "escalation" && <EscalationPanel instance={instance} />}
      </div>
    </div>
  );
}

export function FrictionPanel({ instance }: { instance: PrismInstance }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
      <SectionCard title="Friction decomposition" icon={<Gauge className="h-4 w-4" />}>
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-slate-600">Composite friction</div>
                <div className="mt-1 text-4xl font-bold text-slate-100">{percent(instance.friction.coefficient)}</div>
              </div>
              <StatusPill tone={instance.friction.severity === "CRITICAL" ? "red" : instance.friction.severity === "HIGH" ? "amber" : "slate"}>
                {instance.friction.severity}
              </StatusPill>
            </div>
            <div className="mt-4"><FrictionBar value={instance.friction.coefficient} /></div>
          </div>
          {instance.friction.sources.length ? instance.friction.sources.map((source) => (
            <div key={source.name}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="capitalize text-slate-400">{source.name}</span>
                <span className="font-mono text-slate-200">{percent(source.weight)}</span>
              </div>
              <FrictionBar value={source.weight} compact />
            </div>
          )) : (
            <div className="rounded-lg border border-dashed border-slate-800 p-5 text-center text-sm text-slate-600">No friction sources were recorded.</div>
          )}
        </div>
      </SectionCard>

      <div className="space-y-4">
        <SectionCard title="Alignment layers" icon={<Target className="h-4 w-4" />}>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(instance.alignment).map(([key, value]) => (
              <div key={key} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <div className="font-mono text-[9px] uppercase tracking-widest text-slate-600">{key}</div>
                <div className="mt-1 text-xl font-semibold text-slate-100">{percent(value)}</div>
              </div>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="Recommended next action" icon={<ArrowRight className="h-4 w-4" />}>
          <StatusPill tone={instance.recommended_next_action.urgency === "IMMEDIATE" ? "red" : instance.recommended_next_action.urgency === "HIGH" ? "amber" : "cyan"}>
            {instance.recommended_next_action.urgency}
          </StatusPill>
          <h3 className="mt-3 text-base font-semibold text-slate-100">{instance.recommended_next_action.type}</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{instance.recommended_next_action.target}</p>
        </SectionCard>
      </div>
    </div>
  );
}

export function EvidencePanel({ instance }: { instance: PrismInstance }) {
  return (
    <div className="space-y-4">
      <SectionCard title={`Evidence (${instance.evidence.length})`} icon={<FileCheck2 className="h-4 w-4" />}>
        <div className="grid gap-3 xl:grid-cols-2">
          {instance.evidence.map((evidence) => (
            <article key={evidence.id} className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StatusPill tone="cyan">{evidence.evidence_type}</StatusPill>
                <StatusPill tone={evidence.status === "ACTIVE" ? "green" : "slate"}>{evidence.status}</StatusPill>
              </div>
              <div className="mt-3 font-mono text-[10px] text-slate-600">{evidence.source_document}</div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{evidence.content}</p>
              <div className="mt-4 flex items-center gap-2 border-t border-slate-800 pt-3 font-mono text-[10px] text-slate-600">
                <Fingerprint className="h-3.5 w-3.5" />
                <span className="truncate">{evidence.provenance_hash}</span>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>
      <SectionCard title={`Findings (${instance.findings.length})`} icon={<ShieldCheck className="h-4 w-4" />}>
        <div className="space-y-3">
          {instance.findings.map((finding) => (
            <article key={finding.id} className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StatusPill tone="purple">{finding.finding_type}</StatusPill>
                <span className="font-mono text-sm font-semibold text-emerald-300">{percent(finding.confidence)}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">{finding.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {finding.evidence_links.map((link) => (
                  <span key={link} className="rounded bg-slate-900 px-2 py-1 font-mono text-[9px] text-slate-500">{link}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
