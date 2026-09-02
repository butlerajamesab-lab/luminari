import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Wrench, AlertTriangle, ArrowRight, Trash2, Search, Shield, CheckCircle2, Send } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { PublicWalkthroughShell } from "@/components/PublicWalkthroughShell";

export default function CaseRepair() {
  const { user } = useAuth();
  const canAdminister = user?.role === "admin";
  const [, setLocation] = useLocation();


  // Orphan scan
  const orphanQuery = trpc.caseRepair.findOrphans.useQuery(undefined, {
    enabled: canAdminister,
  });

  // Move state
  const [moveSource, setMoveSource] = useState<number | null>(null);
  const [moveTarget, setMoveTarget] = useState<string>("");
  const [movePreview, setMovePreview] = useState<any>(null);
  const [showMoveConfirm, setShowMoveConfirm] = useState(false);

  // Purge state
  const [purgeTarget, setPurgeTarget] = useState<number | null>(null);
  const [purgePreview, setPurgePreview] = useState<any>(null);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);

  // Cases for target selection
  const casesQuery = trpc.cases.list.useQuery(undefined, {
    enabled: canAdminister,
    retry: false,
  });

  // Mutations
  const moveMutation = trpc.caseRepair.moveEntities.useMutation({
    onSuccess: (data) => {
      if (data.dryRun) {
        setMovePreview(data);
      } else {
        toast.success(`Moved ${data.moved} entities from "${data.sourceCaseName}" to "${data.targetCaseName}"`);
        setMovePreview(null);
        setMoveSource(null);
        setMoveTarget("");
        setShowMoveConfirm(false);
        orphanQuery.refetch();
      }
    },
    onError: (err) => {
      toast.error(`Move failed: ${err.message}`);
    },
  });

  const purgeMutation = trpc.caseRepair.purgeEntities.useMutation({
    onSuccess: (data) => {
      if (data.dryRun) {
        setPurgePreview(data);
      } else {
        toast.success(`Purged ${data.purged} entities from "${data.caseName}"`);
        setPurgePreview(null);
        setPurgeTarget(null);
        setShowPurgeConfirm(false);
        orphanQuery.refetch();
      }
    },
    onError: (err) => {
      toast.error(`Purge failed: ${err.message}`);
    },
  });

  if (!canAdminister) {
    return (
      <PublicWalkthroughShell
        title="Case Repair"
        description="The repair workspace is open for walkthrough. Case names, orphan scans, move previews, purge previews, and repair actions remain private."
        sections={["Orphan Scan", "Move Entities", "Purge Preview", "Repair Confirmation"]}
      />
    );
  }

  const handleDryRunMove = () => {
    if (!moveSource || !moveTarget) return;
    moveMutation.mutate({
      sourceCaseId: moveSource,
      targetCaseId: parseInt(moveTarget),
      dryRun: true,
    });
  };

  const handleExecuteMove = () => {
    if (!moveSource || !moveTarget) return;
    moveMutation.mutate({
      sourceCaseId: moveSource,
      targetCaseId: parseInt(moveTarget),
      dryRun: false,
    });
  };

  const handleDryRunPurge = (caseId: number) => {
    setPurgeTarget(caseId);
    purgeMutation.mutate({ caseId, dryRun: true });
  };

  const handleExecutePurge = () => {
    if (!purgeTarget) return;
    purgeMutation.mutate({ caseId: purgeTarget, dryRun: false });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Wrench className="h-5 w-5 text-destructive" />
        <div>
          <h1 className="text-xl font-semibold">Case Repair Tool</h1>
          <p className="text-sm text-muted-foreground">
            Admin-only. Find orphaned data, move entities between cases, or purge mislinked records.
          </p>
        </div>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Scalpel, not broom</AlertTitle>
        <AlertDescription>
          Every operation is audit-logged. Move and purge run inside database transactions — if any step fails, everything rolls back. Dry-run first, execute second.
        </AlertDescription>
      </Alert>

      {/* A) Find Orphans */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="h-4 w-4" />
                Find Orphans
              </CardTitle>
              <CardDescription>
                Cases with entities but 0 documents — likely mislinking from bulk upload.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => orphanQuery.refetch()}
              disabled={orphanQuery.isFetching}
            >
              {orphanQuery.isFetching ? "Scanning..." : "Rescan"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {orphanQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Scanning cases...</p>
          )}
          {orphanQuery.data && orphanQuery.data.mismatchedCases === 0 && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              No orphaned data detected. All cases have matching documents.
            </div>
          )}
          {orphanQuery.data && orphanQuery.data.orphanDetails.map((orphan) => (
            <div key={orphan.caseId} className="border rounded-lg p-4 space-y-3 mb-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-sm">{orphan.caseName}</span>
                  <span className="text-xs text-muted-foreground ml-2">ID: {orphan.caseId}</span>
                </div>
                <div className="flex gap-2">
                  <Badge variant="destructive">{orphan.entityCount} entities</Badge>
                  <Badge variant="outline">0 documents</Badge>
                </div>
              </div>

              {/* Entity list */}
              <div className="text-xs space-y-1">
                <p className="text-muted-foreground font-medium">Entities:</p>
                <div className="flex flex-wrap gap-1">
                  {orphan.entities.slice(0, 20).map((e) => (
                    <Badge key={e.id} variant="secondary" className="text-xs">
                      {e.name} ({e.type})
                    </Badge>
                  ))}
                  {orphan.entities.length > 20 && (
                    <Badge variant="secondary" className="text-xs">
                      +{orphan.entities.length - 20} more
                    </Badge>
                  )}
                </div>
              </div>

              {/* Dependent counts */}
              <div className="grid grid-cols-4 gap-2 text-xs">
                {Object.entries(orphan.dependentCounts).map(([key, val]) => (
                  <div key={key} className="flex justify-between bg-muted/50 rounded px-2 py-1">
                    <span className="text-muted-foreground">{key}</span>
                    <span className={val > 0 ? "font-medium text-amber-600" : "text-muted-foreground"}>{val}</span>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setMoveSource(orphan.caseId);
                    setMovePreview(null);
                    setMoveTarget("");
                  }}
                >
                  <ArrowRight className="h-3 w-3 mr-1" />
                  Move to...
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDryRunPurge(orphan.caseId)}
                  disabled={purgeMutation.isPending}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Purge (dry-run)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-amber-400 border-amber-400/30 hover:bg-amber-500/10"
                  onClick={() => setLocation(`/lumensend?type=complaint&context=case_repair`)}
                >
                  <Send className="h-3 w-3 mr-1" />
                  Report via LumenSend
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* B) Move Panel */}
      {moveSource !== null && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowRight className="h-4 w-4" />
              Move Entities
            </CardTitle>
            <CardDescription>
              Source: Case #{moveSource} — Select target case, then dry-run before executing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Target Case</label>
                <Select value={moveTarget} onValueChange={setMoveTarget}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select target case" />
                  </SelectTrigger>
                  <SelectContent>
                    {casesQuery.data?.filter(c => c.id !== moveSource).map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.name} (ID: {c.id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="pt-5">
                <Button
                  onClick={handleDryRunMove}
                  disabled={!moveTarget || moveMutation.isPending}
                  variant="outline"
                >
                  Dry-Run Preview
                </Button>
              </div>
            </div>

            {/* Dry-run results */}
            {movePreview && movePreview.dryRun && (
              <div className="border rounded-lg p-4 bg-amber-50/50 dark:bg-amber-950/20 space-y-3">
                <p className="text-sm font-medium">
                  Preview: Move {movePreview.moved} entities from "{movePreview.sourceCaseName}" → "{movePreview.targetCaseName}"
                </p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {Object.entries(movePreview.dependentMoves).map(([key, val]) => (
                    <div key={key} className="flex justify-between bg-background rounded px-2 py-1">
                      <span className="text-muted-foreground">{key}</span>
                      <span className={Number(val) > 0 ? "font-medium" : "text-muted-foreground"}>{String(val)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setShowMoveConfirm(true)}
                    variant="default"
                    size="sm"
                  >
                    Execute Move
                  </Button>
                  <Button
                    onClick={() => { setMoveSource(null); setMovePreview(null); }}
                    variant="ghost"
                    size="sm"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Move Confirmation Dialog */}
      <Dialog open={showMoveConfirm} onOpenChange={setShowMoveConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Move Operation</DialogTitle>
            <DialogDescription>
              This will move {movePreview?.moved} entities and all dependent data from
              "{movePreview?.sourceCaseName}" to "{movePreview?.targetCaseName}".
              This operation is audit-logged and runs inside a transaction.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowMoveConfirm(false)}>Cancel</Button>
            <Button onClick={handleExecuteMove} disabled={moveMutation.isPending}>
              {moveMutation.isPending ? "Moving..." : "Confirm Move"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purge Preview */}
      {purgePreview && purgePreview.dryRun && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <Trash2 className="h-4 w-4" />
              Purge Preview — "{purgePreview.caseName}"
            </CardTitle>
            <CardDescription>
              This will permanently delete {purgePreview.purged} entities and all dependent data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-xs">
              {Object.entries(purgePreview.dependentDeletes).map(([key, val]) => (
                <div key={key} className="flex justify-between bg-destructive/5 rounded px-2 py-1">
                  <span className="text-muted-foreground">{key}</span>
                  <span className={Number(val) > 0 ? "font-medium text-destructive" : "text-muted-foreground"}>{String(val)}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowPurgeConfirm(true)}
              >
                Execute Purge
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setPurgePreview(null); setPurgeTarget(null); }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Purge Confirmation Dialog */}
      <Dialog open={showPurgeConfirm} onOpenChange={setShowPurgeConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Confirm Purge Operation</DialogTitle>
            <DialogDescription>
              This will permanently delete {purgePreview?.purged} entities and all dependent data
              from "{purgePreview?.caseName}". This cannot be undone.
              This operation is audit-logged and runs inside a transaction.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowPurgeConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleExecutePurge} disabled={purgeMutation.isPending}>
              {purgeMutation.isPending ? "Purging..." : "Confirm Purge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
