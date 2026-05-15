import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { Send, Loader2, MessageSquare, Bot, User } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import ReadAloud from "@/components/ReadAloud";

export default function Chat() {
  const { currentCaseId } = useCase();
  const [, setLocation] = useLocation();
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: history, isLoading } = trpc.chat.history.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId, refetchInterval: 5000 }
  );

  const sendMessage = trpc.chat.send.useMutation({
    onSuccess: () => {
      setMessage("");
      utils.chat.history.invalidate();
    },
  });

  const utils = trpc.useUtils();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  if (!currentCaseId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-muted-foreground">Select a case first</p>
        <Button variant="outline" onClick={() => setLocation("/cases")}>Manage Cases</Button>
      </div>
    );
  }

  const handleSend = () => {
    if (!message.trim() || sendMessage.isPending) return;
    sendMessage.mutate({ caseId: currentCaseId, message: message.trim() });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" />
          Ask the Evidence
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ask questions about your case. Every response cites specific documents and quotes.
        </p>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : history && history.length > 0 ? (
          history.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <Card className={`max-w-[80%] ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card"
              }`}>
                <CardContent className="p-3">
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  {msg.role === "assistant" && (
                    <div className="mt-2 pt-2 border-t border-border/30">
                      <ReadAloud text={msg.content} label="Listen" />
                    </div>
                  )}
                </CardContent>
              </Card>
              {msg.role === "user" && (
                <div className="shrink-0 h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Bot className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="font-medium text-foreground">No messages yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Ask a question about your case evidence. For example:
            </p>
            <div className="mt-4 space-y-2">
              {[
                "What are the key findings in this case?",
                "Who are the main entities and how are they connected?",
                "Are there any contradictions between documents?",
                "What does the timeline of events show?",
              ].map((q) => (
                <Button
                  key={q}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setMessage(q);
                    inputRef.current?.focus();
                  }}
                >
                  {q}
                </Button>
              ))}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-border pt-4">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask a question about your evidence..."
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={sendMessage.isPending}
          />
          <Button
            onClick={handleSend}
            disabled={!message.trim() || sendMessage.isPending}
            className="gap-2"
          >
            {sendMessage.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        {sendMessage.isPending && (
          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            Analyzing evidence and generating response...
          </p>
        )}
      </div>
    </div>
  );
}
