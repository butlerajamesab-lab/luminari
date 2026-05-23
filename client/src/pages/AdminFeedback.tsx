import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MessageCircle, HelpCircle, Lightbulb, Bug, Heart, MoreHorizontal,
  Clock, CheckCircle2, Archive, ChevronLeft, User, Filter,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

const TYPE_CONFIG: Record<string, { icon: any; label: string; color: string }> = {
  question: { icon: HelpCircle, label: "Question", color: "text-blue-400" },
  suggestion: { icon: Lightbulb, label: "Suggestion", color: "text-amber-400" },
  bug_report: { icon: Bug, label: "Bug Report", color: "text-red-400" },
  praise: { icon: Heart, label: "Praise", color: "text-pink-400" },
  other: { icon: MoreHorizontal, label: "Other", color: "text-muted-foreground" },
};

const STATUS_CONFIG: Record<string, { icon: any; label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  new: { icon: Clock, label: "New", variant: "default" },
  reviewed: { icon: CheckCircle2, label: "Reviewed", variant: "secondary" },
  resolved: { icon: CheckCircle2, label: "Resolved", variant: "outline" },
  archived: { icon: Archive, label: "Archived", variant: "outline" },
};

export default function AdminFeedback() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: feedbackList, refetch } = trpc.feedback.list.useQuery({ limit: 100 }, {
    enabled: user?.role === "admin",
  });

  const updateStatus = trpc.feedback.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Status updated");
      refetch();
    },
  });

  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-8 pb-6 text-center space-y-3">
            <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto" />
            <h2 className="text-lg font-semibold">Admin Access Required</h2>
            <p className="text-sm text-muted-foreground">
              You need admin privileges to view the feedback dashboard.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filtered = feedbackList?.filter((f: any) =>
    statusFilter === "all" ? true : f.status === statusFilter
  ) || [];

  const counts = {
    all: feedbackList?.length || 0,
    new: feedbackList?.filter((f: any) => f.status === "new").length || 0,
    reviewed: feedbackList?.filter((f: any) => f.status === "reviewed").length || 0,
    resolved: feedbackList?.filter((f: any) => f.status === "resolved").length || 0,
    archived: feedbackList?.filter((f: any) => f.status === "archived").length || 0,
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Feedback Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Review and manage user feedback, suggestions, and bug reports
            </p>
          </div>
        </div>

        {/* Summary cards — counts.new, counts.reviewed, counts.resolved, counts.archived */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {Object.entries(counts).map(([key, count]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`rounded-lg border p-3 text-center transition-colors ${
                statusFilter === key
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/30"
              }`}
            >
              <div className="text-xl font-bold">{count}</div>
              <div className="text-[10px] text-muted-foreground capitalize">{key}</div>
            </button>
          ))}
        </div>

        {/* Feedback list */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Filter className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {statusFilter === "all"
                    ? "No feedback received yet. The Luminari Helper widget collects user feedback."
                    : `No ${statusFilter} feedback items.`}
                </p>
              </CardContent>
            </Card>
          ) : (
            filtered.map((item: any) => {
              const typeConf = TYPE_CONFIG[item.type] || TYPE_CONFIG.other;
              const statusConf = STATUS_CONFIG[item.status] || STATUS_CONFIG.new;
              const TypeIcon = typeConf.icon;
              const StatusIcon = statusConf.icon;

              return (
                <Card key={item.id} className="hover:border-primary/20 transition-colors">
                  <CardContent className="py-4 px-5">
                    <div className="flex items-start gap-3">
                      <TypeIcon className={`h-5 w-5 mt-0.5 shrink-0 ${typeConf.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge variant={statusConf.variant} className="text-[9px] gap-1">
                            <StatusIcon className="h-2.5 w-2.5" />
                            {statusConf.label}
                          </Badge>
                          <Badge variant="outline" className="text-[9px]">
                            {typeConf.label}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(item.createdAt).toLocaleDateString()} at{" "}
                            {new Date(item.createdAt).toLocaleTimeString()}
                          </span>
                        </div>

                        <p className="text-sm mt-2 whitespace-pre-wrap">{item.message}</p>

                        {item.email && (
                          <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-foreground">
                            <User className="h-3 w-3" />
                            <a href={`mailto:${item.email}`} className="hover:text-primary transition-colors">
                              {item.email}
                            </a>
                          </div>
                        )}

                        {/* Status actions */}
                        <div className="flex items-center gap-1.5 mt-3">
                          {item.status !== "reviewed" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[10px] gap-1"
                              onClick={() => updateStatus.mutate({ feedbackId: item.id, status: "reviewed" })}
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Mark Reviewed
                            </Button>
                          )}
                          {item.status !== "resolved" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[10px] gap-1"
                              onClick={() => updateStatus.mutate({ feedbackId: item.id, status: "resolved" })}
                            >
                              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                              Resolve
                            </Button>
                          )}
                          {item.status === "new" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[10px] gap-1 text-muted-foreground"
                              onClick={() => updateStatus.mutate({ feedbackId: item.id, status: "new" })}
                            >
                              <Clock className="h-3 w-3" />
                              Reset
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
