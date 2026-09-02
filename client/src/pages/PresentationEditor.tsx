import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Play,
  Plus,
  Trash2,
  Edit3,
  Sparkles,
  Loader2,
  GripVertical,
  ChevronLeft,
  ChevronRight,
  X,
  Maximize2,
  FileText,
  Quote,
  Clock,
  Users,
  BarChart3,
  Type,
  MoreVertical,
  StickyNote,
  Wand2,
  Save,
  ArrowUp,
  ArrowDown,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { useAuth } from "@/core/hooks/useAuth";
import { PublicWalkthroughShell } from "@/components/PublicWalkthroughShell";

const SLIDE_TYPE_CONFIG: Record<string, { icon: typeof FileText; label: string; color: string }> = {
  title: { icon: Type, label: "Title", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  finding: { icon: BarChart3, label: "Finding", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  evidence_quote: { icon: Quote, label: "Evidence", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  timeline: { icon: Clock, label: "Timeline", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  entity_map: { icon: Users, label: "Entities", color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  summary: { icon: FileText, label: "Summary", color: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
  custom: { icon: Edit3, label: "Custom", color: "bg-gray-500/10 text-gray-400 border-gray-500/20" },
};

type SlideData = {
  id: number;
  presentationId: number;
  orderIndex: number;
  slideType: string;
  title: string | null;
  content: string | null;
  sourceCitations: unknown;
  notes: string | null;
  layout: string;
  metadata: unknown;
};

export default function PresentationEditor() {
  const { user } = useAuth();

  if (!user) {
    return (
      <PublicWalkthroughShell
        title="Presentation Editor"
        description="The presentation workspace is open for walkthrough. Case-derived slides, citations, speaker notes, exports, and editing actions remain private."
        sections={["Slide Outline", "Evidence Citations", "Presentation Mode", "Editing Tools"]}
        backHref="/presentations"
      />
    );
  }

  return <AuthenticatedPresentationEditor />;
}

function AuthenticatedPresentationEditor() {
  const params = useParams<{ id: string }>();
  const presId = Number(params.id);
  const search = useSearch();
  const startInPresent = new URLSearchParams(search).get("mode") === "present";
  const [, setLocation] = useLocation();
  const { currentCaseId } = useCase();

  const [selectedSlideIdx, setSelectedSlideIdx] = useState(0);
  const [isPresenting, setIsPresenting] = useState(startInPresent);
  const [showNotes, setShowNotes] = useState(false);
  const [editingSlide, setEditingSlide] = useState<SlideData | null>(null);
  const [showAddSlide, setShowAddSlide] = useState(false);
  const [newSlideType, setNewSlideType] = useState("custom");
  const [refineInstruction, setRefineInstruction] = useState("");
  const [showRefine, setShowRefine] = useState(false);
  const presentRef = useRef<HTMLDivElement>(null);

  const { data: presentation, isLoading } = trpc.presentations.get.useQuery(
    { id: presId },
    { enabled: !!presId }
  );

  const utils = trpc.useUtils();
  const slides = (presentation?.slides || []) as SlideData[];

  const generateMutation = trpc.presentations.generateSlides.useMutation({
    onSuccess: () => {
      utils.presentations.get.invalidate({ id: presId });
      toast.success("Slides generated from your case evidence");
    },
    onError: (err) => toast.error(err.message || "Failed to generate slides"),
  });

  const addSlideMutation = trpc.presentations.addSlide.useMutation({
    onSuccess: () => {
      utils.presentations.get.invalidate({ id: presId });
      setShowAddSlide(false);
      toast.success("Slide added");
    },
    onError: () => toast.error("Failed to add slide"),
  });

  const updateSlideMutation = trpc.presentations.updateSlide.useMutation({
    onSuccess: () => {
      utils.presentations.get.invalidate({ id: presId });
      setEditingSlide(null);
      toast.success("Slide updated");
    },
    onError: () => toast.error("Failed to update slide"),
  });

  const deleteSlideMutation = trpc.presentations.deleteSlide.useMutation({
    onSuccess: () => {
      utils.presentations.get.invalidate({ id: presId });
      if (selectedSlideIdx >= slides.length - 1) setSelectedSlideIdx(Math.max(0, slides.length - 2));
      toast.success("Slide deleted");
    },
    onError: () => toast.error("Failed to delete slide"),
  });

  const reorderMutation = trpc.presentations.reorderSlides.useMutation({
    onSuccess: () => utils.presentations.get.invalidate({ id: presId }),
  });

  const refineMutation = trpc.presentations.refineSlide.useMutation({
    onSuccess: () => {
      utils.presentations.get.invalidate({ id: presId });
      setShowRefine(false);
      setRefineInstruction("");
      toast.success("Slide refined");
    },
    onError: () => toast.error("Failed to refine slide"),
  });

  // Keyboard navigation for presentation mode
  useEffect(() => {
    if (!isPresenting) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        setSelectedSlideIdx((i) => Math.min(i + 1, slides.length - 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSelectedSlideIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Escape") {
        setIsPresenting(false);
      } else if (e.key === "n" || e.key === "N") {
        setShowNotes((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isPresenting, slides.length]);

  const moveSlide = (fromIdx: number, direction: "up" | "down") => {
    const toIdx = direction === "up" ? fromIdx - 1 : fromIdx + 1;
    if (toIdx < 0 || toIdx >= slides.length) return;
    const newOrder = slides.map((s) => s.id);
    [newOrder[fromIdx], newOrder[toIdx]] = [newOrder[toIdx], newOrder[fromIdx]];
    reorderMutation.mutate({ presentationId: presId, slideIds: newOrder });
    setSelectedSlideIdx(toIdx);
  };

  const handleExportPdf = async () => {
    try {
      toast.info("Generating printable document...");
      const result = await utils.presentations.exportHtml.fetch({ presentationId: presId });
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(result.html);
        win.document.close();
        toast.success(`Opened ${result.slideCount}-slide document. Use Print / Save as PDF.`);
      } else {
        toast.error("Pop-up blocked. Please allow pop-ups for this site.");
      }
    } catch {
      toast.error("Failed to generate export");
    }
  };

  const currentSlide = slides[selectedSlideIdx];
  const citations = currentSlide?.sourceCitations as Array<{ documentName?: string; quote?: string }> | null;

  // ─── Presentation Mode ───
  if (isPresenting) {
    return (
      <div
        ref={presentRef}
        className="fixed inset-0 z-50 bg-[oklch(0.08_0.005_250)] flex flex-col"
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3 bg-black/40 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setIsPresenting(false)} className="text-white/70 hover:text-white">
              <X className="h-4 w-4 mr-1" /> Exit
            </Button>
            <span className="text-white/50 text-sm">
              {selectedSlideIdx + 1} / {slides.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowNotes(!showNotes)}
              className={`text-sm ${showNotes ? "text-primary" : "text-white/50"}`}
            >
              <StickyNote className="h-4 w-4 mr-1" /> Notes (N)
            </Button>
          </div>
        </div>

        {/* Slide content */}
        <div className="flex-1 flex items-center justify-center p-8 relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white h-12 w-12"
            onClick={() => setSelectedSlideIdx((i) => Math.max(i - 1, 0))}
            disabled={selectedSlideIdx === 0}
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>

          <div className="max-w-4xl w-full">
            {currentSlide && (
              <div className="space-y-6">
                {/* Slide type badge */}
                {currentSlide.slideType !== "title" && (
                  <Badge variant="outline" className={SLIDE_TYPE_CONFIG[currentSlide.slideType]?.color || "bg-muted text-muted-foreground"}>
                    {SLIDE_TYPE_CONFIG[currentSlide.slideType]?.label || currentSlide.slideType}
                  </Badge>
                )}

                {/* Title */}
                <h1 className={`font-bold text-white leading-tight ${
                  currentSlide.slideType === "title" ? "text-5xl text-center mt-16" : "text-3xl"
                }`}>
                  {currentSlide.title}
                </h1>

                {/* Content */}
                {currentSlide.content && (
                  <div className={`prose prose-invert prose-lg max-w-none ${
                    currentSlide.slideType === "title" ? "text-center text-white/70" :
                    currentSlide.layout === "full_quote" ? "text-2xl italic text-white/80 border-l-4 border-primary pl-6" :
                    ""
                  }`}>
                    <Streamdown>{currentSlide.content}</Streamdown>
                  </div>
                )}

                {/* Citations */}
                {citations && citations.length > 0 && (
                  <div className="mt-8 pt-4 border-t border-white/10 space-y-2">
                    {citations.map((c, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-white/40">
                        <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>
                          <span className="text-white/60">{c.documentName}</span>
                          {c.quote && <span className="italic ml-1">— "{c.quote.slice(0, 120)}{c.quote.length > 120 ? "..." : ""}"</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white h-12 w-12"
            onClick={() => setSelectedSlideIdx((i) => Math.min(i + 1, slides.length - 1))}
            disabled={selectedSlideIdx === slides.length - 1}
          >
            <ChevronRight className="h-8 w-8" />
          </Button>
        </div>

        {/* Speaker notes panel */}
        {showNotes && currentSlide?.notes && (
          <div className="bg-black/60 backdrop-blur-sm border-t border-white/10 px-8 py-4 max-h-[25vh] overflow-y-auto">
            <p className="text-xs uppercase tracking-wider text-white/40 mb-2">Speaker Notes</p>
            <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{currentSlide.notes}</p>
          </div>
        )}

        {/* Progress bar */}
        <div className="h-1 bg-white/5">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((selectedSlideIdx + 1) / slides.length) * 100}%` }}
          />
        </div>
      </div>
    );
  }

  // ─── Editor Mode ───
  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-[280px_1fr] gap-6">
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!presentation) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">Presentation not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/presentations")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{presentation.title}</h1>
            {presentation.description && (
              <p className="text-sm text-muted-foreground">{presentation.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {slides.length === 0 && currentCaseId && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => generateMutation.mutate({ caseId: currentCaseId, presentationId: presId })}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Auto-Generate from Evidence
            </Button>
          )}
          {slides.length > 0 && (
            <>
              <Button variant="outline" className="gap-2" onClick={handleExportPdf}>
                <Download className="h-4 w-4" /> Export PDF
              </Button>
              <Button className="gap-2" onClick={() => setIsPresenting(true)}>
                <Play className="h-4 w-4" /> Present
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Generating overlay */}
      {generateMutation.isPending && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-6 flex items-center gap-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <div>
              <p className="font-medium text-foreground">Building your presentation...</p>
              <p className="text-sm text-muted-foreground">
                Analyzing findings, evidence, entities, and timeline to create courtroom-ready slides.
                This may take 15-30 seconds.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {slides.length === 0 && !generateMutation.isPending && (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center space-y-4">
            <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-8 w-8 text-primary/60" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground">No slides yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Click "Auto-Generate from Evidence" to build a complete presentation from your case data,
                or add slides manually.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              {currentCaseId && (
                <Button
                  className="gap-2"
                  onClick={() => generateMutation.mutate({ caseId: currentCaseId, presentationId: presId })}
                >
                  <Sparkles className="h-4 w-4" /> Auto-Generate
                </Button>
              )}
              <Button variant="outline" className="gap-2" onClick={() => setShowAddSlide(true)}>
                <Plus className="h-4 w-4" /> Add Manually
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Editor layout */}
      {slides.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          {/* Slide list sidebar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Slides ({slides.length})
              </span>
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setShowAddSlide(true)}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <ScrollArea className="h-[calc(100vh-240px)]">
              <div className="space-y-1.5 pr-2">
                {slides.map((slide, idx) => {
                  const config = SLIDE_TYPE_CONFIG[slide.slideType] || SLIDE_TYPE_CONFIG.custom;
                  const Icon = config.icon;
                  return (
                    <div
                      key={slide.id}
                      className={`group relative rounded-lg border p-3 cursor-pointer transition-all ${
                        idx === selectedSlideIdx
                          ? "border-primary/40 bg-primary/5"
                          : "border-border/50 hover:border-border"
                      }`}
                      onClick={() => setSelectedSlideIdx(idx)}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground mt-0.5 w-4 text-right shrink-0">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <Icon className={`h-3 w-3 shrink-0 ${config.color.split(" ")[1]}`} />
                            <span className="text-[10px] font-medium text-muted-foreground">{config.label}</span>
                          </div>
                          <p className="text-sm font-medium text-foreground truncate">
                            {slide.title || "Untitled"}
                          </p>
                        </div>
                        {/* Reorder + actions */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-0.5">
                          <button
                            className="h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
                            onClick={(e) => { e.stopPropagation(); moveSlide(idx, "up"); }}
                            disabled={idx === 0}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button
                            className="h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
                            onClick={(e) => { e.stopPropagation(); moveSlide(idx, "down"); }}
                            disabled={idx === slides.length - 1}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            {/* Re-generate button */}
            {currentCaseId && (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 mt-2"
                onClick={() => {
                  if (confirm("This will replace all existing slides. Continue?")) {
                    generateMutation.mutate({ caseId: currentCaseId, presentationId: presId });
                  }
                }}
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Regenerate All
              </Button>
            )}
          </div>

          {/* Main slide preview + editor */}
          <div className="space-y-4">
            {currentSlide && (
              <>
                {/* Slide preview card */}
                <Card className="overflow-hidden">
                  <div className="bg-[oklch(0.10_0.005_250)] p-8 min-h-[400px] flex flex-col justify-center">
                    {/* Type badge */}
                    {currentSlide.slideType !== "title" && (
                      <Badge variant="outline" className={`mb-4 w-fit ${SLIDE_TYPE_CONFIG[currentSlide.slideType]?.color || ""}`}>
                        {SLIDE_TYPE_CONFIG[currentSlide.slideType]?.label || currentSlide.slideType}
                      </Badge>
                    )}

                    <h2 className={`font-bold text-foreground leading-tight ${
                      currentSlide.slideType === "title" ? "text-4xl text-center" : "text-2xl"
                    }`}>
                      {currentSlide.title}
                    </h2>

                    {currentSlide.content && (
                      <div className={`mt-4 prose prose-invert max-w-none ${
                        currentSlide.layout === "full_quote" ? "text-xl italic border-l-4 border-primary pl-4 text-muted-foreground" : ""
                      }`}>
                        <Streamdown>{currentSlide.content}</Streamdown>
                      </div>
                    )}

                    {/* Citations */}
                    {citations && citations.length > 0 && (
                      <div className="mt-6 pt-3 border-t border-border/30 space-y-1.5">
                        {citations.map((c, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <FileText className="h-3 w-3 mt-0.5 shrink-0" />
                            <span>
                              <span className="font-medium">{c.documentName}</span>
                              {c.quote && <span className="italic ml-1">— "{c.quote.slice(0, 100)}{c.quote.length > 100 ? "..." : ""}"</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>

                {/* Action bar */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setEditingSlide(currentSlide)}
                  >
                    <Edit3 className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setShowRefine(true)}
                  >
                    <Wand2 className="h-3.5 w-3.5" /> Refine with AI
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm("Delete this slide?")) {
                        deleteSlideMutation.mutate({ id: currentSlide.id, presentationId: presId });
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                  <div className="flex-1" />
                  <Button size="sm" className="gap-1.5" onClick={() => setIsPresenting(true)}>
                    <Play className="h-3.5 w-3.5" /> Present
                  </Button>
                </div>

                {/* Speaker notes */}
                {currentSlide.notes && (
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                        <StickyNote className="h-3 w-3" /> Speaker Notes
                      </p>
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {currentSlide.notes}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Edit Slide Dialog */}
      <Dialog open={!!editingSlide} onOpenChange={(open) => !open && setEditingSlide(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Slide</DialogTitle>
          </DialogHeader>
          {editingSlide && (
            <EditSlideForm
              slide={editingSlide}
              onSave={(updates) => {
                updateSlideMutation.mutate({
                  id: editingSlide.id,
                  presentationId: presId,
                  ...updates,
                });
              }}
              isPending={updateSlideMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Add Slide Dialog */}
      <Dialog open={showAddSlide} onOpenChange={setShowAddSlide}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Slide</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Slide Type</label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(SLIDE_TYPE_CONFIG).map(([key, config]) => {
                  const Icon = config.icon;
                  return (
                    <button
                      key={key}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm transition-colors ${
                        newSlideType === key ? "border-primary bg-primary/10" : "border-border hover:border-border/80"
                      }`}
                      onClick={() => setNewSlideType(key)}
                    >
                      <Icon className="h-4 w-4" />
                      {config.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddSlide(false)}>Cancel</Button>
            <Button
              onClick={() => {
                addSlideMutation.mutate({
                  presentationId: presId,
                  orderIndex: slides.length,
                  slideType: newSlideType,
                  title: "New Slide",
                  content: "",
                  layout: "default",
                });
              }}
              disabled={addSlideMutation.isPending}
            >
              {addSlideMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Add Slide
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refine with AI Dialog */}
      <Dialog open={showRefine} onOpenChange={setShowRefine}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refine Slide with AI</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Describe how you'd like to improve this slide. The AI will rewrite the title, content, and notes.
            </p>
            <Textarea
              placeholder="e.g., Make the language more accessible, add more emphasis on the financial impact, simplify for a non-legal audience..."
              value={refineInstruction}
              onChange={(e) => setRefineInstruction(e.target.value)}
              rows={4}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRefine(false)}>Cancel</Button>
            <Button
              className="gap-2"
              onClick={() => {
                if (!currentSlide || !refineInstruction.trim()) return;
                refineMutation.mutate({
                  presentationId: presId,
                  slideId: currentSlide.id,
                  instruction: refineInstruction.trim(),
                });
              }}
              disabled={refineMutation.isPending || !refineInstruction.trim()}
            >
              {refineMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Refine
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Edit Slide Form ───
function EditSlideForm({
  slide,
  onSave,
  isPending,
}: {
  slide: SlideData;
  onSave: (updates: { title?: string; content?: string; notes?: string }) => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState(slide.title || "");
  const [content, setContent] = useState(slide.content || "");
  const [notes, setNotes] = useState(slide.notes || "");

  return (
    <div className="space-y-4 py-2">
      <div>
        <label className="text-sm font-medium text-foreground">Title</label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">Content (Markdown)</label>
        <Textarea value={content} onChange={(e) => setContent(e.target.value)} className="mt-1 font-mono text-sm" rows={8} />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">Speaker Notes</label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" rows={4} />
      </div>
      <DialogFooter>
        <Button
          onClick={() => onSave({ title, content, notes })}
          disabled={isPending}
          className="gap-2"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          <Save className="h-4 w-4" /> Save Changes
        </Button>
      </DialogFooter>
    </div>
  );
}
