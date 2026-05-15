import { useState, useEffect, ReactNode } from "react";
import { PANEL_REGISTRY, shouldRenderPanel, type PanelConfig } from "@/lib/panelRegistry";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Loader2, XCircle, Database } from "lucide-react";

/**
 * PanelGate — Conditional rendering wrapper for Mission Control panels.
 *
 * If the panel is disabled in PANEL_REGISTRY, renders nothing.
 * If the panel requires data and has none, renders nothing.
 * Otherwise, renders children.
 */
export function PanelGate({
  panelKey,
  children,
  dataCount,
  queryStatus,
}: {
  panelKey: string;
  children: ReactNode;
  dataCount?: number;
  queryStatus?: "loading" | "success" | "error";
}) {
  const config = PANEL_REGISTRY[panelKey];

  // Panel not in registry or disabled → render nothing
  if (!config || !config.enabled) return null;

  // Panel requires data and count is 0 (and not allowed empty state)
  if (config.requiresData && !config.allowEmptyState && (dataCount === 0 || dataCount === undefined)) {
    // Still show if loading
    if (queryStatus === "loading") return <>{children}</>;
    return null;
  }

  return <>{children}</>;
}

/**
 * TabGate — Conditional rendering for TabsTrigger elements.
 * Returns null if panel is disabled, otherwise renders children.
 */
export function TabGate({
  panelKey,
  children,
}: {
  panelKey: string;
  children: ReactNode;
}) {
  if (!shouldRenderPanel(panelKey)) return null;
  return <>{children}</>;
}

/**
 * DebugOverlay — Shows panel data source, record count, and query status.
 * Toggle with Ctrl+Shift+D keyboard shortcut.
 */
export function DebugOverlay({
  panelKey,
  dataCount,
  queryStatus,
}: {
  panelKey: string;
  dataCount?: number;
  queryStatus?: "loading" | "success" | "error";
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        setVisible((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!visible) return null;

  const config = PANEL_REGISTRY[panelKey];
  if (!config) return null;

  const statusIcon =
    queryStatus === "loading" ? (
      <Loader2 className="h-3 w-3 animate-spin text-yellow-400" />
    ) : queryStatus === "success" ? (
      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
    ) : queryStatus === "error" ? (
      <XCircle className="h-3 w-3 text-red-400" />
    ) : (
      <AlertTriangle className="h-3 w-3 text-zinc-500" />
    );

  return (
    <div className="absolute top-1 right-1 z-50 flex items-center gap-1.5 rounded bg-black/80 px-2 py-1 text-[10px] font-mono text-zinc-300 border border-zinc-700 pointer-events-none">
      <Database className="h-3 w-3 text-blue-400" />
      <span className="text-blue-300">{config.dataSource}</span>
      <span className="text-zinc-500">|</span>
      <span className={dataCount !== undefined && dataCount > 0 ? "text-emerald-400" : "text-zinc-500"}>
        {dataCount !== undefined ? dataCount.toLocaleString() : "—"}
      </span>
      <span className="text-zinc-500">|</span>
      {statusIcon}
      <span className="text-zinc-500">
        {queryStatus ?? "idle"}
      </span>
    </div>
  );
}

/**
 * PanelActivationSummary — Shows a summary of enabled/disabled panels.
 * Used in the Operations tab for admin visibility.
 */
export function PanelActivationSummary() {
  const panels = Object.values(PANEL_REGISTRY);
  const enabled = panels.filter((p) => p.enabled);
  const disabled = panels.filter((p) => !p.enabled);
  const categories = panels.reduce(
    (acc: Record<string, { enabled: number; disabled: number }>, p) => {
      if (!acc[p.category]) acc[p.category] = { enabled: 0, disabled: 0 };
      if (p.enabled) acc[p.category].enabled++;
      else acc[p.category].disabled++;
      return acc;
    },
    {}
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-muted-foreground">Panel Activation</h4>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-emerald-400 border-emerald-400/30 text-xs">
            {enabled.length} active
          </Badge>
          <Badge variant="outline" className="text-zinc-500 border-zinc-600 text-xs">
            {disabled.length} hidden
          </Badge>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {Object.entries(categories).map(([cat, counts]) => (
          <div
            key={cat}
            className="flex items-center justify-between text-xs p-2 rounded bg-muted/30"
          >
            <span className="capitalize text-muted-foreground">{cat}</span>
            <span className="font-mono">
              <span className="text-emerald-400">{counts.enabled}</span>
              <span className="text-zinc-600">/</span>
              <span>{counts.enabled + counts.disabled}</span>
            </span>
          </div>
        ))}
      </div>
      {disabled.length > 0 && (
        <div className="text-[11px] text-zinc-500">
          Hidden: {disabled.map((p) => p.label).join(", ")}
        </div>
      )}
    </div>
  );
}
