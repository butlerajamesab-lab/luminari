import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { LayerNavBar } from "@/components/LayerNavBar";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  ExternalLink,
  GitMerge,
  Link2,
  Loader2,
  MapPin,
  Radio,
  Scale,
  Search,
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

const artifact_domains = ["legal_pattern", "live_data", "convergence"] as const;
type ArtifactDomain = typeof artifact_domains[number];

const relationship_types = [
  "context",
  "supporting_candidate",
  "contradiction_candidate",
  "pattern_candidate",
  "routing_context",
] as const;
type RelationshipType = typeof relationship_types[number];

const PAGE_SIZE = 50;

function is_artifact_domain(value: string | null): value is ArtifactDomain {
  return value != null && artifact_domains.includes(value as ArtifactDomain);
}

function readable(value: string): string {
  return value.replaceAll("_", " ");
}

function collect_urls(value: unknown, urls = new Set<string>()): Set<string> {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) {
    urls.add(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collect_urls(item, urls));
  } else if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) =>
      collect_urls(item, urls),
    );
  }
  return urls;
}

function format_date(value: string | null | undefined): string {
  if (!value) return "No record yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

function format_number(value: number | null | undefined): string {
  return new Intl.NumberFormat().format(value ?? 0);
}

export default function SignalRegistry() {
  const search_string = useSearch();
  const [, navigate] = useLocation();
  const url_params = useMemo(
    () => new URLSearchParams(search_string),
    [search_string],
  );
  const url_domain = url_params.get("signal_domain") ?? url_params.get("domain");
  const url_record_id = url_params.get("signal_id");
  const [selected_domain, set_selected_domain] = useState<ArtifactDomain | undefined>(
    is_artifact_domain(url_domain) ? url_domain : undefined,
  );
  const [offset, set_offset] = useState(0);
  const [search_input, set_search_input] = useState("");
  const [search_query, set_search_query] = useState("");
  const [selected_record_id, set_selected_record_id] = useState<string | null>(
    url_record_id,
  );
  const [selected_case_id, set_selected_case_id] = useState("");
  const [relationship_type, set_relationship_type] = useState<RelationshipType>("context");
  const [reviewer_notes, set_reviewer_notes] = useState("");

  const architecture_query = trpc.enforcementIntel.get_signal_architecture.useQuery(
    { limit: 1 },
    { refetchInterval: 60_000 },
  );
  const artifacts_query = trpc.enforcementIntel.list_signal_artifacts.useQuery({
    domain: selected_domain,
    limit: PAGE_SIZE,
    offset,
    query: search_query || undefined,
  });
  const artifact_detail_query = trpc.enforcementIntel.get_signal_artifact.useQuery(
    {
      domain: selected_domain ?? "live_data",
      record_id: selected_record_id ?? "",
    },
    { enabled: selected_domain != null && selected_record_id != null },
  );
  const cases_query = trpc.cases.list.useQuery();
  const utils = trpc.useUtils();
  const connect_mutation = trpc.enforcementIntel.connect_signal_artifact_to_case.useMutation({
    onSuccess: async (result) => {
      toast.success(result.created ? "Signal artifact connected to case" : "That case connection already exists");
      set_reviewer_notes("");
      if (selected_case_id) {
        await utils.enforcementIntel.list_case_signal_artifacts.invalidate({
          case_id: Number(selected_case_id),
        });
      }
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    if (is_artifact_domain(url_domain)) {
      set_selected_domain(url_domain);
    }
    set_selected_record_id(url_record_id);
  }, [url_domain, url_record_id]);

  function choose_domain(domain: string) {
    if (domain === "case_intake") {
      navigate("/cases");
      return;
    }
    if (!is_artifact_domain(domain)) return;
    set_selected_domain(domain);
    set_selected_record_id(null);
    set_offset(0);
    navigate(`/signal-registry?domain=${domain}`);
    window.setTimeout(() => {
      document.getElementById("signal-artifact-browser")?.scrollIntoView({ behavior: "smooth" });
    }, 0);
  }

  function open_artifact(domain: ArtifactDomain, record_id: string) {
    set_selected_domain(domain);
    set_selected_record_id(record_id);
    const params = new URLSearchParams({ signal_domain: domain, signal_id: record_id });
    navigate(`/signal-registry?${params.toString()}`);
  }

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

  const { domains, integrity } = architecture_query.data;

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
            <div style={metric_label_style}>Governed source-domain records</div>
            <div style={metric_note_style}>
              Domain 3: {format_number(integrity.live_data_candidate_count)} candidates · {format_number(integrity.live_data_promoted_count)} promoted signals
            </div>
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
          const isCaseIntake = domain.domain_code === "case_intake";
          const isLiveData = domain.domain_code === "live_data";
          const displayLabel = isCaseIntake
            ? "Promoted Case Intake Signals"
            : isLiveData
              ? "Atlas Domain 3 Records"
            : domain.domain_label;
          const displayDescription = isCaseIntake
            ? "Promoted case breakpoints only. Intake sessions, uploaded documents, preserved evidence, and case reviews are tracked separately and are not counted here."
            : isLiveData
              ? `${format_number(integrity.live_data_candidate_count)} governed observation candidates and ${format_number(integrity.live_data_promoted_count)} promoted canonical signals projected from Atlas. Candidates are not findings.`
            : domain.description;

          return (
            <article
              key={domain.domain_code}
              role="button"
              tabIndex={0}
              aria-label={`Explore ${displayLabel}`}
              onClick={() => choose_domain(domain.domain_code)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  choose_domain(domain.domain_code);
                }
              }}
              style={{
                background: palette.surface,
                border: `1px solid ${
                  selected_domain === domain.domain_code ? color : palette.border
                }`,
                borderTop: `3px solid ${color}`,
                borderRadius: 12,
                padding: 18,
                cursor: "pointer",
                outline: "none",
                boxShadow:
                  selected_domain === domain.domain_code
                    ? `0 0 0 2px ${color}22`
                    : "none",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <Icon size={20} color={color} />
                  <div>
                    <div style={{ color, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>
                      {meta?.short_label ?? "Domain"}
                    </div>
                    <h2 style={{ margin: "2px 0 0", fontSize: 18 }}>{displayLabel}</h2>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 24, fontWeight: 750, color }}>
                    {format_number(domain.current_record_count)}
                  </div>
                  <div style={{ color: palette.muted, fontSize: 11 }}>
                    {isCaseIntake ? "promoted" : "current"}
                  </div>
                </div>
              </div>

              <p style={{ color: palette.muted, lineHeight: 1.55, minHeight: 66 }}>
                {displayDescription}
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

              <details style={{ marginTop: 12 }} onClick={(event) => event.stopPropagation()}>
                <summary style={{ cursor: "pointer", color }}>Boundary contract</summary>
                <p style={contract_text_style}>{domain.source_boundary}</p>
                <p style={contract_text_style}><strong>Severity:</strong> {domain.severity_policy}</p>
                <p style={contract_text_style}><strong>Confidence:</strong> {domain.confidence_policy}</p>
              </details>
              <div style={{ marginTop: 12, color, fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
                {isCaseIntake ? "Open private case artifacts" : "Explore every artifact"}
                <ChevronRight size={14} />
              </div>
            </article>
          );
        })}
      </section>

      <section
        id="signal-artifact-browser"
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
            <h2 style={{ margin: 0, fontSize: 19 }}>Canonical artifact explorer</h2>
            <p style={{ margin: "5px 0 0", color: palette.muted, fontSize: 13 }}>
              Browse every Domain 2, Domain 3, and convergence artifact. Domain 1 stays inside its authorized case workspace.
            </p>
          </div>
          <div style={{ color: palette.muted, fontSize: 12, display: "flex", gap: 6 }}>
            <Clock size={14} />
            Atlas freshness: {format_date(integrity.latest_atlas_observation_at)}
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            set_search_query(search_input.trim());
            set_offset(0);
          }}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(180px, 0.35fr) minmax(240px, 1fr) auto",
            gap: 10,
            padding: 16,
            borderBottom: `1px solid ${palette.border}`,
          }}
          className="signal-artifact-filters"
        >
          <select
            value={selected_domain ?? "all"}
            onChange={(event) => {
              const value = event.target.value;
              set_selected_domain(is_artifact_domain(value) ? value : undefined);
              set_selected_record_id(null);
              set_offset(0);
              navigate(value === "all" ? "/signal-registry" : `/signal-registry?domain=${value}`);
            }}
            style={control_style}
            aria-label="Signal domain"
          >
            <option value="all">All public domains</option>
            <option value="legal_pattern">Domain 2 · Legal patterns</option>
            <option value="live_data">Domain 3 · Atlas records</option>
            <option value="convergence">Three-domain convergence</option>
          </select>
          <label style={{ position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: 11, top: 11, color: palette.muted }} />
            <input
              value={search_input}
              onChange={(event) => set_search_input(event.target.value)}
              placeholder="Search title, type, jurisdiction, or source…"
              style={{ ...control_style, width: "100%", boxSizing: "border-box", paddingLeft: 34 }}
            />
          </label>
          <button type="submit" style={primary_button_style}>Search</button>
        </form>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            padding: "10px 18px",
            color: palette.muted,
            fontSize: 12,
            borderBottom: `1px solid ${palette.border}`,
          }}
        >
          <span>
            {artifacts_query.data?.total
              ? `${format_number(offset + 1)}–${format_number(Math.min(offset + PAGE_SIZE, artifacts_query.data.total))} of ${format_number(artifacts_query.data.total)}`
              : "0 artifacts"}
          </span>
          <span>No findings are inferred by this list.</span>
        </div>

        {artifacts_query.isLoading ? (
          <div style={{ padding: 36, display: "flex", justifyContent: "center" }}>
            <Loader2 size={24} style={{ animation: "spin 1s linear infinite" }} />
          </div>
        ) : artifacts_query.error ? (
          <div style={{ padding: 24, color: palette.danger }}>{artifacts_query.error.message}</div>
        ) : artifacts_query.data?.items.length === 0 ? (
          <div style={{ padding: 28, textAlign: "center", color: palette.muted }}>
            No canonical artifacts match this filter.
          </div>
        ) : (
          <div>
            {artifacts_query.data?.items.map((record) => {
              const meta = domain_meta[record.domain_code as keyof typeof domain_meta];
              const color = meta?.color ?? palette.text;
              return (
                <button
                  type="button"
                  key={`${record.domain_code}:${record.record_id}`}
                  onClick={() => open_artifact(record.domain_code, record.record_id)}
                  style={{
                    width: "100%",
                    color: palette.text,
                    background:
                      selected_record_id === record.record_id
                        ? `${color}12`
                        : "transparent",
                    padding: "14px 18px",
                    border: 0,
                    borderBottom: `1px solid ${palette.border}`,
                    display: "grid",
                    gridTemplateColumns: "minmax(180px, 0.7fr) minmax(260px, 1.4fr) minmax(130px, 0.35fr)",
                    gap: 16,
                    alignItems: "start",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                  className="signal-artifact-row"
                >
                  <div>
                    <div style={{ color, fontSize: 11, textTransform: "uppercase" }}>
                      {readable(record.domain_code)} · {readable(record.artifact_type)}
                    </div>
                    <div style={{ marginTop: 4, fontWeight: 650 }}>{record.title}</div>
                    <div style={{ marginTop: 7, color, fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                      Opens in {record.home_label} <ExternalLink size={11} />
                    </div>
                  </div>
                  <div>
                    <div style={{ color: palette.muted, lineHeight: 1.45, fontSize: 13 }}>
                      {record.description}
                    </div>
                    <div style={{ display: "flex", gap: 12, marginTop: 7, color: palette.muted, fontSize: 11, flexWrap: "wrap" }}>
                      {record.jurisdiction_id && (
                        <span style={{ display: "flex", gap: 4 }}>
                          <MapPin size={12} /> {record.jurisdiction_id}
                        </span>
                      )}
                      {record.source_reference && <span style={{ overflowWrap: "anywhere" }}>source: {record.source_reference}</span>}
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
                    <ChevronRight size={16} color={color} style={{ margin: "8px 0 0 auto" }} />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", padding: 14, gap: 10 }}>
          <button
            type="button"
            onClick={() => set_offset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0 || artifacts_query.isFetching}
            style={secondary_button_style}
          >
            <ChevronLeft size={14} /> Previous {PAGE_SIZE}
          </button>
          <button
            type="button"
            onClick={() => set_offset(offset + PAGE_SIZE)}
            disabled={!artifacts_query.data?.has_more || artifacts_query.isFetching}
            style={secondary_button_style}
          >
            Next {PAGE_SIZE} <ChevronRight size={14} />
          </button>
        </div>
      </section>

      {selected_record_id && selected_domain && (
        <section
          style={{
            marginTop: 20,
            background: palette.surface,
            border: `1px solid ${palette.border}`,
            borderRadius: 12,
            padding: 18,
          }}
        >
          {artifact_detail_query.isLoading ? (
            <div style={{ padding: 28, display: "flex", justifyContent: "center" }}>
              <Loader2 size={24} style={{ animation: "spin 1s linear infinite" }} />
            </div>
          ) : artifact_detail_query.error ? (
            <div style={{ color: palette.danger }}>{artifact_detail_query.error.message}</div>
          ) : artifact_detail_query.data ? (
            <div style={{ display: "grid", gap: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <div style={{ maxWidth: 820 }}>
                  <div style={{ color: domain_meta[selected_domain].color, textTransform: "uppercase", fontSize: 11, letterSpacing: 1 }}>
                    {readable(artifact_detail_query.data.domain_code)} · {readable(artifact_detail_query.data.artifact_type)}
                  </div>
                  <h2 style={{ margin: "6px 0 8px", fontSize: 23 }}>{artifact_detail_query.data.title}</h2>
                  <p style={{ margin: 0, color: palette.muted, lineHeight: 1.6 }}>
                    {artifact_detail_query.data.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(artifact_detail_query.data.destination_path)}
                  style={primary_button_style}
                >
                  Open in {artifact_detail_query.data.home_label} <ExternalLink size={14} />
                </button>
              </div>

              <div style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: 14, background: "rgba(245,158,11,0.04)" }}>
                <div style={{ color: palette.live, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                  Environmental meaning
                </div>
                <p style={{ margin: 0, color: palette.muted, lineHeight: 1.6 }}>
                  {artifact_detail_query.data.environmental_effect}
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                <div style={json_detail_style}>
                  <div style={json_summary_style}>Canonical identity and source hash</div>
                  <code style={{ ...json_pre_style, display: "block", maxHeight: "none" }}>
                    {artifact_detail_query.data.domain_code}:{artifact_detail_query.data.record_id}
                    {"\n"}sha256:{artifact_detail_query.data.source_hash}
                  </code>
                </div>
                <div style={json_detail_style}>
                  <div style={json_summary_style}>Open exact source material</div>
                  {Array.from(collect_urls(artifact_detail_query.data.evidence)).length ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                      {Array.from(collect_urls(artifact_detail_query.data.evidence)).slice(0, 12).map((url, index) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ ...secondary_button_style, fontSize: 11, textDecoration: "none" }}
                        >
                          Source {index + 1} <ExternalLink size={11} />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p style={{ margin: "10px 0 0", color: palette.muted, fontSize: 12 }}>
                      No public source URL is embedded in this artifact. Use the preserved source key and hash below for review.
                    </p>
                  )}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                <details open style={json_detail_style}>
                  <summary style={json_summary_style}>Evidence and exact source references</summary>
                  <pre style={json_pre_style}>{JSON.stringify(artifact_detail_query.data.evidence, null, 2)}</pre>
                </details>
                <details style={json_detail_style}>
                  <summary style={json_summary_style}>Rule, engine, and hash provenance</summary>
                  <pre style={json_pre_style}>{JSON.stringify(artifact_detail_query.data.provenance, null, 2)}</pre>
                </details>
              </div>

              <div style={{ borderTop: `1px solid ${palette.border}`, paddingTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <Link2 size={17} color={palette.convergence} />
                  <h3 style={{ margin: 0, fontSize: 16 }}>Connect this artifact to a case</h3>
                </div>
                <p style={{ margin: "0 0 12px", color: palette.muted, fontSize: 12 }}>
                  This creates a reviewer-authored context receipt. It does not create a finding, prove wrongdoing, or change the artifact.
                </p>
                <div className="signal-case-link-grid" style={{ display: "grid", gridTemplateColumns: "minmax(200px, 0.8fr) minmax(200px, 0.7fr) minmax(240px, 1fr) auto", gap: 10 }}>
                  <select value={selected_case_id} onChange={(event) => set_selected_case_id(event.target.value)} style={control_style}>
                    <option value="">Choose a case…</option>
                    {cases_query.data?.map((case_item) => (
                      <option key={case_item.id} value={case_item.id}>{case_item.name}</option>
                    ))}
                  </select>
                  <select value={relationship_type} onChange={(event) => set_relationship_type(event.target.value as RelationshipType)} style={control_style}>
                    {relationship_types.map((relationship) => (
                      <option key={relationship} value={relationship}>{readable(relationship)}</option>
                    ))}
                  </select>
                  <input
                    value={reviewer_notes}
                    onChange={(event) => set_reviewer_notes(event.target.value)}
                    placeholder="Why this artifact belongs with the case (optional)"
                    style={control_style}
                  />
                  <button
                    type="button"
                    disabled={!selected_case_id || connect_mutation.isPending}
                    onClick={() => connect_mutation.mutate({
                      domain: selected_domain,
                      record_id: selected_record_id,
                      case_id: Number(selected_case_id),
                      relationship_type,
                      reviewer_notes: reviewer_notes.trim() || undefined,
                    })}
                    style={primary_button_style}
                  >
                    {connect_mutation.isPending ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Link2 size={14} />}
                    Connect
                  </button>
                </div>
                {connect_mutation.data && selected_case_id && (
                  <button
                    type="button"
                    onClick={() => navigate(`/cases/${selected_case_id}/control-room`)}
                    style={{ ...secondary_button_style, marginTop: 10 }}
                  >
                    Open connected case <ExternalLink size={13} />
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </section>
      )}

      <style>{`
        @media (max-width: 760px) {
          .signal-artifact-filters,
          .signal-case-link-grid,
          .signal-artifact-row { grid-template-columns: 1fr !important; }
        }
      `}</style>
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

const control_style = {
  minHeight: 38,
  borderRadius: 8,
  border: `1px solid ${palette.border}`,
  background: palette.background,
  color: palette.text,
  padding: "9px 11px",
  outline: "none",
} as const;

const primary_button_style = {
  minHeight: 38,
  borderRadius: 8,
  border: "1px solid rgba(245,158,11,0.45)",
  background: "rgba(245,158,11,0.13)",
  color: palette.text,
  padding: "8px 13px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  whiteSpace: "nowrap",
} as const;

const secondary_button_style = {
  minHeight: 34,
  borderRadius: 8,
  border: `1px solid ${palette.border}`,
  background: palette.surface,
  color: palette.text,
  padding: "7px 11px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
} as const;

const json_detail_style = {
  border: `1px solid ${palette.border}`,
  borderRadius: 10,
  padding: 12,
  minWidth: 0,
} as const;

const json_summary_style = {
  cursor: "pointer",
  color: palette.text,
  fontSize: 13,
  fontWeight: 650,
} as const;

const json_pre_style = {
  margin: "12px 0 0",
  maxHeight: 360,
  overflow: "auto",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  color: palette.muted,
  fontSize: 11,
  lineHeight: 1.5,
} as const;
