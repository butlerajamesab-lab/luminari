/**
 * LayerNavBar — shared top navigation strip for the 8 Explore Layer pages.
 * Shows "← Architecture Map" (left) and "⚒ Open in Workshop" (right).
 * Used by: LegalLibrary, DoctrineGraph, EnforcementIntel, SignalRegistry,
 *           LitigationBarriers, ContradictionScoring, EnforcementPathway,
 *           InvestigationWorkflow
 */
import { useLocation } from "wouter";

interface LayerNavBarProps {
  /** Human-readable layer name, e.g. "Enforcement Intel" */
  label: string;
  /** Route for this layer, e.g. "/enforcement-intel" */
  route: string;
  /** Optional inline-style override for the container */
  style?: React.CSSProperties;
}

export function LayerNavBar({ label, route, style }: LayerNavBarProps) {
  const [, navigate] = useLocation();

  const base: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    ...style,
  };

  const btnBase: React.CSSProperties = {
    background: "none",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    fontFamily: "monospace",
    padding: "4px 10px",
    borderRadius: 6,
    transition: "opacity 0.15s",
  };

  return (
    <div style={base}>
      <button
        style={{ ...btnBase, color: "#94a3b8", border: "1px solid rgba(148,163,184,0.2)" }}
        onClick={() => navigate("/architecture")}
        title="Back to Architecture Map"
      >
        ← Architecture Map
      </button>
      <button
        style={{
          ...btnBase,
          color: "#10b981",
          background: "rgba(16,185,129,0.08)",
          border: "1px solid rgba(16,185,129,0.25)",
        }}
        onClick={() =>
          navigate(`/workshop?from=${encodeURIComponent(label)}&layer=${encodeURIComponent(route)}`)
        }
        title="Open this layer in Workshop"
      >
        ⚒ Open in Workshop
      </button>
    </div>
  );
}
