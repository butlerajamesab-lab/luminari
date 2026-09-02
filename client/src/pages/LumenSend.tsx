/**
 * LumenSend — Document Generation & Delivery
 *
 * Generates pre-filled letters, complaints, appeals, and applications
 * from Luminari's registry data. Surfaces eligibility warnings before sending.
 */
import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useWorldIndex } from "@/hooks/useWorldIndex";
import { useAuth } from "@/core/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

import {
  Send, FileText, Printer, Copy, AlertTriangle, Shield,
  ChevronRight, Clock, CheckCircle, ArrowLeft, Loader2,
  Info, Zap, Eye, Edit3, Trash2, MailOpen,
} from "lucide-react";

// ─── State Code List ───
const US_STATES = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" }, { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" }, { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" }, { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" }, { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" },
  { code: "AS", name: "American Samoa" }, { code: "GU", name: "Guam" }, { code: "MP", name: "Northern Mariana Islands" },
  { code: "PR", name: "Puerto Rico" }, { code: "VI", name: "U.S. Virgin Islands" },
];

const DOC_TYPES = [
  { value: "appeal", label: "Appeal Letter", icon: Shield, desc: "Appeal a denied benefit, claim, or decision" },
  { value: "complaint", label: "Formal Complaint", icon: AlertTriangle, desc: "File a complaint with an oversight body" },
  { value: "foia", label: "FOIA Request", icon: FileText, desc: "Freedom of Information Act request to a government agency" },
  { value: "inquiry", label: "Inquiry Letter", icon: Info, desc: "Request information or status on a matter" },
  { value: "application", label: "Application Cover Letter", icon: FileText, desc: "Cover letter for a program application" },
  { value: "follow_up", label: "Follow-Up Letter", icon: Clock, desc: "Follow up on a previous submission" },
  { value: "demand", label: "Demand Letter", icon: Zap, desc: "Demand action on an unresolved matter" },
  { value: "notice", label: "Notice Letter", icon: MailOpen, desc: "Formal notice of intent or action" },
];

const CONTEXT_TYPES = [
  { value: "registry_program", label: "Registry Program" },
  { value: "oversight_body", label: "Oversight Body" },
  { value: "cda_denial", label: "Claim Denial" },
  { value: "case_repair", label: "Case Repair" },
  { value: "docket_entry", label: "Docket Entry" },
  { value: "manual", label: "Manual / Custom" },
];

