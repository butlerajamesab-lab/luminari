import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { FileText, Users, Clock, Network, Loader2, ExternalLink, Printer, Download, HardDrive, FileJson, Globe, Shield } from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";

export type SovereignExportType = "full-bundle" | "json-dump";

const EXPORT_TYPE_HEADER = "X-Luminari-Export-Type";

export function validateExportDownloadResponse(response: Pick<Response, "headers">, exportType: SovereignExportType): void {
  const expectedContentType = exportType === "json-dump" ? "application/json" : "text/html";
  const actualExportType = response.headers.get(EXPORT_TYPE_HEADER);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const disposition = response.headers.get("content-disposition")?.toLowerCase() ?? "";
  if (actualExportType !== exportType || !contentType.startsWith(expectedContentType) || !disposition.startsWith("attachment;")) {
    throw new Error("The server returned the application page instead of a case export. Refresh and try again.");
  }
}

export default function Exports() {
  const { currentCaseId, currentCase } = useCase();
  const [, setLocation] = useLocation();
  const [generating, setGenerating] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const { data: stats } = trpc.cases.stats.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId }
  );

  const handleExport = useCallback(async (exportType: string) => {
    if (!currentCaseId) return;
    setGenerating(exportType);
    try {
      const url = `/api/export/${exportType}?caseId=${currentCaseId}`;

      const response = await fetch(url, { credentials: "same-origin" });

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = "Export failed";
        try {
          const errJson = JSON.parse(errText);
          errMsg = errJson.error || errMsg;
        } catch { errMsg = errText || errMsg; }
        throw new Error(errMsg);
      }

      const html = await response.text();
      const blob = new Blob([html], { type: "text/html; charset=utf-8" });
      const blobUrl = URL.createObjectURL(blob);

      const newWindow = window.open(blobUrl, "_blank");

      if (!newWindow) {
        toast.info("Popup blocked — opening report inline. Use the Print button below.");
        if (iframeRef.current) {
          iframeRef.current.srcdoc = html;
          iframeRef.current.style.display = "block";
          iframeRef.current.scrollIntoView({ behavior: "smooth" });
        }
      } else {
        toast.success("Report opened. Use the Print button in the report to save as PDF.");
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      }
    } catch (err: any) {
      toast.error(err.message || "Export failed");
    } finally {
      setTimeout(() => setGenerating(null), 1000);
    }
  }, [currentCaseId]);

  const handleDownload = useCallback(async (exportType: SovereignExportType, filename: string) => {
    if (!currentCaseId) return;
    setGenerating(exportType);
    try {
      const url = `/api/export/${exportType}?caseId=${currentCaseId}`;
      const response = await fetch(url, {
        credentials: "same-origin",
        headers: { Accept: exportType === "json-dump" ? "application/json" : "text/html" },
      });

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = "Export failed";
        try {
          const errJson = JSON.parse(errText);
          errMsg = errJson.error || errMsg;
        } catch { errMsg = errText || errMsg; }
        throw new Error(errMsg);
      }

      validateExportDownloadResponse(response, exportType);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      toast.success(`Downloaded ${filename}`);
    } catch (err: any) {
      toast.error(err.message || "Download failed");
    } finally {
      setTimeout(() => setGenerating(null), 1000);
    }
  }, [currentCaseId]);

  const handlePrintInline = useCallback(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.print();
    }
  }, []);

  if (!currentCaseId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-muted-foreground">Select a case first</p>
        <Button variant="outline" onClick={() => setLocation("/cases")}>Manage Cases</Button>
      </div>
    );
  }

  const caseName = currentCase?.name?.replace(/[^a-zA-Z0-9]/g, "_") || "Case";

  const exportTypes = [
    {
      id: "case-brief",
      title: "Case Brief",
      description: "Executive summary with key findings, evidence chains, timeline, and full citation table.",
      icon: FileText,
      stats: `${stats?.findings ?? 0} findings, ${stats?.documents ?? 0} documents`,
      color: "text-blue-400",
    },
    {
      id: "entity-report",
      title: "Entity Report",
      description: "People, organizations, and their roles — with relationships and source citations.",
      icon: Users,
      stats: `${stats?.entities ?? 0} entities tracked`,
      color: "text-emerald-400",
    },
    {
      id: "timeline-report",
      title: "Timeline Report",
      description: "Chronological events from all documents with source citations.",
      icon: Clock,
      stats: `${stats?.events ?? 0} events documented`,
      color: "text-amber-400",
    },
    {
      id: "relationship-report",
      title: "Relationship Report",
      description: "Documented connections between entities with evidence for each.",
      icon: Network,
      stats: `${stats?.relationships ?? 0} relationships mapped`,
      color: "text-purple-400",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Export Evidence</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate reports, download offline bundles, or export raw data for sovereign access.
        </p>
      </div>

      {/* ─── SOVEREIGN EXPORT SECTION ─── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Sovereign Export</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Download your entire case as a self-contained file. No internet, no platform dependency, no capture risk. These files work forever.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {/* HTML Bundle */}
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <HardDrive className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Offline HTML Bundle</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Single .html file — opens in any browser</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-sm mb-3">
                Complete case with all findings, timeline, entities, quotes, claims, correlations, and signal flags. Includes search, collapsible sections, and print-to-PDF. <strong>Zero internet required.</strong>
              </CardDescription>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                <Globe className="h-3.5 w-3.5" />
                <span>Works offline in Chrome, Firefox, Safari, Edge — any device, any OS</span>
              </div>
              <Button
                className="gap-2 w-full"
                onClick={() => handleDownload("full-bundle", `Luminari_${caseName}_Bundle.html`)}
                disabled={generating === "full-bundle"}
              >
                {generating === "full-bundle" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download HTML Bundle
              </Button>
            </CardContent>
          </Card>

          {/* JSON Dump */}
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileJson className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Full JSON Data Export</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Structured data — portable and importable</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-sm mb-3">
                Complete structured data dump: documents, quotes, entities, claims, findings, events, relationships, correlations, signal flags, and entity roles. <strong>Import into any system.</strong>
              </CardDescription>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                <Shield className="h-3.5 w-3.5" />
                <span>Your data, your format — no vendor lock-in, no platform dependency</span>
              </div>
              <Button
                className="gap-2 w-full"
                onClick={() => handleDownload("json-dump", `Luminari_${caseName}_Data.json`)}
                disabled={generating === "json-dump"}
              >
                {generating === "json-dump" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download JSON Data
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ─── COURT-READY REPORTS ─── */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Court-Ready Reports</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {exportTypes.map((exp) => (
            <Card key={exp.id} className="hover:border-primary/30 transition-colors">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                    <exp.icon className={`h-5 w-5 ${exp.color}`} />
                  </div>
                  <div>
                    <CardTitle className="text-base">{exp.title}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">{exp.stats}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm mb-4">{exp.description}</CardDescription>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => handleExport(exp.id)}
                  disabled={generating === exp.id}
                >
                  {generating === exp.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ExternalLink className="h-3.5 w-3.5" />
                  )}
                  Generate Report
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card className="border-dashed">
        <CardContent className="p-6 text-center">
          <p className="text-sm text-muted-foreground">
            All reports include exhibit numbering, citation tables, chain-of-custody metadata, and professional formatting.
            Sovereign exports contain your complete case data with no external dependencies.
          </p>
        </CardContent>
      </Card>

      {/* Inline fallback iframe */}
      <div className="relative">
        <iframe
          ref={iframeRef}
          title="Export Preview"
          className="w-full border border-border rounded-lg bg-white"
          style={{ display: "none", height: "80vh" }}
          sandbox="allow-same-origin allow-scripts allow-popups"
        />
        <div className="absolute top-2 right-2 z-10">
          <Button
            variant="default"
            size="sm"
            className="gap-2 shadow-lg"
            onClick={handlePrintInline}
            style={{ display: iframeRef.current?.style.display === "block" ? "flex" : "none" }}
          >
            <Printer className="h-3.5 w-3.5" />
            Print / Save PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
