import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { TrendingUp, BarChart3 } from "lucide-react";

/**
 * Color palette for pattern types — consistent with Patterns.tsx PATTERN_TYPE_META.
 * Uses oklch for Tailwind 4 compatibility but also provides hex fallbacks for recharts.
 */
const PATTERN_COLORS: Record<string, string> = {
  entity_recurrence: "#3b82f6",     // blue-500
  agency_behavior: "#f59e0b",       // amber-500
  denial_language_pattern: "#ef4444", // red-500
  foia_denial_pattern: "#f97316",   // orange-500
  record_gap_pattern: "#eab308",    // yellow-500
  regulatory_violation_pattern: "#a855f7", // purple-500
};

const PATTERN_LABELS: Record<string, string> = {
  entity_recurrence: "Entity Recurrence",
  agency_behavior: "Agency Behavior",
  denial_language_pattern: "Denial Language",
  foia_denial_pattern: "FOIA Denial",
  record_gap_pattern: "Record Gap",
  regulatory_violation_pattern: "Regulatory Violation",
};

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * PatternTrendChart — Stacked area chart showing cumulative pattern growth over time.
 *
 * Transforms the TrendDataPoint[] from the backend into a recharts-compatible
 * format: one row per date, with a column per pattern type containing the
 * cumulative count.
 */
export default function PatternTrendChart() {
  const { data: trendData, isLoading } = trpc.patterns.trendData.useQuery();

  // Transform API data into recharts row format: { date, entity_recurrence: N, ... }
  const { chartData, activeTypes, chartConfig } = useMemo(() => {
    if (!trendData || trendData.points.length === 0) {
      return { chartData: [], activeTypes: [] as string[], chartConfig: {} as ChartConfig };
    }

    // Collect all unique types present in the data
    const typeSet = new Set<string>();
    for (const pt of trendData.points) {
      typeSet.add(pt.patternType);
    }
    const activeTypes = Array.from(typeSet).sort();

    // Build date → { type: cumulative } map
    const dateMap = new Map<string, Record<string, number>>();
    for (const pt of trendData.points) {
      if (!dateMap.has(pt.date)) {
        dateMap.set(pt.date, {});
      }
      dateMap.get(pt.date)![pt.patternType] = pt.cumulative;
    }

    // Sort dates and forward-fill cumulative values
    const sortedDates = Array.from(dateMap.keys()).sort();
    const prevCumulatives: Record<string, number> = {};
    for (const t of activeTypes) prevCumulatives[t] = 0;

    const chartData = sortedDates.map((date) => {
      const row: Record<string, any> = { date, dateLabel: formatDateLabel(date) };
      const dayData = dateMap.get(date)!;
      for (const t of activeTypes) {
        if (dayData[t] !== undefined) {
          prevCumulatives[t] = dayData[t];
        }
        row[t] = prevCumulatives[t];
      }
      return row;
    });

    // Build chart config for shadcn chart component
    const chartConfig: ChartConfig = {};
    for (const t of activeTypes) {
      chartConfig[t] = {
        label: PATTERN_LABELS[t] || t,
        color: PATTERN_COLORS[t] || "#6b7280",
      };
    }

    return { chartData, activeTypes, chartConfig };
  }, [trendData]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Pattern Detection Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!trendData || trendData.points.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Pattern Detection Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <BarChart3 className="h-8 w-8 opacity-30" />
            <p className="text-xs">Timeline will appear as patterns are detected across cases.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Pattern Detection Timeline
          </CardTitle>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {trendData.dateRange.earliest && trendData.dateRange.latest && (
              <span>
                {formatDateLabel(trendData.dateRange.earliest)} — {formatDateLabel(trendData.dateRange.latest)}
              </span>
            )}
            <span className="font-medium text-foreground">
              {trendData.totalOccurrences} total
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[280px] w-full">
          <AreaChart
            data={chartData}
            margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
          >
            <defs>
              {activeTypes.map((type) => (
                <linearGradient key={type} id={`fill-${type}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PATTERN_COLORS[type] || "#6b7280"} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={PATTERN_COLORS[type] || "#6b7280"} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="dateLabel"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              fontSize={11}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              fontSize={11}
              allowDecimals={false}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    if (payload?.[0]?.payload?.date) {
                      const d = new Date(payload[0].payload.date + "T00:00:00");
                      return d.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      });
                    }
                    return String(_);
                  }}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            {activeTypes.map((type) => (
              <Area
                key={type}
                dataKey={type}
                type="monotone"
                fill={`url(#fill-${type})`}
                stroke={PATTERN_COLORS[type] || "#6b7280"}
                strokeWidth={2}
                stackId="patterns"
                dot={false}
                activeDot={{ r: 3, strokeWidth: 1 }}
              />
            ))}
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
