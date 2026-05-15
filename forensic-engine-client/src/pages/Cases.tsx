import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useLocation } from "wouter";
import { Plus, Briefcase, Trash2, Archive, Shield, Box } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Cases() {
  const { cases, setCurrentCaseId, currentCaseId } = useCase();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [domain, setDomain] = useState("");
  const [container, setContainer] = useState("");
  const utils = trpc.useUtils();

  const createCase = trpc.cases.create.useMutation({
    onSuccess: (data) => {
      toast.success("Case created");
      setCurrentCaseId(data.id);
      setOpen(false);
      setName("");
      setDescription("");
      setDomain("");
      setContainer("");
      utils.cases.list.invalidate();
      setLocation("/");
    },
  });

  const deleteCase = trpc.cases.delete.useMutation({
    onSuccess: () => {
      toast.success("Case deleted");
      utils.cases.list.invalidate();
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Cases</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your investigation cases — each case is a gated container</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Case
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Case</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-sm font-medium text-foreground">Case Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Maxwell 20 Cr. 330"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">
                  <span className="flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-primary" />
                    Domain Gate
                  </span>
                </label>
                <Input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="e.g., SDNY Criminal, State Family Court"
                  className="mt-1"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Jurisdictional domain — no cross-domain correlation allowed
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">
                  <span className="flex items-center gap-1.5">
                    <Box className="h-3.5 w-3.5 text-primary" />
                    Case Container
                  </span>
                </label>
                <Input
                  value={container}
                  onChange={(e) => setContainer(e.target.value)}
                  placeholder="e.g., Maxwell 20 Cr. 330, Epstein 08-80736"
                  className="mt-1"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Case identifier — no cross-container correlation allowed
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Description (optional)</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of the case..."
                  className="mt-1"
                  rows={3}
                />
              </div>
              <Button
                onClick={() => createCase.mutate({
                  name,
                  description: description || undefined,
                  domain: domain || undefined,
                  container: container || undefined,
                })}
                disabled={!name.trim() || createCase.isPending}
                className="w-full"
              >
                {createCase.isPending ? "Creating..." : "Create Case"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {!cases || cases.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
            <Briefcase className="h-10 w-10 text-muted-foreground" />
            <div>
              <h3 className="font-medium text-foreground">No cases yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Create your first case to start uploading and analyzing evidence.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {cases.map((c) => (
            <Card
              key={c.id}
              className={`cursor-pointer transition-colors hover:border-primary/30 ${c.id === currentCaseId ? "border-primary/50 bg-primary/5" : ""}`}
              onClick={() => {
                setCurrentCaseId(c.id);
                setLocation("/");
              }}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <Briefcase className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{c.name}</p>
                    {c.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{c.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {(c as any).domain && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                          <Shield className="h-2.5 w-2.5" />
                          {(c as any).domain}
                        </span>
                      )}
                      {(c as any).container && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-accent text-accent-foreground px-1.5 py-0.5 rounded">
                          <Box className="h-2.5 w-2.5" />
                          {(c as any).container}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Created {new Date(c.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {c.status === "archived" && (
                    <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Delete this case and all its data?")) {
                        deleteCase.mutate({ id: c.id });
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
