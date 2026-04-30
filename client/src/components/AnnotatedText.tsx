import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, User, Quote, Link2 } from "lucide-react";

/* ─── Types ─── */
export interface AnnotationEntity {
  id: number;
  name: string;
  type: string;
  aliases?: string[];
}

export interface AnnotationQuote {
  id: number;
  text: string;
  pageNumber?: number | null;
  statementOrigin?: string;
}

export interface AnnotationCorrelation {
  id: number;
  sharedIdentifiers?: string[];
  correlationType: string;
  sourceDocumentId: number;
  targetDocumentId: number;
}

type SpanType = "entity" | "quote" | "correlation";

interface AnnotatedSpan {
  start: number;
  end: number;
  type: SpanType;
  id: number;
  label: string;
  meta?: Record<string, any>;
}

interface TooltipState {
  x: number;
  y: number;
  span: AnnotatedSpan;
}

/* ─── Color palette — structural, not semantic ─── */
const SPAN_STYLES: Record<SpanType, { bg: string; border: string; hoverBg: string; icon: typeof User }> = {
  entity:      { bg: "bg-sky-500/8",    border: "border-b border-sky-500/30 border-dashed", hoverBg: "bg-sky-500/15",    icon: User },
  quote:       { bg: "bg-amber-500/8",  border: "border-b border-amber-500/30 border-dashed", hoverBg: "bg-amber-500/15",  icon: Quote },
  correlation: { bg: "bg-violet-500/8", border: "border-b border-violet-500/30 border-dashed", hoverBg: "bg-violet-500/15", icon: Link2 },
};

/* ─── Annotation engine: find spans in text ─── */
function buildAnnotations(
  text: string,
  entities: AnnotationEntity[],
  quotes: AnnotationQuote[],
  correlations: AnnotationCorrelation[],
): AnnotatedSpan[] {
  const spans: AnnotatedSpan[] = [];
  const textLower = text.toLowerCase();

  // 1. Quote spans — exact substring match (longest first)
  const sortedQuotes = [...quotes].sort((a, b) => b.text.length - a.text.length);
  for (const q of sortedQuotes) {
    if (q.text.length < 20) continue; // skip very short quotes to avoid false positives
    const qLower = q.text.toLowerCase().trim();
    let searchFrom = 0;
    while (searchFrom < textLower.length) {
      const idx = textLower.indexOf(qLower, searchFrom);
      if (idx === -1) break;
      spans.push({
        start: idx,
        end: idx + qLower.length,
        type: "quote",
        id: q.id,
        label: `Quote #${q.id}${q.pageNumber ? ` (p.${q.pageNumber})` : ""}`,
        meta: { pageNumber: q.pageNumber, statementOrigin: q.statementOrigin },
      });
      searchFrom = idx + qLower.length;
    }
  }

  // 2. Entity spans — word-boundary match on name and aliases
  for (const e of entities) {
    const names = [e.name, ...(Array.isArray(e.aliases) ? e.aliases : [])];
    for (const name of names) {
      if (name.length < 3) continue; // skip very short names
      const nameLower = name.toLowerCase();
      let searchFrom = 0;
      while (searchFrom < textLower.length) {
        const idx = textLower.indexOf(nameLower, searchFrom);
        if (idx === -1) break;
        // Check word boundaries
        const before = idx > 0 ? textLower[idx - 1] : " ";
        const after = idx + nameLower.length < textLower.length ? textLower[idx + nameLower.length] : " ";
        const isWordBoundary = /[\s,.;:!?()\[\]"'\-\/]/.test(before) && /[\s,.;:!?()\[\]"'\-\/]/.test(after);
        if (isWordBoundary || idx === 0 || idx + nameLower.length === textLower.length) {
          spans.push({
            start: idx,
            end: idx + nameLower.length,
            type: "entity",
            id: e.id,
            label: `${e.name} (${e.type})`,
            meta: { entityType: e.type },
          });
        }
        searchFrom = idx + nameLower.length;
      }
    }
  }

  // 3. Correlation anchor spans — shared identifiers
  for (const c of correlations) {
    const identifiers = Array.isArray(c.sharedIdentifiers) ? c.sharedIdentifiers : [];
    for (const ident of identifiers) {
      if (typeof ident !== "string" || ident.length < 3) continue;
      const identLower = ident.toLowerCase();
      let searchFrom = 0;
      while (searchFrom < textLower.length) {
        const idx = textLower.indexOf(identLower, searchFrom);
        if (idx === -1) break;
        spans.push({
          start: idx,
          end: idx + identLower.length,
          type: "correlation",
          id: c.id,
          label: `Correlation: ${c.correlationType.replace(/_/g, " ")}`,
          meta: { correlationType: c.correlationType, sourceDocumentId: c.sourceDocumentId, targetDocumentId: c.targetDocumentId },
        });
        searchFrom = idx + identLower.length;
      }
    }
  }

  // Deduplicate overlapping spans — prefer quotes > correlations > entities, then longer spans
  const priority: Record<SpanType, number> = { quote: 3, correlation: 2, entity: 1 };
  spans.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (priority[a.type] !== priority[b.type]) return priority[b.type] - priority[a.type];
    return (b.end - b.start) - (a.end - a.start);
  });

  // Remove overlaps — greedy non-overlapping selection
  const selected: AnnotatedSpan[] = [];
  let lastEnd = -1;
  for (const span of spans) {
    if (span.start >= lastEnd) {
      selected.push(span);
      lastEnd = span.end;
    }
  }

  return selected;
}

