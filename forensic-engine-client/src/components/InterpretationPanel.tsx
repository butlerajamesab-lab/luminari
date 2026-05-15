import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, AlertCircle } from "lucide-react";

interface InterpretationPanelProps {
  caseId: number;
}

interface ComparisonMatrixRow {
  adverseReason: string;
  governingRule: string;
  ruleSource: string;
  matchType: "unsupported" | "partial" | "supported";
  elementConfidence: number | null;
  requiredMissing: string[];
  optionalMissing: string[];
  elementHints: Record<string, string>;
}

export function InterpretationPanel({ caseId }: InterpretationPanelProps) {
  const [showAllComparison, setShowAllComparison] = useState(false);

  // Query 1: Get case interpretation (legal analysis)
  const { data: interpretation, isLoading: interpretationLoading, error: interpretationError, refetch: refetchInterpretation } = trpc.cases.getInterpretation.useQuery({ caseId });

  // Query 2: Extract forms and get confidence scores
  const { data: extractedForms, isLoading: extractionLoading } = trpc.cases.extractForms.useQuery({ caseId });

  // Merge the two data sources
  const comparisonRows: ComparisonMatrixRow[] = useMemo(() => {
    if (!interpretation?.comparisonMatrix) return [];

    return interpretation.comparisonMatrix.map((row: any) => {
      // Calculate element confidence based on extracted forms
      let elementConfidence = 0;
      let requiredMissing: string[] = [];
      let optionalMissing: string[] = [];
      const elementHints: Record<string, string> = {};

      if (extractedForms && extractedForms.topForms.length > 0) {
        // Count how many elements we have
        const hasURL = extractedForms.topForms.some((f: any) => f.submission_url);
        const hasPhone = extractedForms.topForms.some((f: any) => f.phone_number);
        const hasAddress = extractedForms.topForms.some((f: any) => f.mailing_address);
        const hasAgency = extractedForms.topForms.some((f: any) => f.agency_detected);

        const totalElements = 4;
        const presentElements = [hasURL, hasPhone, hasAddress, hasAgency].filter(Boolean).length;
        elementConfidence = Math.round((presentElements / totalElements) * 100);

        // Populate missing elements
        if (!hasURL) {
          requiredMissing.push("Submission URL");
          elementHints["Submission URL"] = "Find the official government website where you can submit your claim or appeal. Look for URLs ending in .gov or official agency portals.";
        }
        if (!hasPhone) {
          optionalMissing.push("Phone Number");
          elementHints["Phone Number"] = "Locate the primary contact phone number for the agency. Check official government websites or call 411 for agency phone numbers.";
        }
        if (!hasAddress) {
          optionalMissing.push("Mailing Address");
          elementHints["Mailing Address"] = "Find the official mailing address for submitting documents. This is typically found on agency websites or in official correspondence.";
        }
        if (!hasAgency) {
          requiredMissing.push("Agency Identification");
          elementHints["Agency Identification"] = "Identify the specific government agency responsible for handling your claim. This helps determine the correct submission pathway.";
        }
      } else {
        // No forms extracted - all elements missing
        requiredMissing = ["Submission URL", "Agency Identification"];
        optionalMissing = ["Phone Number", "Mailing Address"];
        elementHints["Submission URL"] = "Find the official government website where you can submit your claim or appeal.";
        elementHints["Phone Number"] = "Locate the primary contact phone number for the agency.";
        elementHints["Mailing Address"] = "Find the official mailing address for submitting documents.";
        elementHints["Agency Identification"] = "Identify the specific government agency responsible for handling your claim.";
      }

      return {
        adverseReason: row.adverseReason || "Unknown reason",
        governingRule: row.governingRule || "Unknown rule",
        ruleSource: row.ruleSource || "unknown",
        matchType: row.matchType || "unsupported",
        elementConfidence,
        requiredMissing,
        optionalMissing,
        elementHints,
      };
    });
  }, [interpretation, extractedForms]);

  const isLoading = interpretationLoading || extractionLoading;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading interpretation and extracting forms...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (interpretationError || !interpretation) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-4 w-4" />
            <p>Unable to load interpretation.</p>
          </div>
          <Button variant="outline" onClick={() => refetchInterpretation()} className="mt-4">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const displayedRows = showAllComparison ? comparisonRows : comparisonRows.slice(0, 3);

  return (
    <div className="space-y-6">
      {/* ── Claim Ledger ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Claim Ledger</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Claim ID:</span> {interpretation.claimLedger?.[0]?.claimId || "N/A"}
            </div>
            <div>
              <span className="font-medium">Claim Type:</span> {interpretation.claimLedger?.[0]?.claimType || "Unknown"}
            </div>
            <div className="col-span-2">
              <span className="font-medium">Claim Text:</span>{" "}
              {interpretation.claimLedger?.[0]?.claimText || "No claim text available."}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Comparison Matrix ─────────────────────────────────────────── */}
      {comparisonRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Comparison Matrix</CardTitle>
            <p className="text-sm text-gray-500">Denial reasons vs. governing rules</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Adverse Reason</TableHead>
                  <TableHead>Governing Rule</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Element Coverage</TableHead>
                  <TableHead>Missing Elements</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedRows.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="max-w-xs truncate" title={row.adverseReason}>
                      {row.adverseReason}
                    </TableCell>

                    <TableCell className="max-w-sm">
                      <div className="truncate" title={row.governingRule}>
                        {row.governingRule}
                      </div>
                      <span className="text-xs text-gray-400">{row.ruleSource}</span>
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant={
                          row.matchType === "unsupported"
                            ? "destructive"
                            : row.matchType === "partial"
                            ? "secondary"
                            : "default"
                        }
                      >
                        {row.matchType}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      {row.elementConfidence !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${row.elementConfidence}%`,
                                backgroundColor:
                                  row.elementConfidence === 100
                                    ? "#22c55e"
                                    : row.elementConfidence >= 50
                                    ? "#f59e0b"
                                    : "#ef4444",
                              }}
                            />
                          </div>
                          <span className="text-xs text-gray-500">{row.elementConfidence}%</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">No elements defined</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <div className="space-y-1">
                        {row.requiredMissing.map((el) => (
                          <div key={el} className="flex items-center gap-1 group relative">
                            <Badge variant="destructive" className="text-xs cursor-default">
                              {el}
                            </Badge>
                            {row.elementHints[el] && (
                              <span className="hidden group-hover:block absolute left-0 top-6 z-10 w-64 text-xs bg-gray-900 text-white rounded p-2 shadow-lg leading-relaxed">
                                <span className="font-semibold block mb-1">How to satisfy:</span>
                                {row.elementHints[el]}
                              </span>
                            )}
                          </div>
                        ))}
                        {row.optionalMissing.map((el) => (
                          <div key={el} className="flex items-center gap-1 group relative">
                            <Badge variant="outline" className="text-xs text-amber-600 cursor-default">
                              {el}
                            </Badge>
                            {row.elementHints[el] && (
                              <span className="hidden group-hover:block absolute left-0 top-6 z-10 w-64 text-xs bg-gray-900 text-white rounded p-2 shadow-lg leading-relaxed">
                                <span className="font-semibold block mb-1">How to satisfy:</span>
                                {row.elementHints[el]}
                              </span>
                            )}
                          </div>
                        ))}
                        {row.requiredMissing.length === 0 && row.optionalMissing.length === 0 && (
                          <span className="text-xs text-gray-400">✓ All elements present</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {comparisonRows.length > 3 && !showAllComparison && (
              <Button variant="link" onClick={() => setShowAllComparison(true)}>
                Show all {comparisonRows.length} rows
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Evidence Gaps ─────────────────────────────────────────────── */}
      {interpretation.evidenceGaps && interpretation.evidenceGaps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Evidence Gaps</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {interpretation.evidenceGaps.map((gap: any, idx: number) => (
                <div
                  key={idx}
                  className="border-l-4 pl-4"
                  style={{
                    borderLeftColor:
                      gap.severity === "critical"
                        ? "#ef4444"
                        : gap.severity === "important"
                        ? "#f59e0b"
                        : "#6b7280",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{gap.gapType}</Badge>
                    <Badge
                      variant="outline"
                      className={gap.severity === "critical" ? "text-red-600" : ""}
                    >
                      {gap.severity}
                    </Badge>
                  </div>
                  <p className="font-medium mt-2">{gap.gapDescription}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Contradictions ────────────────────────────────────────────── */}
      {interpretation.contradictions && interpretation.contradictions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Contradictions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {interpretation.contradictions.map((c: any, idx: number) => (
                <div key={idx} className="bg-amber-50 dark:bg-amber-950/20 p-3 rounded">
                  <p className="font-medium">{c.contradictionType}</p>
                  <p className="text-sm mt-1">{c.contradictionText}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Systemic Context ──────────────────────────────────────────── */}
      {interpretation.signals && interpretation.signals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Systemic Context</CardTitle>
            <p className="text-sm text-gray-500">Patterns that may relate to your case</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {interpretation.signals.map((signal: any, idx: number) => (
                <div key={idx} className="border rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium">{signal.signalType}</h4>
                      <p className="text-sm text-gray-500 mt-1">{signal.signalDescription}</p>
                    </div>
                    <Badge variant="outline">
                      {signal.severity}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Available Actions ─────────────────────────────────────────── */}
      {interpretation.availableActions && interpretation.availableActions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Action Paths</CardTitle>
            <p className="text-sm text-gray-500">Possible next steps based on the evidence</p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {interpretation.availableActions.map((action: any, idx: number) => (
                <div key={idx} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{action.actionType}</h3>
                      <p className="text-xs text-gray-400 mt-2">Template: {action.templateId || "N/A"}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Extracted Forms Summary ───────────────────────────────────── */}
      {extractedForms && extractedForms.totalFormsExtracted > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Extracted Forms</CardTitle>
            <p className="text-sm text-gray-500">Forms detected in your documents</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Total Forms:</span> {extractedForms.totalFormsExtracted}
                </div>
                <div>
                  <span className="font-medium">Average Confidence:</span> {extractedForms.averageConfidence.toFixed(1)}/5
                </div>
              </div>
              {extractedForms.topForms.length > 0 && (
                <div>
                  <p className="font-medium text-sm mb-2">Top Forms:</p>
                  <div className="space-y-2">
                    {extractedForms.topForms.map((form: any, idx: number) => (
                      <div key={idx} className="bg-blue-50 dark:bg-blue-950/20 p-2 rounded text-sm">
                        <p className="font-medium">{form.form_name}</p>
                        {form.submission_url && (
                          <p className="text-xs text-blue-600 truncate">{form.submission_url}</p>
                        )}
                        {form.agency_detected && (
                          <Badge variant="outline" className="mt-1 text-xs">
                            {form.agency_detected}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
