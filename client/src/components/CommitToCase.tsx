/**
 * CommitToCase — Universal commit button for all output surfaces
 *
 * Usage:
 *   <CommitToCase type="finding" itemId={finding.id} label="Commit to Case" />
 *   <CommitToCase type="proceduralPath" pathLabel="EEOC Administrative Complaint" pathId={42} deadlines={[...]} />
 *   <CommitToCase type="remedyStrategy" strategyLabel="Agency Complaint" strategyId={7} />
 *   <CommitToCase type="barrier" itemId={barrier.id} />
 *   <CommitToCase type="benefit" itemId={program.id} />
 *   <CommitToCase type="signal" itemId={signal.id} signalType="structural" />
 *   <CommitToCase type="statute" itemId={statute.id} />
 *   <CommitToCase type="foia" itemId={foiaRequest.id} />
 *   <CommitToCase type="filing" itemId={filing.id} />
 *
 * Reads active case from CaseContext. Shows a case picker if no active case.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCase } from "@/contexts/CaseContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, BookmarkPlus, ChevronDown, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type CommitType =
  | "finding"
  | "barrier"
  | "benefit"
  | "signal"
  | "statute"
  | "foia"
  | "filing"
  | "proceduralPath"
  | "remedyStrategy"
  | "claimType";

type CommitToCaseProps = {
  type: CommitType;
  // For item-based commits (finding, barrier, benefit, signal, statute, foia, filing)
  itemId?: number | string;
  // For signal commits
  signalType?: "structural" | "evidentiary" | "pattern" | "resource";
  // For procedural path commits
  pathId?: number;
  pathLabel?: string;
  deadlines?: Array<{ label: string; date: string; daysRemaining: number; critical: boolean }>;
  // For remedy strategy commits
  strategyId?: number;
  strategyLabel?: string;
  // For claim type commits
  claimType?: string;
  // UI customization
  label?: string;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline" | "ghost";
  className?: string;
  // Called after successful commit
  onCommitted?: () => void;
};

export function CommitToCase({
  type,
  itemId,
  signalType,
  pathId,
  pathLabel,
  deadlines,
  strategyId,
  strategyLabel,
  claimType,
  label,
  size = "sm",
  variant = "outline",
  className,
  onCommitted,
}: CommitToCaseProps) {
  const { currentCaseId, cases } = useCase();
  const utils = trpc.useUtils();
  const [committed, setCommitted] = useState(false);
  const [targetCaseId, setTargetCaseId] = useState<number | null>(null);

  const activeCaseId = targetCaseId ?? currentCaseId;

  // All commit mutations
  const commit_finding = trpc.case_state.commit_finding.useMutation({ onSuccess: handleSuccess, onError: handleError });
  const commit_barrier = trpc.case_state.commit_barrier.useMutation({ onSuccess: handleSuccess, onError: handleError });
  const commit_benefit = trpc.case_state.commit_benefit.useMutation({ onSuccess: handleSuccess, onError: handleError });
  const commit_signal = trpc.case_state.commit_signal.useMutation({ onSuccess: handleSuccess, onError: handleError });
  const commit_statute = trpc.case_state.commit_statute.useMutation({ onSuccess: handleSuccess, onError: handleError });
  const commit_foia = trpc.case_state.commit_foia.useMutation({ onSuccess: handleSuccess, onError: handleError });
  const commit_filing = trpc.case_state.commit_filing.useMutation({ onSuccess: handleSuccess, onError: handleError });
  const commit_path = trpc.case_state.commit_procedural_path.useMutation({ onSuccess: handleSuccess, onError: handleError });
  const commit_strategy = trpc.case_state.commit_remedy_strategy.useMutation({ onSuccess: handleSuccess, onError: handleError });
  const set_claim_type = trpc.case_state.set_claim_type.useMutation({ onSuccess: handleSuccess, onError: handleError });

  const isLoading =
    commit_finding.isPending || commit_barrier.isPending || commit_benefit.isPending ||
    commit_signal.isPending || commit_statute.isPending || commit_foia.isPending ||
    commit_filing.isPending || commit_path.isPending || commit_strategy.isPending ||
    set_claim_type.isPending;

  function handleSuccess() {
    setCommitted(true);
    utils.case_state.get.invalidate({ case_id: activeCaseId! });
    toast.success("Committed to case", { description: getSuccessMessage() });
    onCommitted?.();
    // Reset committed state after 3s so button is re-usable
    setTimeout(() => setCommitted(false), 3000);
  }

  function handleError(err: any) {
    toast.error("Could not commit", { description: err.message || "Please try again." });
  }

  function getSuccessMessage(): string {
    switch (type) {
      case "finding": return "Finding added to case evidence.";
      case "barrier": return "Barrier logged in case state.";
      case "benefit": return "Benefit program saved to case.";
      case "signal": return "Signal committed to case.";
      case "statute": return "Statute attached to case.";
      case "foia": return "FOIA request tracked in case.";
      case "filing": return "Filing packet saved to case.";
      case "proceduralPath": return `Path "${pathLabel}" set as active strategy.`;
      case "remedyStrategy": return `Remedy strategy "${strategyLabel}" committed.`;
      case "claimType": return `Claim type set to "${claimType}".`;
      default: return "Committed to case.";
    }
  }

  function getButtonLabel(): string {
    if (label) return label;
    if (committed) return "Committed";
    switch (type) {
      case "proceduralPath": return "Set as Active Path";
      case "remedyStrategy": return "Commit Strategy";
      case "claimType": return "Set Claim Type";
      default: return "Commit to Case";
    }
  }

  function doCommit(caseId: number) {
    const numericItemId = typeof itemId === "number" ? itemId : Number(itemId);
    switch (type) {
      case "finding":
        commit_finding.mutate({ case_id: caseId, finding_id: numericItemId });
        break;
      case "barrier":
        commit_barrier.mutate({ case_id: caseId, barrier_id: numericItemId });
        break;
      case "benefit":
        commit_benefit.mutate({ case_id: caseId, benefit_id: numericItemId });
        break;
      case "signal":
        commit_signal.mutate({ case_id: caseId, signal_id: numericItemId, signal_type: signalType });
        break;
      case "statute":
        commit_statute.mutate({ case_id: caseId, statute_id: itemId! });
        break;
      case "foia":
        commit_foia.mutate({ case_id: caseId, foia_id: numericItemId });
        break;
      case "filing":
        commit_filing.mutate({ case_id: caseId, filing_id: numericItemId });
        break;
      case "proceduralPath":
        commit_path.mutate({ case_id: caseId, path_id: pathId, path_label: pathLabel!, deadlines: deadlines?.map((deadline) => ({ label: deadline.label, date: deadline.date, days_remaining: deadline.daysRemaining, critical: deadline.critical })) });
        break;
      case "remedyStrategy":
        commit_strategy.mutate({ case_id: caseId, strategy_id: strategyId, strategy_label: strategyLabel! });
        break;
      case "claimType":
        set_claim_type.mutate({ case_id: caseId, claim_type: claimType as any });
        break;
    }
  }

  // No active case — show case picker
  if (!activeCaseId) {
    if (!cases || cases.length === 0) {
      return (
        <Button size={size} variant="outline" disabled className={cn("gap-1.5 opacity-60", className)}>
          <AlertCircle className="h-3.5 w-3.5" />
          No active case
        </Button>
      );
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size={size} variant={variant} className={cn("gap-1.5", className)}>
            <BookmarkPlus className="h-3.5 w-3.5" />
            Commit to Case
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Select a case</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {cases.map(c => (
            <DropdownMenuItem
              key={c.id}
              onClick={() => {
                setTargetCaseId(c.id);
                doCommit(c.id);
              }}
            >
              {c.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Multiple cases — show picker with active case highlighted
  if (cases && cases.length > 1) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size={size}
            variant={committed ? "default" : variant}
            disabled={isLoading}
            className={cn(
              "gap-1.5",
              committed && "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600",
              className
            )}
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : committed ? (
              <CheckCircle className="h-3.5 w-3.5" />
            ) : (
              <BookmarkPlus className="h-3.5 w-3.5" />
            )}
            {getButtonLabel()}
            {!committed && <ChevronDown className="h-3 w-3 opacity-60" />}
          </Button>
        </DropdownMenuTrigger>
        {!committed && (
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Commit to case</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {cases.map(c => (
              <DropdownMenuItem
                key={c.id}
                onClick={() => doCommit(c.id)}
                className={cn(c.id === activeCaseId && "font-medium")}
              >
                {c.name}
                {c.id === activeCaseId && (
                  <Badge variant="secondary" className="ml-auto text-xs">Active</Badge>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        )}
      </DropdownMenu>
    );
  }

  // Single case — direct commit button
  return (
    <Button
      size={size}
      variant={committed ? "default" : variant}
      disabled={isLoading || committed}
      onClick={() => doCommit(activeCaseId)}
      className={cn(
        "gap-1.5",
        committed && "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600",
        className
      )}
    >
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : committed ? (
        <CheckCircle className="h-3.5 w-3.5" />
      ) : (
        <BookmarkPlus className="h-3.5 w-3.5" />
      )}
      {getButtonLabel()}
    </Button>
  );
}

/**
 * FlagArea — Lightweight flag button for marking areas that need attention
 */
