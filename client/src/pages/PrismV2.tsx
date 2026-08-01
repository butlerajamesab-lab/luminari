import {
  Activity, AlertTriangle, ArrowLeft, Download, Fingerprint, Home, Menu,
  Network, PanelLeftClose, PanelLeftOpen, Shield, X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { type PrismBatch } from "./prism-v2-data";
import {
  StatusPill, classNames, pageFromPath, usePrismBatch, type PageKey,
} from "./prism-v2-shared";
import { DashboardView } from "./prism-v2-dashboard";
import { ControlRoomView } from "./prism-v2-control-room";
import { CorrelationMapView, ExportView, ProvenanceIndexView } from "./prism-v2-map";
function PrismNavigation({
  page,
  navigate,
  mobileOpen,
  setMobileOpen,
  collapsed,
  setCollapsed,
}: {
  page: PageKey;
  navigate: (path: string) => void;
  mobileOpen: boolean;
  setMobileOpen: (value: boolean) => void;
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
}) {
  const items: Array<{ key: PageKey; label: string; path: string; icon: React.ReactNode }> = [
    { key: "dashboard", label: "Dashboard", path: "/prism", icon: <Home className="h-4 w-4" /> },
    { key: "control-room", label: "Control Room", path: "/prism/control-room", icon: <Activity className="h-4 w-4" /> },
    { key: "correlation-map", label: "Correlation Map", path: "/prism/correlation-map", icon: <Network className="h-4 w-4" /> },
    { key: "provenance", label: "Provenance", path: "/prism/provenance", icon: <Fingerprint className="h-4 w-4" /> },
    { key: "export", label: "Export", path: "/prism/export", icon: <Download className="h-4 w-4" /> },
  ];
  return (
    <aside
      className={classNames(
        "fixed inset-y-0 left-0 z-[130] flex flex-col border-r border-slate-800 bg-[#050c12] transition-all lg:static lg:z-auto",
        collapsed ? "lg:w-[72px]" : "lg:w-[244px]",
        mobileOpen ? "w-[280px] translate-x-0" : "w-[280px] -translate-x-full lg:translate-x-0",
      )}
    >
      <div className="flex h-[72px] items-center gap-3 border-b border-slate-800 px-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/10">
          <Shield className="h-5 w-5 text-cyan-300" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-semibold tracking-tight text-slate-100">Prism</div>
            <div className="truncate font-mono text-[9px] uppercase tracking-[0.18em] text-slate-600">Civic-forensic verification</div>
          </div>
        )}
        <button type="button" onClick={() => setMobileOpen(false)} className="ml-auto p-2 text-slate-500 lg:hidden"><X className="h-5 w-5" /></button>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            title={collapsed ? item.label : undefined}
            onClick={() => {
              navigate(item.path);
              setMobileOpen(false);
            }}
            className={classNames(
              "flex w-full items-center rounded-lg px-3 py-2.5 text-sm transition",
              collapsed ? "justify-center" : "gap-3",
              page === item.key ? "bg-cyan-500/12 text-cyan-200 shadow-[inset_2px_0_0_#22d3ee]" : "text-slate-500 hover:bg-slate-900 hover:text-slate-300",
            )}
          >
            {item.icon}
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>
      <div className="border-t border-slate-800 p-3">
        <button type="button" onClick={() => setCollapsed(!collapsed)} className="hidden w-full items-center justify-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-500 hover:bg-slate-900 lg:flex">
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed && "Collapse"}
        </button>
        <button type="button" onClick={() => navigate("/lighthouse")} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-500 hover:border-cyan-500/25 hover:text-cyan-200">
          <ArrowLeft className="h-4 w-4" />
          {!collapsed && "Back to Lighthouse"}
        </button>
      </div>
    </aside>
  );
}

export default function PrismV2() {
  const [location, navigate] = useLocation();
  const { data, loading, error } = usePrismBatch();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const page = pageFromPath(location);

  useEffect(() => {
    document.title = "Prism · Luminari";
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#02070c] text-slate-400">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-slate-800 border-t-cyan-400" />
          <div className="mt-4 font-mono text-xs uppercase tracking-widest">Loading Prism workspace</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#02070c] p-6 text-slate-300">
        <div className="max-w-lg rounded-2xl border border-red-500/25 bg-red-500/[0.04] p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-red-300" />
          <h1 className="mt-4 text-xl font-semibold">Prism batch unavailable</h1>
          <p className="mt-2 font-mono text-xs text-slate-500">{error || "unknown_batch_error"}</p>
          <button type="button" onClick={() => navigate("/lighthouse")} className="mt-5 rounded-lg border border-slate-700 px-4 py-2 text-sm">Return to Lighthouse</button>
        </div>
      </div>
    );
  }

  const pageTitle = {
    dashboard: "Dashboard",
    "control-room": "Control Room",
    "correlation-map": "Correlation Map",
    provenance: "Provenance",
    export: "Export",
  }[page];

  return (
    <div className="fixed inset-0 z-[120] flex overflow-hidden bg-[#02070c] font-sans text-slate-100">
      {mobileOpen && <button type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-[125] bg-black/70 lg:hidden" />}
      <PrismNavigation
        page={page}
        navigate={navigate}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[72px] shrink-0 items-center justify-between gap-3 border-b border-slate-800 bg-[#050c12]/95 px-4 backdrop-blur md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setMobileOpen(true)} className="rounded-lg border border-slate-800 p-2 text-slate-400 lg:hidden"><Menu className="h-5 w-5" /></button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-slate-100 md:text-lg">{pageTitle}</h1>
              <p className="truncate font-mono text-[9px] uppercase tracking-[0.15em] text-slate-600">Deterministic verification & civic-forensic analysis</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill tone="green"><span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />Operational</StatusPill>
            <StatusPill tone="slate">Read-only frontend</StatusPill>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          {page === "dashboard" && <DashboardView batch={data} navigate={navigate} />}
          {page === "control-room" && <ControlRoomView batch={data} navigate={navigate} location={location} />}
          {page === "correlation-map" && <CorrelationMapView batch={data} navigate={navigate} />}
          {page === "provenance" && <ProvenanceIndexView batch={data} navigate={navigate} />}
          {page === "export" && <ExportView batch={data} />}
        </main>
      </div>
    </div>
  );
}
