import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useAuth } from "@/core/hooks/useAuth";
import { PublicWalkthroughShell } from "@/components/PublicWalkthroughShell";
import {
  FlaskConical, Play, FileText, Users, Search, Loader2,
  ChevronDown, ChevronUp, CheckCircle2, AlertTriangle,
  Shield, Heart, Briefcase, DollarSign, Megaphone, TrendingDown,
  Wheat, HelpCircle, Scale, Home,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const PIPELINE_ICONS: Record<string, React.ElementType> = {
  elderabuse: Heart,
  insurance: Shield,
  custody: Scale,
  medical: Heart,
  workplace: Briefcase,
  predatorylending: DollarSign,
  whistleblower: Megaphone,
  marketconcentration: TrendingDown,
  agricultureexploitation: Wheat,
  involuntary_hold: Shield,
  polypharmacy_harm: Heart,
  discharge_failure: HelpCircle,
  family_exclusion: Users,
  restraint_seclusion: Shield,
  record_correction: FileText,
  other: HelpCircle,
};

const PIPELINE_COLORS: Record<string, string> = {
  elderabuse: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  insurance: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  custody: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  medical: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  workplace: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  predatorylending: "bg-red-500/10 text-red-400 border-red-500/20",
  whistleblower: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  marketconcentration: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  agricultureexploitation: "bg-lime-500/10 text-lime-400 border-lime-500/20",
  involuntary_hold: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  polypharmacy_harm: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  discharge_failure: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  family_exclusion: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  restraint_seclusion: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  record_correction: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  other: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

const PIPELINE_LABELS: Record<string, string> = {
  elderabuse: "Elder Abuse",
  insurance: "Insurance Denial",
  custody: "Custody Dispute",
  medical: "Medical Records",
  workplace: "Workplace Discrimination",
  predatorylending: "Predatory Lending",
  whistleblower: "Whistleblower",
  marketconcentration: "Market Concentration",
  agricultureexploitation: "Agriculture Exploitation",
  involuntary_hold: "Involuntary Hold",
  polypharmacy_harm: "Polypharmacy Harm",
  discharge_failure: "Discharge Failure",
  family_exclusion: "Family Exclusion",
  restraint_seclusion: "Restraint & Seclusion",
  record_correction: "Record Correction",
  other: "General Investigation",
};

export default function AdminTestScenarios() {
  const { user } = useAuth();
  const canAdminister = user?.role === "admin";
  const { data: bundles, isLoading } = trpc.testScenarios.listBundles.useQuery(undefined, {
    enabled: canAdminister,
    retry: false,
  });
  const [search, setSearch] = useState("");
  const [expandedBundle, setExpandedBundle] = useState<string | null>(null);
  const [loadingBundle, setLoadingBundle] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ bundleId: string; scenarioName: string } | null>(null);
  const [customName, setCustomName] = useState("");
  const [, navigate] = useLocation();

  const loadMutation = trpc.testScenarios.loadBundle.useMutation({
    onSuccess: (data) => {
      setLoadingBundle(null);
      setConfirmDialog(null);
      toast.success(`Test case created: ${data.caseName}`, {
        description: `${data.documentsUploaded}/${data.documentsTotal} documents uploaded and queued for analysis`,
        action: {
          label: "Open Case",
          onClick: () => navigate(`/cases/${data.caseId}`),
        },
      });
    },
    onError: (err) => {
      setLoadingBundle(null);
      toast.error("Failed to load test bundle", { description: err.message });
    },
  });

  if (!canAdminister) {
    return (
      <PublicWalkthroughShell
        title="Test Scenarios"
        description="The testing workspace is open for walkthrough. Scenario bundles, synthetic case creation, and pipeline execution remain owner-only."
        sections={["Scenario Library", "Bundle Details", "Pipeline Preview", "Test Case Creation"]}
      />
    );
  }

  const filteredBundles = bundles?.filter(b =>
    b.scenarioName.toLowerCase().includes(search.toLowerCase()) ||
    b.pipelineType.toLowerCase().includes(search.toLowerCase()) ||
    (PIPELINE_LABELS[b.pipelineType] || "").toLowerCase().includes(search.toLowerCase())
  );

  const handleLoad = (bundleId: string) => {
    setLoadingBundle(bundleId);
    loadMutation.mutate({ bundleId, customCaseName: customName || undefined });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-amber-400" />
            Test Scenarios
          </h1>
          <p className="text-muted-foreground mt-1">
            Pre-built synthetic cases for end-to-end pipeline testing. Each bundle creates a case, uploads documents, generates checklists, and queues analysis — all with one click.
          </p>
        </div>
        <Badge variant="outline" className="text-xs shrink-0">
          {bundles?.length || 0} bundles available
        </Badge>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by scenario name or pipeline type..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Bundle Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-3">
                <div className="h-5 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/2 mt-2" />
              </CardHeader>
              <CardContent>
                <div className="h-16 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredBundles?.map((bundle) => {
            const Icon = PIPELINE_ICONS[bundle.pipelineType] || HelpCircle;
            const colorClass = PIPELINE_COLORS[bundle.pipelineType] || PIPELINE_COLORS.other;
            const isExpanded = expandedBundle === bundle.bundleId;
            const isCurrentlyLoading = loadingBundle === bundle.bundleId;

            return (
              <Card
                key={bundle.bundleId}
                className={`transition-all duration-200 hover:shadow-lg ${isCurrentlyLoading ? "ring-2 ring-amber-500/50" : ""}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg border ${colorClass}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base leading-tight">
                          {bundle.scenarioName}
                        </CardTitle>
                        <Badge variant="outline" className="mt-1 text-xs">
                          {PIPELINE_LABELS[bundle.pipelineType] || bundle.pipelineType}
                        </Badge>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {bundle.bundleId}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <CardDescription className="text-sm leading-relaxed line-clamp-3">
                    {bundle.description}
                  </CardDescription>

                  {/* Stats Row */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" />
                      {bundle.documentCount} documents
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {bundle.expectedEntities} expected entities
                    </span>
                    <span className="flex items-center gap-1">
                      <Search className="h-3.5 w-3.5" />
                      {bundle.expectedFindings} expected findings
                    </span>
                  </div>

                  {/* Expand/Collapse Details */}
                  <button
                    onClick={() => setExpandedBundle(isExpanded ? null : bundle.bundleId)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {isExpanded ? "Hide details" : "Show details"}
                  </button>

                  {isExpanded && <BundleDetails bundleId={bundle.bundleId} />}

                  {/* Load Button */}
                  <Button
                    className="w-full"
                    onClick={() => {
                      setCustomName("");
                      setConfirmDialog({ bundleId: bundle.bundleId, scenarioName: bundle.scenarioName });
                    }}
                    disabled={isCurrentlyLoading}
                  >
                    {isCurrentlyLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Loading test case...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Load Test Scenario
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {filteredBundles?.length === 0 && !isLoading && (
        <div className="text-center py-12 text-muted-foreground">
          <FlaskConical className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No test scenarios match your search.</p>
        </div>
      )}

      {/* Confirm Dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-amber-400" />
              Load Test Scenario
            </DialogTitle>
            <DialogDescription>
              This will create a new case with pre-loaded synthetic documents and queue them for analysis.
              The case will be prefixed with [TEST] for easy identification.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="p-3 rounded-lg bg-muted/50 border">
              <p className="font-medium text-sm">{confirmDialog?.scenarioName}</p>
            </div>
            <div>
              <label className="text-sm font-medium">Custom case name (optional)</label>
              <Input
                placeholder={`[TEST] ${confirmDialog?.scenarioName || ""}`}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                All documents in this bundle are <strong>entirely fictional</strong> — no real personal information is used.
                The analysis pipeline will process them as if they were real documents.
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => confirmDialog && handleLoad(confirmDialog.bundleId)}
              disabled={!!loadingBundle}
            >
              {loadingBundle ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Create Test Case
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BundleDetails({ bundleId }: { bundleId: string }) {
  const { data: details, isLoading } = trpc.testScenarios.getBundleDetails.useQuery({ bundleId });

  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        <div className="h-4 bg-muted rounded w-full" />
        <div className="h-4 bg-muted rounded w-3/4" />
      </div>
    );
  }

  if (!details) return null;

  return (
    <div className="space-y-3 border-t pt-3">
      {/* Documents */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Documents Included
        </h4>
        <div className="space-y-1.5">
          {details.documents.map((doc, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <span className="font-medium">{doc.filename}</span>
                <span className="text-muted-foreground ml-1">— {doc.description}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Expected Entities */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Expected Entities
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {details.expectedEntities.map((entity, i) => (
            <Badge key={i} variant="outline" className="text-xs">
              {entity}
            </Badge>
          ))}
        </div>
      </div>

      {/* Expected Findings */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Expected Findings
        </h4>
        <div className="space-y-1">
          {details.expectedFindings.map((finding, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <span>{finding}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Expected Correlations */}
      {details.expectedCorrelations.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Expected Correlations
          </h4>
          <div className="space-y-1">
            {details.expectedCorrelations.map((corr, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span>{corr}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
