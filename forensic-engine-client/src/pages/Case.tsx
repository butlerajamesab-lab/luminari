/**
 * Case Page
 * 
 * Displays:
 * - Case details
 * - Matched workflow
 * - Action steps
 * - Contact entities
 * - Enforcement signals
 * 
 * Aligned with Kernel Truth:
 * - User-owned case data
 * - Source-grounded registry data
 * - Clear action pathways
 */

import { useParams, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Phone,
  AlertTriangle,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

const CATEGORY_LABELS: Record<string, string> = {
  housing: "Housing & Eviction",
  employment: "Employment & Wages",
  benefits: "Government Benefits",
  healthcare: "Healthcare & Insurance",
  disability: "Disability Rights",
  other: "General Advocacy",
};

const SIGNAL_PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-50 border-red-200 text-red-900",
  HIGH: "bg-orange-50 border-orange-200 text-orange-900",
  LOW: "bg-blue-50 border-blue-200 text-blue-900",
};

export default function Case() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [noteInput, setNoteInput] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);

  const caseQuery = trpc.luminari.getCase.useQuery(
    { case_id: parseInt(id || "0", 10) },
    { enabled: !!id && !!user }
  );

  const addNoteMutation = trpc.luminari.addNote.useMutation();
  const recordActionMutation = trpc.luminari.recordAction.useMutation();

  const handleAddNote = async () => {
    if (!noteInput.trim() || !id) return;

    setIsAddingNote(true);
    try {
      await addNoteMutation.mutateAsync({
        case_id: parseInt(id, 10),
        note: noteInput,
      });
      setNoteInput("");
      toast.success("Note added");
      caseQuery.refetch();
    } catch (err) {
      toast.error("Failed to add note");
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleRecordAction = async (actionType: string, description: string) => {
    if (!id) return;

    try {
      await recordActionMutation.mutateAsync({
        case_id: parseInt(id, 10),
        type: actionType,
        description,
      });
      toast.success("Action recorded");
      caseQuery.refetch();
    } catch (err) {
      toast.error("Failed to record action");
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Please log in to view your case.</p>
      </div>
    );
  }

  if (caseQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading your case...</p>
        </div>
      </div>
    );
  }

  if (caseQuery.isError || !caseQuery.data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">Case not found</p>
          <Button onClick={() => setLocation("/intake")}>Start new intake</Button>
        </div>
      </div>
    );
  }

  const { case: caseData, registry } = caseQuery.data;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 px-4 sm:px-6 py-4 sticky top-0 bg-background/95 backdrop-blur">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => setLocation("/")}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="inline">Back</span>
            </Button>
            <div className="h-4 w-px bg-border" />
            <div>
              <h1 className="text-lg font-semibold">
                {CATEGORY_LABELS[caseData.category] || "Your Case"}
              </h1>
              <p className="text-xs text-muted-foreground">
                {registry.jurisdiction.name} • Case #{caseData.id}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Critical signals */}
        {registry.signals && registry.signals.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Important alerts for your situation
            </h2>
            <div className="space-y-2">
              {registry.signals.map((signal: any) => (
                <Alert
                  key={signal.id}
                  className={`border-l-4 ${SIGNAL_PRIORITY_COLORS[signal.priority] || "bg-blue-50 border-blue-200"}`}
                >
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="ml-2">
                    <strong>{signal.signal_type}</strong>: {signal.action_description}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </div>
        )}

        {/* Workflow section */}
        {registry.workflow && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Your action plan
              </CardTitle>
              <CardDescription>{registry.workflow.workflow_name}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {registry.workflow.trigger_condition}
              </p>

              {/* Steps */}
              {registry.steps && registry.steps.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Steps to take:</h3>
                  <div className="space-y-2">
                    {registry.steps.map((step: any, index: number) => (
                      <div
                        key={step.id}
                        className="flex gap-3 p-3 rounded-lg border border-border/50 hover:border-border bg-card/50"
                      >
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                          {step.step_number}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{step.action}</p>
                          {step.deadline && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <Clock className="h-3 w-3" />
                              Deadline: {step.deadline}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleRecordAction("step_completed", `Completed: ${step.action}`)
                          }
                        >
                          <CheckCircle2 className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Contacts section */}
        {registry.contacts && registry.contacts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Who to contact
              </CardTitle>
              <CardDescription>
                Organizations that can help with your situation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {registry.contacts.map((contact: any) => (
                  <div
                    key={contact.id}
                    className="p-3 rounded-lg border border-border/50 hover:border-border bg-card/50"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium">{contact.entity_name}</p>
                        <Badge variant="outline" className="text-xs mt-1">
                          {contact.entity_type}
                        </Badge>
                      </div>
                      <Button variant="ghost" size="sm">
                        <Phone className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notes section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Your notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Add a note about your situation, actions taken, or next steps..."
              className="min-h-[100px]"
            />
            <Button
              onClick={handleAddNote}
              disabled={!noteInput.trim() || isAddingNote}
              className="w-full"
            >
              {isAddingNote ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Adding note...
                </>
              ) : (
                "Add note"
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Case info */}
        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-muted-foreground">Case created</p>
                <p className="font-medium">
                  {new Date(caseData.created_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <p className="font-medium capitalize">{caseData.status}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