/* ─── Main Component ─── */
export default function AnnotatedText({
  text,
  entities,
  quotes,
  correlations,
  onEntityClick,
  onQuoteClick,
  onCorrelationClick,
}: {
  text: string;
  entities: AnnotationEntity[];
  quotes: AnnotationQuote[];
  correlations: AnnotationCorrelation[];
  onEntityClick?: (entityId: number) => void;
  onQuoteClick?: (quoteId: number) => void;
  onCorrelationClick?: (correlationId: number) => void;
}) {
  const [enabled, setEnabled] = useState(true);
  const [hoveredSpan, setHoveredSpan] = useState<AnnotatedSpan | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const annotations = useMemo(
    () => (enabled ? buildAnnotations(text, entities, quotes, correlations) : []),
    [text, entities, quotes, correlations, enabled],
  );

  // Stats for the legend
  const stats = useMemo(() => {
    const counts = { entity: 0, quote: 0, correlation: 0 };
    for (const a of annotations) counts[a.type]++;
    return counts;
  }, [annotations]);

  const handleSpanHover = useCallback((e: React.MouseEvent, span: AnnotatedSpan | null) => {
    if (span) {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (containerRect) {
        setTooltip({
          x: rect.left - containerRect.left + rect.width / 2,
          y: rect.top - containerRect.top - 4,
          span,
        });
      }
    } else {
      setTooltip(null);
    }
    setHoveredSpan(span);
  }, []);

  const handleSpanClick = useCallback((span: AnnotatedSpan) => {
    if (span.type === "entity" && onEntityClick) onEntityClick(span.id);
    if (span.type === "quote" && onQuoteClick) onQuoteClick(span.id);
    if (span.type === "correlation" && onCorrelationClick) onCorrelationClick(span.id);
  }, [onEntityClick, onQuoteClick, onCorrelationClick]);

  // Build rendered segments
  const segments = useMemo(() => {
    if (annotations.length === 0) return [{ text, span: null as AnnotatedSpan | null }];

    const result: { text: string; span: AnnotatedSpan | null }[] = [];
    let cursor = 0;

    for (const ann of annotations) {
      if (ann.start > cursor) {
        result.push({ text: text.slice(cursor, ann.start), span: null });
      }
      result.push({ text: text.slice(ann.start, ann.end), span: ann });
      cursor = ann.end;
    }

    if (cursor < text.length) {
      result.push({ text: text.slice(cursor), span: null });
    }

    return result;
  }, [text, annotations]);

  return (
    <div className="relative" ref={containerRef}>
      {/* Legend + Toggle */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/50">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Linkage Map</span>
          {enabled && (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[10px] text-sky-400">
                <span className="w-2 h-2 rounded-full bg-sky-500/40" />
                Entities ({stats.entity})
              </span>
              <span className="flex items-center gap-1 text-[10px] text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-500/40" />
                Quotes ({stats.quote})
              </span>
              <span className="flex items-center gap-1 text-[10px] text-violet-400">
                <span className="w-2 h-2 rounded-full bg-violet-500/40" />
                Correlations ({stats.correlation})
              </span>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-[10px]"
          onClick={() => setEnabled(!enabled)}
        >
          {enabled ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          {enabled ? "Hide" : "Show"} Linkage
        </Button>
      </div>

      {/* Annotated text */}
      <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed max-h-[600px] overflow-y-auto">
        {segments.map((seg, i) => {
          if (!seg.span) return <span key={i}>{seg.text}</span>;

          const style = SPAN_STYLES[seg.span.type];
          const isHovered = hoveredSpan?.start === seg.span.start && hoveredSpan?.type === seg.span.type;
          const clickable = (seg.span.type === "entity" && onEntityClick) ||
                           (seg.span.type === "quote" && onQuoteClick) ||
                           (seg.span.type === "correlation" && onCorrelationClick);

          return (
            <span
              key={i}
              className={`
                ${isHovered ? style.hoverBg : style.bg}
                ${style.border}
                ${clickable ? "cursor-pointer" : ""}
                rounded-sm transition-colors duration-150
              `}
              onMouseEnter={(e) => handleSpanHover(e, seg.span)}
              onMouseLeave={(e) => handleSpanHover(e, null)}
              onClick={() => seg.span && handleSpanClick(seg.span)}
            >
              {seg.text}
            </span>
          );
        })}
      </pre>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="bg-popover text-popover-foreground border border-border rounded-md shadow-lg px-2.5 py-1.5 text-[11px] max-w-[280px]">
            <div className="flex items-center gap-1.5 mb-0.5">
              {(() => {
                const Icon = SPAN_STYLES[tooltip.span.type].icon;
                return <Icon className="h-3 w-3 shrink-0" />;
              })()}
              <span className="font-medium capitalize">{tooltip.span.type}</span>
            </div>
            <p className="text-muted-foreground">{tooltip.span.label}</p>
            {(tooltip.span.type === "entity" && onEntityClick) && (
              <p className="text-primary text-[9px] mt-0.5">Click to view entity</p>
            )}
            {(tooltip.span.type === "quote" && onQuoteClick) && (
              <p className="text-primary text-[9px] mt-0.5">Click to view quote</p>
            )}
            {(tooltip.span.type === "correlation" && onCorrelationClick) && (
              <p className="text-primary text-[9px] mt-0.5">Click to view correlation</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
