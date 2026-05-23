import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ChevronLeft,
  BarChart3,
  TrendingUp,
  Users,
  Activity,
  PieChart,
  Clock,
  ArrowUpRight,
  RefreshCw,
  Filter,
} from "lucide-react";
import { Link } from "wouter";
import { useWorldIndex } from "@/hooks/useWorldIndex";

// ─── Pipeline label mapping ───
const PIPELINE_LABELS: Record<string, string> = {
  insurance: "Insurance Denial",
  custody: "Custody & Family Court",
  medical: "Medical Records",
  workplace: "Workplace Retaliation",
  housing: "Housing Disputes",
  consumer: "Consumer Protection",
  disability: "Disability/Benefits",
  medicaid: "Medicaid/Medicare",
  snap: "SNAP/WIC/Food",
  veterans: "Veterans Benefits",
  unemployment: "Unemployment",
  nursing: "Nursing Home",
  guardianship: "Guardianship",
  elderabuse: "Elder Abuse",
  immigration: "Immigration/Asylum",
  childwelfare: "Child Welfare/CPS",
  education: "Education/IEP",
  section8: "Section 8/Housing",
  juvenile: "Juvenile Justice",
  icwa: "ICWA Compliance",
  mmiw: "MMIW Cases",
  treatyrights: "Treaty Rights",
  triballand: "Land & Trust",
  tribalenrollment: "Tribal Enrollment",
  tribalhousing: "Tribal Housing",
  tribalsovereignty: "Sovereignty",
  workerscomp: "Workers' Comp",
  wrongfulconviction: "Wrongful Conviction",
  debtcollection: "Debt Collection",
  policemisconduct: "Police Misconduct",
  bankruptcy: "Bankruptcy",
  environmental: "Environmental Justice",
  hoa: "HOA Disputes",
  taxdispute: "Tax Disputes",
  fostercare: "Foster Care Records",
  medmalpractice: "Medical Malpractice",
  predatorylending: "Predatory Lending",
  whistleblower: "Whistleblower",
  nonprofitcompliance: "Nonprofit Compliance",
  marketconcentration: "Market Concentration",
  agricultureexploitation: "Agriculture Exploitation",
  involuntary_hold: "Involuntary Hold",
  polypharmacy_harm: "Polypharmacy Harm",
  discharge_failure: "Discharge Failure",
  family_exclusion: "Family Exclusion",
  restraint_seclusion: "Restraint & Seclusion",
  record_correction: "Record Correction",
  other: "General Investigation",
};

const CATEGORY_COLORS: Record<string, string> = {
  insurance: "#3b82f6", custody: "#f43f5e", medical: "#10b981", workplace: "#f59e0b",
  housing: "#8b5cf6", consumer: "#06b6d4", disability: "#6366f1", medicaid: "#14b8a6",
  snap: "#f97316", veterans: "#059669", unemployment: "#eab308", nursing: "#ec4899",
  guardianship: "#a855f7", elderabuse: "#ef4444", immigration: "#0ea5e9", childwelfare: "#d946ef",
  education: "#22c55e", section8: "#7c3aed", juvenile: "#f472b6", icwa: "#c084fc",
  mmiw: "#fb923c", treatyrights: "#2dd4bf", triballand: "#a78bfa", tribalenrollment: "#34d399",
  tribalhousing: "#fbbf24", tribalsovereignty: "#818cf8", workerscomp: "#f87171", wrongfulconviction: "#4ade80",
  debtcollection: "#84cc16", policemisconduct: "#e879f9", bankruptcy: "#38bdf8",
  marketconcentration: "#d97706", agricultureexploitation: "#65a30d", environmental: "#2dd4bf",
  hoa: "#c084fc", taxdispute: "#fcd34d", fostercare: "#f0abfc", medmalpractice: "#67e8f9",
  predatorylending: "#fda4af", whistleblower: "#86efac", nonprofitcompliance: "#93c5fd",
  involuntary_hold: "#38bdf8", polypharmacy_harm: "#7dd3fc", discharge_failure: "#0ea5e9",
  family_exclusion: "#67e8f9", restraint_seclusion: "#06b6d4", record_correction: "#22d3ee",
  other: "#94a3b8",
};