// ─── Pre-Flight Warning Component ───
function PreFlightPanel({ warnings }: { warnings: Array<{ type: string; severity: string; title: string; description: string }> }) {
  if (!warnings.length) return null;
  const severityColors: Record<string, string> = {
    critical: "border-red-500/50 bg-red-500/10 text-red-400",
    warning: "border-amber-500/50 bg-amber-500/10 text-amber-400",
    info: "border-primary/30 bg-primary/5 text-primary",
  };
  const severityIcons: Record<string, typeof AlertTriangle> = {
    critical: AlertTriangle,
    warning: Shield,
    info: Info,
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Shield className="w-4 h-4 text-amber-400" />
        Pre-Flight Check — Read Before Sending
      </h3>
      {warnings.map((w, i) => {
        const Icon = severityIcons[w.severity] || Info;
        return (
          <div key={i} className={`rounded-lg border p-3 ${severityColors[w.severity] || severityColors.info}`}>
            <div className="flex items-start gap-2">
              <Icon className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">{w.title}</p>
                <p className="text-xs mt-1 opacity-80">{w.description}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Compose Form ───
interface ComposeFormProps {
  onDraftCreated: (id: number) => void;
  initialDocType?: string | null;
  initialState?: string | null;
  initialContext?: string | null;
  initialProgramId?: string | null;
  initialOversight?: string | null;
}

function ComposeForm({ onDraftCreated, initialDocType, initialState, initialContext, initialProgramId, initialOversight }: ComposeFormProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<"type" | "context" | "compose" | "preflight">(
    initialDocType ? "context" : "type"
  );
  const [docType, setDocType] = useState(initialDocType || "");
  const [contextType, setContextType] = useState(initialContext || "");
  const [stateCode, setStateCode] = useState(initialState || "WA");
  const [selectedProgram, setSelectedProgram] = useState(initialProgramId || "");
  const [selectedOversight, setSelectedOversight] = useState(initialOversight || "");
  const [senderName, setSenderName] = useState(user?.name || "");
  const [senderAddress, setSenderAddress] = useState("");
  const [senderEmail, setSenderEmail] = useState(user?.email || "");
  const [senderPhone, setSenderPhone] = useState("");
  const [situation, setSituation] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");

  // Load programs/oversight for selected state
  const { data: programsRaw } = trpc.lumensend.context.programs.useQuery(
    { stateCode: stateCode },
    { enabled: Boolean(user) && !!stateCode && (contextType === "registry_program"), retry: false }
  );
  const { data: oversightRaw } = trpc.lumensend.context.oversightBodies.useQuery(
    { stateCode: stateCode },
    { enabled: Boolean(user) && !!stateCode && (contextType === "oversight_body"), retry: false }
  );
  // World Index fallback: if JSON-based context returns empty, use world index nodes
  const worldIndex = useWorldIndex();
  const programs = useMemo(() => {
    if (programsRaw && programsRaw.length > 0) return programsRaw;
    const wiPrograms = (worldIndex.nodesByType["program"] ?? []).filter(
      p => p.jurisdiction === stateCode
    );
    if (wiPrograms.length === 0) return programsRaw ?? [];
    return wiPrograms.map(p => ({
      id: p.id,
      name: (p.metadata as any)?.name || p.id,
      agency: (p.metadata as any)?.agency || "Unknown",
      category: (p.metadata as any)?.category || "General",
      eligibility: (p.metadata as any)?.eligibility || null,
      phone: (p.metadata as any)?.phone || null,
    }));
  }, [programsRaw, worldIndex.nodesByType, stateCode]);
  const oversight = useMemo(() => {
    if (oversightRaw && oversightRaw.length > 0) return oversightRaw;
    const wiAgencies = (worldIndex.nodesByType["agency"] ?? []).filter(
      a => a.jurisdiction === stateCode
    );
    if (wiAgencies.length === 0) return oversightRaw ?? [];
    return wiAgencies.map(a => ({
      name: (a.metadata as any)?.name || a.id,
      jurisdiction: a.jurisdiction || stateCode,
      phone: (a.metadata as any)?.phone || null,
      address: (a.metadata as any)?.address || "",
      whatToReport: (a.metadata as any)?.function || "",
    }));
  }, [oversightRaw, worldIndex.nodesByType, stateCode]);

  // Pre-flight check
  const { data: preflightData, isLoading: preflightLoading } = trpc.lumensend.preflight.useQuery(
    {
      stateCode,
      documentType: docType as any,
      contextType: contextType as any,
      programId: selectedProgram || undefined,
      oversightBody: selectedOversight || undefined,
      userSituation: situation || undefined,
    },
    { enabled: Boolean(user) && step === "preflight" && !!docType && !!contextType, retry: false }
  );

  // Generate letter
  const generateMutation = trpc.lumensend.generate.useMutation({
    onSuccess: (data) => {
      toast.success("Letter generated — your draft is ready for review.");
      onDraftCreated(data.draftId);
    },
    onError: (err) => {
      toast.error("Generation failed", { description: err.message });
    },
  });

  const handleGenerate = () => {
    if (!user) {
      toast.info("Public walkthrough mode", {
        description: "Sign in when you are ready to generate and save a real draft.",
      });
      return;
    }
    generateMutation.mutate({
      stateCode,
      documentType: docType as any,
      contextType: contextType as any,
      programId: selectedProgram || undefined,
      oversightBody: selectedOversight || undefined,
      senderName,
      senderAddress: senderAddress || undefined,
      senderEmail: senderEmail || undefined,
      senderPhone: senderPhone || undefined,
      situation,
      additionalContext: additionalContext || undefined,
    });
  };

  // Step 1: Choose document type
  if (step === "type") {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">What do you need to send?</h2>
        <p className="text-sm text-muted-foreground">Choose the type of document. LumenSend will generate it pre-filled with the correct agency info, statutory references, and protective language.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {DOC_TYPES.map((dt) => {
            const Icon = dt.icon;
            return (
              <button
                key={dt.value}
                onClick={() => { setDocType(dt.value); setStep("context"); }}
                className={`text-left p-4 rounded-lg border transition-all hover:border-primary/50 hover:bg-primary/5 ${
                  docType === dt.value ? "border-primary bg-primary/10" : "border-border"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{dt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{dt.desc}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Step 2: Choose context
  if (step === "context") {
    return (
      <div className="space-y-4">
        <button onClick={() => setStep("type")} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Back
        </button>
        <h2 className="text-lg font-semibold text-foreground">What is this about?</h2>
        <p className="text-sm text-muted-foreground">Select the context so LumenSend can pull the right agency info and eligibility data.</p>

        <div className="space-y-3">
          <label className="text-sm font-medium text-foreground">Jurisdiction</label>
          <Select value={stateCode} onValueChange={setStateCode}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {US_STATES.map(s => (
                <SelectItem key={s.code} value={s.code}>{s.name} ({s.code})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-medium text-foreground">Context Type</label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {CONTEXT_TYPES.map(ct => (
              <button
                key={ct.value}
                onClick={() => setContextType(ct.value)}
                className={`text-left p-3 rounded-lg border text-sm transition-all hover:border-primary/50 ${
                  contextType === ct.value ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"
                }`}
              >
                {ct.label}
              </button>
            ))}
          </div>
        </div>

        {/* Program selector */}
        {contextType === "registry_program" && programs && programs.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Select Program</label>
            <Select value={selectedProgram} onValueChange={setSelectedProgram}>
              <SelectTrigger><SelectValue placeholder="Choose a program..." /></SelectTrigger>
              <SelectContent>
                {programs.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name} — {p.agency}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Oversight body selector */}
        {contextType === "oversight_body" && oversight && oversight.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Select Oversight Body</label>
            <Select value={selectedOversight} onValueChange={setSelectedOversight}>
              <SelectTrigger><SelectValue placeholder="Choose an oversight body..." /></SelectTrigger>
              <SelectContent>
                {oversight.map(b => (
                  <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Button
          onClick={() => setStep("compose")}
          disabled={!contextType}
          className="w-full"
        >
          Continue <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    );
  }

  // Step 3: Compose details
  if (step === "compose") {
    return (
      <div className="space-y-4">
        <button onClick={() => setStep("context")} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Back
        </button>
        <h2 className="text-lg font-semibold text-foreground">Describe your situation</h2>
        <p className="text-sm text-muted-foreground">LumenSend will generate a professional letter with the correct statutory references, agency details, and protective language.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Your Name</label>
            <Input value={senderName} onChange={e => setSenderName(e.target.value)} placeholder="Full name" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Your Email</label>
            <Input value={senderEmail} onChange={e => setSenderEmail(e.target.value)} placeholder="email@example.com" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Your Phone (optional)</label>
            <Input value={senderPhone} onChange={e => setSenderPhone(e.target.value)} placeholder="(555) 123-4567" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Your Address (optional)</label>
            <Input value={senderAddress} onChange={e => setSenderAddress(e.target.value)} placeholder="123 Main St, City, ST 12345" />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Situation *</label>
          <Textarea
            value={situation}
            onChange={e => setSituation(e.target.value)}
            placeholder="Describe what happened, what you need, and any relevant dates or reference numbers..."
            rows={5}
          />
          <p className="text-xs text-muted-foreground">{situation.length}/5000 characters</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Additional Context (optional)</label>
          <Textarea
            value={additionalContext}
            onChange={e => setAdditionalContext(e.target.value)}
            placeholder="Any case numbers, dates, names, or documents you want referenced..."
            rows={3}
          />
        </div>

        <Button
          onClick={() => setStep("preflight")}
          disabled={!senderName || !situation || situation.length < 10}
          className="w-full"
        >
          Run Pre-Flight Check <Shield className="w-4 h-4 ml-1" />
        </Button>
      </div>
    );
  }

  // Step 4: Pre-flight + Generate
  if (step === "preflight") {
    return (
      <div className="space-y-4">
        <button onClick={() => setStep("compose")} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Back to edit
        </button>

        {preflightLoading ? (
          <div className="flex items-center gap-3 p-6 justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Running pre-flight eligibility check...</span>
          </div>
        ) : (
          <PreFlightPanel warnings={preflightData?.warnings ?? []} />
        )}

        <div className="border-t border-border pt-4">
          <p className="text-sm text-muted-foreground mb-3">
            Review the warnings above. When ready, generate your letter. You can edit it before sending.
          </p>
          <Button
            onClick={handleGenerate}
            disabled={generateMutation.isPending}
            className="w-full"
            size="lg"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating letter...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Generate Letter
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}

// ─── Draft Preview & Delivery ───
function DraftView({ draftId, onBack }: { draftId: number; onBack: () => void }) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState("");
  const [editSubject, setEditSubject] = useState("");

  const { data: draft, isLoading } = trpc.lumensend.drafts.get.useQuery({ id: draftId });

  const updateMutation = trpc.lumensend.drafts.update.useMutation({
    onSuccess: () => {
      toast.success("Draft updated");
      setEditing(false);
      utils.lumensend.drafts.get.invalidate({ id: draftId });
    },
  });

  const markSentMutation = trpc.lumensend.drafts.markSent.useMutation({
    onSuccess: () => {
      toast.success("Marked as sent");
      utils.lumensend.drafts.get.invalidate({ id: draftId });
      utils.lumensend.drafts.list.invalidate();
    },
  });

  const deleteMutation = trpc.lumensend.drafts.delete.useMutation({
    onSuccess: () => {
      toast.success("Draft deleted");
      utils.lumensend.drafts.list.invalidate();
      onBack();
    },
  });

  if (isLoading || !draft) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
    markSentMutation.mutate({ id: draftId, method: "copy" });
    toast.success("Copied to clipboard", { description: "Paste into your email client or portal." });
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <html><head><title>${draft.subject}</title>
        <style>body{font-family:Georgia,serif;max-width:700px;margin:40px auto;padding:20px;line-height:1.6;color:#111}
        h1{font-size:16px;margin-bottom:24px}pre{white-space:pre-wrap;font-family:Georgia,serif;font-size:14px}</style>
        </head><body><h1>${draft.subject}</h1><pre>${draft.body}</pre></body></html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
    markSentMutation.mutate({ id: draftId, method: "print" });
  };

  const startEdit = () => {
    setEditSubject(draft.subject);
    setEditBody(draft.body);
    setEditing(true);
  };

  const saveEdit = () => {
    updateMutation.mutate({ id: draftId, subject: editSubject, body: editBody });
  };

  const isSent = draft.status === "sent" || draft.status === "printed" || draft.status === "copied";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Back to drafts
        </button>
        <div className="flex items-center gap-2">
          {isSent && (
            <Badge variant="outline" className="border-green-500/50 text-green-400">
              <CheckCircle className="w-3 h-3 mr-1" />
              {draft.sentMethod === "copy" ? "Copied" : draft.sentMethod === "print" ? "Printed" : "Sent"}
            </Badge>
          )}
          <Badge variant="outline">{draft.documentType}</Badge>
        </div>
      </div>

      {/* Recipient info */}
      <Card className="bg-card border-border">
        <CardContent className="p-4 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">To:</span>{" "}
              <span className="text-foreground">{draft.recipientAgency || "Not specified"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Contact:</span>{" "}
              <span className="text-foreground">{draft.recipientName || "To Whom It May Concern"}</span>
            </div>
            {draft.recipientAddress && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Address:</span>{" "}
                <span className="text-foreground">{draft.recipientAddress}</span>
              </div>
            )}
            {draft.recipientEmail && (
              <div>
                <span className="text-muted-foreground">Email:</span>{" "}
                <span className="text-foreground">{draft.recipientEmail}</span>
              </div>
            )}
            {draft.recipientPhone && (
              <div>
                <span className="text-muted-foreground">Phone:</span>{" "}
                <span className="text-foreground">{draft.recipientPhone}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Letter content */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          {editing ? (
            <Input value={editSubject} onChange={e => setEditSubject(e.target.value)} className="text-lg font-semibold" />
          ) : (
            <CardTitle className="text-base">{draft.subject}</CardTitle>
          )}
        </CardHeader>
        <CardContent>
          {editing ? (
            <Textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={20} className="font-mono text-sm" />
          ) : (
            <pre className="whitespace-pre-wrap text-sm text-foreground font-sans leading-relaxed">{draft.body}</pre>
          )}
        </CardContent>
      </Card>

      {/* Dispatch Bundle — Related Actions */}
      {draft.relatedActions && (() => {
        try {
          const actions = JSON.parse(draft.relatedActions);
          if (!Array.isArray(actions) || actions.length === 0) return null;
          return (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  Dispatch Bundle — Related Actions
                </CardTitle>
                <CardDescription className="text-xs">
                  The system identified these interconnected agencies and programs. Consider sending coordinated documents for maximum effect.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {actions.map((action: { documentType: string; recipientAgency: string; description: string }, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary/30 transition-all">
                    <div className="w-8 h-8 rounded-md bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Send className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{action.recipientAgency}</p>
                        <Badge variant="outline" className="text-xs">{action.documentType}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{action.description}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 text-xs"
                      onClick={() => {
                        toast("Dispatch bundle", { description: `Opening compose form for ${action.recipientAgency}...` });
                      }}
                    >
                      <Send className="w-3 h-3 mr-1" /> Draft
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        } catch { return null; }
      })()}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {editing ? (
          <>
            <Button onClick={saveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
              Save Changes
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </>
        ) : (
          <>
            <Button onClick={handleCopy} variant="outline">
              <Copy className="w-4 h-4 mr-1" /> Copy to Clipboard
            </Button>
            <Button onClick={handlePrint} variant="outline">
              <Printer className="w-4 h-4 mr-1" /> Print
            </Button>
            <Button onClick={startEdit} variant="outline">
              <Edit3 className="w-4 h-4 mr-1" /> Edit
            </Button>
            <Button onClick={() => deleteMutation.mutate({ id: draftId })} variant="outline" className="text-destructive hover:text-destructive">
              <Trash2 className="w-4 h-4 mr-1" /> Delete
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Drafts List ───
function DraftsList({ onSelectDraft, onCompose }: { onSelectDraft: (id: number) => void; onCompose: () => void }) {
  const { user } = useAuth();
  const { data: queriedDrafts, isLoading } = trpc.lumensend.drafts.list.useQuery({}, {
    enabled: Boolean(user),
    retry: false,
  });
  const drafts = user ? queriedDrafts : undefined;

  const statusColors: Record<string, string> = {
    draft: "bg-amber-500/20 text-amber-400",
    ready: "bg-primary/20 text-primary",
    sent: "bg-green-500/20 text-green-400",
    printed: "bg-green-500/20 text-green-400",
    copied: "bg-green-500/20 text-green-400",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Your Drafts</h2>
          <p className="text-sm text-muted-foreground">Letters and documents you've generated</p>
        </div>
        <Button onClick={onCompose}>
          <Send className="w-4 h-4 mr-1" /> New Letter
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : !drafts || drafts.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center">
            <Send className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-foreground font-medium">No drafts yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create your first letter to get started.</p>
            <Button onClick={onCompose} className="mt-4">
              <Send className="w-4 h-4 mr-1" /> Compose a Letter
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {drafts.map((d: any) => (
            <button
              key={d.id}
              onClick={() => onSelectDraft(d.id)}
              className="w-full text-left p-4 rounded-lg border border-border hover:border-primary/40 transition-all bg-card"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{d.subject || "Untitled Draft"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    To: {d.recipientAgency || "Not specified"} · {d.jurisdiction || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0">
                  <Badge className={statusColors[d.status] || statusColors.draft} variant="outline">
                    {d.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(d.createdAt).toLocaleDateString()}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───
export default function LumenSendPage() {
  const { user } = useAuth();
  const [view, setView] = useState<"list" | "compose" | "draft">("list");
  const [selectedDraftId, setSelectedDraftId] = useState<number | null>(null);
  const [initialDocType, setInitialDocType] = useState<string | null>(null);
  const [initialState, setInitialState] = useState<string | null>(null);
  const [initialContext, setInitialContext] = useState<string | null>(null);
  const [initialProgramId, setInitialProgramId] = useState<string | null>(null);
  const [initialOversight, setInitialOversight] = useState<string | null>(null);

  // Parse URL parameters for deep-linking from Lighthouse / Civic Map / etc.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get("type") || params.get("actionType");
    const state = params.get("state");
    const ctx = params.get("context");
    const pid = params.get("programId");
    const ob = params.get("oversight");
    const docType = params.get("documentType");
    if (type) {
      setInitialDocType(type);
      setView("compose");
    }
    if (state) setInitialState(state);
    if (ctx) setInitialContext(ctx);
    if (pid) setInitialProgramId(pid);
    if (ob) setInitialOversight(ob);
    if (docType) {
      setInitialDocType(docType);
      setView("compose");
    }
    // Clean URL params after reading
    if (type || state || ctx || pid || ob || docType) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Send className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">LumenSend</h1>
              <p className="text-sm text-muted-foreground">Generate and deliver documents that work the system as it was designed.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {!user && (
          <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Public walkthrough mode: explore the complete composer; generating or saving a draft still requires the owner session.
          </div>
        )}
        {view === "list" && (
          <DraftsList
            onSelectDraft={(id) => { setSelectedDraftId(id); setView("draft"); }}
            onCompose={() => setView("compose")}
          />
        )}
        {view === "compose" && (
          <div>
            <button onClick={() => setView("list")} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4">
              <ArrowLeft className="w-3 h-3" /> Back to drafts
            </button>
            <ComposeForm
              onDraftCreated={(id) => { setSelectedDraftId(id); setView("draft"); }}
              initialDocType={initialDocType}
              initialState={initialState}
              initialContext={initialContext}
              initialProgramId={initialProgramId}
              initialOversight={initialOversight}
            />
          </div>
        )}
        {view === "draft" && selectedDraftId && (
          <DraftView draftId={selectedDraftId} onBack={() => { setSelectedDraftId(null); setView("list"); }} />
        )}
      </div>
    </div>
  );
}
