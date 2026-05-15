import { useState } from "react";
import { useLocation } from "wouter";
import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  Presentation,
  Plus,
  MoreVertical,
  Trash2,
  Edit3,
  Play,
  Clock,
  Layers,
  Sparkles,
  Loader2,
  ArrowLeft,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

export default function Presentations() {
  const { currentCaseId, currentCase } = useCase();
  const [, setLocation] = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const { data: presentations, isLoading } = trpc.presentations.list.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId }
  );

  const utils = trpc.useUtils();

  const createMutation = trpc.presentations.create.useMutation({
    onSuccess: (data) => {
      utils.presentations.list.invalidate();
      setShowCreate(false);
      setNewTitle("");
      setNewDesc("");
      toast.success("Presentation created");
      setLocation(`/presentations/${data.id}`);
    },
    onError: () => toast.error("Failed to create presentation"),
  });

  const deleteMutation = trpc.presentations.delete.useMutation({
    onSuccess: () => {
      utils.presentations.list.invalidate();
      toast.success("Presentation deleted");
    },
    onError: () => toast.error("Failed to delete presentation"),
  });

  const handleCreate = () => {
    if (!currentCaseId || !newTitle.trim()) return;
    createMutation.mutate({
      caseId: currentCaseId,
      title: newTitle.trim(),
      description: newDesc.trim() || undefined,
    });
  };

  if (!currentCaseId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">Select a case first.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Presentation className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Presentations</h1>
            <p className="text-sm text-muted-foreground">
              Build courtroom-ready slide decks from your case evidence
            </p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Presentation
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-5 space-y-3">
                <div className="h-5 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/2" />
                <div className="h-3 bg-muted rounded w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !presentations?.length ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center space-y-4">
            <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Presentation className="h-8 w-8 text-primary/60" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-foreground">No presentations yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Create a presentation to organize your findings into a compelling narrative.
                The AI can auto-generate slides from your case evidence.
              </p>
            </div>
            <Button onClick={() => setShowCreate(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Your First Presentation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {presentations.map((pres) => (
            <Card
              key={pres.id}
              className="group cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => setLocation(`/presentations/${pres.id}`)}
            >
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground truncate">{pres.title}</h3>
                    {pres.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {pres.description}
                      </p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setLocation(`/presentations/${pres.id}`); }}>
                        <Edit3 className="h-4 w-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setLocation(`/presentations/${pres.id}?mode=present`); }}>
                        <Play className="h-4 w-4 mr-2" /> Present
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Delete this presentation?")) {
                            deleteMutation.mutate({ id: pres.id });
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Layers className="h-3 w-3" />
                    {pres.slideCount} slide{pres.slideCount !== 1 ? "s" : ""}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(pres.updatedAt).toLocaleDateString()}
                  </span>
                </div>

                {/* Theme badge */}
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                    {pres.theme || "courtroom"}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Presentation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-foreground">Title</label>
              <Input
                placeholder="e.g., Case Summary for Mediation"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="mt-1"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Description (optional)</label>
              <Textarea
                placeholder="Brief description of this presentation's purpose..."
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!newTitle.trim() || createMutation.isPending}
              className="gap-2"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
