import { usePlainLanguage } from "@/contexts/PlainLanguageContext";
import { Button } from "@/components/ui/button";
import { BookOpen, BookOpenCheck } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Toggle button for plain language mode.
 * Shows in sidebar footer or header area.
 *
 * Variants:
 * - default: full-width labelled button (expanded footer / header use)
 * - collapsed: icon-only button with tooltip (collapsed sidebar)
 * - tab: compact flex tab for the sidebar footer's view-controls tab strip
 * All variants call the exact same context `toggle`.
 */
export default function PlainLanguageToggle({ collapsed = false, variant }: { collapsed?: boolean; variant?: "tab" }) {
  const { enabled, toggle } = usePlainLanguage();

  if (variant === "tab") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={enabled}
        title={enabled
          ? "Plain Language: ON — rewrites legal jargon into accessible language"
          : "Plain Language: OFF — rewrites legal jargon into accessible language"}
        className={`flex flex-1 min-w-0 items-center justify-center gap-1.5 rounded-md px-1.5 py-1.5 border transition-colors ${
          enabled
            ? "bg-primary/15 text-primary border-primary/30 hover:bg-primary/25"
            : "bg-muted/40 text-muted-foreground border-border/50 hover:bg-muted/60"
        }`}
      >
        {enabled ? <BookOpenCheck className="h-3.5 w-3.5 shrink-0" /> : <BookOpen className="h-3.5 w-3.5 shrink-0" />}
        <span className="text-[11px] font-medium truncate">Plain Language</span>
      </button>
    );
  }

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={enabled ? "default" : "ghost"}
            size="icon"
            onClick={toggle}
            className={`h-8 w-8 ${enabled ? "bg-primary/20 text-primary hover:bg-primary/30" : "text-muted-foreground"}`}
          >
            {enabled ? <BookOpenCheck className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p className="text-xs">{enabled ? "Plain Language: ON" : "Plain Language: OFF"}</p>
          <p className="text-[10px] text-muted-foreground">Rewrites legal jargon into accessible language</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      variant={enabled ? "default" : "outline"}
      size="sm"
      onClick={toggle}
      className={`text-xs h-7 w-full justify-start gap-2 ${
        enabled
          ? "bg-primary/15 text-primary border-primary/30 hover:bg-primary/25"
          : "text-muted-foreground"
      }`}
    >
      {enabled ? <BookOpenCheck className="h-3.5 w-3.5" /> : <BookOpen className="h-3.5 w-3.5" />}
      {enabled ? "Plain Language: ON" : "Plain Language Mode"}
    </Button>
  );
}