// ─── Simple SVG Bar Chart ───
function BarChartSVG({ data, maxBars = 15 }: { data: { label: string; value: number; color: string }[]; maxBars?: number }) {
  const sorted = [...data].sort((a, b) => b.value - a.value).slice(0, maxBars);
  const maxVal = Math.max(...sorted.map((d) => d.value), 1);
  const barHeight = 28;
  const labelWidth = 160;
  const chartWidth = 500;
  const svgHeight = sorted.length * (barHeight + 6) + 10;

  return (
    <svg viewBox={`0 0 ${labelWidth + chartWidth + 60} ${svgHeight}`} className="w-full" style={{ maxHeight: 500 }}>
      {sorted.map((d, i) => {
        const y = i * (barHeight + 6) + 5;
        const barW = (d.value / maxVal) * chartWidth;
        return (
          <g key={d.label}>
            <text x={labelWidth - 8} y={y + barHeight / 2 + 4} textAnchor="end" className="fill-muted-foreground" fontSize="11">
              {d.label.length > 22 ? d.label.slice(0, 20) + "…" : d.label}
            </text>
            <rect x={labelWidth} y={y} width={barW} height={barHeight} rx={4} fill={d.color} opacity={0.8} />
            <text x={labelWidth + barW + 6} y={y + barHeight / 2 + 4} className="fill-foreground" fontSize="12" fontWeight="bold">
              {d.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Simple SVG Donut Chart ───
function DonutChartSVG({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div className="text-center text-muted-foreground py-8">No data yet</div>;

  const cx = 100, cy = 100, r = 80, innerR = 50;
  let cumAngle = -Math.PI / 2;

  const slices = data.filter((d) => d.value > 0).map((d) => {
    const angle = (d.value / total) * 2 * Math.PI;
    const startAngle = cumAngle;
    cumAngle += angle;
    const endAngle = cumAngle;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const ix1 = cx + innerR * Math.cos(endAngle);
    const iy1 = cy + innerR * Math.sin(endAngle);
    const ix2 = cx + innerR * Math.cos(startAngle);
    const iy2 = cy + innerR * Math.sin(startAngle);
    const largeArc = angle > Math.PI ? 1 : 0;

    const path = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;

    return { ...d, path };
  });

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 200 200" className="w-48 h-48 shrink-0">
        {slices.map((s) => (
          <path key={s.label} d={s.path} fill={s.color} opacity={0.85} />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" className="fill-foreground" fontSize="22" fontWeight="bold">
          {total}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="fill-muted-foreground" fontSize="10">
          total events
        </text>
      </svg>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {slices.slice(0, 12).map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-muted-foreground truncate">{s.label}</span>
            <span className="font-medium text-foreground ml-auto">{s.value}</span>
          </div>
        ))}
        {slices.length > 12 && (
          <div className="text-muted-foreground col-span-2">+{slices.length - 12} more</div>
        )}
      </div>
    </div>
  );
}

// ─── Event Type Distribution ───
function EventTypeBreakdown({ stats }: { stats: Record<string, Record<string, number>> }) {
  const ALL_EVENTS = [
    { key: "intake_start", label: "Intake Started", color: "#3b82f6" },
    { key: "intake_complete", label: "Intake Completed", color: "#06b6d4" },
    { key: "direct_create", label: "Case Created", color: "#10b981" },
    { key: "document_uploaded", label: "Doc Uploaded", color: "#22c55e" },
    { key: "extraction_complete", label: "Text Extracted", color: "#84cc16" },
    { key: "analysis_started", label: "Analysis Started", color: "#eab308" },
    { key: "analysis_complete", label: "Analysis Done", color: "#f59e0b" },
    { key: "findings_generated", label: "Findings", color: "#f97316" },
    { key: "export_created", label: "Export Created", color: "#ef4444" },
    { key: "case_completed", label: "Case Done", color: "#8b5cf6" },
  ];

  const totals: Record<string, number> = {};
  for (const e of ALL_EVENTS) totals[e.key] = 0;
  for (const s of Object.values(stats)) {
    for (const e of ALL_EVENTS) {
      totals[e.key] += (s[e.key] || 0);
    }
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {ALL_EVENTS.map((item) => (
        <div key={item.key} className="rounded-lg border border-border p-3 text-center">
          <div className="text-2xl font-bold" style={{ color: item.color }}>{totals[item.key]}</div>
          <div className="text-[10px] text-muted-foreground mt-1">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Recent Activity Feed ───
function RecentActivityFeed({ events }: { events: any[] }) {
  if (!events || events.length === 0) {
    return <div className="text-center text-muted-foreground py-6 text-sm">No recent activity</div>;
  }

  const eventIcons: Record<string, string> = {
    intake_start: "Started intake",
    intake_complete: "Completed intake",
    direct_create: "Created case directly",
    document_uploaded: "Uploaded document",
    extraction_complete: "Text extracted",
    analysis_started: "Analysis started",
    analysis_complete: "Analysis complete",
    findings_generated: "Findings generated",
    export_created: "Export created",
    case_completed: "Completed case",
  };

  return (
    <div className="space-y-2 max-h-80 overflow-y-auto">
      {events.map((ev: any, i: number) => (
        <div key={i} className="flex items-center gap-3 p-2 rounded-md bg-muted/30">
          <Activity className="h-3.5 w-3.5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium">
              {PIPELINE_LABELS[ev.pipelineType] || ev.pipelineType}
            </span>
            <span className="text-xs text-muted-foreground ml-2">
              {eventIcons[ev.eventType] || ev.eventType}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {new Date(ev.createdAt).toLocaleDateString()}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Funnel Analytics Section ───
const FUNNEL_STAGES = [
  { key: "intake_start", label: "Intake Started", color: "#3b82f6" },
  { key: "intake_complete", label: "Intake Completed", color: "#06b6d4" },
  { key: "direct_create", label: "Case Created", color: "#10b981" },
  { key: "document_uploaded", label: "Document Uploaded", color: "#22c55e" },
  { key: "extraction_complete", label: "Text Extracted", color: "#84cc16" },
  { key: "analysis_started", label: "Analysis Started", color: "#eab308" },
  { key: "analysis_complete", label: "Analysis Complete", color: "#f59e0b" },
  { key: "findings_generated", label: "Findings Generated", color: "#f97316" },
  { key: "export_created", label: "Export Created", color: "#ef4444" },
  { key: "case_completed", label: "Case Completed", color: "#8b5cf6" },
];

function FunnelAnalyticsSection() {
  const [timeRange, setTimeRange] = useState<number | undefined>(undefined);
  const { data: funnelData, isLoading } = trpc.analytics.funnelStats.useQuery(
    timeRange ? { timeRangeDays: timeRange } : undefined
  );

  const globalFunnel = funnelData?.globalFunnel || {};
  const pipelineBreakdown = funnelData?.pipelineBreakdown || {};
  const maxFunnelVal = Math.max(...FUNNEL_STAGES.map(s => globalFunnel[s.key] || 0), 1);

  return (
    <Card className="mb-8">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Pipeline Completion Funnel
          </CardTitle>
          <div className="flex gap-1">
            {[
              { label: "7d", value: 7 },
              { label: "30d", value: 30 },
              { label: "All", value: undefined },
            ].map((opt) => (
              <Button
                key={opt.label}
                variant={timeRange === opt.value ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => setTimeRange(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-muted rounded" />)}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Global Funnel Visualization */}
            <div className="space-y-2">
              {FUNNEL_STAGES.map((stage, idx) => {
                const val = globalFunnel[stage.key] || 0;
                const pct = maxFunnelVal > 0 ? (val / maxFunnelVal) * 100 : 0;
                const prevVal = idx > 0 ? (globalFunnel[FUNNEL_STAGES[idx - 1].key] || 0) : 0;
                const dropoff = idx > 0 && prevVal > 0 ? Math.round(((prevVal - val) / prevVal) * 100) : null;
                return (
                  <div key={stage.key} className="flex items-center gap-3">
                    <div className="w-32 text-xs text-muted-foreground text-right shrink-0">{stage.label}</div>
                    <div className="flex-1 h-8 bg-muted/50 rounded-md overflow-hidden relative">
                      <div
                        className="h-full rounded-md transition-all duration-500"
                        style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: stage.color, opacity: 0.8 }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground">
                        {val}
                      </span>
                    </div>
                    <div className="w-16 text-xs text-right shrink-0">
                      {dropoff !== null ? (
                        <span className="text-red-400">-{dropoff}%</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Per-Pipeline Breakdown Table */}
            {Object.keys(pipelineBreakdown).length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2 text-muted-foreground font-medium">Pipeline</th>
                      <th className="text-center py-2 px-2 text-muted-foreground font-medium">Users</th>
                      {FUNNEL_STAGES.map(s => (
                        <th key={s.key} className="text-center py-2 px-2 text-muted-foreground font-medium">{s.label}</th>
                      ))}
                      <th className="text-center py-2 px-2 text-muted-foreground font-medium">Conversion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(pipelineBreakdown)
                      .sort(([, a], [, b]) => b.uniqueUsers - a.uniqueUsers)
                      .map(([key, data]) => {
                        const startCount = data.funnel.intake_start || 0;
                        const completeCount = data.funnel.case_completed || 0;
                        const convRate = startCount > 0 ? Math.round((completeCount / startCount) * 100) : 0;
                        return (
                          <tr key={key} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-1.5 px-2 flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: CATEGORY_COLORS[key] || "#94a3b8" }} />
                              <span className="font-medium">{PIPELINE_LABELS[key] || key}</span>
                            </td>
                            <td className="text-center py-1.5 px-2">
                              <Badge variant="outline" className="text-[10px] px-1">{data.uniqueUsers}</Badge>
                            </td>
                            {FUNNEL_STAGES.map(s => (
                              <td key={s.key} className="text-center py-1.5 px-2 text-muted-foreground">
                                {data.funnel[s.key] || 0}
                              </td>
                            ))}
                            <td className="text-center py-1.5 px-2">
                              {convRate > 0 ? (
                                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
                                  {convRate}%
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ───
export default function AdminAnalytics() {
  const { user } = useAuth();
  const { data: stats, isLoading, refetch } = trpc.analytics.pipelineStats.useQuery();
  const { nodes, edges, isLoading: worldLoading, jurisdictions } = useWorldIndex();

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="py-8 text-center">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-2">Admin Access Required</h2>
            <p className="text-sm text-muted-foreground">Pipeline analytics are only available to administrators.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container max-w-6xl py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-muted rounded w-64" />
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-muted rounded-lg" />)}
            </div>
            <div className="h-64 bg-muted rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  const byPipeline = stats?.byPipeline || {};
  const totalEvents = stats?.totalEvents || 0;
  const recentEvents = stats?.recentEvents || [];

  // Prepare chart data
  const barData = Object.entries(byPipeline).map(([key, val]) => ({
    label: PIPELINE_LABELS[key] || key,
    value: val.total,
    color: CATEGORY_COLORS[key] || "#94a3b8",
  }));

  const donutData = Object.entries(byPipeline).map(([key, val]) => ({
    label: PIPELINE_LABELS[key] || key,
    value: val.total,
    color: CATEGORY_COLORS[key] || "#94a3b8",
  }));

  const activePipelines = Object.keys(byPipeline).length;
  const completionRate = totalEvents > 0
    ? Math.round((Object.values(byPipeline).reduce((s, v) => s + v.intake_complete + v.case_completed, 0) / totalEvents) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-6xl py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-primary" />
                Pipeline Analytics
              </h1>
              <p className="text-sm text-muted-foreground">
                Usage patterns across all 42 Luminari pipelines
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <Activity className="h-5 w-5 mx-auto text-primary mb-1" />
              <div className="text-2xl font-bold">{totalEvents}</div>
              <div className="text-[10px] text-muted-foreground">Pipeline Events</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <PieChart className="h-5 w-5 mx-auto text-emerald-400 mb-1" />
              <div className="text-2xl font-bold">{activePipelines}</div>
              <div className="text-[10px] text-muted-foreground">Active Pipelines</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <TrendingUp className="h-5 w-5 mx-auto text-amber-400 mb-1" />
              <div className="text-2xl font-bold">{completionRate}%</div>
              <div className="text-[10px] text-muted-foreground">Completion Rate</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <Users className="h-5 w-5 mx-auto text-violet-400 mb-1" />
              <div className="text-2xl font-bold">42</div>
              <div className="text-[10px] text-muted-foreground">Available Pipelines</div>
            </CardContent>
          </Card>
        </div>

        {/* Canonical Core Health — always shows real data from world index */}
        {!worldLoading && nodes.length > 0 && (
          <Card className="mb-8 border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-primary flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Canonical Knowledge Core — Live Counts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                {[
                  { label: "Total Nodes", value: nodes.length, color: "text-foreground" },
                  { label: "Relationships", value: edges.length, color: "text-blue-400" },
                  { label: "Jurisdictions", value: jurisdictions.length, color: "text-amber-400" },
                  { label: "Programs", value: nodes.filter(n => n.type === "program").length, color: "text-emerald-400" },
                  { label: "Agencies", value: nodes.filter(n => n.type === "agency").length, color: "text-violet-400" },
                  { label: "Signals", value: nodes.filter(n => n.type === "signal").length, color: "text-rose-400" },
                ].map(s => (
                  <div key={s.label} className="bg-muted/30 rounded-lg p-3 text-center">
                    <div className={`text-xl font-bold ${s.color}`}>{s.value.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Event Type Breakdown */}
        <Card className="mb-8">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4" />
              Event Type Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EventTypeBreakdown stats={byPipeline} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Donut Chart */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <PieChart className="h-4 w-4" />
                Pipeline Usage Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DonutChartSVG data={donutData} />
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RecentActivityFeed events={recentEvents} />
            </CardContent>
          </Card>
        </div>

        {/* Bar Chart — Pipeline Usage */}
        <Card className="mb-8">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Pipeline Usage (Top 15)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {barData.length > 0 ? (
              <BarChartSVG data={barData} />
            ) : (
              <div className="text-center text-muted-foreground py-8 text-sm">
                No pipeline usage data yet. Events will appear as users interact with Luminari.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Funnel Analytics Section */}
        <FunnelAnalyticsSection />

        {/* Pipeline Detail Table */}
        {Object.keys(byPipeline).length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pipeline Detail Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Pipeline</th>
                      <th className="text-center py-2 px-3 text-xs text-muted-foreground font-medium">Total</th>
                      <th className="text-center py-2 px-3 text-xs text-muted-foreground font-medium">Intake Start</th>
                      <th className="text-center py-2 px-3 text-xs text-muted-foreground font-medium">Intake Complete</th>
                      <th className="text-center py-2 px-3 text-xs text-muted-foreground font-medium">Direct Create</th>
                      <th className="text-center py-2 px-3 text-xs text-muted-foreground font-medium">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(byPipeline)
                      .sort(([, a], [, b]) => b.total - a.total)
                      .map(([key, val]) => (
                        <tr key={key} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="py-2 px-3 flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: CATEGORY_COLORS[key] || "#94a3b8" }} />
                            <span className="font-medium">{PIPELINE_LABELS[key] || key}</span>
                          </td>
                          <td className="text-center py-2 px-3 font-bold">{val.total}</td>
                          <td className="text-center py-2 px-3 text-muted-foreground">{val.intake_start}</td>
                          <td className="text-center py-2 px-3 text-muted-foreground">{val.intake_complete}</td>
                          <td className="text-center py-2 px-3 text-muted-foreground">{val.direct_create}</td>
                          <td className="text-center py-2 px-3">
                            {val.case_completed > 0 ? (
                              <Badge variant="outline" className="text-emerald-400 border-emerald-400/30 text-[10px]">
                                {val.case_completed}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
