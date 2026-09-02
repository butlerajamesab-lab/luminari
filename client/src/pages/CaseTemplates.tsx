import { trpc } from "@/lib/trpc";
import { useAuth } from "@/core/hooks/useAuth";
import { PublicWalkthroughShell } from "@/components/PublicWalkthroughShell";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Plus, Shield, Users, Heart, Briefcase, DollarSign, TrendingDown, Wheat, Megaphone, Search, FileText } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

const ICON_MAP: Record<string, any> = {
  shield: Shield,
  users: Users,
  heart: Heart,
  briefcase: Briefcase,
  "dollar-sign": DollarSign,
  "trending-down": TrendingDown,
  wheat: Wheat,
  megaphone: Megaphone,
  search: Search,
};

const DOMAIN_COLORS: Record<string, string> = {
  Insurance: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "Family Law": "bg-rose-500/10 text-rose-400 border-rose-500/20",
  Healthcare: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "Employment Law": "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "Consumer Finance": "bg-orange-500/10 text-orange-400 border-orange-500/20",
  "Elder Law": "bg-red-500/10 text-red-400 border-red-500/20",
  Antitrust: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  Agriculture: "bg-lime-500/10 text-lime-400 border-lime-500/20",
  "Whistleblower Protection": "bg-purple-500/10 text-purple-400 border-purple-500/20",
  General: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

export default function CaseTemplates() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: templates, isLoading } = trpc.caseTemplates.list.useQuery(undefined, {
    enabled: Boolean(user),
  });
  const createFromTemplate = trpc.caseTemplates.createFromTemplate.useMutation();
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const handleCreate = async (templateId: string) => {
    setCreatingId(templateId);
    try {
      const result = await createFromTemplate.mutateAsync({ templateId });
      toast.success(`Case "${result.name}" created with document checklist.`);
      setLocation(`/guide/${result.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create case");
      setCreatingId(null);
    }
  };

  if (!user) {
    return (
      <PublicWalkthroughShell
        title="Case Templates"
        description="Walk through the template workspace. Template details and case creation remain available after sign-in."
        sections={["Template catalog", "Case setup", "Document checklists"]}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container max-w-6xl py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/welcome")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Case Templates</h1>
              <p className="text-sm text-muted-foreground">One-click case creation with pre-configured document checklists</p>
            </div>
          </div>
        </div>
      </div>

      {/* Templates Grid */}
      <div className="container max-w-6xl py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates?.map((template) => {
              const IconComponent = ICON_MAP[template.icon] || FileText;
              const colorClass = DOMAIN_COLORS[template.domain] || DOMAIN_COLORS.General;
              const isCreating = creatingId === template.id;

              return (
                <Card
                  key={template.id}
                  className="border-border/50 hover:border-border transition-colors group"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${colorClass} border`}>
                        <IconComponent className="h-5 w-5" />
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {template.domain}
                      </Badge>
                    </div>
                    <CardTitle className="text-base mt-3">{template.name}</CardTitle>
                    <CardDescription className="text-xs leading-relaxed">
                      {template.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Button
                      onClick={() => handleCreate(template.id)}
                      disabled={isCreating || creatingId !== null}
                      className="w-full"
                      size="sm"
                    >
                      {isCreating ? (
                        <>
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Plus className="mr-2 h-3.5 w-3.5" />
                          Create Case
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
