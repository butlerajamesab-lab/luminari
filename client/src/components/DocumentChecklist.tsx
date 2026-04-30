import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { CheckSquare, Square, FileText, AlertTriangle, Info, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const PRIORITY_CONFIG = {
  critical: { label: "Critical", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", icon: AlertTriangle },
  important: { label: "Important", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", icon: FileText },
  helpful: { label: "Helpful", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", icon: Info },
};

export function DocumentChecklist({ caseId, pipelineType }: { caseId: number; pipelineType?: string | null }) {
  const [expanded, setExpanded] = useState(true);
  const utils = trpc.useUtils();

  const { data: items, isLoading } = trpc.checklist.list.useQuery({ caseId });

  const toggleMutation = trpc.checklist.toggle.useMutation({
    onMutate: async ({ itemId, checked }) => {
      await utils.checklist.list.cancel({ caseId });
      const prev = utils.checklist.list.getData({ caseId });
      utils.checklist.list.setData({ caseId }, (old) =>
        old?.map((item) => (item.id === itemId ? { ...item, checked, checkedAt: checked ? Date.now() : null } : item))
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.checklist.list.setData({ caseId }, ctx.prev);
      toast.error("Failed to update checklist");
    },
    onSettled: () => utils.checklist.list.invalidate({ caseId }),
  });

  const generateMutation = trpc.checklist.generate.useMutation({
    onSuccess: (result) => {
      if (result.generated) {
        toast.success(`Generated ${result.count} checklist items`);
        utils.checklist.list.invalidate({ caseId });
      } else {
        toast.info(result.message);
      }
    },
    onError: () => toast.error("Failed to generate checklist"),
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border/50 bg-card/50 p-4 animate-pulse">
        <div className="h-5 w-40 bg-muted rounded" />
        <div className="mt-3 space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-8 bg-muted rounded" />)}
        </div>
      </div>
    );
  }

  // No checklist yet — offer to generate
  if (!items || items.length === 0) {
    if (!pipelineType) return null;
    return (
      <div className="rounded-lg border border-dashed border-border/50 bg-card/30 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Document Checklist</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => generateMutation.mutate({ caseId, pipelineType })}
            disabled={generateMutation.isPending}
            className="text-xs"
          >
            {generateMutation.isPending ? "Generating..." : "Generate Checklist"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Generate a domain-specific document gathering guide for this case.
        </p>
      </div>
    );
  }

  const checked = items.filter((i) => i.checked).length;
  const total = items.length;
  const progress = Math.round((checked / total) * 100);

  const grouped = {
    critical: items.filter((i) => i.priority === "critical"),
    important: items.filter((i) => i.priority === "important"),
    helpful: items.filter((i) => i.priority === "helpful"),
  };

  return (
    <div className="rounded-lg border border-border/50 bg-card/50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Document Checklist</span>
          <span className="text-xs text-muted-foreground">
            {checked}/{total} gathered
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Progress bar */}
          <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{progress}%</span>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Items */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {(["critical", "important", "helpful"] as const).map((priority) => {
            const group = grouped[priority];
            if (group.length === 0) return null;
            const config = PRIORITY_CONFIG[priority];
            const Icon = config.icon;
            return (
              <div key={priority}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Icon className={`h-3 w-3 ${config.color}`} />
                  <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
                </div>
                <div className="space-y-1">
                  {group.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => toggleMutation.mutate({ itemId: item.id, checked: !item.checked, caseId })}
                      className={`w-full flex items-start gap-2.5 p-2 rounded-md text-left transition-all hover:bg-muted/30 group ${
                        item.checked ? "opacity-60" : ""
                      }`}
                    >
                      {item.checked ? (
                        <CheckSquare className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0 group-hover:text-primary" />
                      )}
                      <div className="min-w-0">
                        <span className={`text-sm ${item.checked ? "line-through text-muted-foreground" : ""}`}>
                          {item.label}
                        </span>
                        {item.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