type FlagAreaProps = {
  location: string;
  message?: string;
  targetId?: number;
  targetType?: string;
  areaName?: string;
  className?: string;
};

export function FlagArea({ location, message, targetId, targetType, areaName, className }: FlagAreaProps) {
  const { currentCaseId } = useCase();
  const [flagged, setFlagged] = useState(false);
  const [inputMsg, setInputMsg] = useState(message || "");
  const [showInput, setShowInput] = useState(false);

  const add_flag = trpc.case_state.add_flag.useMutation({
    onSuccess: () => {
      setFlagged(true);
      setShowInput(false);
      toast.success("Area flagged", { description: "Added to case review queue." });
      setTimeout(() => setFlagged(false), 3000);
    },
    onError: (err) => {
      toast.error("Could not flag", { description: err.message });
    },
  });

  if (!currentCaseId) return null;

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      {showInput ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={inputMsg}
            onChange={e => setInputMsg(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                add_flag.mutate({ case_id: currentCaseId, location, message: inputMsg || "Needs attention", target_id: targetId, target_type: targetType, area_name: areaName });
              }
              if (e.key === "Escape") setShowInput(false);
            }}
            placeholder="Note (optional)"
            className="h-7 px-2 text-xs rounded border border-border bg-background text-foreground w-40 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => add_flag.mutate({ case_id: currentCaseId, location, message: inputMsg || "Needs attention", target_id: targetId, target_type: targetType, area_name: areaName })}
          >
            Flag
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setShowInput(false)}>
            ✕
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          disabled={add_flag.isPending}
          onClick={() => message ? add_flag.mutate({ case_id: currentCaseId, location, message, target_id: targetId, target_type: targetType, area_name: areaName }) : setShowInput(true)}
          className={cn(
            "h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-amber-500",
            flagged && "text-amber-500"
          )}
        >
          {flagged ? "🚩 Flagged" : "🚩 Flag"}
        </Button>
      )}
    </div>
  );
}
