import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle, FileSearch, ChevronDown, ChevronRight,
  Scale, Loader2, CheckCircle2, Clock, XCircle, Eye,
  Building2, ExternalLink, Mail, MapPin, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { FoiaRequestSection } from "@/components/FoiaRequestPanel";

const SEVERITY_CONFIG = {
  critical: { label: "Critical", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", badge: "bg-red-500/15 text-red-400 border-red-500/30" },
  important: { label: "Important", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", badge: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  helpful: { label: "Helpful", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", badge: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
} as const;

const STATUS_CONFIG = {
  detected: { label: "Missing", icon: AlertTriangle, color: "text-red-400" },
  acknowledged: { label: "Acknowledged", icon: Eye, color: "text-amber-400" },
  requested: { label: "Requested", icon: Clock, color: "text-blue-400" },
  received: { label: "Received", icon: CheckCircle2, color: "text-emerald-400" },
  not_applicable: { label: "Not Applicable", icon: XCircle, color: "text-muted-foreground" },
} as const;

interface AgencyInfo {
  agencyName: string;
  agencyComponent: string | null;
  portalUrl: string | null;
  email: string | null;
  mailingAddress: string | null;
  submissionMethods: string;
  statuteName: string;
  statuteReference: string;
  responseDeadlineDays: number | null;
  feeWaiverAvailable: boolean;
  confidence: string;
}

function AgencyCard({ agency }: { agency: AgencyInfo }) {
  return (
    <div className="bg-background/50 rounded-md p-2.5 border border-border/40 space-y-1.5">
      <div className="flex items-start gap-2">
        <Building2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-foreground">
            {agency.agencyName}
            {agency.agencyComponent && (
              <span className="text-muted-foreground font-normal"> — {agency.agencyComponent}</span>
            )}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="outline" className="text-[8px] px-1 py-0 bg-primary/5 text-primary/80 border-primary/20">
              {agency.statuteReference}
            </Badge>
            {agency.responseDeadlineDays && (
              <span className="text-[9px] text-muted-foreground">
                {agency.responseDeadlineDays}-day response deadline
              </span>
            )}
            {agency.feeWaiverAvailable && (
              <Badge variant="outline" className="text-[8px] px-1 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                Fee waiver available
              </Badge>
            )}
            <Badge variant="outline" className={`text-[8px] px-1 py-0 ${
              agency.confidence === "high" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
              "bg-amber-500/10 text-amber-400 border-amber-500/20"
            }`}>
              {agency.confidence} confidence
            </Badge>
          </div>
        </div>
      </div>
      <div className="pl-5.5 flex items-center gap-3 flex-wrap">
        {agency.portalUrl && (
          <a
            href={agency.portalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[9px] text-primary hover:underline flex items-center gap-0.5"
          >
            <ExternalLink className="h-2.5 w-2.5" /> Portal
          </a>
        )}
        {agency.email && (
          <a
            href={`mailto:${agency.email}`}
            className="text-[9px] text-primary hover:underline flex items-center gap-0.5"
          >
            <Mail className="h-2.5 w-2.5" /> {agency.email}
          </a>
        )}
        {agency.mailingAddress && (
          <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
            <MapPin className="h-2.5 w-2.5" /> {agency.mailingAddress}
          </span>
        )}
      </div>
    </div>
  );
}

function MissingRecordCard({
  record,
  agencies,
  onStatusChange,
}: {
  record: {
    id: number;
    recordType: string;
    label: string;
    description: string;
    legalBasis: string | null;
    severity: string;
    agencyType: string | null;
    foiaEligible: boolean;
    status: string;
  };
  agencies?: AgencyInfo[];
  onStatusChange: (id: number, status: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const severity = SEVERITY_CONFIG[record.severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.helpful;
  const status = STATUS_CONFIG[record.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.detected;
  const StatusIcon = status.icon;
  const hasAgencies = agencies && agencies.length > 0;

  return (
    <Card className={`${severity.bg} transition-colors`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <StatusIcon className={`h-4 w-4 ${status.color} shrink-0 mt-0.5`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-foreground">{record.label}</span>
              <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${severity.badge}`}>
                {severity.label}
              </Badge>
              {record.foiaEligible && (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-primary/10 text-primary border-primary/30">
                  FOIA Eligible
                </Badge>
              )}
              {hasAgencies && (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-violet-500/10 text-violet-400 border-violet-500/30">
                  <Building2 className="h-2.5 w-2.5 mr-0.5" />
                  {agencies.length} {agencies.length === 1 ? "agency" : "agencies"}
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
              {record.description}
            </p>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>

        {expanded && (
          <div className="pl-6 space-y-2 border-t border-border/50 pt-2">
            {record.legalBasis && (
              <div>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">Legal Basis</p>
                <p className="text-[11px] text-foreground/80">{record.legalBasis}</p>
              </div>
            )}

            {/* AKB Agency Information */}
            {hasAgencies && (
              <div>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                  <FileText className="h-2.5 w-2.5" />
                  Where to Request This Record
                </p>
                <div className="space-y-1.5">
                  {agencies.map((agency, i) => (
                    <AgencyCard key={i} agency={agency} />
                  ))}
                </div>
              </div>
            )}

            {/* Fallback to generic agency type if no AKB data */}
            {!hasAgencies && record.agencyType && (
              <div>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">Typically Held By</p>
                <p className="text-[11px] text-foreground/80">{record.agencyType}</p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Status:</p>
              <Select
                value={record.status}
                onValueChange={(val) => onStatusChange(record.id, val)}
              >
                <SelectTrigger className="h-6 text-[10px] w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="detected">Missing</SelectItem>
                  <SelectItem value="acknowledged">Acknowledged</SelectItem>
                  <SelectItem value="requested">Requested</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="not_applicable">Not Applicable</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MissingRecordsSection({ caseId }: { caseId: number }) {
  const utils = trpc.useUtils();
  const { data: records, isLoading } = trpc.missingRecords.list.useQuery({ caseId });
  const { data: summary } = trpc.missingRecords.summary.useQuery({ caseId });
  const { data: akbData } = trpc.missingRecords.agenciesForCase.useQuery({ caseId });
  const updateStatus = trpc.missingRecords.updateStatus.useMutation({
    onSuccess: () => {
      utils.missingRecords.list.invalidate({ caseId });
      utils.missingRecords.summary.invalidate({ caseId });
    },
  });
  const runDetection = trpc.missingRecords.runDetection.useMutation({
    onSuccess: (result) => {
      utils.missingRecords.list.invalidate({ caseId });
      utils.missingRecords.summary.invalidate({ caseId });
      utils.missingRecords.agenciesForCase.invalidate({ caseId });
      if (result) {
        toast.success(`Gap detection complete: ${result.rulesMissing} missing records identified out of ${result.totalRules} checked.`);
      } else {
        toast.info("No domain rules available for this case type. Gap detection is available for police misconduct, ICWA, insurance denial, and elder abuse cases.");
      }
    },
    onError: (err) => {
      toast.error(`Gap detection failed: ${err.message}`);
    },
  });

  // Build a lookup map: recordType → agencies
  const agencyMap = new Map<string, AgencyInfo[]>();
  if (akbData?.hasCoverage && akbData.records) {
    for (const rec of akbData.records) {
      if (rec.agencies.length > 0) {
        agencyMap.set(rec.recordType, rec.agencies);
      }
    }
  }

  const handleStatusChange = (id: number, status: string) => {
    updateStatus.mutate({ id, status: status as any });
  };

  if (isLoading) {
    return (
      <Card className="border-dashed border-border">
        <CardContent className="p-5 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Checking for missing records...</span>
        </CardContent>
      </Card>
    );
  }

  // No records and no summary — either detection hasn't run or no rules for this domain
  if (!records || records.length === 0) {
    return (
      <Card className="border-dashed border-border">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
              <FileSearch className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">Record Gap Analysis</p>
              <p className="text-[10px] text-muted-foreground">
                The engine can check your evidence against legal requirements to identify missing records.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs"
            onClick={() => runDetection.mutate({ caseId })}
            disabled={runDetection.isPending}
          >
            {runDetection.isPending ? (
              <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Running analysis...</>
            ) : (
              <><Scale className="h-3 w-3 mr-1" /> Check for Missing Records</>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Filter to show active gaps first
  const activeGaps = records.filter((r: any) => r.status === "detected" || r.status === "acknowledged");
  const resolvedOrNA = records.filter((r: any) => r.status === "received" || r.status === "not_applicable" || r.status === "requested");

  return (
    <div className="space-y-3">
      {/* Header with summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Missing Records</h3>
          {summary && summary.activeGaps > 0 && (
            <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-400 border-red-500/30">
              {summary.activeGaps} gap{summary.activeGaps !== 1 ? "s" : ""}
            </Badge>
          )}
          {akbData?.hasCoverage && (
            <Badge variant="outline" className="text-[9px] bg-violet-500/10 text-violet-400 border-violet-500/30">
              <Building2 className="h-2.5 w-2.5 mr-0.5" />
              Agency data available
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-[10px] text-muted-foreground h-7"
          onClick={() => runDetection.mutate({ caseId })}
          disabled={runDetection.isPending}
        >
          {runDetection.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            "Re-scan"
          )}
        </Button>
      </div>

      {/* Summary bar */}
      {summary && (
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-red-400">{summary.bySeverity.critical} critical</span>
          <span className="text-amber-400">{summary.bySeverity.important} important</span>
          <span className="text-blue-400">{summary.bySeverity.helpful} helpful</span>
          <span className="text-muted-foreground ml-auto">{summary.total} total checked</span>
        </div>
      )}

      {/* Active gaps */}
      {activeGaps.length > 0 && (
        <div className="space-y-2">
          {activeGaps.map((record: any) => (
            <MissingRecordCard
              key={record.id}
              record={record}
              agencies={agencyMap.get(record.recordType)}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}

      {/* Resolved / NA — collapsed by default */}
      {resolvedOrNA.length > 0 && (
        <details className="group">
          <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors list-none flex items-center gap-1">
            <ChevronRight className="h-3 w-3 group-open:rotate-90 transition-transform" />
            {resolvedOrNA.length} resolved or not applicable
          </summary>
          <div className="space-y-2 mt-2">
            {resolvedOrNA.map((record: any) => (
              <MissingRecordCard
                key={record.id}
                record={record}
                agencies={agencyMap.get(record.recordType)}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        </details>
      )}

      {/* FOIA Request Generator */}
      <FoiaRequestSection caseId={caseId} />

      {/* Disclaimer */}
      <p className="text-[9px] text-muted-foreground/60 leading-relaxed">
        This analysis compares your uploaded evidence against known legal requirements for this case type.
        {akbData?.hasCoverage
          ? " Agency contact information is sourced from the Agency Knowledge Base. Verify agency details before submitting any records requests."
          : " Missing records may indicate documents you haven't uploaded yet, or records the relevant agency was required to produce."
        }
      </p>
    </div>
  );
}

/** Compact summary badge for use in other parts of the UI */
export function MissingRecordsBadge({ caseId }: { caseId: number }) {
  const { data: summary } = trpc.missingRecords.summary.useQuery({ caseId });

  if (!summary || summary.activeGaps === 0) return null;

  return (
    <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-400 border-red-500/30 gap-1">
      <AlertTriangle className="h-2.5 w-2.5" />
      {summary.activeGaps} missing record{summary.activeGaps !== 1 ? "s" : ""}
    </Badge>
  );
}
