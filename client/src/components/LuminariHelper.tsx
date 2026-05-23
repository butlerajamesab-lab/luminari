import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/core/hooks/useAuth";
import {
  MessageCircleQuestion,
  X,
  Send,
  Lightbulb,
  Bug,
  HelpCircle,
  Heart,
  MessageSquare,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const FEEDBACK_TYPES = [
  { id: "question" as const, label: "Ask a Question", icon: HelpCircle, color: "text-blue-400" },
  { id: "suggestion" as const, label: "Suggestion", icon: Lightbulb, color: "text-amber-400" },
  { id: "bug_report" as const, label: "Report a Bug", icon: Bug, color: "text-red-400" },
  { id: "praise" as const, label: "Share Praise", icon: Heart, color: "text-pink-400" },
  { id: "other" as const, label: "Other", icon: MessageSquare, color: "text-muted-foreground" },
];

const QUICK_TIPS = [
  "Upload documents to start your forensic analysis. The engine extracts entities, quotes, and relationships automatically.",
  "Use the Timeline view to see events in chronological order — it helps spot gaps and contradictions.",
  "The Network Graph shows how entities are connected. Look for unexpected relationships.",
  "Export Reports generates a comprehensive PDF you can share with your attorney or advocate.",
  "The Document Checklist shows you exactly what documents to gather for your type of case.",
  "Ask the Evidence lets you query your documents in natural language — try asking specific questions.",
];

export function LuminariHelper() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<"menu" | "form" | "tips">("menu");
  const [feedbackType, setFeedbackType] = useState<typeof FEEDBACK_TYPES[number]["id"]>("question");
  const [message, setMessage] = useState("");
  const [tipIndex, setTipIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submitFeedback = trpc.feedback.submit.useMutation({
    onSuccess: () => {
      toast.success("Thank you! Your feedback has been received.");
      setMessage("");
      setView("menu");
    },
    onError: () => {
      toast.error("Failed to send feedback. Please try again.");
    },
  });

  useEffect(() => {
    if (view === "form" && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [view]);

  const handleSubmit = () => {
    if (!message.trim()) return;
    submitFeedback.mutate({
      feedbackType,
      message: message.trim(),
      currentPage: window.location.pathname,
    });
  };

  const nextTip = () => setTipIndex((i) => (i + 1) % QUICK_TIPS.length);

  if (!user) return null;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 flex items-center justify-center w-12 h-12 rounded-full shadow-lg transition-all duration-300 ${
          isOpen
            ? "bg-muted text-muted-foreground rotate-0"
            : "bg-primary text-primary-foreground hover:scale-110"
        }`}
        aria-label={isOpen ? "Close helper" : "Open helper"}
      >
        {isOpen ? <X className="h-5 w-5" /> : <MessageCircleQuestion className="h-5 w-5" />}
      </button>

      {/* Panel */}
      {isOpen && (
        <div className="fixed bottom-20 right-6 z-50 w-80 max-h-[28rem] rounded-xl border border-border/50 bg-card shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 fade-in duration-200">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border/50 bg-primary/5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Luminari Helper</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {view === "menu" && "How can I help you today?"}
              {view === "form" && `Send ${FEEDBACK_TYPES.find((t) => t.id === feedbackType)?.label}`}
              {view === "tips" && "Quick Tips"}
            </p>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-3">
            {/* Menu View */}
            {view === "menu" && (
              <div className="space-y-1.5">
                {FEEDBACK_TYPES.map((type) => {
                  const Icon = type.icon;
                  return (
                    <button
                      key={type.id}
                      onClick={() => {
                        setFeedbackType(type.id);
                        setView("form");
                      }}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left group"
                    >
                      <Icon className={`h-4 w-4 ${type.color} shrink-0`} />
                      <span className="text-sm group-hover:text-foreground">{type.label}</span>
                    </button>
                  );
                })}
                <div className="border-t border-border/30 my-2" />
                <button
                  onClick={() => {
                    setTipIndex(Math.floor(Math.random() * QUICK_TIPS.length));
                    setView("tips");
                  }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left group"
                >
                  <Lightbulb className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span className="text-sm group-hover:text-foreground">Quick Tips</span>
                </button>
              </div>
            )}

            {/* Form View */}
            {view === "form" && (
              <div className="space-y-3">
                {/* Type selector */}
                <div className="relative">
                  <select
                    value={feedbackType}
                    onChange={(e) => setFeedbackType(e.target.value as typeof feedbackType)}
                    className="w-full appearance-none bg-muted/30 border border-border/50 rounded-lg px-3 py-2 text-sm pr-8 focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {FEEDBACK_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>

                {/* Message */}
                <textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    feedbackType === "question"
                      ? "What would you like to know?"
                      : feedbackType === "suggestion"
                      ? "What would make Luminari better?"
                      : feedbackType === "bug_report"
                      ? "What went wrong? Steps to reproduce help a lot."
                      : feedbackType === "praise"
                      ? "What's working well for you?"
                      : "Tell us anything..."
                  }
                  className="w-full bg-muted/30 border border-border/50 rounded-lg px-3 py-2 text-sm resize-none h-28 focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/60"
                  maxLength={5000}
                />

                {/* Actions */}
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setView("menu"); setMessage(""); }}
                    className="text-xs"
                  >
                    Back
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={!message.trim() || submitFeedback.isPending}
                    className="text-xs gap-1.5"
                  >
                    <Send className="h-3 w-3" />
                    {submitFeedback.isPending ? "Sending..." : "Send"}
                  </Button>
                </div>
              </div>
            )}

            {/* Tips View */}
            {view === "tips" && (
              <div className="space-y-3">
                <div className="bg-primary/5 border border-primary/10 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <Lightbulb className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <p className="text-sm leading-relaxed">{QUICK_TIPS[tipIndex]}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setView("menu")}
                    className="text-xs"
                  >
                    Back
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={nextTip}
                    className="text-xs"
                  >
                    Next Tip
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Tip {tipIndex + 1} of {QUICK_TIPS.length}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
