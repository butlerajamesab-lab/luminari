import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { FileText, Users, Clock, Network, AlertTriangle, Upload, Headphones, ShieldAlert, Shield, Lamp, MapPin, Eye, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentChecklist } from "@/components/DocumentChecklist";
import { ResourceDirectory } from "@/components/ResourceDirectory";
import { LegalResources } from "@/components/LegalResources";
import { ShareWithAdvocate } from "@/components/ShareWithAdvocate";
import { FoiaCaseSummary } from "@/components/FoiaCaseSummary";
import { IntakeSpineControl } from "@/components/lighthouse/IntakeSpineControl";

export default function Home() {
  const { currentCaseId, currentCase } = useCase();
  const [, setLocation] = useLocation();

  const { data: stats, isLoading } = trpc.cases.stats.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId, refetchInterval: 15000 }
  );

  if (!currentCaseId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold text-foreground">No Case Selected</h2>
          <p className="text-muted-foreground max-w-md">
            Create a new case or select an existing one to begin your investigation.
          </p>
        </div>
        <Button onClick={() => setLocation("/cases")}>
          Manage Cases
        </Button>
      </div>
    );
  }

  const statCards = [
    { label: "Registered Sources", value: stats?.documents ?? 0, icon: FileText, path: "/documents", color: "text-blue-400" },
    { label: "Entities", value: stats?.entities ?? 0, icon: Users, path: "/entities", color: "text-emerald-400" },
    { label: "Claim Candidates", value: stats?.claims ?? 0, icon: AlertTriangle, path: "/claim-elements", color: "text-orange-400" },
    { label: "Verification Records", value: stats?.findings ?? 0, icon: Shield, path: "/findings", color: "text-purple-400" },
    { label: "Events", value: stats?.events ?? 0, icon: Clock, path: "/timeline", color: "text-cyan-400" },
    { label: "Relationships", value: stats?.relationships ?? 0, icon: Network, path: "/network", color: "text-pink-400" },
    { label: "Structural Signals", value: stats?.signalFlags ?? 0, icon: Eye, path: "/viewfinder", color: "text-red-400" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {currentCase?.name || "Case Overview"}
          </h1>
          {currentCase?.description && (
            <p className="text-sm text-muted-foreground mt-1">{currentCase.description}</p>
          )}
        </div>
        <Button onClick={() => setLocation("/upload")} className="gap-2">
          <Upload className="h-4 w-4" />
          Upload Evidence
        </Button>
      </div>

      <IntakeSpineControl caseId={currentCaseId} />

      {/* ── Share, Checklist & Resources ── */}
      {currentCase && (
        <div className="space-y-4">
          <ShareWithAdvocate caseId={currentCaseId} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DocumentChecklist caseId={currentCaseId} pipelineType={(currentCase as any).pipelineType} />
            <ResourceDirectory pipelineType={(currentCase as any).pipelineType} />
          </div>
          <LegalResources pipelineType={(currentCase as any).pipelineType} />
        </div>
      )}

      {/* ── Lighthouse Orientation Card ── */}
      <Card className="bg-gradient-to-r from-amber-500/5 via-amber-400/5 to-transparent border-amber-500/20 hover:border-amber-500/30 transition-colors">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
              <Lamp className="h-6 w-6 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground">The Lighthouse</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your orientation point. Find community resources, know your rights, discover opportunities, and explore the full platform.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-teal-400 hover:text-teal-300 gap-1"
                onClick={() => setLocation("/civic-map")}
              >
                <MapPin className="h-3 w-3" />
                <span className="hidden sm:inline">Map</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-amber-400/70 hover:text-amber-300 gap-1"
                onClick={() => setLocation("/viewfinder")}
              >
                <Eye className="h-3 w-3" />
                <span className="hidden sm:inline">Viewfinder</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10 gap-1.5"
                onClick={() => setLocation("/lighthouse")}
              >
                Enter
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card
            key={card.label}
            className="stat-card cursor-pointer hover:border-primary/30 transition-colors"
            onClick={() => setLocation(card.path)}
          >
            <CardContent className="p-4">
              {isLoading ? (
                <Skeleton className="h-12 w-full" />
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-foreground">{card.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{card.label}</p>
                  </div>
                  <card.icon className={`h-5 w-5 ${card.color} opacity-70`} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Document Status Breakdown */}
      {stats?.documentStatus && Object.keys(stats.documentStatus).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Source Integrity Status <span className="text-[10px] font-normal text-muted-foreground/60">(receipt-bound)</span></CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 flex-wrap">
              {Object.entries(stats.documentStatus).map(([status, count]) => (
                <div key={status} className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${
                    status === "preserved" ? "bg-emerald-400" :
                    status === "registered" ? "bg-cyan-400" :
                    status === "quarantined" || status === "referenced_missing" ? "bg-red-400" :
                    "bg-muted-foreground"
                  }`} />
                  <span className="text-xs text-muted-foreground capitalize">{status}</span>
                  <span className="text-xs font-mono text-foreground">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Read Aloud Feature Tip */}
      {stats && (stats.findings > 0 || stats.events > 0) && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Headphones className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-foreground">Listen to your evidence</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Use the <strong>Listen</strong> buttons on Findings, Timeline, Entities, and Document pages to have evidence read aloud with forensic attribution.
              </p>
            </div>
            <Button variant="outline" size="sm" className="shrink-0 gap-1.5 border-primary/30 text-primary hover:bg-primary/10" onClick={() => setLocation("/findings")}>
              <Headphones className="h-3.5 w-3.5" />
              Try it
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Linkage Mismatch Warning ── */}
      {stats && (stats.entities ?? 0) > 0 && (stats.documents ?? 0) === 0 && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
              <ShieldAlert className="h-5 w-5 text-red-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-red-400">Linkage Mismatch Detected</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                This case has <strong>{stats.entities} entities</strong> but <strong>0 documents</strong>.
                Entities may have been created from documents uploaded to a different case.
                Verify your uploads are linked to the correct case.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10"
              onClick={() => setLocation("/upload")}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload Here
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── FOIA Requests Summary ── */}
      <FoiaCaseSummary caseId={currentCaseId} />

      {/* Quick Actions */}
      {stats?.documents === 0 && (stats?.entities ?? 0) === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
            <Upload className="h-10 w-10 text-muted-foreground" />
            <div>
              <h3 className="font-medium text-foreground">No registered evidence yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Upload source files to register them with the case's live Intake Spine session.
                Governed reconstruction runs only when you explicitly start it.
              </p>
            </div>
            <Button onClick={() => setLocation("/upload")} className="gap-2">
              <Upload className="h-4 w-4" />
              Upload Your First Document
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
