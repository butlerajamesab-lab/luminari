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
  correlationsForInstance,
  type PrismBatch,
  type PrismInstance,
} from "./prism-v2-data";
import {
  FrictionBar, ProblemBadge, RiskBadge, SectionCard, StatusPill,
  TABS, MiniMetric, classNames, currentUrl, navigateInstance, percent, selectedRecordFromLocation,
  selectedTabFromLocation, type WorkspaceTab,
} from "./prism-v2-shared";
import { InstanceWorkspace } from "./prism-v2-instance-workspace";
export function InstanceListItem({
  instance,
  selected,
  onClick,
}: {
  instance: PrismInstance;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        "w-full border-b border-slate-800 px-3 py-3 text-left transition",
        selected ? "bg-cyan-500/10 shadow-[inset_3px_0_0_#22d3ee]" : "hover:bg-slate-900/70",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <ProblemBadge type={instance.problem_type} />
        <span className="font-mono text-[10px] text-slate-600">{instance.record_id}</span>
      </div>
      <div className="mt-2 truncate text-sm font-medium text-slate-200">{instance.system_primary}</div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
        <span className="truncate">{instance.jurisdiction}</span>
        <span className="font-mono text-orange-300">{percent(instance.friction.coefficient, 0)}</span>
      </div>
      <div className="mt-2"><FrictionBar value={instance.friction.coefficient} compact /></div>
    </button>
  );
}

export function ControlRoomView({
  batch,
  navigate,
  location,
}: {
  batch: PrismBatch;
  navigate: (path: string) => void;
  location: string;
}) {
  const url = currentUrl();
  const [search, setSearch] = useState(url.searchParams.get("q") || "");
  const [typeFilter, setTypeFilter] = useState(url.searchParams.get("type") || "ALL");
  const [riskFilter, setRiskFilter] = useState(url.searchParams.get("risk") || "ALL");
  const [jurisdictionFilter, setJurisdictionFilter] = useState(url.searchParams.get("jurisdiction") || "ALL");
  const [systemFilter, setSystemFilter] = useState(url.searchParams.get("system") || "ALL");
  const [mobileListOpen, setMobileListOpen] = useState(false);

  const selectedId = selectedRecordFromLocation(location);
  const selectedTab = selectedTabFromLocation();
  const selected = batch.instances.find((instance) => instance.record_id === selectedId) || null;

  const jurisdictions = useMemo(
    () => Array.from(new Set(batch.instances.map((instance) => instance.jurisdiction))).sort(),
    [batch.instances],
  );
  const systems = useMemo(
    () => Array.from(new Set(batch.instances.map((instance) => instance.system_primary))).sort(),
    [batch.instances],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return batch.instances.filter((instance) => {
      if (typeFilter !== "ALL" && instance.problem_type !== typeFilter) return false;
      if (riskFilter !== "ALL" && instance.risk_level !== riskFilter) return false;
      if (jurisdictionFilter !== "ALL" && instance.jurisdiction !== jurisdictionFilter) return false;
      if (systemFilter !== "ALL" && instance.system_primary !== systemFilter) return false;
      if (!query) return true;
      return [
        instance.record_id,
        instance.problem_type,
        instance.jurisdiction,
        instance.system_primary,
        ...instance.findings.map((finding) => finding.description),
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [batch.instances, search, typeFilter, riskFilter, jurisdictionFilter, systemFilter]);

  const choose = (instance: PrismInstance) => {
    navigateInstance(navigate, instance.record_id, selectedTab);
    setMobileListOpen(false);
  };

  return (
    <div className="-m-4 flex min-h-[calc(100vh-112px)] flex-col md:-m-6 lg:flex-row">
      <aside
        className={classNames(
          "border-r border-slate-800 bg-[#050c12] lg:flex lg:w-[360px] lg:flex-col",
          mobileListOpen ? "fixed inset-0 z-[130] flex flex-col" : "hidden",
        )}
      >
        <div className="border-b border-slate-800 p-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
              <input
                value={search}
                onChange={(event: { target: { value: string } }) => setSearch(event.target.value)}
                placeholder="Search instances..."
                className="h-10 w-full rounded-lg border border-slate-800 bg-slate-950 pl-9 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-700 focus:border-cyan-500/50"
              />
            </div>
            <button type="button" onClick={() => setMobileListOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 lg:hidden">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <FilterSelect value={typeFilter} onChange={setTypeFilter} options={["ALL", "DENIAL", "ESCALATION", "GAP", "CONTRADICTION", "SIGNAL"]} label="Type" />
            <FilterSelect value={riskFilter} onChange={setRiskFilter} options={["ALL", "RED", "ORANGE", "YELLOW", "GREEN"]} label="Risk" />
            <FilterSelect value={jurisdictionFilter} onChange={setJurisdictionFilter} options={["ALL", ...jurisdictions]} label="Jurisdiction" />
            <FilterSelect value={systemFilter} onChange={setSystemFilter} options={["ALL", ...systems]} label="System" />
          </div>
          <div className="mt-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-slate-600">
            <span>{filtered.length} results</span>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setTypeFilter("ALL");
                setRiskFilter("ALL");
                setJurisdictionFilter("ALL");
                setSystemFilter("ALL");
              }}
              className="text-cyan-400 hover:text-cyan-300"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtered.map((instance) => (
            <InstanceListItem
              key={instance.record_id}
              instance={instance}
              selected={selected?.record_id === instance.record_id}
              onClick={() => choose(instance)}
            />
          ))}
        </div>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto bg-[#02070c]">
        <div className="border-b border-slate-800 bg-[#050c12]/90 px-4 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMobileListOpen(true)}
            className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300"
          >
            <span className="flex items-center gap-2"><ListFilter className="h-4 w-4" /> Browse {filtered.length} instances</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {selected ? (
          <InstanceWorkspace
            instance={selected}
            instances={batch.instances}
            tab={selectedTab}
            navigate={navigate}
          />
        ) : (
          <div className="flex min-h-[70vh] items-center justify-center p-8 text-center">
            <div className="max-w-md">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/5">
                <FileSearch className="h-7 w-7 text-cyan-300" />
              </div>
              <h2 className="mt-5 text-xl font-semibold text-slate-100">Select a problem instance</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Choose an instance to inspect friction, evidence, deterministic correlations, pathways, validation, provenance, and escalation context.
              </p>
              {filtered[0] && (
                <button
                  type="button"
                  onClick={() => choose(filtered[0])}
                  className="mt-5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/15"
                >
                  Open first result
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function FilterSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  label: string;
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event: { target: { value: string } }) => onChange(event.target.value)}
        className="h-9 w-full appearance-none truncate rounded-lg border border-slate-800 bg-slate-950 px-2 pr-7 text-xs text-slate-400 outline-none focus:border-cyan-500/50"
      >
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-600" />
    </label>
  );
}
