import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, BarChart3, CheckCircle2,
  ChevronDown, ChevronRight, CircleDot, Clock3, Database, Download, Eye,
  FileCheck2, FileSearch, Fingerprint, Gauge, GitBranch, Home, Layers3,
  Link2, ListFilter, LockKeyhole, MapPin, Menu, Network, PanelLeftClose,
  PanelLeftOpen, Route, Search, Shield, ShieldCheck, SlidersHorizontal,
  Sparkles, Target, X, Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  buildCorrelationGraph,
  computeAggregates,
  computeHotspots,
  type PrismBatch,
  type PrismHotspot,
} from "./prism-v2-data";
import {
  DistributionRows, FrictionBar, HotspotModal, MetricCard, MiniMetric,
  PROBLEM_COLORS, ProblemBadge, RISK_COLORS, RiskBadge, SectionCard,
  StatusPill, navigateInstance, percent,
} from "./prism-v2-shared";
export function DashboardView({
  batch,
  navigate,
}: {
  batch: PrismBatch;
  navigate: (path: string) => void;
}) {
  const [selectedHotspot, setSelectedHotspot] = useState<PrismHotspot | null>(null);
  const aggregates = useMemo(() => computeAggregates(batch.instances), [batch.instances]);
  const correlations = useMemo(() => buildCorrelationGraph(batch.instances), [batch.instances]);
  const hotspots = useMemo(() => computeHotspots(batch.instances), [batch.instances]);
  const activeSignals = useMemo(
    () => batch.instances
      .filter((instance) => instance.problem_type === "SIGNAL")
      .sort((a, b) => b.friction.coefficient - a.friction.coefficient)
      .slice(0, 5),
    [batch.instances],
  );
  const detectedPatterns = useMemo(
    () => batch.instances
      .flatMap((instance) => instance.findings.map((finding) => ({ instance, finding })))
      .filter(({ finding }) => /PATTERN|SYSTEMIC/i.test(finding.finding_type))
      .sort((a, b) => b.finding.confidence - a.finding.confidence)
      .slice(0, 5),
    [batch.instances],
  );
  const recent = useMemo(
    () => [...batch.instances]
      .sort((a, b) => Date.parse(b.traceability.updated_at) - Date.parse(a.traceability.updated_at))
      .slice(0, 6),
    [batch.instances],
  );

  return (
    <div className="space-y-6">
      {selectedHotspot && (
        <HotspotModal hotspot={selectedHotspot} onClose={() => setSelectedHotspot(null)} navigate={navigate} />
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Instances"
          value={aggregates.totalInstances}
          detail="Tracked problem instances"
          icon={<BarChart3 className="h-4 w-4" />}
          onClick={() => navigate("/prism/control-room")}
        />
        <MetricCard
          label="Avg friction"
          value={percent(aggregates.avgFriction)}
          detail="Raw batch coefficient average"
          icon={<Gauge className="h-4 w-4" />}
          tone="orange"
          onClick={() => navigate("/prism/control-room")}
        />
        <MetricCard
          label="Avg alignment"
          value={percent(aggregates.avgAlignment)}
          detail="Composite alignment average"
          icon={<Target className="h-4 w-4" />}
          tone="green"
          onClick={() => navigate("/prism/control-room")}
        />
        <MetricCard
          label="Correlations"
          value={correlations.length}
          detail="Deterministic deduplicated links"
          icon={<Network className="h-4 w-4" />}
          tone="purple"
          onClick={() => navigate("/prism/correlation-map")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Risk distribution" icon={<AlertTriangle className="h-4 w-4" />}>
          <DistributionRows data={aggregates.riskDistribution} colors={RISK_COLORS} />
        </SectionCard>
        <SectionCard title="Problem type distribution" icon={<Layers3 className="h-4 w-4" />}>
          <DistributionRows data={aggregates.typeDistribution} colors={PROBLEM_COLORS} />
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard
          title="Active signals"
          icon={<Zap className="h-4 w-4" />}
          action={<button type="button" onClick={() => navigate("/prism/control-room?type=SIGNAL")} className="text-xs text-cyan-300 hover:text-cyan-200">View all</button>}
        >
          <div className="space-y-2">
            {activeSignals.map((instance) => (
              <button
                key={instance.record_id}
                type="button"
                onClick={() => navigateInstance(navigate, instance.record_id)}
                className="flex w-full items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-left hover:border-cyan-500/30"
              >
                <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-200">{instance.record_id}</span>
                    <RiskBadge risk={instance.risk_level} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                    {instance.findings[0]?.description || instance.recommended_next_action.type}
                  </p>
                </div>
                <span className="font-mono text-xs text-orange-300">{percent(instance.friction.coefficient, 0)}</span>
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Detected patterns"
          icon={<GitBranch className="h-4 w-4" />}
          action={<button type="button" onClick={() => navigate("/prism/control-room")} className="text-xs text-cyan-300 hover:text-cyan-200">Inspect</button>}
        >
          <div className="space-y-2">
            {detectedPatterns.map(({ instance, finding }) => (
              <button
                key={finding.id}
                type="button"
                onClick={() => navigateInstance(navigate, instance.record_id, "evidence")}
                className="w-full rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-left hover:border-purple-500/30"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <ProblemBadge type={instance.problem_type} />
                    <span className="font-mono text-[10px] text-slate-500">{finding.finding_type}</span>
                  </div>
                  <span className="font-mono text-xs text-emerald-300">{percent(finding.confidence, 0)}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-400">{finding.description}</p>
              </button>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Friction hotspots"
        icon={<Activity className="h-4 w-4" />}
        action={<button type="button" onClick={() => navigate("/prism/correlation-map")} className="text-xs text-cyan-300 hover:text-cyan-200">Open map</button>}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {hotspots.slice(0, 8).map((hotspot) => (
            <button
              type="button"
              key={hotspot.id}
              onClick={() => setSelectedHotspot(hotspot)}
              className="rounded-lg border border-orange-500/15 bg-orange-500/[0.03] p-3 text-left transition hover:border-orange-500/40 hover:bg-orange-500/[0.06]"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-200">{hotspot.jurisdiction}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{hotspot.system}</div>
                </div>
                <span className="font-mono text-lg text-orange-300">{percent(hotspot.averageFriction, 0)}</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-600">
                <span>{hotspot.instanceCount} instances</span>
                <span>{hotspot.dominantProblemType}</span>
              </div>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Recent problem instances" icon={<Clock3 className="h-4 w-4" />}>
        <div className="divide-y divide-slate-800">
          {recent.map((instance) => (
            <button
              key={instance.record_id}
              type="button"
              onClick={() => navigateInstance(navigate, instance.record_id)}
              className="grid w-full gap-2 py-3 text-left hover:bg-cyan-500/[0.025] sm:grid-cols-[auto_1fr_auto_auto] sm:items-center sm:px-2"
            >
              <ProblemBadge type={instance.problem_type} />
              <div className="min-w-0">
                <div className="truncate font-mono text-xs text-slate-200">{instance.record_id}</div>
                <div className="truncate text-xs text-slate-500">{instance.jurisdiction} · {instance.system_primary}</div>
              </div>
              <RiskBadge risk={instance.risk_level} />
              <span className="font-mono text-xs text-orange-300">{percent(instance.friction.coefficient, 0)}</span>
            </button>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
