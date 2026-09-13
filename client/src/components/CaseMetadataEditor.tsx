import { useRef, useState } from "react";
import { Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  buildCaseMetadataCorrection,
  type EditableCaseMetadata,
} from "@/lib/case-metadata-correction";

type CaseMetadataEditorProps = {
  caseId: number;
  metadata: EditableCaseMetadata;
};

export function CaseMetadataEditor({ caseId, metadata }: CaseMetadataEditorProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(metadata.name ?? "");
  const [description, setDescription] = useState(metadata.description ?? "");
  const [domain, setDomain] = useState(metadata.domain ?? "");
  const [container, setContainer] = useState(metadata.container ?? "");
  const openedWithMetadata = useRef(metadata);
  const utils = trpc.useUtils();

  const setDialogOpen = (nextOpen: boolean) => {
    if (nextOpen) {
      openedWithMetadata.current = metadata;
      setName(metadata.name ?? "");
      setDescription(metadata.description ?? "");
      setDomain(metadata.domain ?? "");
      setContainer(metadata.container ?? "");
    }
    setOpen(nextOpen);
  };

  const updateCase = trpc.cases.update.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.cases.get.invalidate({ id: caseId }),
        utils.cases.list.invalidate(),
      ]);
      setDialogOpen(false);
      toast.success(result.changed ? "Case details corrected." : "No case details changed.");
    },
    onError: (error) => {
      toast.error(error.message || "Could not update the case details.");
    },
  });

  const save = () => {
    const correctedName = name.trim();
    if (!correctedName) {
      toast.error("The case name cannot be blank.");
      return;
    }
    const correction = buildCaseMetadataCorrection(
      caseId,
      openedWithMetadata.current,
      { name: correctedName, description, domain, container },
    );
    updateCase.mutate(correction);
  };

  return (
    <Dialog open={open} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <Pencil className="h-3.5 w-3.5" />
          Edit details
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Correct case details</DialogTitle>
          <DialogDescription>
            These fields organize your workspace. Corrections are recorded in the audit trail and do not change preserved intake statements or uploaded source files.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="case-metadata-name">Case name</Label>
            <Input
              id="case-metadata-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={240}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="case-metadata-description">Workspace summary</Label>
            <Textarea
              id="case-metadata-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={40_000}
              rows={5}
              placeholder="A working summary of the case"
            />
            <p className="text-[10px] text-muted-foreground">
              This summary is editable metadata, not a replacement for the original intake record.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="case-metadata-domain">Domain</Label>
              <Input
                id="case-metadata-domain"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                maxLength={120}
                placeholder="e.g., housing"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="case-metadata-container">Reference or container</Label>
              <Input
                id="case-metadata-container"
                value={container}
                onChange={(event) => setContainer(event.target.value)}
                maxLength={240}
                placeholder="Optional case reference"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={updateCase.isPending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={updateCase.isPending || !name.trim()} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {updateCase.isPending ? "Saving…" : "Save corrections"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
