import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, BarChart3, CheckCircle2,
  ChevronDown, ChevronRight, CircleDot, Clock3, Database, Download, Eye,
  FileCheck2, FileSearch, Fingerprint, Gauge, GitBranch, Home, Layers3,
  Link2, ListFilter, LockKeyhole, MapPin, Menu, Network, PanelLeftClose,
  PanelLeftOpen, Route, Search, Shield, ShieldCheck, SlidersHorizontal,
  Sparkles, Target, X, Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  type PrismBatch,
  type PrismHotspot,
} from "./prism-v2-data";
export const PROBLEM_COLORS: Record<string, string> = {
  DENIAL: "#ef4444",
  ESCALATION: "#f97316",
  GAP: "#eab308",
  CONTRADICTION: "#a855f7",
  SIGNAL: "#06b6d4",
};

export const RISK_COLORS: Record<string, string> = {
  RED: "#ef4444",
  ORANGE: "#f97316",
  YELLOW: "#eab308",
  GREEN: "#22c55e",
};

export const TYPE_CLASS: Record<string, string> = {
  DENIAL: "border-red-500/30 bg-red-500/10 text-red-300",
  ESCALATION: "border-orange-500/30 bg-orange-500/10 text-orange-300",
  GAP: "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
  CONTRADICTION: "border-purple-500/30 bg-purple-500/10 text-purple-300",
  SIGNAL: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
};

export const RISK_CLASS: Record<string, string> = {
  RED: "border-red-500/30 bg-red-500/10 text-red-300",
  ORANGE: "border-orange-500/30 bg-orange-500/10 text-orange-300",
  YELLOW: "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
  GREEN: "border-green-500/30 bg-green-500/10 text-green-300",
};

export const TABS = [
  "friction",
  "evidence",
  "correlations",
  "pathways",
  "verification",
  "provenance",
  "escalation",
] as const;

export type WorkspaceTab = (typeof TABS)[number];

export type PageKey = "dashboard" | "control-room" | "correlation-map" | "provenance" | "export";

export function percent(value: number, digits = 1): string {
  return `${(Number(value || 0) * 100).toFixed(digits)}%`;
}

export function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function currentUrl(): URL {
  return new URL(window.location.href);
}

export function pageFromPath(path: string): PageKey {
  if (path.includes("/correlation-map")) return "correlation-map";
  if (path.includes("/provenance")) return "provenance";
  if (path.includes("/export")) return "export";
  if (path.includes("/control-room") || path.includes("/instance/")) return "control-room";
  return "dashboard";
}

