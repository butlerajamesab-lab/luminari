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
 */
export default function PlainLanguageToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { enabled, toggle } = usePlainLanguage();

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
