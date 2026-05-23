/**
 * CDA Run List — /cda
 *
 * Displays all CDA runs for the authenticated user.
 * Shows: run_id, created_at, status, failure_flags count, spec_version, download icon.
 */

import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useAuth } from "@/core/hooks/useAuth";
import {
  FileSearch,
  Download,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  complete: { icon: CheckCircle2, color: "text-emerald-400", label: "Complete" },
  incomplete: { icon: AlertTriangle, color: "text-amber-400", label: "Incomplete" },
  error: { icon: XCircle, color: "text-red-400", label: "Error" },
  created: { icon: Clock, color: "text-muted-foreground", label: "Created" },
  validating: { icon: Loader2, color: "text-blue-400", label: "Validating" },
};

function getStatusConfig(status: string) {
  if (status.startsWith("error_at_")) {
    return { icon: XCircle, color: "text-red-400", label: `Error at ${status.replace("error_at_", "")}` };
  }
  // Running stages
  const runningStages = ["classifying", "extracting", "normalizing", "parsing_denial", "parsing_policy", "linking", "comparing", "detecting_contradictions", "generating_artifacts"];
  if (runningStages.includes(status)) {
    return { icon: Loader2, color: "text-blue-400", label: status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) };
  }
  return STATUS_CONFIG[status] ?? { icon: Clock, color: "text-muted-foreground", label: status };
}

export default function CdaRunList() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: runs, isLoading } = trpc.cda.listRuns.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 10_000,
  });

  const handleDownload = (runId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `/api/cda/export/${runId}`;
    window.open(url, "_blank");
    toast.info(`Downloading CDA run #${runId} bundle.`);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 mb-6">
          <FileSearch className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Claim Denial Analysis</h1>
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!runs || runs.length === 0) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <FileSearch className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Claim Denial Analysis</h1>
        </div>
        <div className="border border-dashed border-border rounded-lg p-12 text-center">
          <FileSearch className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">
            No CDA runs yet. Runs are created when you trigger a Claim Denial Analysis from the case documents.
          </p>
          <Button variant="outline" size="sm" className="gap-1.5 mt-4" onClick={() => setLocation("/documents")}>
            <FileSearch className="h-3.5 w-3.5" /> View Documents
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <FileSearch className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Claim Denial Analysis</h1>
        <Badge variant="outline" className="ml-auto text-xs font-mono">
          {runs.length} run{runs.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-20">Run</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Flags</TableHead>
              <TableHead>Spec</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => {
              const sc = getStatusConfig(run.status);
              const StatusIcon = sc.icon;
              const flags = (run.activeFailureFlags as string[] | null) ?? [];
              const isRunning = !["complete", "incomplete", "error"].includes(run.status) && !run.status.startsWith("error_at_");
              const isComplete = run.status === "complete" || run.status === "incomplete";

              return (
                <TableRow
                  key={run.id}
                  className="cursor-pointer"
                  onClick={() => setLocation(`/cda/${run.id}`)}
                >
                  <TableCell className="font-mono text-xs">#{run.id}</TableCell>
                  <TableCell className="text-sm">
                    {new Date(run.startedAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <StatusIcon className={`h-4 w-4 ${sc.color} ${isRunning ? "animate-spin" : ""}`} />
                      <span className="text-sm">{sc.label}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {flags.length > 0 ? (
                      <Badge variant="destructive" className="text-xs">
                        {flags.length}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-mono text-muted-foreground">
                      {run.specVersion}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {isComplete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => handleDownload(run.id, e)}
                          title="Download bundle"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLocation(`/cda/${run.id}`);
                        }}
                        title="View details"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
