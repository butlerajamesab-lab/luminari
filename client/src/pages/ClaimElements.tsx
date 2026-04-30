import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListChecks, ChevronDown, ChevronUp, Target, FileText } from "lucide-react";
import { CommitToCase, FlagArea } from "@/components/CommitToCase";
import { NextStepBar } from "@/components/NextStepBar";
import { CrossClaimPanel } from "@/components/CrossClaimPanel";

function strengthColor(s: string) {
  switch (s?.toLowerCase()) {
    case "strong": return "text-emerald-400 border-emerald-400/30";
    case "moderate": return "text-amber-400 border-amber-400/30";
    case "weak": return "text-red-400 border-red-400/30";
    default: return "text-white/60 border-white/20";
  }
}

function ClaimGroup({ claimType, elements }: { claimType: string; elements: any[] }) {
  const [expanded, setExpanded] = useState(false);
  const domain = elements[0]?.domain ?? "";

  return (
    <Card className="border-white/10">
      <CardHeader className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
              <ListChecks className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <CardTitle className="text-base text-white">{claimType}</CardTitle>
              <Badge variant="outline" className="text-xs mt-0.5">{domain}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
            <CommitToCase type="claimType" claimType={claimType} label="Set as Claim Type" size="sm" />
            <Badge variant="outline" className="text-xs">{elements.length} elements</Badge>
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <div className="space-y-3">
            {elements.map((el, i) => (
              <div key={el.id} className="p-3 rounded-lg bg-white/3 border border-white/5">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/10 text-cyan-400 text-xs flex items-center justify-center font-medium">
                      {el.elementOrder}
                    </span>
                    <h4 className="text-sm font-medium text-white">{el.elementName}</h4>
                  </div>
                  {el.strengthIndicators && (el.strengthIndicators as string[]).length > 0 && (
                    <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-400/30">
                      {(el.strengthIndicators as string[])[0]}
                    </Badge>
                  )}
                </div>

                <p className="text-sm text-white/70 mb-2 ml-8">{el.elementDescription}</p>

                <div className="ml-8 space-y-2">
                  {/* Evidence Types */}
                  {el.evidenceTypes && (el.evidenceTypes as string[]).length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                        <Target className="h-3 w-3" /> Evidence Types
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {(el.evidenceTypes as string[]).map((ev: string, j: number) => (
                          <Badge key={j} variant="outline" className="text-xs text-white/60">{ev}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Common Weaknesses */}
                  {el.commonWeaknesses && (el.commonWeaknesses as string[]).length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                        <FileText className="h-3 w-3" /> Common Weaknesses
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {(el.commonWeaknesses as string[]).map((w: string, j: number) => (
                          <Badge key={j} variant="outline" className="text-xs text-amber-400 border-amber-400/30">{w}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function ClaimElements() {
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const { data, isLoading } = trpc.architectureMap.listClaimElements.useQuery(
    domainFilter !== "all" ? { domain: domainFilter } : undefined
  );

  const domains = useMemo(() => {
    if (!data) return [];
    const set = new Set(data.map((el: any) => el.domain));
    return Array.from(set).sort();
  }, [data]);

  // Group by claimType
  const grouped = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, any[]>();
    data.forEach((el: any) => {
      const key = el.claimType;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(el);
    });
    return Array.from(map.entries()).map(([claimType, elements]) => ({ claimType, elements }));
  }, [data]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-64 bg-white/5 rounded animate-pulse" />
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-white/5 rounded-lg animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <ListChecks className="h-6 w-6 text-cyan-400" />
          <h1 className="text-2xl font-bold text-white">Claim Element Matrix</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          What must be proven for each claim type. Element-by-element breakdown with evidence types, key documents, and strength indicators.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Select value={domainFilter} onValueChange={setDomainFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Domains" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Domains</SelectItem>
            {domains.map(d => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Badge variant="outline" className="text-xs">
          {grouped.length} claim types, {data?.length ?? 0} elements
        </Badge>
      </div>

      {grouped.length >= 2 && (
        <CrossClaimPanel activeClaimTypes={grouped.map(g => g.claimType)} />
      )}

      <div className="space-y-3">
        {grouped.length > 0 ? (
          grouped.map(g => <ClaimGroup key={g.claimType} claimType={g.claimType} elements={g.elements} />)
        ) : (
          <Card className="border-white/10">
            <CardContent className="p-8 text-center">
              <ListChecks className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">No claim elements found.</p>
            </CardContent>
          </Card>
        )}
      </div>
      <NextStepBar
        context="Claim elements reviewed. Now check which procedural paths are available for your claim type."
        steps={[
          { label: "Procedural Paths", href: "/enforcement-pathway", icon: "scale", variant: "primary", description: "Choose your enforcement route" },
          { label: "Litigation Barriers", href: "/litigation-barriers", icon: "shield", description: "Identify structural obstacles" },
          { label: "Remedy Strategy", href: "/remedy-feasibility", icon: "gavel", description: "Assess achievable outcomes" },
        ]}
      />
    </div>
  );
}
