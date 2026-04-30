import { useState } from "react";
import { useRoute, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useCase } from "@/contexts/CaseContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Shield, ShieldCheck, ShieldX, ShieldAlert,
  Clock, FileText, AlertTriangle, ChevronDown, ChevronRight,
  ArrowLeft, Layers, Calendar, Search, Hash,
} from "lucide-react";

// ─── Signature Status Badge ───
function SignatureBadge({ status }: { status: "valid" | "invalid" | "unsigned" }) {
  if (status === "valid") {
    return (
      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1">
        <ShieldCheck className="h-3.5 w-3.5" /> Valid
      </Badge>
    );
  }
  if (status === "invalid") {
    return (
      <Badge className="bg-red-500/20 text-red-400 border-red-500/30 gap-1">
        <ShieldX className="h-3.5 w-3.5" /> Invalid
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1">
      <ShieldAlert className="h-3.5 w-3.5" /> Unsigned
    </Badge>
  );
}

// ─── Collapsible Section ───
function CollapsibleSection({
  title,
  icon,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="border-zinc-800 bg-zinc-900/50">
      <CardHeader
        className="cursor-pointer select-none py-3 px-4"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {open ? <ChevronDown className="h-4 w-4 text-zinc-400" /> : <ChevronRight className="h-4 w-4 text-zinc-400" />}
            {icon}
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            {count !== undefined && (
              <Badge variant="outline" className="text-xs ml-1">{count}</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      {open && <CardContent className="pt-0 px-4 pb-4">{children}</CardContent>}
    </Card>
  );
}

// ─── Chronological Day Group ───
function DayGroup({ date, items }: { date: string; items: ChronoItem[] }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2 sticky top-0 bg-zinc-900/80 backdrop-blur-sm py-1 z-10">
        <Calendar className="h-3.5 w-3.5 text-blue-400" />
        <span className="text-xs font-mono text-blue-400">{date}</span>
        <div className="flex-1 border-t border-zinc-800" />
        <span className="text-xs text-zinc-500">{items.length} item{items.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="space-y-2 pl-4 border-l border-zinc-800">
        {items.map((item) => (
          <ChronoCard key={`${item.type}-${item.id}`} item={item} />
        ))}
      </div>
    </div>
  );
}

type ChronoItem = {
  type: "finding" | "structured_note" | "gap_note";
  id: number;
  title: string;
  description: string;
  primaryAnchor: string;
  additionalAnchors: string[];
  confidence: string;
  sourceReferences: Array<{ documentId?: number | null; page?: number | null; quote?: string | null }>;
  payload?: Record<string, unknown>;
};

function ChronoCard({ item }: { item: ChronoItem }) {
  const [expanded, setExpanded] = useState(false);
  const typeColors: Record<string, string> = {
    finding: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    structured_note: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    gap_note: "text-red-400 bg-red-500/10 border-red-500/20",
  };
  const typeLabels: Record<string, string> = {
    finding: "Finding",
    structured_note: "Structured Note",
    gap_note: "Temporal Gap",
  };

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={`text-[10px] ${typeColors[item.type] || "text-zinc-400"}`}>
            {typeLabels[item.type] || item.type}
          </Badge>
          <span className="text-sm font-medium text-zinc-200">{item.title}</span>
        </div>
        <Badge variant="outline" className="text-[10px] shrink-0">
          {item.confidence}
        </Badge>
      </div>
      <p className="text-xs text-zinc-400 mb-2 line-clamp-2">{item.description}</p>

      {item.additionalAnchors.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap mb-2">
          <span className="text-[10px] text-zinc-500">Additional anchors:</span>
          {item.additionalAnchors.map((a, i) => (
            <Badge key={i} variant="outline" className="text-[10px] font-mono">{a}</Badge>
          ))}
        </div>
      )}

      {item.sourceReferences.length > 0 && (
        <div>
          <button
            className="text-[10px] text-blue-400 hover:text-blue-300 underline"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Hide" : "Show"} {item.sourceReferences.length} source{item.sourceReferences.length !== 1 ? "s" : ""}
          </button>
          {expanded && (
            <div className="mt-1 space-y-1">
              {item.sourceReferences.map((ref, i) => (
                <div key={i} className="text-[10px] text-zinc-500 pl-2 border-l border-zinc-700">
                  {ref.documentId && (
                    <Link href={`/documents/${ref.documentId}`} className="text-blue-400 hover:underline">
                      Doc #{ref.documentId}
                    </Link>
                  )}
                  {ref.page && <span className="ml-1">p.{ref.page}</span>}
                  {ref.quote && (
                    <span className="block text-zinc-400 italic mt-0.5">"{ref.quote.slice(0, 120)}{ref.quote.length > 120 ? "..." : ""}"</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Structural Type Group ───
type StructuralItem = {
  type: string;
  id: number;
  title: string;
  description: string;
  confidence: string;
  sourceReferences: Array<{ documentId?: number | null; page?: number | null; quote?: string | null }>;
  payload?: Record<string, unknown>;
};

function StructuralGroup({ type, items }: { type: string; items: StructuralItem[] }) {
  const typeLabels: Record<string, string> = {
    evidence_requirement: "Evidence Requirement",
    policy_mismatch: "Policy Mismatch",
    internal_contradiction: "Internal Contradiction",
    extraction_unsupported: "Extraction Unsupported",
    pattern: "Pattern",
    contradiction: "Contradiction",
    corroboration: "Corroboration",
    timeline_gap: "Timeline Gap",
    undocumented_claim: "Undocumented Claim",
    structured_note: "Structured Note",
  };

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-2">
        <Layers className="h-3.5 w-3.5 text-zinc-400" />
        <span className="text-xs font-medium text-zinc-300">{typeLabels[type] || type}</span>
        <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
      </div>
      <div className="space-y-2 pl-4">
        {items.map((item) => (
          <div key={item.id} className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-zinc-200">{item.title}</span>
              <Badge variant="outline" className="text-[10px]">{item.confidence}</Badge>
            </div>
            <p className="text-xs text-zinc-400">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Spine Viewer ───
export default function SpineViewer() {
  const [, params] = useRoute("/spine/:caseId/:snapshotId");
  const { currentCaseId } = useCase();

  const caseId = params?.caseId ? Number(params.caseId) : currentCaseId;
  const snapshotId = params?.snapshotId ? Number(params.snapshotId) : null;

  const { data, isLoading, error } = trpc.snapshots.spineView.useQuery(
    { caseId: caseId!, snapshotId: snapshotId! },
    { enabled: !!caseId && !!snapshotId },
  );

  if (!caseId || !snapshotId) {
    return (
      <div className="p-6">
        <p className="text-zinc-400">No case or snapshot selected. Navigate to a sealed snapshot to view the spine.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-zinc-800 animate-pulse rounded" />
        <div className="h-32 bg-zinc-800 animate-pulse rounded" />
        <div className="h-64 bg-zinc-800 animate-pulse rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">Spine Viewer Error</span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">{error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const { header, chronological, structural, temporalGaps, ingestionIntegrity } = data;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Back navigation */}
      <div className="flex items-center gap-2">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-1 text-zinc-400 hover:text-zinc-200">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Overview
          </Button>
        </Link>
      </div>

      {/* Section 1: Snapshot Header */}
      <Card className="border-zinc-700 bg-gradient-to-br from-zinc-900 to-zinc-950">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-blue-400" />
              <CardTitle className="text-lg">Snapshot Spine View</CardTitle>
            </div>
            <SignatureBadge status={header.signatureStatus} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-zinc-500 text-xs block mb-0.5">Case</span>
              <span className="text-zinc-200 font-medium">{header.caseName}</span>
            </div>
            <div>
              <span className="text-zinc-500 text-xs block mb-0.5">Snapshot ID</span>
              <span className="text-zinc-200 font-mono">{header.snapshotId}</span>
            </div>
            <div>
              <span className="text-zinc-500 text-xs block mb-0.5">Version</span>
              <span className="text-zinc-200 font-mono">v{header.snapshotVersion}</span>
            </div>
            <div>
              <span className="text-zinc-500 text-xs block mb-0.5">Sealed At</span>
              <span className="text-zinc-200">{header.sealedAt ? new Date(header.sealedAt).toLocaleString() : "N/A"}</span>
            </div>
            <div>
              <span className="text-zinc-500 text-xs block mb-0.5">Engine Version</span>
              <span className="text-zinc-200 text-xs font-mono">{header.engineVersion}</span>
            </div>
            <div>
              <span className="text-zinc-500 text-xs block mb-0.5">Lane</span>
              <span className="text-zinc-200 font-mono text-xs">{header.lane}</span>
            </div>
          </div>
          {header.signatureDetails && (
            <div className="mt-3 pt-3 border-t border-zinc-800">
              <span className="text-zinc-500 text-xs block mb-0.5">Signature Details</span>
              <span className="text-zinc-400 text-xs">{header.signatureDetails}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Chronological Narrative */}
      <CollapsibleSection
        title="Chronological Narrative"
        icon={<Clock className="h-4 w-4 text-blue-400" />}
        count={chronological.totalItems}
        defaultOpen={true}
      >
        {chronological.totalItems === 0 ? (
          <p className="text-xs text-zinc-500 italic">No temporal artifacts found in this snapshot.</p>
        ) : (
          <div className="mt-2">
            {chronological.dayGroups.map((group) => (
              <DayGroup key={group.date} date={group.date} items={group.items} />
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* Section 3: Structural Findings */}
      <CollapsibleSection
        title="Structural Findings"
        icon={<FileText className="h-4 w-4 text-amber-400" />}
        count={structural.totalItems}
        defaultOpen={true}
      >
        {structural.totalItems === 0 ? (
          <p className="text-xs text-zinc-500 italic">No structural (non-temporal) artifacts found in this snapshot.</p>
        ) : (
          <div className="mt-2">
            {structural.typeGroups.map((group) => (
              <StructuralGroup key={group.type} type={group.type} items={group.items} />
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* Section 4: Temporal Gaps */}
      <CollapsibleSection
        title="Temporal Gaps"
        icon={<Search className="h-4 w-4 text-red-400" />}
        count={temporalGaps.gapsDetected}
        defaultOpen={true}
      >
        <div className="text-xs text-zinc-500 mb-2">
          {temporalGaps.anchorsAnalyzed} anchors analyzed | Threshold: {temporalGaps.thresholdDays} days
        </div>
        {temporalGaps.gaps.length === 0 ? (
          <p className="text-xs text-zinc-500 italic">No temporal gaps detected above threshold.</p>
        ) : (
          <div className="space-y-2">
            {temporalGaps.gaps.map((gap, i) => (
              <div key={i} className="flex items-center gap-3 rounded-md border border-red-500/20 bg-red-500/5 p-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono text-red-400">{gap.gapStart}</span>
                  <span className="text-zinc-600">→</span>
                  <span className="text-xs font-mono text-red-400">{gap.gapEnd}</span>
                </div>
                <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px]">
                  {gap.gapDays} days
                </Badge>
                <Badge variant="outline" className="text-[10px]">{gap.confidence}</Badge>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* Section 5: Ingestion Integrity */}
      <CollapsibleSection
        title="Ingestion Integrity"
        icon={<Hash className="h-4 w-4 text-emerald-400" />}
        defaultOpen={false}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-1">
          <MetricCard label="Intended Uploads" value={ingestionIntegrity.totalIntendedUploads} />
          <MetricCard label="Ingested" value={ingestionIntegrity.totalDocumentsCreated} color="emerald" />
          <MetricCard label="Duplicates" value={ingestionIntegrity.totalDuplicatesLinked} color="blue" />
          <MetricCard label="Failed" value={ingestionIntegrity.totalFailedFiles} color={ingestionIntegrity.totalFailedFiles > 0 ? "red" : undefined} />
          <MetricCard label="Expired" value={ingestionIntegrity.totalExpiredUnprocessed} color={ingestionIntegrity.totalExpiredUnprocessed > 0 ? "amber" : undefined} />
          <MetricCard label="Extraction Failures" value={ingestionIntegrity.totalExtractionFailures} color={ingestionIntegrity.totalExtractionFailures > 0 ? "red" : undefined} />
          <MetricCard label="Missing" value={ingestionIntegrity.totalMissingDocuments} color={ingestionIntegrity.totalMissingDocuments > 0 ? "red" : undefined} />
        </div>
        <div className="mt-3 pt-2 border-t border-zinc-800">
          <Link href="/" className="text-xs text-blue-400 hover:text-blue-300 underline">
            View full ingestion detail panel →
          </Link>
        </div>
      </CollapsibleSection>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: number; color?: string }) {
  const colorClasses: Record<string, string> = {
    emerald: "text-emerald-400",
    blue: "text-blue-400",
    red: "text-red-400",
    amber: "text-amber-400",
  };
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-2.5 text-center">
      <div className={`text-lg font-semibold font-mono ${color ? colorClasses[color] || "text-zinc-200" : "text-zinc-200"}`}>
        {value}
      </div>
      <div className="text-[10px] text-zinc-500">{label}</div>
    </div>
  );
}
