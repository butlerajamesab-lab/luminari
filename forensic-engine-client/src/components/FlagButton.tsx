import { useState } from "react";
import { Flag, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type TargetType = "program" | "signal" | "finding" | "kb_table" | "oversight_body" | "workflow" | "area" | "other";
type IssueType = "incorrect_data" | "broken_link" | "missing_info" | "duplicate" | "other";

interface FlagButtonProps {
  targetType: TargetType;
  targetId: string;
  targetLabel?: string;
  size?: "sm" | "xs";
  variant?: "ghost" | "outline";
  className?: string;
  /** If true, shows just the icon without the word "Flag" */
  iconOnly?: boolean;
  /** Pre-fill geographic fields for area flags */
  areaName?: string;
  stateCode?: string;
  lat?: number;
  lng?: number;
}

export function FlagButton({
  targetType,
  targetId,
  targetLabel,
  size = "sm",
  variant = "ghost",
  className,
  iconOnly = false,
  areaName: initialAreaName,
  stateCode: initialStateCode,
  lat: initialLat,
  lng: initialLng,
}: FlagButtonProps) {
  const [open, setOpen] = useState(false);
  const [issueType, setIssueType] = useState<IssueType>("incorrect_data");
  const [description, setDescription] = useState("");
  const [areaName, setAreaName] = useState(initialAreaName ?? "");
  const [stateCode, setStateCode] = useState(initialStateCode ?? "");

  const isAreaFlag = targetType === "area";

  const report = trpc.issueReports.report.useMutation({
    onSuccess: () => {
      toast.success("Flag submitted", {
        description: "Thank you — our team will review this.",
      });
      setOpen(false);
      setDescription("");
      setIssueType("incorrect_data");
    },
    onError: (e) => {
      toast.error("Failed to submit flag", { description: e.message });
    },
  });

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={cn(
          isAreaFlag
            ? "text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
            : "text-muted-foreground hover:text-orange-400 hover:bg-orange-500/10",
          className
        )}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title={isAreaFlag ? "Flag an issue with this area" : "Flag an issue with this item"}
      >
        {isAreaFlag ? (
          <MapPin className={cn("h-3.5 w-3.5", !iconOnly && "mr-1")} />
        ) : (
          <Flag className={cn("h-3.5 w-3.5", !iconOnly && "mr-1")} />
        )}
        {!iconOnly && <span className="text-xs">{isAreaFlag ? "Flag Area" : "Flag"}</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {isAreaFlag ? (
                <MapPin className="h-4 w-4 text-red-400" />
              ) : (
                <Flag className="h-4 w-4 text-orange-400" />
              )}
              {isAreaFlag ? "Flag an Area Issue" : "Flag an Issue"}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {isAreaFlag ? (
                <>Flag a problem in a specific geographic area — a county, city, region, or state.</>
              ) : targetLabel ? (
                <>Reporting an issue with: <strong className="text-foreground">{targetLabel}</strong></>
              ) : (
                "Let us know what's wrong with this item."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Area-specific fields */}
            {isAreaFlag && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Area / County / City
                  </label>
                  <Input
                    value={areaName}
                    onChange={(e) => setAreaName(e.target.value)}
                    placeholder="e.g. King County, Hi-Line"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    State
                  </label>
                  <Input
                    value={stateCode}
                    onChange={(e) => setStateCode(e.target.value.toUpperCase().slice(0, 2))}
                    placeholder="e.g. WA"
                    className="h-9 text-sm"
                    maxLength={2}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Issue Type
              </label>
              <Select value={issueType} onValueChange={(v) => setIssueType(v as IssueType)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="incorrect_data">Incorrect or outdated data</SelectItem>
                  <SelectItem value="broken_link">Broken link or URL</SelectItem>
                  <SelectItem value="missing_info">Missing information</SelectItem>
                  <SelectItem value="duplicate">Duplicate entry</SelectItem>
                  <SelectItem value="other">Other issue</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Description <span className="text-muted-foreground/50 normal-case">(optional)</span>
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  isAreaFlag
                    ? "Describe what's wrong in this area — missing programs, incorrect data, service gaps..."
                    : "Describe what's wrong or what should be corrected..."
                }
                className="text-sm resize-none h-24"
                maxLength={2000}
              />
              {description.length > 0 && (
                <p className="text-xs text-muted-foreground text-right">{description.length}/2000</p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() =>
                report.mutate({
                  targetType,
                  targetId: isAreaFlag ? (areaName || stateCode || targetId) : targetId,
                  targetLabel: isAreaFlag ? (areaName ? `${areaName}${stateCode ? `, ${stateCode}` : ""}` : targetLabel) : targetLabel,
                  issueType,
                  description: description || undefined,
                  areaName: isAreaFlag ? (areaName || undefined) : undefined,
                  stateCode: isAreaFlag ? (stateCode || undefined) : undefined,
                  lat: initialLat,
                  lng: initialLng,
                })
              }
              disabled={report.isPending || (isAreaFlag && !areaName && !stateCode)}
              className={cn(
                isAreaFlag ? "bg-red-500 hover:bg-red-600" : "bg-orange-500 hover:bg-orange-600",
                "text-white"
              )}
            >
              {report.isPending ? "Submitting..." : "Submit Flag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Standalone area flag button — use on Viewfinder, map views, or any geographic UI.
 * Pre-wired with targetType="area" and accepts state/area context.
 */
export function AreaFlagButton({
  areaName,
  stateCode,
  lat,
  lng,
  className,
  iconOnly = false,
}: {
  areaName?: string;
  stateCode?: string;
  lat?: number;
  lng?: number;
  className?: string;
  iconOnly?: boolean;
}) {
  return (
    <FlagButton
      targetType="area"
      targetId={areaName ?? stateCode ?? "area"}
      targetLabel={areaName ? `${areaName}${stateCode ? `, ${stateCode}` : ""}` : stateCode}
      areaName={areaName}
      stateCode={stateCode}
      lat={lat}
      lng={lng}
      className={className}
      iconOnly={iconOnly}
    />
  );
}