export function selectedRecordFromLocation(path: string): string | null {
  const routeMatch = path.match(/\/prism\/instance\/([^/?#]+)/);
  if (routeMatch?.[1]) return decodeURIComponent(routeMatch[1]);
  return currentUrl().searchParams.get("id");
}

export function selectedTabFromLocation(): WorkspaceTab {
  const tab = currentUrl().searchParams.get("tab") as WorkspaceTab | null;
  return tab && TABS.includes(tab) ? tab : "friction";
}

export function navigateInstance(
  navigate: (path: string) => void,
  recordId: string,
  tab: WorkspaceTab = "friction",
): void {
  navigate(`/prism/control-room?id=${encodeURIComponent(recordId)}&tab=${tab}`);
}

export function usePrismBatch(): {
  data: PrismBatch | null;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<PrismBatch | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(Array.from({ length: 10 }, (_, part) => part).map(async (part) => {
      const response = await fetch(`/data/prism-v2-batch.${part}.b64`, { cache: "no-store" });
      if (!response.ok) throw new Error(`batch_fetch_${part}_${response.status}`);
      return (await response.text()).trim();
    }))
      .then(async (parts) => {
        if (typeof DecompressionStream === "undefined") {
          throw new Error("gzip_decompression_unavailable");
        }
        const encoded = parts.join("");
        const binary = atob(encoded);
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        const stream = new Blob([bytes])
          .stream()
          .pipeThrough(new DecompressionStream("gzip"));
        return JSON.parse(await new Response(stream).text()) as PrismBatch;
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "batch_fetch_failed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading: !data && !error, error };
}

export function StatusPill({
  children,
  tone = "cyan",
}: {
  children: ReactNode;
  tone?: "cyan" | "green" | "amber" | "red" | "purple" | "slate";
}) {
  const tones = {
    cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
    green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    red: "border-red-500/30 bg-red-500/10 text-red-300",
    purple: "border-purple-500/30 bg-purple-500/10 text-purple-300",
    slate: "border-slate-600/50 bg-slate-800/70 text-slate-300",
  };
  return (
    <span
      className={classNames(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em]",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function ProblemBadge({ type }: { type: string }) {
  return (
    <span
      className={classNames(
        "inline-flex rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider",
        TYPE_CLASS[type] || "border-slate-600 bg-slate-800 text-slate-300",
      )}
    >
      {type}
    </span>
  );
}

export function RiskBadge({ risk }: { risk: string }) {
  return (
    <span
      className={classNames(
        "inline-flex rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider",
        RISK_CLASS[risk] || "border-slate-600 bg-slate-800 text-slate-300",
      )}
    >
      {risk}
    </span>
  );
}

export function FrictionBar({ value, compact = false }: { value: number; compact?: boolean }) {
  const color = value >= 0.75
    ? "bg-red-500"
    : value >= 0.5
      ? "bg-orange-500"
      : value >= 0.25
        ? "bg-yellow-500"
        : "bg-emerald-500";
  return (
    <div className={classNames("overflow-hidden rounded-full bg-slate-800", compact ? "h-1" : "h-2")}>
      <div
        className={classNames("h-full rounded-full transition-all", color)}
        style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
      />
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  icon,
  onClick,
  tone = "cyan",
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: ReactNode;
  onClick?: () => void;
  tone?: "cyan" | "orange" | "green" | "purple";
}) {
  const tones = {
    cyan: "text-cyan-300 border-cyan-500/20",
    orange: "text-orange-300 border-orange-500/20",
    green: "text-emerald-300 border-emerald-500/20",
    purple: "text-purple-300 border-purple-500/20",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        "group min-w-0 rounded-xl border bg-[#071018]/90 p-4 text-left shadow-[0_20px_80px_rgba(0,0,0,0.18)] transition",
        tones[tone],
        onClick && "hover:-translate-y-0.5 hover:bg-[#0a1620]",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</span>
        <span className={tones[tone]}>{icon}</span>
      </div>
      <div className="text-3xl font-bold tabular-nums text-slate-50">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </button>
  );
}

export function SectionCard({
  title,
  icon,
  children,
  action,
  className,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={classNames("rounded-xl border border-slate-800 bg-[#071018]/90", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {icon && <span className="text-cyan-300">{icon}</span>}
          <h2 className="truncate text-sm font-semibold text-slate-100">{title}</h2>
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function DistributionRows({
  data,
  colors,
}: {
  data: Record<string, number>;
  colors: Record<string, string>;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const max = Math.max(...entries.map((entry) => entry[1]), 1);
  return (
    <div className="space-y-3">
      {entries.map(([label, count]) => (
        <div key={label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-mono text-slate-400">{label}</span>
            <span className="font-semibold tabular-nums text-slate-200">{count}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full"
              style={{ width: `${(count / max) * 100}%`, backgroundColor: colors[label] || "#64748b" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function HotspotModal({
  hotspot,
  onClose,
  navigate,
}: {
  hotspot: PrismHotspot;
  onClose: () => void;
  navigate: (path: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-orange-500/25 bg-[#071018] shadow-2xl sm:max-w-2xl sm:rounded-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-800 bg-[#071018]/95 px-5 py-4 backdrop-blur">
          <div>
            <div className="flex items-center gap-2 text-orange-300">
              <Zap className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Friction Hotspot</h2>
            </div>
            <p className="mt-1 text-sm text-slate-400">{hotspot.jurisdiction} · {hotspot.system}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniMetric label="Instances" value={String(hotspot.instanceCount)} />
            <MiniMetric label="Avg friction" value={percent(hotspot.averageFriction)} />
            <MiniMetric label="Alignment" value={percent(hotspot.averageAlignment)} />
            <MiniMetric label="Dominant" value={hotspot.dominantProblemType} />
          </div>
          <div>
            <div className="mb-2 text-xs font-mono uppercase tracking-widest text-slate-500">Contributing instances</div>
            <div className="space-y-2">
              {hotspot.instances.map((instance) => (
                <button
                  type="button"
                  key={instance.record_id}
                  onClick={() => {
                    onClose();
                    navigateInstance(navigate, instance.record_id);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-left hover:border-cyan-500/30 hover:bg-cyan-500/5"
                >
                  <ProblemBadge type={instance.problem_type} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs text-slate-200">{instance.record_id}</div>
                    <div className="mt-1 text-xs text-slate-500">{instance.findings[0]?.finding_type || "No finding"}</div>
                  </div>
                  <span className="font-mono text-sm text-orange-300">{percent(instance.friction.coefficient, 0)}</span>
                  <ChevronRight className="h-4 w-4 text-slate-600" />
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate(`/prism/control-room?jurisdiction=${encodeURIComponent(hotspot.jurisdiction)}&system=${encodeURIComponent(hotspot.system)}`);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/15"
          >
            View matching instances in Control Room <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
      <div className="font-mono text-[9px] uppercase tracking-widest text-slate-600">{label}</div>
      <div className="mt-1 break-words text-lg font-semibold text-slate-100">{value}</div>
    </div>
  );
}
