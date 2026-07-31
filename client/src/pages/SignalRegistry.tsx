import { trpc } from "@/lib/trpc";
import { LayerNavBar } from "@/components/LayerNavBar";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Clock,
  Database,
  GitMerge,
  Loader2,
  MapPin,
  Radio,
  Scale,
  ShieldCheck,
  Users,
} from "lucide-react";

const palette = {
  background: "#0c0f14",
  surface: "rgba(255,255,255,0.035)",
  border: "rgba(255,255,255,0.09)",
  text: "#f0ece4",
  muted: "rgba(240,236,228,0.58)",
  intake: "#38bdf8",
  legal: "#c084fc",
  live: "#f59e0b",
  convergence: "#34d399",
  danger: "#f87171",
};

const domain_meta = {
  case_intake: {
    icon: Users,
    color: palette.intake,
    short_label: "Domain 1",
  },
  legal_pattern: {
    icon: Scale,
    color: palette.legal,
    short_label: "Domain 2",
  },
  live_data: {
    icon: Activity,
    color: palette.live,
    short_label: "Domain 3",
  },
  convergence: {
    icon: GitMerge,
    color: palette.convergence,
    short_label: "End-stage",
  },
} as const;

function format_date(value: string | null | undefined): string {
  if (!value) return "No record yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

function format_number(value: number | null | undefined): string {
  return new Intl.NumberFormat().format(value ?? 0);
}

export default function SignalRegistry() {
  const architecture_query = trpc.enforcementIntel.get_signal_architecture.useQuery(
    { limit: 40 },
    { refetchInterval: 60_000 },
  );

  if (architecture_query.isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: palette.background,
          color: palette.text,
          display: "grid",
          placeItems: "center",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <Loader2 size={34} style={{ animation: "spin 1s linear infinite" }} />
          <p style={{ color: palette.muted }}>Loading canonical signal architecture…</p>
        </div>
      </div>
    );
  }

  if (architecture_query.error || !architecture_query.data) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: palette.background,
          color: palette.text,
          padding: 32,
        }}
      >
        <LayerNavBar label="Signal Architecture" route="/signal-registry" />
        <div
          style={{
            border: `1px solid ${palette.danger}`,
            borderRadius: 12,
            padding: 20,
            background: "rgba(248,113,113,0.06)",
          }}
        >
          <AlertTriangle size={22} color={palette.danger} />
          <h1>Signal architecture unavailable</h1>
          <p style={{ color: palette.muted }}>
            {architecture_query.error?.message ?? "The canonical signal views are not available."}
          </p>
        </div>
      </div>
    );
  }

  const { domains, integrity, recent_records } = architecture_query.data;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: palette.background,
        color: palette.text,
        padding: "24px 32px 48px",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <LayerNavBar label="Signal Architecture" route="/signal-registry" />

      <header style={{ maxWidth: 1080, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Radio size={26} color={palette.live} />
          <h1 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 30 }}>
            Luminari Signal Architecture
          </h1>
        </div>
        <p style={{ color: palette.muted, lineHeight: 1.6, marginBottom: 0 }}>
          Three independent source domains. No source mixing. Convergence occurs only after
          each domain has produced its own provenance-bound output.
        </p>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
          gap: 12,
          marginBottom: 22,
        }}
      >
        <div style={metric_card_style}>
          <Database size={18} color={palette.live} />
          <div>
            <div style={metric_value_style}>{format_number(integrity.atlas_unique_observation_count)}</div>
            <div style={metric_label_style}>Unique Atlas observations</div>
            <div style={metric_note_style}>
              {format_number(integrity.atlas_raw_observation_count)} historical rows; {format_number(integrity.atlas_replay_observation_count)} replay rows preserved
            </div>
          </div>
        </div>
        <div style={metric_card_style}>
          <ShieldCheck size={18} color={palette.convergence} />
          <div>
            <div style={metric_value_style}>
              {format_number(
                integrity.intake_signal_count +
                  integrity.legal_pattern_count +
                  integrity.live_data_signal_count,
              )}
            </div>
            <div style={metric_label_style}>Canonical source-domain outputs</div>
            <div style={metric_note_style}>Separated by source ownership</div>
          </div>
        </div>
        <div style={metric_card_style}>
          <GitMerge size={18} color={palette.convergence} />
          <div>
            <div style={metric_value_style}>{format_number(integrity.convergence_count)}</div>
            <div style={metric_label_style}>Three-domain convergences</div>
            <div style={metric_note_style}>Requires one record from every domain</div>
          </div>
        </div>
        <div style={{ ...metric_card_style, borderColor: "rgba(248,113,113,0.32)" }}>
          <AlertTriangle size={18} color={palette.danger} />
          <div>
            <div style={metric_value_style}>
              {format_number(
                integrity.legacy_detected_signals_count + integrity.legacy_live_signals_count,
              )}
            </div>
            <div style={metric_label_style}>Legacy mixed rows quarantined</div>
            <div style={metric_note_style}>Preserved as evidence; not canonicalized</div>
          </div>
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 14,
          marginBottom: 26,
        }}
      >
        {domains.map((domain) => {
          const meta = domain_meta[domain.domain_code as keyof typeof domain_meta];
          const Icon = meta?.icon ?? BookOpen;
          const color = meta?.color ?? palette.text;
          return (
            <article
              key={domain.domain_code}
              style={{
                background: palette.surface,
                border: `1px solid ${palette.border}`,
                borderTop: `3px solid ${color}`,
                borderRadius: 12,
                padding: 18,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <Icon size={20} color={color} />
                  <div>
                    <div style={{ color, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>
                      {meta?.short_label ?? "Domain"}
                    </div>
                    <h2 style={{ margin: "2px 0 0", fontSize: 18 }}>{domain.domain_label}</h2>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 24, fontWeight: 750, color }}>
                    {format_number(domain.current_record_count)}
                  </div>
                  <div style={{ color: palette.muted, fontSize: 11 }}>current</div>
                </div>
              </div>

              <p style={{ color: palette.muted, lineHeight: 1.55, minHeight: 66 }}>
                {domain.description}
              </p>

              <div style={detail_row_style}>
                <span>Owner</span>
                <strong>{domain.source_owner}</strong>
              </div>
              <div style={detail_row_style}>
                <span>Storage</span>
                <code>{domain.canonical_relation}</code>
              </div>
              <div style={detail_row_style}>
                <span>Latest</span>
                <strong>{format_date(domain.latest_record_at)}</strong>
              </div>

              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", color }}>Boundary contract</summary>
                <p style={contract_text_style}>{domain.source_boundary}</p>
                <p style={contract_text_style}><strong>Severity:</strong> {domain.severity_policy}</p>
                <p style={contract_text_style}><strong>Confidence:</strong> {domain.confidence_policy}</p>
              </details>
            </article>
          );
        })}
      </section>

      <section
        style={{
          background: palette.surface,
          border: `1px solid ${palette.border}`,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "16px 18px",
            borderBottom: `1px solid ${palette.border}`,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 19 }}>Recent canonical outputs</h2>
            <p style={{ margin: "5px 0 0", color: palette.muted, fontSize: 13 }}>
              Individual intake details are redacted on this cross-system surface.
            </p>
          </div>
          <div style={{ color: palette.muted, fontSize: 12, display: "flex", gap: 6 }}>
            <Clock size={14} />
            Atlas freshness: {format_date(integrity.latest_atlas_observation_at)}
          </div>
        </div>

        {recent_records.length === 0 ? (
          <div style={{ padding: 28, textAlign: "center", color: palette.muted }}>
            The canonical domain stores are ready. No domain output has been registered yet.
          </div>
        ) : (
          <div>
            {recent_records.map((record) => {
              const meta = domain_meta[record.domain_code as keyof typeof domain_meta];
              const color = meta?.color ?? palette.text;
              return (
                <div
                  key={`${record.domain_code}:${record.record_id}`}
                  style={{
                    padding: "14px 18px",
                    borderBottom: `1px solid ${palette.border}`,
                    display: "grid",
                    gridTemplateColumns: "minmax(170px, 0.8fr) minmax(260px, 2fr) minmax(150px, 0.7fr)",
                    gap: 16,
                    alignItems: "start",
                  }}
                >
                  <div>
                    <div style={{ color, fontSize: 11, textTransform: "uppercase" }}>
                      {record.domain_code.replaceAll("_", " ")}
                    </div>
                    <div style={{ marginTop: 4, fontWeight: 650 }}>{record.title}</div>
                  </div>
                  <div>
                    <div style={{ color: palette.muted, lineHeight: 1.45, fontSize: 13 }}>
                      {record.description}
                    </div>
                    <div style={{ display: "flex", gap: 12, marginTop: 7, color: palette.muted, fontSize: 11 }}>
                      {record.jurisdiction_id && (
                        <span style={{ display: "flex", gap: 4 }}>
                          <MapPin size={12} /> {record.jurisdiction_id}
                        </span>
                      )}
                      {record.entity_resolution_status && (
                        <span>entity: {record.entity_resolution_status}</span>
                      )}
                      {record.source_reference && <span>source: {record.source_reference}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 12 }}>
                    <div style={{ color }}>{record.status}</div>
                    {record.severity && <div style={{ marginTop: 4 }}>severity: {record.severity}</div>}
                    {record.confidence_score != null && (
                      <div style={{ marginTop: 4 }}>
                        confidence: {(record.confidence_score * 100).toFixed(1)}%
                      </div>
                    )}
                    <div style={{ marginTop: 5, color: palette.muted }}>
                      {format_date(record.occurred_at)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

const metric_card_style = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  padding: 16,
  background: palette.surface,
  border: `1px solid ${palette.border}`,
  borderRadius: 10,
} as const;

const metric_value_style = {
  fontSize: 22,
  fontWeight: 750,
  lineHeight: 1,
} as const;

const metric_label_style = {
  marginTop: 5,
  fontSize: 13,
} as const;

const metric_note_style = {
  marginTop: 4,
  color: palette.muted,
  fontSize: 11,
} as const;

const detail_row_style = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  borderTop: `1px solid ${palette.border}`,
  padding: "8px 0",
  fontSize: 12,
  color: palette.muted,
} as const;

const contract_text_style = {
  color: palette.muted,
  lineHeight: 1.5,
  fontSize: 12,
  marginBottom: 6,
} as const;