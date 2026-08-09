import { useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Upload, FileUp, CheckCircle2, AlertCircle, ArrowLeft,
  FileText, Users, Clock, StickyNote, Download, Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface BundleManifest {
  bundleVersion: string;
  luminariVersion: string;
  createdAt: number;
  updatedAt: number;
  userMode: string;
  caseContext: {
    name: string;
    description: string;
    primaryDomain: string;
    additionalDomains: string[];
    situationNotes: string;
  };
  timeline: unknown[];
  people: unknown[];
  attachments: { id: string; filename: string; size: number; mimeType: string }[];
  evidenceNotes: unknown[];
  advocateInfo?: { name?: string; organization?: string };
}

interface BackupFile {
  manifest: BundleManifest;
  files: Record<string, string>; // id -> base64
}

interface SyncResult {
  success: boolean;
  caseId: number;
  summary: {
    caseName: string;
    domain: string;
    pipelineType: string;
    documentsUploaded: number;
    documentsRegistered: number;
    timelineContextRegistered: number;
    peopleContextRegistered: number;
    checklistItemsGenerated: number;
  };
  warnings: string[];
}

export default function ImportBundle() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [backup, setBackup] = useState<BackupFile | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError(null);
    setResult(null);
    setUploadError(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupFile;

      if (!parsed.manifest?.caseContext?.name) {
        throw new Error("Invalid bundle file — missing case context");
      }
      if (!parsed.manifest?.bundleVersion) {
        throw new Error("Invalid bundle file — missing version");
      }

      setBackup(parsed);
      toast.success("Bundle loaded successfully");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to parse bundle file";
      setParseError(msg);
      toast.error(msg);
    }

    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleUpload = useCallback(async () => {
    if (!backup) return;
    setUploading(true);
    setUploadProgress(10);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("manifest", JSON.stringify(backup.manifest));

      // Convert base64 files back to blobs
      setUploadProgress(20);
      const fileEntries = Object.entries(backup.files || {});
      for (let i = 0; i < fileEntries.length; i++) {
        const [id, b64] = fileEntries[i];
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);

        const att = backup.manifest.attachments.find(a => a.id === id);
        const filename = att?.filename || `file-${id}`;
        const mimeType = att?.mimeType || "application/octet-stream";

        formData.append("files", new Blob([bytes], { type: mimeType }), filename);
        setUploadProgress(20 + Math.round((i / fileEntries.length) * 50));
      }

      setUploadProgress(75);

      const response = await fetch("/api/bundle-sync", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      setUploadProgress(90);
      const data = await response.json();

      if (response.ok && data.success) {
        setResult(data as SyncResult);
        setUploadProgress(100);
        toast.success(`Case "${data.summary.caseName}" created successfully!`);
      } else {
        throw new Error(data.error || "Upload failed");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setUploadError(msg);
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  }, [backup]);

  const manifest = backup?.manifest;
  const fileCount = manifest?.attachments?.length || 0;
  const totalSize = manifest?.attachments?.reduce((sum, a) => sum + a.size, 0) || 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-3xl py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate("/welcome")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Import Offline Bundle</h1>
            <p className="text-muted-foreground text-sm">
              Upload a .luminari backup file created with the offline intake tool
            </p>
          </div>
        </div>

        {!isAuthenticated && (
          <Card className="mb-6 border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-destructive">Login Required</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    You need to be logged in to import a bundle. The case will be created under your account.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Upload Success */}
        {result && (
          <Card className="mb-6 border-green-500/50 bg-green-500/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-lg text-green-400">Import Successful</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Case "{result.summary.caseName}" has been created and exact source bytes are registered. Run the governed Intake Spine explicitly when you are ready.
                  </p>
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <div className="bg-background/50 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-primary">{result.summary.documentsUploaded}</div>
                      <div className="text-xs text-muted-foreground">Documents</div>
                    </div>
                    <div className="bg-background/50 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-primary">{result.summary.timelineContextRegistered}</div>
                      <div className="text-xs text-muted-foreground">Timeline Context</div>
                    </div>
                    <div className="bg-background/50 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-primary">{result.summary.peopleContextRegistered}</div>
                      <div className="text-xs text-muted-foreground">People Context</div>
                    </div>
                    <div className="bg-background/50 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-primary">{result.summary.checklistItemsGenerated}</div>
                      <div className="text-xs text-muted-foreground">Checklist Items</div>
                    </div>
                  </div>
                  {result.warnings.length > 0 && (
                    <div className="mt-3 text-xs text-yellow-400">
                      {result.warnings.map((w, i) => <p key={i}>{w}</p>)}
                    </div>
                  )}
                  <div className="flex gap-3 mt-4">
                    <Button onClick={() => navigate(`/guide/${result.caseId}`)}>
                      Open Case Dashboard
                    </Button>
                    <Button variant="outline" onClick={() => navigate("/")}>
                      Go to Workspace
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* File Selector */}
        {!result && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Select Bundle File
              </CardTitle>
              <CardDescription>
                Choose a .luminari file from your device. These files are created by the offline intake tool.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <input
                ref={fileInputRef}
                type="file"
                accept=".luminari,.json"
                onChange={handleFileSelect}
                className="hidden"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
              >
                <FileUp className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="font-medium">Click to select a .luminari file</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Or drag and drop the file here
                </p>
              </div>

              {parseError && (
                <div className="mt-4 flex items-start gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{parseError}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Bundle Preview */}
        {manifest && !result && (
          <>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Bundle Contents
                </CardTitle>
                <CardDescription>
                  Review the contents before importing
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Case Name</h4>
                    <p className="font-semibold">{manifest.caseContext.name}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{manifest.caseContext.primaryDomain}</Badge>
                    {manifest.caseContext.additionalDomains.map(d => (
                      <Badge key={d} variant="outline">{d}</Badge>
                    ))}
                  </div>

                  {manifest.advocateInfo?.name && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">Advocate</h4>
                      <p className="text-sm">
                        {manifest.advocateInfo.name}
                        {manifest.advocateInfo.organization && ` (${manifest.advocateInfo.organization})`}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-lg font-bold">{manifest.timeline.length}</div>
                      <div className="text-xs text-muted-foreground">Events</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <Users className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-lg font-bold">{manifest.people.length}</div>
                      <div className="text-xs text-muted-foreground">People</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <FileText className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-lg font-bold">{fileCount}</div>
                      <div className="text-xs text-muted-foreground">Files</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <StickyNote className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-lg font-bold">{manifest.evidenceNotes.length}</div>
                      <div className="text-xs text-muted-foreground">Notes</div>
                    </div>
                  </div>

                  {fileCount > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-2">Attached Files</h4>
                      <div className="space-y-1">
                        {manifest.attachments.map(a => (
                          <div key={a.id} className="flex items-center justify-between text-sm py-1 px-2 rounded bg-muted/30">
                            <span className="truncate">{a.filename}</span>
                            <span className="text-muted-foreground text-xs shrink-0 ml-2">
                              {(a.size / 1024).toFixed(0)} KB
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Total: {(totalSize / (1024 * 1024)).toFixed(1)} MB
                      </p>
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Bundle version: {manifest.bundleVersion}</p>
                    <p>Created: {new Date(manifest.createdAt).toLocaleString()}</p>
                    <p>Last updated: {new Date(manifest.updatedAt).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Upload Button */}
            <Card>
              <CardContent className="pt-6">
                {uploading && (
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Uploading...</span>
                      <span className="text-muted-foreground">{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} />
                  </div>
                )}

                {uploadError && (
                  <div className="mb-4 flex items-start gap-2 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Import Failed</p>
                      <p>{uploadError}</p>
                      <p className="text-xs mt-1">
                        Make sure you are logged in and try again.
                      </p>
                    </div>
                  </div>
                )}

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleUpload}
                  disabled={uploading || !isAuthenticated}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Import Bundle to Luminari
                    </>
                  )}
                </Button>

                <p className="text-xs text-muted-foreground text-center mt-3">
                  This will create a new case with all the data from the bundle.
                  Documents will be registered as source evidence; governed reconstruction remains an explicit action.
                </p>
              </CardContent>
            </Card>
          </>
        )}

        {/* Download Bundle Link */}
        {!backup && !result && isAuthenticated && (
          <Card className="mt-6">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Download className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium">Need an offline intake form?</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Download the offline intake bundle to collect case information without internet access.
                    The bundle works on any device with a web browser.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => {
                      window.open("/api/bundle/download", "_blank");
                      toast.info("Downloading offline intake bundle...");
                    }}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download Offline Intake Bundle
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
