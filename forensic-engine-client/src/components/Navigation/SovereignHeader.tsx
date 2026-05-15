import { useInterfaceStore } from "@/store/interfaceStore";
import { Badge } from "@/components/ui/badge";
import { Shield, AlertCircle, Loader2 } from "lucide-react";

/**
 * SovereignHeader: Single Visual Truth for Jurisdiction Status
 * 
 * Displays the currently matched jurisdiction and its sovereign tier.
 * Connected to useInterfaceStore for reactive updates.
 * 
 * - If isProcessing: Shows "Scanning..." state with spinner
 * - If activeJurisdiction exists: Shows jurisdiction ID
 * - If isSovereign is true: Gold badge (high-tier)
 * - If isSovereign is false: Silver badge (standard)
 * - If no jurisdiction: Hidden
 */
export function SovereignHeader() {
  const { activeJurisdiction, isSovereign, isProcessing, confidence } = useInterfaceStore();

  // Show loading state while processing
  if (isProcessing) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2 flex-1">
          <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
          <span className="text-sm font-medium text-foreground">
            Scanning jurisdiction...
          </span>
        </div>
        <Badge
          variant="outline"
          className="bg-blue-600/10 text-blue-700 border-blue-600/30"
        >
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            Processing
          </span>
        </Badge>
      </div>
    );
  }

  // Don't render if no jurisdiction is active
  if (!activeJurisdiction) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-border">
      {/* Jurisdiction ID Display with Confidence */}
      <div className="flex items-center gap-2 flex-1">
        <Shield className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">
          {activeJurisdiction}
        </span>
        {confidence && confidence > 0 && (
          <span className="text-xs text-muted-foreground opacity-75">
            {Math.round(confidence)}% match
          </span>
        )}
      </div>

      {/* Sovereign Status Badge */}
      {isSovereign ? (
        <Badge
          variant="default"
          className="bg-amber-500 text-slate-950 border border-yellow-400 hover:bg-amber-600 animate-pulse font-semibold shadow-sm"
        >
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-yellow-300 animate-pulse" />
            Sovereign Gold
          </span>
        </Badge>
      ) : (
        <Badge
          variant="secondary"
          className="bg-slate-600/20 text-slate-700 border-slate-600/30 hover:bg-slate-600/30"
        >
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-slate-600" />
            Standard
          </span>
        </Badge>
      )}
    </div>
  );
}
