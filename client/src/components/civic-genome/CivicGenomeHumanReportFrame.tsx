import { useCallback, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";

const mono = "'IBM Plex Mono', monospace";

export function CivicGenomeHumanReportFrame({
  source_bill_id,
}: {
  source_bill_id: number;
}) {
  const frame_ref = useRef<HTMLIFrameElement | null>(null);
  const [height, set_height] = useState(980);
  const href = `/api/civic-genome/export/bill/${encodeURIComponent(source_bill_id)}/summary/view`;

  const resize = useCallback(() => {
    const frame = frame_ref.current;
    const document = frame?.contentDocument;
    if (!document) return;
    const next = Math.max(
      720,
      document.documentElement?.scrollHeight ?? 0,
      document.body?.scrollHeight ?? 0,
    );
    if (Number.isFinite(next) && next > 0) set_height(next + 8);
  }, []);

  return <section
    aria-label="Human-readable Civic Genome report"
    style={{
      marginBottom: "1.25rem",
      border: "1px solid rgba(82,193,145,.22)",
      borderRadius: 12,
      overflow: "hidden",
      background: "#f5f8f6",
    }}
  >
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: ".75rem",
      flexWrap: "wrap",
      padding: ".7rem .85rem",
      background: "rgba(13,30,25,.98)",
      borderBottom: "1px solid rgba(82,193,145,.22)",
    }}>
      <div>
        <strong style={{ color: "#edf7f2", fontSize: ".9rem" }}>Civic Genome report</strong>
        <div style={{ color: "#91a9a0", fontFamily: mono, fontSize: ".61rem", marginTop: ".2rem" }}>
          Human-readable current record · source preserving
        </div>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: "inline-flex", alignItems: "center", gap: ".35rem", color: "#59d89c", fontFamily: mono, fontSize: ".64rem", fontWeight: 700 }}
      >
        Open full report <ExternalLink size={13}/>
      </a>
    </div>
    <iframe
      ref={frame_ref}
      src={href}
      title="Civic Genome human-readable report"
      onLoad={resize}
      style={{
        display: "block",
        width: "100%",
        height,
        border: 0,
        background: "#f5f8f6",
      }}
    />
  </section>;
}
