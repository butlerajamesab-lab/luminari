import { Download } from "lucide-react";
import { useLocation } from "wouter";

const mono = "'IBM Plex Mono', monospace";

function export_link(href: string, label: string) {
  return <a
    href={href}
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: ".4rem",
      padding: ".55rem .7rem",
      borderRadius: 8,
      border: "1px solid rgba(89,216,156,.42)",
      background: "rgba(8,17,15,.96)",
      color: "#59d89c",
      fontFamily: mono,
      fontSize: ".64rem",
      fontWeight: 700,
      textDecoration: "none",
      boxShadow: "0 8px 28px rgba(0,0,0,.28)",
    }}
  ><Download size={14}/>{label}</a>;
}

export function CivicGenomeExportDock() {
  const [location] = useLocation();
  const match = location.match(/^\/civic-genome(?:\/bill\/(\d+))?\/?$/);
  if (!match) return null;

  const source_bill_id = match[1] ?? null;

  return <div
    aria-label="Civic Genome reports and technical data"
    style={{
      position: "fixed",
      right: "max(1rem, env(safe-area-inset-right))",
      bottom: "max(1rem, env(safe-area-inset-bottom))",
      zIndex: 120,
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "flex-end",
      gap: ".5rem",
      maxWidth: "calc(100vw - 2rem)",
    }}
  >
    {source_bill_id ? <>
      {export_link(
        `/api/civic-genome/export/bill/${encodeURIComponent(source_bill_id)}/summary`,
        "Summary report",
      )}
      {export_link(
        `/api/civic-genome/export/bill/${encodeURIComponent(source_bill_id)}/detailed`,
        "Detailed report",
      )}
      {export_link(
        `/api/civic-genome/export/bill/${encodeURIComponent(source_bill_id)}`,
        "Technical JSON",
      )}
    </> : export_link(
      "/api/civic-genome/export/current?limit=100",
      "Technical data · current 100",
    )}
  </div>;
}
