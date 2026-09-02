/**
 * Sovereign Control — Admin Independence Kit
 * 
 * 6 tabs:
 * 1. Export Spine — export platform bundles
 * 2. Restore Spine — restore from bundles
 * 3. Admin Control — engine/stream/schema/migration management
 * 4. Data Streams — stream registry management
 * 5. Intervention Timeline — pattern evolution tracking
 * 6. System Copilot (Sunam) — LLM-powered admin assistant
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Download, Upload, Shield, Database, GitBranch, Bot,
  Play, CheckCircle, XCircle, AlertTriangle, Clock,
  RefreshCw, Trash2, Eye, FileText, Send, Plus,
  Settings, ToggleLeft, ArrowUpDown, Search,
  Table2, Zap, Activity, Archive, ChevronRight,
  Loader2, Copy, RotateCcw, ArrowLeft, CalendarClock,
} from "lucide-react";
import { Link } from "wouter";
import AtlasCommandPanel from "@/components/sovereign/AtlasCommandPanel";
import { PublicWalkthroughShell } from "@/components/PublicWalkthroughShell";

// ─── Export Spine Panel ───
function ExportSpinePanel() {
  const [exportType, setExportType] = useState<string>("full");
  const runExport = trpc.s76.exportSpine.runExport.useMutation();
  const { data: history, refetch: refetchHistory } = trpc.s76.exportSpine.getHistory.useQuery();
  const { data: stats } = trpc.s76.exportSpine.getStats.useQuery();
  const { data: quarterlyStatus, refetch: refetchQuarterly } = trpc.s76.exportSpine.getQuarterlyStatus.useQuery();
  const triggerQuarterly = trpc.s76.exportSpine.triggerQuarterlyExport.useMutation();

  const handleTriggerQuarterly = async () => {
    try {
      const result = await triggerQuarterly.mutateAsync();
      if (result.success) {
        toast.success(`Quarterly backup started: ${result.bundleName ?? "in progress"}`);
        refetchHistory();
        refetchQuarterly();
      } else {
        toast.error(`Could not start: ${result.error}`);
      }
    } catch (e: any) {
      toast.error(`Trigger failed: ${e.message}`);
    }
  };

  const handleExport = async () => {
    try {
      const result = await runExport.mutateAsync({ exportType: exportType as any });
      toast.success(`Export started: ${result.bundleName}`);
      refetchHistory();
    } catch (e: any) {
      toast.error(`Export failed: ${e.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Export Spine Engine</h3>
          <p className="text-sm text-muted-foreground">Generate portable bundles of the Luminari platform</p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          <Card className="bg-card/50"><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Total Exports</div>
            <div className="text-xl font-bold text-foreground">{stats.totalExports}</div>
          </CardContent></Card>
          <Card className="bg-card/50"><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Completed</div>
            <div className="text-xl font-bold text-green-400">{stats.completedExports}</div>
          </CardContent></Card>
          <Card className="bg-card/50"><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Failed</div>
            <div className="text-xl font-bold text-red-400">{stats.failedExports}</div>
          </CardContent></Card>
          <Card className="bg-card/50"><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Total Size</div>
            <div className="text-xl font-bold text-foreground">{(stats.totalExportSize / 1024 / 1024).toFixed(1)} MB</div>
          </CardContent></Card>
        </div>
      )}

      {/* New Export */}
      <Card className="border-dashed">
        <CardContent className="p-4">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium text-foreground mb-1 block">Export Type</label>
              <Select value={exportType} onValueChange={setExportType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full Export (schema + config + data + deployment)</SelectItem>
                  <SelectItem value="schema">Schema Only (DDL statements)</SelectItem>
                  <SelectItem value="config">Config Only (engines, streams, signals, patterns)</SelectItem>
                  <SelectItem value="deployment">Deployment Bundle (schema + config + env manifest)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleExport} disabled={runExport.isPending}>
              {runExport.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
              Run Export
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quarterly Auto-Backup Status */}
      <Card className="border border-amber-500/30 bg-amber-950/10">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <CalendarClock className="h-5 w-5 text-amber-400 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-foreground">Quarterly Auto-Backup</div>
                <div className="text-xs text-muted-foreground">Full Spine Export runs automatically every 90 days. Owner is notified on completion or failure.</div>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleTriggerQuarterly}
              disabled={triggerQuarterly.isPending || quarterlyStatus?.isCurrentlyRunning}
              className="shrink-0 border-amber-500/40 text-amber-300 hover:bg-amber-950/30"
            >
              {(triggerQuarterly.isPending || quarterlyStatus?.isCurrentlyRunning)
                ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Running...</>
                : <><Play className="h-3 w-3 mr-1" /> Run Now</>}
            </Button>
          </div>
          {quarterlyStatus && (
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div className="bg-card/40 rounded p-2">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Status</div>
                <div className="text-xs font-medium text-foreground mt-0.5">
                  {quarterlyStatus.isCurrentlyRunning
                    ? <span className="text-amber-400">Running now</span>
                    : quarterlyStatus.scheduled
                    ? <span className="text-green-400">Scheduled ✓</span>
                    : <span className="text-red-400">Not scheduled</span>}
                </div>
              </div>
              <div className="bg-card/40 rounded p-2">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Next Run</div>
                <div className="text-xs font-medium text-foreground mt-0.5">
                  {quarterlyStatus.nextRunFormatted ?? "—"}
                </div>
              </div>
              <div className="bg-card/40 rounded p-2">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Last Status</div>
                <div className="text-xs font-medium mt-0.5">
                  {quarterlyStatus.lastRunStatus === "success"
                    ? <span className="text-green-400">Success</span>
                    : quarterlyStatus.lastRunStatus === "failed"
                    ? <span className="text-red-400">Failed</span>
                    : <span className="text-muted-foreground">No runs yet</span>}
                </div>
              </div>
            </div>
          )}
          {quarterlyStatus?.recentRuns && quarterlyStatus.recentRuns.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Recent Auto-Backups</div>
              <div className="space-y-1">
                {quarterlyStatus.recentRuns.slice(0, 3).map((run) => (
                  <div key={run.id} className="flex items-center justify-between text-xs bg-card/30 rounded px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      {run.status === "completed"
                        ? <CheckCircle className="h-3 w-3 text-green-400" />
                        : run.status === "failed"
                        ? <XCircle className="h-3 w-3 text-red-400" />
                        : <Clock className="h-3 w-3 text-amber-400" />}
                      <span className="text-foreground">{run.bundleName ?? "—"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>{new Date(Number(run.createdAt)).toLocaleDateString()}</span>
                      {run.bundleSize ? <span>{(Number(run.bundleSize) / 1024).toFixed(0)} KB</span> : null}
                      {run.fileUrl && run.status === "completed" && (
                        <button onClick={() => window.open(run.fileUrl!, "_blank")} className="text-amber-400 hover:text-amber-300">
                          <Download className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <div>
        <h4 className="text-sm font-medium text-foreground mb-2">Export History</h4>
        <div className="space-y-2">
          {history?.map((run) => (
            <Card key={run.id} className="bg-card/50">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant={run.status === "completed" ? "default" : run.status === "failed" ? "destructive" : "secondary"}>
                    {run.status}
                  </Badge>
                  <div>
                    <div className="text-sm font-medium text-foreground">{run.bundleName}</div>
                    <div className="text-xs text-muted-foreground">
                      {run.exportType} · {new Date(Number(run.createdAt)).toLocaleString()}
                      {run.bundleSize ? ` · ${(Number(run.bundleSize) / 1024).toFixed(0)} KB` : ""}
                    </div>
                  </div>
                </div>
                {run.fileUrl && run.status === "completed" && (
                  <Button size="sm" variant="outline" onClick={() => window.open(run.fileUrl!, "_blank")}>
                    <Download className="h-3 w-3 mr-1" /> Download
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
          {(!history || history.length === 0) && (
            <div className="text-sm text-muted-foreground text-center py-8">No exports yet. Run your first export above.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Restore Spine Panel ───
function RestoreSpinePanel() {
  const [bundleJson, setBundleJson] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [restoreType, setRestoreType] = useState<string>("config");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateMutation = trpc.s76.restoreSpine.validate.useMutation();
  const executeMutation = trpc.s76.restoreSpine.execute.useMutation();
  const { data: history, refetch: refetchHistory } = trpc.s76.restoreSpine.getHistory.useQuery();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setBundleJson(content);
      handleValidate(content);
    };
    reader.readAsText(file);
  };

  const handleValidate = async (json?: string) => {
    try {
      const result = await validateMutation.mutateAsync({ bundleJson: json || bundleJson });
      setPreview(result);
      setRestoreType(result.bundleType);
      toast.success(`Bundle validated: ${result.bundleName} — ${result.validation.warnings.length} warnings`);
    } catch (e: any) {
      toast.error(`Validation failed: ${e.message}`);
    }
  };

  const handleRestore = async () => {
    try {
      const result = await executeMutation.mutateAsync({ bundleJson, restoreType: restoreType as any });
      toast.success(`Restore complete: ${result.summary}`);
      setPreview(null);
      setBundleJson("");
      refetchHistory();
    } catch (e: any) {
      toast.error(`Restore failed: ${e.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">Restore Spine Engine</h3>
        <p className="text-sm text-muted-foreground">Upload and restore from exported Luminari bundles</p>
      </div>

      {/* Upload */}
      <Card className="border-dashed">
        <CardContent className="p-4">
          <div className="text-center space-y-3">
            <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
            <div>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                Choose Bundle File (.json)
              </Button>
              <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileUpload} />
            </div>
            <p className="text-xs text-muted-foreground">Or paste bundle JSON below</p>
            <Textarea
              placeholder="Paste exported bundle JSON here..."
              value={bundleJson}
              onChange={(e) => setBundleJson(e.target.value)}
              rows={4}
              className="text-xs font-mono"
            />
            {bundleJson && !preview && (
              <Button onClick={() => handleValidate()} disabled={validateMutation.isPending}>
                {validateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                Validate Bundle
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {preview && (
        <Card className={`border-l-4 ${preview.riskLevel === "critical" ? "border-l-red-500" : preview.riskLevel === "high" ? "border-l-orange-500" : preview.riskLevel === "medium" ? "border-l-yellow-500" : "border-l-green-500"}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Bundle Validation Result
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">Bundle:</span> <span className="text-foreground">{preview.bundleName}</span></div>
              <div><span className="text-muted-foreground">Type:</span> <span className="text-foreground">{preview.bundleType}</span></div>
              <div><span className="text-muted-foreground">Tables:</span> <span className="text-foreground">{preview.tableCount}</span></div>
              <div><span className="text-muted-foreground">Configs:</span> <span className="text-foreground">{preview.configCount}</span></div>
              <div><span className="text-muted-foreground">Risk Level:</span> <Badge variant={preview.riskLevel === "critical" ? "destructive" : "secondary"}>{preview.riskLevel}</Badge></div>
              <div><span className="text-muted-foreground">Checksum:</span> {preview.validation.checksumValid ? <Badge className="bg-green-600">Valid</Badge> : <Badge variant="destructive">Invalid</Badge>}</div>
            </div>
            {preview.validation.warnings.length > 0 && (
              <div className="space-y-1">
                {preview.validation.warnings.map((w: string, i: number) => (
                  <div key={i} className="text-xs text-yellow-400 flex items-start gap-1">
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {w}
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3">
              <Select value={restoreType} onValueChange={setRestoreType}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full Restore</SelectItem>
                  <SelectItem value="schema">Schema Only</SelectItem>
                  <SelectItem value="config">Config Only</SelectItem>
                  <SelectItem value="deployment">Deployment</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleRestore} disabled={executeMutation.isPending} variant={preview.riskLevel === "critical" ? "destructive" : "default"}>
                {executeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                Execute Restore
              </Button>
              <Button variant="outline" onClick={() => { setPreview(null); setBundleJson(""); }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* History */}
      <div>
        <h4 className="text-sm font-medium text-foreground mb-2">Restore History</h4>
        <div className="space-y-2">
          {history?.map((run) => (
            <Card key={run.id} className="bg-card/50">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant={run.status === "completed" ? "default" : run.status === "failed" ? "destructive" : "secondary"}>
                      {run.status}
                    </Badge>
                    <div>
                      <div className="text-sm font-medium text-foreground">{run.bundleName}</div>
                      <div className="text-xs text-muted-foreground">
                        {run.restoreType} · {new Date(Number(run.startedAt)).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline">{run.riskLevel}</Badge>
                </div>
                {run.errors && (run.errors as string[]).length > 0 && (
                  <div className="mt-2 text-xs text-red-400">
                    {(run.errors as string[]).map((e, i) => <div key={i}>• {e}</div>)}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {(!history || history.length === 0) && (
            <div className="text-sm text-muted-foreground text-center py-8">No restore operations yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Admin Sovereign Control Panel ───
function AdminControlPanel() {
  const [activeSection, setActiveSection] = useState("engines");
  const [sqlInput, setSqlInput] = useState("");
  const [sqlResult, setSqlResult] = useState<any>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const { data: engines, refetch: refetchEngines } = trpc.s76.adminControl.listEngines.useQuery();
  const { data: streams, refetch: refetchStreams } = trpc.s76.adminControl.listStreams.useQuery();
  const { data: tables } = trpc.s76.adminControl.listTables.useQuery();
  const { data: changeLog, refetch: refetchLog } = trpc.s76.adminControl.getChangeLog.useQuery();
  const { data: systemStats } = trpc.s76.adminControl.getSystemStats.useQuery();
  const { data: tableDetail } = trpc.s76.adminControl.inspectTable.useQuery(
    { tableName: selectedTable! },
    { enabled: !!selectedTable }
  );

  const toggleEngine = trpc.s76.adminControl.toggleEngine.useMutation();
  const removeEngine = trpc.s76.adminControl.removeEngine.useMutation();
  const executeSql = trpc.s76.adminControl.executeSql.useMutation();
  const previewSql = trpc.s76.adminControl.previewSql.useMutation();
  const rollbackChange = trpc.s76.adminControl.rollbackChange.useMutation();

  const [newEngineForm, setNewEngineForm] = useState({ engineId: "", engineName: "", category: "", description: "" });
  const addEngine = trpc.s76.adminControl.addEngine.useMutation();
  const reorderEngines = trpc.s76.execution.reorderEngines.useMutation();

  const sections = [
    { id: "engines", label: "Engines", icon: Zap },
    { id: "streams", label: "Streams", icon: Activity },
    { id: "schema", label: "Schema", icon: Table2 },
    { id: "migrations", label: "SQL Runner", icon: Database },
    { id: "changelog", label: "Change Log", icon: GitBranch },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Admin Sovereign Control</h3>
          <p className="text-sm text-muted-foreground">Full system management without backend intervention</p>
        </div>
        {systemStats && (
          <div className="flex gap-2 text-xs">
            <Badge variant="outline">{systemStats.tableCount} tables</Badge>
            <Badge variant="outline">{systemStats.engineCount} engines</Badge>
            <Badge variant="outline">{systemStats.streamCount} streams</Badge>
          </div>
        )}
      </div>

      {/* Section Tabs */}
      <div className="flex gap-1 border-b border-border pb-1">
        {sections.map(s => (
          <Button key={s.id} variant={activeSection === s.id ? "default" : "ghost"} size="sm" onClick={() => setActiveSection(s.id)}>
            <s.icon className="h-3 w-3 mr-1" /> {s.label}
          </Button>
        ))}
      </div>

      {/* Engine Manager */}
      {activeSection === "engines" && (
        <div className="space-y-3">
          {/* Add Engine Form */}
          <Card className="border-dashed">
            <CardContent className="p-3">
              <div className="text-xs font-medium text-foreground mb-2">Register New Engine</div>
              <div className="grid grid-cols-4 gap-2">
                <Input placeholder="Engine ID" value={newEngineForm.engineId} onChange={e => setNewEngineForm(p => ({ ...p, engineId: e.target.value }))} className="text-xs" />
                <Input placeholder="Engine Name" value={newEngineForm.engineName} onChange={e => setNewEngineForm(p => ({ ...p, engineName: e.target.value }))} className="text-xs" />
                <Input placeholder="Category" value={newEngineForm.category} onChange={e => setNewEngineForm(p => ({ ...p, category: e.target.value }))} className="text-xs" />
                <Button size="sm" disabled={!newEngineForm.engineId || !newEngineForm.engineName || addEngine.isPending} onClick={async () => {
                  try {
                    await addEngine.mutateAsync(newEngineForm);
                    toast.success("Engine added");
                    setNewEngineForm({ engineId: "", engineName: "", category: "", description: "" });
                    refetchEngines();
                    refetchLog();
                  } catch (e: any) { toast.error(e.message); }
                }}>
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
            </CardContent>
          </Card>

          {engines?.map((engine, idx) => (
            <Card key={engine.id} className="bg-card/50">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Switch checked={engine.enabled} onCheckedChange={async (checked) => {
                      await toggleEngine.mutateAsync({ engineId: engine.engineId, enabled: checked });
                      refetchEngines();
                      refetchLog();
                    }} />
                    <div>
                      <div className="text-sm font-medium text-foreground">{engine.engineName}</div>
                      <div className="text-xs text-muted-foreground">{engine.engineId} · {engine.category || "uncategorized"} · v{engine.version || "1.0"}</div>
                      {engine.description && <div className="text-[10px] text-muted-foreground mt-0.5">{engine.description}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="flex flex-col">
                      <Button size="sm" variant="ghost" className="h-5 px-1" disabled={idx === 0} onClick={async () => {
                        if (engines && idx > 0) {
                          const newOrder = engines.map((e, i) => ({
                            engineId: e.engineId,
                            sortOrder: i === idx ? engines[idx - 1].sortOrder : i === idx - 1 ? engines[idx].sortOrder : e.sortOrder
                          }));
                          // @ts-expect-error pre-existing type mismatch
                          await reorderEngines.mutateAsync({ order: newOrder });
                          refetchEngines(); refetchLog();
                        }
                      }}>
                        <ChevronRight className="h-3 w-3 -rotate-90" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-5 px-1" disabled={engines ? idx === engines.length - 1 : true} onClick={async () => {
                        if (engines && idx < engines.length - 1) {
                          const newOrder = engines.map((e, i) => ({
                            engineId: e.engineId,
                            sortOrder: i === idx ? engines[idx + 1].sortOrder : i === idx + 1 ? engines[idx].sortOrder : e.sortOrder
                          }));
                          // @ts-expect-error pre-existing type mismatch
                          await reorderEngines.mutateAsync({ order: newOrder });
                          refetchEngines(); refetchLog();
                        }
                      }}>
                        <ChevronRight className="h-3 w-3 rotate-90" />
                      </Button>
                    </div>
                    <Badge variant={engine.enabled ? "default" : "secondary"} className="text-[9px]">
                      {engine.enabled ? "ACTIVE" : "OFF"}
                    </Badge>
                    <Badge variant="outline">#{engine.sortOrder}</Badge>
                    <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" onClick={async () => {
                      if (confirm(`Remove engine ${engine.engineName}?`)) {
                        await removeEngine.mutateAsync({ engineId: engine.engineId });
                        refetchEngines();
                        refetchLog();
                      }
                    }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {(!engines || engines.length === 0) && (
            <div className="text-sm text-muted-foreground text-center py-8">No engines registered. Add one above.</div>
          )}
        </div>
      )}

      {/* Stream Manager */}
      {activeSection === "streams" && (
        <div className="space-y-2">
          {streams?.map(stream => (
            <Card key={stream.id} className="bg-card/50">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${stream.enabled ? "bg-green-400" : "bg-red-400"}`} />
                  <div>
                    <div className="text-sm font-medium text-foreground">{stream.stream_name}</div>
                    <div className="text-xs text-muted-foreground">{stream.stream_id} · {stream.stream_type} · weight: {stream.signal_weight}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{stream.update_frequency}</Badge>
                  <Badge variant={stream.enabled ? "default" : "secondary"}>{stream.enabled ? "Active" : "Disabled"}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
          {(!streams || streams.length === 0) && (
            <div className="text-sm text-muted-foreground text-center py-8">No data streams registered. Use the Data Streams tab to add streams.</div>
          )}
        </div>
      )}

      {/* Schema Manager */}
      {activeSection === "schema" && (
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-1 space-y-1 max-h-[500px] overflow-y-auto">
            {tables?.map(t => (
              <button key={t.tableName} onClick={() => setSelectedTable(t.tableName)}
                className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent/50 flex justify-between ${selectedTable === t.tableName ? "bg-accent text-accent-foreground" : "text-foreground"}`}>
                <span className="truncate">{t.tableName}</span>
                <span className="text-muted-foreground ml-1">{t.rowCount}</span>
              </button>
            ))}
          </div>
          <div className="col-span-2">
            {tableDetail ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-foreground">{tableDetail.tableName}</h4>
                  <Badge variant="outline">{tableDetail.rowCount} rows</Badge>
                </div>
                <div className="text-xs">
                  <div className="font-medium text-foreground mb-1">Columns</div>
                  <div className="space-y-0.5">
                    {tableDetail.columns?.map((col: any, i: number) => (
                      <div key={i} className="flex gap-2 text-muted-foreground">
                        <span className="text-foreground font-mono w-40 truncate">{col.Field}</span>
                        <span className="w-32 truncate">{col.Type}</span>
                        <span className="w-16">{col.Null === "YES" ? "nullable" : "required"}</span>
                        {col.Key === "PRI" && <Badge className="text-[10px] h-4">PK</Badge>}
                        {col.Key === "MUL" && <Badge variant="outline" className="text-[10px] h-4">IDX</Badge>}
                      </div>
                    ))}
                  </div>
                </div>
                {tableDetail.sampleRows && tableDetail.sampleRows.length > 0 && (
                  <div className="text-xs">
                    <div className="font-medium text-foreground mb-1">Sample Rows (first 5)</div>
                    <div className="overflow-x-auto">
                      <pre className="text-[10px] text-muted-foreground bg-muted/30 p-2 rounded max-h-40 overflow-y-auto">
                        {JSON.stringify(tableDetail.sampleRows, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
                <div className="text-xs">
                  <div className="font-medium text-foreground mb-1">CREATE TABLE</div>
                  <pre className="text-[10px] text-muted-foreground bg-muted/30 p-2 rounded max-h-40 overflow-y-auto whitespace-pre-wrap">
                    {tableDetail.createStatement}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-16">Select a table to inspect</div>
            )}
          </div>
        </div>
      )}

      {/* SQL Runner */}
      {activeSection === "migrations" && (
        <div className="space-y-3">
          <Textarea
            placeholder="Enter SQL statement..."
            value={sqlInput}
            onChange={e => setSqlInput(e.target.value)}
            rows={4}
            className="font-mono text-xs"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={async () => {
              const result = await previewSql.mutateAsync({ sql: sqlInput });
              setSqlResult({ type: "preview", ...result });
            }} disabled={!sqlInput || previewSql.isPending}>
              <Eye className="h-3 w-3 mr-1" /> Preview
            </Button>
            <Button size="sm" onClick={async () => {
              try {
                const result = await executeSql.mutateAsync({ sql: sqlInput });
                setSqlResult({ type: "result", ...result });
                refetchLog();
                toast.success(`SQL ${result.success ? "executed" : "failed"}: ${result.rowsAffected} rows affected`);
              } catch (e: any) {
                toast.error(e.message);
              }
            }} disabled={!sqlInput || executeSql.isPending}>
              {executeSql.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}
              Execute
            </Button>
          </div>
          {sqlResult && (
            <Card className={`bg-card/50 ${sqlResult.type === "preview" && sqlResult.isDestructive ? "border-red-500/50" : ""}`}>
              <CardContent className="p-3">
                {sqlResult.type === "preview" ? (
                  <div className="text-xs space-y-1">
                    <div className="flex gap-2">
                      <Badge variant={sqlResult.riskLevel === "high" ? "destructive" : sqlResult.riskLevel === "medium" ? "secondary" : "default"}>
                        {sqlResult.riskLevel} risk
                      </Badge>
                      {sqlResult.isDestructive && <Badge variant="destructive">Destructive</Badge>}
                      {sqlResult.isSelect && <Badge>Read-only</Badge>}
                    </div>
                    {sqlResult.warning && <div className="text-yellow-400">{sqlResult.warning}</div>}
                  </div>
                ) : (
                  <pre className="text-xs text-muted-foreground max-h-60 overflow-y-auto">
                    {JSON.stringify(sqlResult.result, null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Change Log */}
      {activeSection === "changelog" && (
        <div className="space-y-2">
          {changeLog?.map(change => (
            <Card key={change.id} className="bg-card/50">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-[10px]">{change.actionType}</Badge>
                  <div>
                    <div className="text-xs text-foreground">{change.description || `${change.actionType} on ${change.targetSystem}`}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(Number(change.timestamp)).toLocaleString()} · {change.adminName || change.adminId}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {change.rolledBack && <Badge variant="secondary" className="text-[10px]">Rolled back</Badge>}
                  {change.rollbackAvailable && !change.rolledBack && (
                    <Button size="sm" variant="ghost" className="text-xs" onClick={async () => {
                      if (confirm("Rollback this change?")) {
                        await rollbackChange.mutateAsync({ changeId: change.id });
                        refetchLog();
                        refetchEngines();
                        refetchStreams();
                        toast.success("Change rolled back");
                      }
                    }}>
                      <RotateCcw className="h-3 w-3 mr-1" /> Rollback
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {(!changeLog || changeLog.length === 0) && (
            <div className="text-sm text-muted-foreground text-center py-8">No changes recorded yet.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Data Stream Manager Panel (with Execution Bridge) ───
function DataStreamPanel() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedStream, setExpandedStream] = useState<string | null>(null);
  const [runningStreams, setRunningStreams] = useState<Set<string>>(new Set());
  const [streamResults, setStreamResults] = useState<Record<string, { success: boolean; message: string; recordsProcessed?: number; signals_generated?: number }>>({});
  const [newStream, setNewStream] = useState({
    stream_id: "", stream_name: "", stream_type: "government_complaints",
    source_url: "", update_frequency: "daily", signal_weight: 100,
    confidence_multiplier: 100, description: "",
  });

  const { data: streams, refetch } = trpc.s76.dataStream.getStreamsWithHealth.useQuery();
  const { data: stats, refetch: refetchStats } = trpc.s76.dataStream.getStreamStats.useQuery();
  const { data: types } = trpc.s76.dataStream.getStreamTypes.useQuery();
  const { data: schedulerStatus, refetch: refetchScheduler } = trpc.s76.execution.getSchedulerStatus.useQuery();
  const createStream = trpc.s76.dataStream.createStream.useMutation();
  const updateStream = trpc.s76.dataStream.updateStream.useMutation();
  const deleteStream = trpc.s76.dataStream.deleteStream.useMutation();

  // tRPC queries (read-only)
  // Self-healing actions now use direct fetch() to /api/executor/* endpoints
  const refreshSchedules = trpc.s76.execution.refreshSchedules.useMutation();
  const updateStreamConfig = trpc.s76.execution.updateStreamConfig.useMutation();
  const { data: diagnostics, refetch: refetchDiagnostics } = trpc.s76.execution.getStreamDiagnostics.useQuery(
    { stream_id: expandedStream! },
    { enabled: !!expandedStream }
  );
  const { data: executionLog, refetch: refetchLog } = trpc.s76.execution.getExecutionLog.useQuery({ limit: 20 });
  const [showExecutionLog, setShowExecutionLog] = useState(false);

  // ─── Direct fetch() execution layer — NO tRPC, NO abstraction ───
  const [runAllPending, setRunAllPending] = useState(false);
  // Per-stream action loading state: { [stream_id]: "run" | "retry" | "backfill" | "reset" | null }
  const [streamAction, setStreamAction] = useState<Record<string, string | null>>({});

  const execFetch = async (endpoint: string, body: Record<string, any>) => {
    const res = await fetch(`/api/executor/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok && !data.success) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  };

  // ─── Direct fetch() handlers ───
  const handleRunStream = async (stream_id: string) => {
    setRunningStreams(prev => new Set(prev).add(stream_id));
    setStreamAction(prev => ({ ...prev, [stream_id]: "run" }));
    setStreamResults(prev => ({ ...prev, [stream_id]: { success: true, message: "Running..." } }));
    console.log("[Executor] run_stream:", stream_id);
    try {
      const result = await execFetch("run_stream", { stream_id: stream_id });
      setStreamResults(prev => ({
        ...prev,
        [stream_id]: {
          success: result.success,
          message: result.message,
          recordsProcessed: result.records_processed,
          signals_generated: result.signals_generated,
        },
      }));
      toast[result.success ? "success" : "error"](`▶ ${stream_id}: ${result.message}`);
      refetch(); refetchStats(); refetchScheduler();
    } catch (e: any) {
      setStreamResults(prev => ({ ...prev, [stream_id]: { success: false, message: e.message } }));
      toast.error(`▶ ${stream_id}: ${e.message}`);
    } finally {
      setRunningStreams(prev => { const n = new Set(prev); n.delete(stream_id); return n; });
      setStreamAction(prev => ({ ...prev, [stream_id]: null }));
    }
  };

  const handleRetryStream = async (stream_id: string) => {
    setRunningStreams(prev => new Set(prev).add(stream_id));
    setStreamAction(prev => ({ ...prev, [stream_id]: "retry" }));
    setStreamResults(prev => ({ ...prev, [stream_id]: { success: true, message: "Retrying..." } }));
    console.log("[Executor] retry_stream:", stream_id);
    try {
      const result = await execFetch("retry_stream", { stream_id: stream_id });
      setStreamResults(prev => ({
        ...prev,
        [stream_id]: {
          success: result.success,
          message: result.message,
          recordsProcessed: result.records_processed,
          signals_generated: result.signals_generated,
        },
      }));
      toast[result.success ? "success" : "error"](`↻ ${stream_id}: ${result.message}`);
      refetch(); refetchStats(); refetchScheduler();
    } catch (e: any) {
      setStreamResults(prev => ({ ...prev, [stream_id]: { success: false, message: e.message } }));
      toast.error(`↻ ${stream_id}: ${e.message}`);
    } finally {
      setRunningStreams(prev => { const n = new Set(prev); n.delete(stream_id); return n; });
      setStreamAction(prev => ({ ...prev, [stream_id]: null }));
    }
  };

  const handleBackfillStream = async (stream_id: string) => {
    setRunningStreams(prev => new Set(prev).add(stream_id));
    setStreamAction(prev => ({ ...prev, [stream_id]: "backfill" }));
    setStreamResults(prev => ({ ...prev, [stream_id]: { success: true, message: "Backfilling..." } }));
    console.log("[Executor] backfill_stream:", stream_id);
    try {
      const result = await execFetch("backfill_stream", { stream_id: stream_id });
      setStreamResults(prev => ({
        ...prev,
        [stream_id]: {
          success: result.success,
          message: result.message,
          recordsProcessed: result.records_processed,
          signals_generated: result.signals_generated,
        },
      }));
      toast[result.success ? "success" : "error"](`⏪ ${stream_id}: ${result.message}`);
      refetch(); refetchStats(); refetchScheduler(); refetchDiagnostics();
    } catch (e: any) {
      setStreamResults(prev => ({ ...prev, [stream_id]: { success: false, message: e.message } }));
      toast.error(`⏪ ${stream_id}: ${e.message}`);
    } finally {
      setRunningStreams(prev => { const n = new Set(prev); n.delete(stream_id); return n; });
      setStreamAction(prev => ({ ...prev, [stream_id]: null }));
    }
  };

  const handleResetCheckpoint = async (stream_id: string) => {
    setStreamAction(prev => ({ ...prev, [stream_id]: "reset" }));
    console.log("[Executor] reset_checkpoint:", stream_id);
    try {
      const result = await execFetch("reset_checkpoint", { stream_id: stream_id });
      toast.success(`♻ ${stream_id}: ${result.message}`);
      refetch(); refetchDiagnostics();
    } catch (e: any) {
      toast.error(`♻ ${stream_id}: ${e.message}`);
    } finally {
      setStreamAction(prev => ({ ...prev, [stream_id]: null }));
    }
  };

  const handleRunAll = async () => {
    setRunAllPending(true);
    toast.info("▶ Running all enabled streams...");
    console.log("[Executor] run_all_streams");
    try {
      const result = await execFetch("run_all_streams", {});
      toast.success(`▶ Completed: ${result.succeeded}/${result.total_streams} succeeded, ${result.failed} failed`);
      for (const r of (result.results || [])) {
        setStreamResults(prev => ({
          ...prev,
          [r.stream_id]: { success: r.success, message: r.message, recordsProcessed: r.records_processed, signals_generated: r.signals_generated },
        }));
      }
      refetch(); refetchStats(); refetchScheduler();
    } catch (e: any) {
      toast.error(`▶ Run all failed: ${e.message}`);
    } finally {
      setRunAllPending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Data Stream Manager</h3>
          <p className="text-sm text-muted-foreground">Create, manage, and execute ingestion streams — all from Sovereign Control</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="text-green-400 border-green-500/30 hover:bg-green-500/10" onClick={handleRunAll} disabled={runAllPending}>
            {runAllPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}
            ▶ Run All Streams
          </Button>
          <Button size="sm" variant="outline" onClick={async () => {
            try {
              const result = await refreshSchedules.mutateAsync();
              toast.success(`Schedules refreshed: ${result.activeJobs?.length ?? 0} jobs active`);
              refetchScheduler();
            } catch (e: any) { toast.error(e.message); }
          }} disabled={refreshSchedules.isPending}>
            {refreshSchedules.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Refresh Schedules
          </Button>
          <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="h-3 w-3 mr-1" /> Add Stream
          </Button>
        </div>
      </div>

      {/* Stats + Scheduler Status */}
      {(() => {
        const safeStats = stats ?? { total_streams: 0, enabled_streams: 0, total_records_ingested: 0, total_signals_generated: 0 };
        return (
          <div className="grid grid-cols-5 gap-3">
            <Card className="bg-card/50"><CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Total Streams</div>
              <div className="text-xl font-bold text-foreground">{safeStats.total_streams}</div>
            </CardContent></Card>
            <Card className="bg-card/50"><CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Active</div>
              <div className="text-xl font-bold text-green-400">{safeStats.enabled_streams}</div>
            </CardContent></Card>
            <Card className="bg-card/50"><CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Records Ingested</div>
              <div className="text-xl font-bold text-foreground">{(safeStats.total_records_ingested ?? 0).toLocaleString()}</div>
            </CardContent></Card>
            <Card className="bg-card/50"><CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Signals Generated</div>
              <div className="text-xl font-bold text-foreground">{(safeStats.total_signals_generated ?? 0).toLocaleString()}</div>
            </CardContent></Card>
            <Card className="bg-card/50"><CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Scheduler</div>
              <div className="text-sm font-bold text-foreground">
                {schedulerStatus ? `${schedulerStatus.activeJobs?.length ?? 0} jobs · ${schedulerStatus.runningIngestions?.length ?? 0} running` : "Loading..."}
              </div>
            </CardContent></Card>
          </div>
        );
      })()}

      {/* Add Form */}
      {showAddForm && (
        <Card className="border-dashed">
          <CardContent className="p-4 space-y-3">
            <div className="text-sm font-medium text-foreground">New Data Stream</div>
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Stream ID (e.g., wa-complaints)" value={newStream.stream_id} onChange={e => setNewStream(p => ({ ...p, stream_id: e.target.value }))} className="text-xs" />
              <Input placeholder="Stream Name" value={newStream.stream_name} onChange={e => setNewStream(p => ({ ...p, stream_name: e.target.value }))} className="text-xs" />
              <Select value={newStream.stream_type} onValueChange={v => setNewStream(p => ({ ...p, stream_type: v }))}>
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {types?.stream_types.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={newStream.update_frequency} onValueChange={v => setNewStream(p => ({ ...p, update_frequency: v }))}>
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {types?.updateFrequencies.map(f => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Source URL (optional)" value={newStream.source_url} onChange={e => setNewStream(p => ({ ...p, source_url: e.target.value }))} className="text-xs" />
              <Input type="number" placeholder="Signal Weight (100)" value={newStream.signal_weight} onChange={e => setNewStream(p => ({ ...p, signal_weight: parseInt(e.target.value) || 100 }))} className="text-xs" />
            </div>
            <Textarea placeholder="Description" value={newStream.description} onChange={e => setNewStream(p => ({ ...p, description: e.target.value }))} rows={2} className="text-xs" />
            <div className="flex gap-2">
              <Button size="sm" disabled={!newStream.stream_id || !newStream.stream_name || createStream.isPending} onClick={async () => {
                try {
                  await createStream.mutateAsync(newStream);
                  toast.success("Stream created — scheduler refreshed");
                  setShowAddForm(false);
                  setNewStream({ stream_id: "", stream_name: "", stream_type: "government_complaints", source_url: "", update_frequency: "daily", signal_weight: 100, confidence_multiplier: 100, description: "" });
                  refetch();
                  refetchStats();
                  refetchScheduler();
                } catch (e: any) { toast.error(e.message); }
              }}>
                {createStream.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                Create Stream
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Execution Log Toggle */}
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => { setShowExecutionLog(!showExecutionLog); if (!showExecutionLog) refetchLog(); }}>
          <FileText className="h-3 w-3 mr-1" /> {showExecutionLog ? "Hide" : "Show"} Execution Log
        </Button>
      </div>

      {/* Execution Log */}
      {showExecutionLog && executionLog && (
        <Card className="bg-card/50">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-sm">Execution Log (Last 20)</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {executionLog.map((entry: any) => (
                <div key={entry.id} className="flex items-center gap-2 text-[10px] py-1 border-b border-border/30">
                  <Badge variant={entry.status === "applied" ? "default" : entry.status === "rolled_back" ? "secondary" : "destructive"} className="text-[9px] h-4">
                    {entry.status}
                  </Badge>
                  <span className="text-muted-foreground">{new Date(Number(entry.timestamp)).toLocaleString()}</span>
                  <span className="text-foreground font-medium">{entry.patchType}</span>
                  <span className="text-muted-foreground">{entry.targetId}</span>
                  <span className="text-foreground flex-1 truncate">{entry.description}</span>
                  <span className="text-muted-foreground">by {entry.appliedByName}</span>
                </div>
              ))}
              {executionLog.length === 0 && <div className="text-xs text-muted-foreground text-center py-2">No execution log entries yet.</div>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stream List with Execution Controls */}
      <div className="space-y-2">
        {streams?.map(stream => {
          const isRunning = runningStreams.has(stream.stream_id);
          const result = streamResults[stream.stream_id];
          const isExpanded = expandedStream === stream.stream_id;
          return (
            <Card key={stream.id} className={`bg-card/50 ${isRunning ? "border-amber-500/50" : result ? (result.success ? "border-green-500/30" : "border-red-500/30") : ""}`}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpandedStream(isExpanded ? null : stream.stream_id)}>
                    <div className={`h-2.5 w-2.5 rounded-full ${isRunning ? "bg-amber-400 animate-pulse" : (stream as any).auto_disabled ? "bg-red-600 animate-pulse" : stream.health_status === "healthy" ? "bg-green-400" : stream.health_status === "stale" ? "bg-yellow-400" : "bg-red-400"}`} />
                    <div>
                      <div className="text-sm font-medium text-foreground">{stream.stream_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {stream.stream_id} · {stream.stream_type} · {stream.update_frequency}
                        {(stream.records_ingested ?? 0) > 0 && ` · ${(stream.records_ingested ?? 0).toLocaleString()} records`}
                        {(stream.signals_generated ?? 0) > 0 && ` · ${(stream.signals_generated ?? 0).toLocaleString()} signals`}
                        {(stream as any).auto_disabled && " · AUTO-DISABLED"}
                        {((stream as any).consecutive_failures ?? 0) > 0 && ` · ${(stream as any).consecutive_failures} consecutive failures`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Execution Status Badge */}
                    {isRunning && <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30"><Loader2 className="h-2.5 w-2.5 animate-spin mr-1" />Running</Badge>}
                    {!isRunning && result && (
                      <Badge variant={result.success ? "default" : "destructive"} className="text-[10px]">
                        {result.success ? <CheckCircle className="h-2.5 w-2.5 mr-1" /> : <XCircle className="h-2.5 w-2.5 mr-1" />}
                        {result.recordsProcessed !== undefined ? `${result.recordsProcessed} rec / ${result.signals_generated} sig` : (result.success ? "Done" : "Failed")}
                      </Badge>
                    )}
                    <Badge variant="outline">wt: {stream.signal_weight}</Badge>
                    {/* ▶ Run */}
                    <Button size="sm" variant="outline" className="text-green-400 border-green-500/30 hover:bg-green-500/10"
                      disabled={isRunning}
                      onClick={() => handleRunStream(stream.stream_id)}
                      title="Run stream">
                      {streamAction[stream.stream_id] === "run" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    </Button>
                    {/* ↻ Retry */}
                    <Button size="sm" variant="outline" className="text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                      disabled={isRunning}
                      onClick={() => handleRetryStream(stream.stream_id)}
                      title="Retry (reset counters + re-enable + run)">
                      {streamAction[stream.stream_id] === "retry" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                    </Button>
                    {/* ⏪ Backfill */}
                    <Button size="sm" variant="outline" className="text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10"
                      disabled={isRunning}
                      onClick={() => handleBackfillStream(stream.stream_id)}
                      title="Backfill (reset checkpoint + full re-ingestion)">
                      {streamAction[stream.stream_id] === "backfill" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
                    </Button>
                    {/* ♻ Reset */}
                    <Button size="sm" variant="outline" className="text-purple-400 border-purple-500/30 hover:bg-purple-500/10"
                      disabled={isRunning || streamAction[stream.stream_id] === "reset"}
                      onClick={() => handleResetCheckpoint(stream.stream_id)}
                      title="Reset checkpoint (no run)">
                      {streamAction[stream.stream_id] === "reset" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={async () => {
                      await updateStream.mutateAsync({ stream_id: stream.stream_id, updates: { enabled: !stream.enabled } });
                      refetch();
                      refetchScheduler();
                      toast.success(`Stream ${!stream.enabled ? "enabled" : "disabled"}`);
                    }}>
                      <ToggleLeft className={`h-3 w-3 ${stream.enabled ? "text-green-400" : "text-muted-foreground"}`} />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-400" onClick={async () => {
                      if (confirm(`Delete stream ${stream.stream_name}?`)) {
                        await deleteStream.mutateAsync({ stream_id: stream.stream_id });
                        refetch();
                      }
                    }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {/* Expanded Detail — execution results + stream info + diagnostics + self-healing */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-border space-y-3">
                    {/* Basic Info */}
                    <div className="grid grid-cols-4 gap-3 text-xs">
                      <div><span className="text-muted-foreground">Source:</span> <span className="text-foreground">{stream.source_url || "N/A"}</span></div>
                      <div><span className="text-muted-foreground">Weight:</span> <span className="text-foreground">{stream.signal_weight}</span></div>
                      <div><span className="text-muted-foreground">Confidence:</span> <span className="text-foreground">{stream.confidence_multiplier}%</span></div>
                      <div><span className="text-muted-foreground">Enabled:</span> <span className={stream.enabled ? "text-green-400" : "text-red-400"}>{stream.enabled ? "Yes" : "No"}</span></div>
                    </div>

                    {/* Self-Healing Status */}
                    {diagnostics?.stream && (
                      <div className="bg-muted/20 rounded p-2 space-y-1">
                        <div className="text-xs font-medium text-foreground flex items-center gap-2">
                          <Shield className="h-3 w-3" /> Self-Healing Status
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-[10px]">
                          <div><span className="text-muted-foreground">Last Run:</span> <span className={diagnostics.stream.last_run_status === "completed" ? "text-green-400" : diagnostics.stream.last_run_status === "failed" ? "text-red-400" : "text-foreground"}>{diagnostics.stream.last_run_status || "Never"}</span></div>
                          <div><span className="text-muted-foreground">Failures:</span> <span className="text-foreground">{diagnostics.stream.consecutive_failures ?? 0} consecutive / {diagnostics.stream.failure_count ?? 0} total</span></div>
                          <div><span className="text-muted-foreground">Last Success:</span> <span className="text-foreground">{diagnostics.stream.last_success_at ? new Date(diagnostics.stream.last_success_at).toLocaleString() : "Never"}</span></div>
                          <div><span className="text-muted-foreground">Auto-Disabled:</span> <span className={diagnostics.stream.auto_disabled ? "text-red-400 font-bold" : "text-green-400"}>{diagnostics.stream.auto_disabled ? "YES" : "No"}</span></div>
                        </div>
                        {diagnostics.stream.last_error_type && (
                          <div className="text-[10px] text-red-400 mt-1">
                            <span className="font-medium">Last Error:</span> [{diagnostics.stream.last_error_type}] {diagnostics.stream.last_error_message}
                            {diagnostics.stream.last_http_status && ` (HTTP ${diagnostics.stream.last_http_status})`}
                          </div>
                        )}
                        {diagnostics.stream.disabled_reason && (
                          <div className="text-[10px] text-amber-400">
                            <span className="font-medium">Disabled Reason:</span> {diagnostics.stream.disabled_reason}
                          </div>
                        )}
                        {diagnostics.stream.retry_after_at && diagnostics.stream.retry_after_at > Date.now() && (
                          <div className="text-[10px] text-amber-400">
                            <span className="font-medium">Backoff Until:</span> {new Date(diagnostics.stream.retry_after_at).toLocaleString()}
                          </div>
                        )}
                        <div className="flex gap-1 mt-1 flex-wrap">
                          <Button size="sm" variant="outline" className="h-6 text-[10px]"
                            disabled={streamAction[stream.stream_id] === "resetCounters"}
                            onClick={async () => {
                              setStreamAction(p => ({ ...p, [stream.stream_id]: "resetCounters" }));
                              try {
                                const res = await fetch("/api/executor/reset_counters", {
                                  method: "POST", headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ stream_id: stream.stream_id })
                                });
                                const data = await res.json();
                                if (data.success) { toast.success(data.message); refetch(); refetchDiagnostics(); }
                                else toast.error(data.error);
                              } catch (e: any) { toast.error(e.message); }
                              // @ts-expect-error pre-existing type mismatch
                              finally { setStreamAction(p => ({ ...p, [stream.stream_id]: undefined })); }
                            }}>
                            {streamAction[stream.stream_id] === "resetCounters" ? <Loader2 className="h-2.5 w-2.5 animate-spin mr-1" /> : null}
                            Reset Counters
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 text-[10px] text-cyan-400"
                            disabled={streamAction[stream.stream_id] === "reset"}
                            onClick={() => handleResetCheckpoint(stream.stream_id)}>
                            {streamAction[stream.stream_id] === "reset" ? <Loader2 className="h-2.5 w-2.5 animate-spin mr-1" /> : <RefreshCw className="h-2.5 w-2.5 mr-1" />}
                            Reset Checkpoint
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 text-[10px] text-amber-400"
                            disabled={isRunning}
                            onClick={() => handleBackfillStream(stream.stream_id)}>
                            {streamAction[stream.stream_id] === "backfill" ? <Loader2 className="h-2.5 w-2.5 animate-spin mr-1" /> : <Zap className="h-2.5 w-2.5 mr-1" />}
                            Backfill (Full Re-ingest)
                          </Button>
                          {diagnostics.stream.auto_disabled && (
                            <Button size="sm" variant="outline" className="h-6 text-[10px] text-amber-400"
                              disabled={streamAction[stream.stream_id] === "reenable"}
                              onClick={async () => {
                                setStreamAction(p => ({ ...p, [stream.stream_id]: "reenable" }));
                                try {
                                  const res = await fetch("/api/executor/reenable_stream", {
                                    method: "POST", headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ stream_id: stream.stream_id })
                                  });
                                  const data = await res.json();
                                  if (data.success) { toast.success(data.message); refetch(); refetchDiagnostics(); refetchScheduler(); }
                                  else toast.error(data.error);
                                } catch (e: any) { toast.error(e.message); }
                                // @ts-expect-error pre-existing type mismatch
                                finally { setStreamAction(p => ({ ...p, [stream.stream_id]: undefined })); }
                              }}>
                              {streamAction[stream.stream_id] === "reenable" ? <Loader2 className="h-2.5 w-2.5 animate-spin mr-1" /> : null}
                              Re-enable Stream
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Last Run Diagnostics */}
                    {diagnostics?.lastRun && (
                      <div className="bg-muted/20 rounded p-2 space-y-1">
                        <div className="text-xs font-medium text-foreground flex items-center gap-2">
                          <Activity className="h-3 w-3" /> Last Run Diagnostics
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-[10px]">
                          <div><span className="text-muted-foreground">Status:</span> <span className={diagnostics.lastRun.status === "completed" ? "text-green-400" : "text-red-400"}>{diagnostics.lastRun.status}</span></div>
                          <div><span className="text-muted-foreground">Records:</span> <span className="text-foreground">{diagnostics.lastRun.recordsProcessed}</span></div>
                          <div><span className="text-muted-foreground">Signals:</span> <span className="text-foreground">{diagnostics.lastRun.signals_generated}</span></div>
                          {diagnostics.lastRun.errorClassification && <div><span className="text-muted-foreground">Error Class:</span> <span className="text-red-400">{diagnostics.lastRun.errorClassification}</span></div>}
                          {diagnostics.lastRun.httpStatus && <div><span className="text-muted-foreground">HTTP:</span> <span className="text-foreground">{diagnostics.lastRun.httpStatus}</span></div>}
                          {diagnostics.lastRun.adapterUsed && <div><span className="text-muted-foreground">Adapter:</span> <span className="text-foreground">{diagnostics.lastRun.adapterUsed}</span></div>}
                        </div>
                        {diagnostics.lastRun.suggestedRemediation && (
                          <div className="text-[10px] text-cyan-400 mt-1">
                            <span className="font-medium">Suggested Fix:</span> {diagnostics.lastRun.suggestedRemediation}
                          </div>
                        )}
                        {diagnostics.lastRun.endpointAttempted && (
                          <div className="text-[10px] text-muted-foreground mt-1">
                            <span className="font-medium">Endpoint:</span> {diagnostics.lastRun.endpointAttempted}
                          </div>
                        )}
                        {diagnostics.lastRun.errors && (diagnostics.lastRun.errors as string[]).length > 0 && (
                          <div className="text-[10px] text-red-400 mt-1">
                            {(diagnostics.lastRun.errors as string[]).map((e, i) => <div key={i}>• {e}</div>)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Execution result from current session */}
                    {result && (
                      <div className={`text-xs p-2 rounded ${result.success ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                        <span className="font-medium">Session execution:</span> {result.message}
                        {result.recordsProcessed !== undefined && (
                          <span> — {result.recordsProcessed} records processed, {result.signals_generated} signals generated</span>
                        )}
                      </div>
                    )}
                    {stream.description && (
                      <div className="text-xs text-muted-foreground">{stream.description}</div>
                    )}
                    {/* Stream Config Editor */}
                    <div className="bg-muted/20 rounded p-2 space-y-2">
                      <div className="text-xs font-medium text-foreground flex items-center gap-2">
                        <Settings className="h-3 w-3" /> Stream Configuration
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground">API URL</label>
                          <Input className="text-[10px] h-7" defaultValue={stream.api_url || ""}
                            onBlur={async (e) => {
                              if (e.target.value !== (stream.api_url || "")) {
                                try {
                                  await updateStreamConfig.mutateAsync({ stream_id: stream.stream_id, api_url: e.target.value });
                                  toast.success("API URL updated"); refetch();
                                } catch (err: any) { toast.error(err.message); }
                              }
                            }} />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">Cron Expression</label>
                          <Input className="text-[10px] h-7" defaultValue={stream.cron_expression || ""}
                            onBlur={async (e) => {
                              if (e.target.value !== (stream.cron_expression || "")) {
                                try {
                                  await updateStreamConfig.mutateAsync({ stream_id: stream.stream_id, cron_expression: e.target.value });
                                  toast.success("Cron updated"); refetch(); refetchScheduler();
                                } catch (err: any) { toast.error(err.message); }
                              }
                            }} />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] text-muted-foreground">Field Mapping (JSON)</label>
                          <Textarea className="text-[10px] font-mono" rows={2}
                            defaultValue={stream.field_mapping ? JSON.stringify(stream.field_mapping, null, 2) : "{}"}
                            onBlur={async (e) => {
                              try {
                                const parsed = JSON.parse(e.target.value);
                                await updateStreamConfig.mutateAsync({ stream_id: stream.stream_id, field_mapping: parsed });
                                toast.success("Field mapping updated"); refetch();
                              } catch (err: any) {
                                if (err instanceof SyntaxError) toast.error("Invalid JSON");
                                else toast.error(err.message);
                              }
                            }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {(!streams || streams.length === 0) && (
          <div className="text-sm text-muted-foreground text-center py-8">No data streams. Click "Add Stream" to create one.</div>
        )}
      </div>
    </div>
  );
}

// ─── Intervention Timeline Panel ───
function InterventionTimelinePanel() {
  const [selectedPattern, setSelectedPattern] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEvent, setNewEvent] = useState({
    patternId: "", eventType: "pattern_detected" as string,
    title: "", description: "", impactScore: 50,
  });

  const { data: timelines, refetch } = trpc.s76.interventionTimeline.getAllTimelines.useQuery();
  const { data: stats } = trpc.s76.interventionTimeline.getStats.useQuery();
  const { data: patternTimeline } = trpc.s76.interventionTimeline.getPatternTimeline.useQuery(
    { patternId: selectedPattern! },
    { enabled: !!selectedPattern }
  );
  const { data: eventTypes } = trpc.s76.interventionTimeline.getEventTypes.useQuery();
  const recordEvent = trpc.s76.interventionTimeline.recordEvent.useMutation();

  const eventColors: Record<string, string> = {
    pattern_detected: "bg-blue-500",
    strategy_generated: "bg-purple-500",
    intervention_started: "bg-amber-500",
    intervention_completed: "bg-green-500",
    outcome_recorded: "bg-cyan-500",
    trend_shift: "bg-pink-500",
    policy_change: "bg-teal-500",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Intervention Timeline</h3>
          <p className="text-sm text-muted-foreground">Track pattern evolution: detection → strategy → intervention → outcome → policy</p>
        </div>
        <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
          <Plus className="h-3 w-3 mr-1" /> Record Event
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          <Card className="bg-card/50"><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Total Events</div>
            <div className="text-xl font-bold text-foreground">{stats.totalEvents}</div>
          </CardContent></Card>
          <Card className="bg-card/50"><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Tracked Patterns</div>
            <div className="text-xl font-bold text-foreground">{stats.uniquePatterns}</div>
          </CardContent></Card>
          <Card className="bg-card/50"><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Policy Changes</div>
            <div className="text-xl font-bold text-teal-400">{stats.patternsWithPolicyChange}</div>
          </CardContent></Card>
          <Card className="bg-card/50"><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Avg Impact</div>
            <div className="text-xl font-bold text-foreground">{stats.avgImpactScore}/100</div>
          </CardContent></Card>
        </div>
      )}

      {/* Add Event Form */}
      {showAddForm && (
        <Card className="border-dashed">
          <CardContent className="p-4 space-y-3">
            <div className="text-sm font-medium text-foreground">Record Timeline Event</div>
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Pattern ID" value={newEvent.patternId} onChange={e => setNewEvent(p => ({ ...p, patternId: e.target.value }))} className="text-xs" />
              <Select value={newEvent.eventType} onValueChange={v => setNewEvent(p => ({ ...p, eventType: v }))}>
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {eventTypes?.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Event Title" value={newEvent.title} onChange={e => setNewEvent(p => ({ ...p, title: e.target.value }))} className="text-xs col-span-2" />
            </div>
            <Textarea placeholder="Description" value={newEvent.description} onChange={e => setNewEvent(p => ({ ...p, description: e.target.value }))} rows={2} className="text-xs" />
            <div className="flex gap-2">
              <Button size="sm" disabled={!newEvent.patternId || !newEvent.title || recordEvent.isPending} onClick={async () => {
                try {
                  await recordEvent.mutateAsync({ ...newEvent, eventType: newEvent.eventType as any });
                  // @ts-expect-error pre-existing type mismatch
                  toast({ title: "Event recorded" });
                  setShowAddForm(false);
                  setNewEvent({ patternId: "", eventType: "pattern_detected", title: "", description: "", impactScore: 50 });
                  refetch();
                // @ts-expect-error pre-existing type mismatch
                } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
              }}>Record</Button>
              <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline List or Detail */}
      {selectedPattern && patternTimeline ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelectedPattern(null)}>← Back</Button>
            <h4 className="text-sm font-medium text-foreground">Pattern: {selectedPattern}</h4>
            <Badge variant="outline">{patternTimeline.progressPercent}% complete</Badge>
            <Badge>{patternTimeline.currentStage}</Badge>
          </div>

          {/* Progress bar */}
          <div className="flex gap-1">
            {eventTypes?.map((type, i) => {
              const hasEvent = patternTimeline.events.some(e => e.eventType === type.id);
              return (
                <div key={type.id} className={`h-2 flex-1 rounded ${hasEvent ? eventColors[type.id] || "bg-primary" : "bg-muted"}`}
                  title={type.label} />
              );
            })}
          </div>

          {/* Events */}
          <div className="relative pl-6 space-y-3">
            <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-border" />
            {patternTimeline.events.map(event => (
              <div key={event.id} className="relative">
                <div className={`absolute -left-4 top-1.5 h-3 w-3 rounded-full border-2 border-background ${eventColors[event.eventType] || "bg-primary"}`} />
                <Card className="bg-card/50">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-[10px]">{event.eventType.replace(/_/g, " ")}</Badge>
                      <span className="text-xs text-muted-foreground">{new Date(Number(event.timestamp)).toLocaleString()}</span>
                      {event.impactScore ? <Badge variant="secondary" className="text-[10px]">impact: {event.impactScore}</Badge> : null}
                    </div>
                    <div className="text-sm font-medium text-foreground">{event.title}</div>
                    {event.description && <div className="text-xs text-muted-foreground mt-1">{event.description}</div>}
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {timelines?.map(timeline => (
            <Card key={timeline.patternId} className="bg-card/50 cursor-pointer hover:bg-accent/20 transition-colors"
              onClick={() => setSelectedPattern(timeline.patternId)}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-foreground">{timeline.patternId}</div>
                    <div className="text-xs text-muted-foreground">
                      {timeline.eventCount} events · {timeline.currentStage} · {timeline.progressPercent}% complete
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5">
                      {eventTypes?.map(type => {
                        const hasEvent = timeline.latestEvent?.eventType === type.id ||
                          (eventTypes.indexOf(type) <= eventTypes.findIndex(t => t.id === timeline.latestEvent?.eventType));
                        return <div key={type.id} className={`h-1.5 w-4 rounded ${hasEvent ? eventColors[type.id] || "bg-primary" : "bg-muted"}`} />;
                      })}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {(!timelines || timelines.length === 0) && (
            <div className="text-sm text-muted-foreground text-center py-8">No intervention timelines yet. Record an event to start tracking.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sunam Command Terminal ───
// Direct execution — no artifacts, no approval, immediate action
function CopilotPanel() {
  const [instruction, setInstruction] = useState("");
  const [execLog, setExecLog] = useState<Array<{
    id: number;
    instruction: string;
    steps: Array<{ step: number; tool: string; args: any; result: any; success: boolean; error?: string }>;
    final_response: string;
    actions_taken: number;
    success: boolean;
    executed_at: number;
  }>>([]);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logIdRef = useRef(0);

  const execute = trpc.s76.copilot.execute.useMutation();
  const { data: tools } = trpc.s76.copilot.getTools.useQuery();
  const dispatchTool = trpc.s76.copilot.dispatchTool.useMutation();

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [execLog]);

  const handleExecute = async () => {
    if (!instruction.trim() || execute.isPending) return;
    const inst = instruction.trim();
    setInstruction("");
    const localId = ++logIdRef.current;
    // Add a pending entry
    setExecLog(prev => [...prev, { id: localId, instruction: inst, steps: [], final_response: "", actions_taken: 0, success: false, executed_at: Date.now() }]);
    try {
      const result = await execute.mutateAsync({ instruction: inst, maxSteps: 10 });
      setExecLog(prev => prev.map(e => e.id === localId ? { ...result, id: localId } : e));
      if (result.success) {
        toast.success(`Sunam: ${result.actions_taken} action${result.actions_taken !== 1 ? "s" : ""} executed`);
      } else {
        toast.error(`Sunam: execution failed`);
      }
    } catch (e: any) {
      setExecLog(prev => prev.map(entry2 => entry2.id === localId ? { ...entry2, final_response: `Error: ${(e as any).message}`, success: false } : entry2));
      toast.error(`Sunam error: ${e.message}`);
    }
  };

  // Quick-action presets
  const QUICK_ACTIONS = [
    { label: "System State", instruction: "Get the current system state: all engines, streams, failures, and scheduler status" },
    { label: "Retry Failures", instruction: "Find all failed streams from the last 24 hours and retry them" },
    { label: "Run All Streams", instruction: "Run ingestion for all enabled data streams" },
    { label: "Execution Log", instruction: "Get the last 20 entries from the execution log" },
    { label: "Stream Diagnostics", instruction: "Get diagnostics for all streams that have consecutive failures" },
    { label: "Refresh Scheduler", instruction: "Refresh all stream schedules from the registry" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Bot className="h-5 w-5 text-cyan-400" />
            Sunam — Full System Operator
          </h3>
          <p className="text-sm text-muted-foreground">Direct execution authority. No proposals. No approval. Immediate action.</p>
        </div>
        <Badge variant="outline" className="text-cyan-400 border-cyan-400/30 bg-cyan-400/5">
          {tools ? `${tools.length} tools available` : "Loading tools..."}
        </Badge>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        {QUICK_ACTIONS.map(qa => (
          <Button key={qa.label} size="sm" variant="outline" className="text-xs h-7"
            onClick={() => setInstruction(qa.instruction)}
            disabled={execute.isPending}>
            {qa.label}
          </Button>
        ))}
      </div>

      {/* Command Input */}
      <div className="flex gap-2">
        <Textarea
          placeholder="Give Sunam an instruction... e.g. 'Run the cfpb-complaints stream and show me the result' or 'Disable all streams with more than 5 consecutive failures'"
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          onKeyDown={e => e.key === "Enter" && e.ctrlKey && handleExecute()}
          className="text-xs min-h-[60px] resize-none"
          disabled={execute.isPending}
        />
        <Button onClick={handleExecute} disabled={!instruction.trim() || execute.isPending}
          className="self-end bg-cyan-600 hover:bg-cyan-700 text-white">
          {execute.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">Ctrl+Enter to execute. Sunam calls tools directly — actions are immediate and real.</p>

      {/* Execution Log */}
      <div className="space-y-3 max-h-[500px] overflow-y-auto">
        {execLog.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Bot className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No executions yet. Give Sunam an instruction above.</p>
            <p className="text-xs mt-1">Sunam has governed authority over streams, engines, scheduler, diagnostics, configuration, and UI. Schema changes remain in Admin Control.</p>
          </div>
        )}
        {[...execLog].reverse().map(entry => (
          <Card key={entry.id} className={`border ${entry.success ? "border-green-500/20 bg-green-500/5" : entry.steps.length === 0 ? "border-border" : "border-red-500/20 bg-red-500/5"}`}>
            <CardContent className="p-4">
              {/* Instruction */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {entry.steps.length === 0 && !entry.final_response ? (
                      <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />
                    ) : entry.success ? (
                      <CheckCircle className="h-3 w-3 text-green-400" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-400" />
                    )}
                    <span className="text-xs font-medium text-foreground">{entry.instruction}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(entry.executed_at).toLocaleTimeString()} · {entry.actions_taken} action{entry.actions_taken !== 1 ? "s" : ""} taken
                  </div>
                </div>
              </div>

              {/* Steps */}
              {entry.steps.length > 0 && (
                <div className="space-y-1 mb-3">
                  {entry.steps.map(step => (
                    <div key={step.step} className={`flex items-start gap-2 text-[10px] rounded px-2 py-1 ${step.success ? "bg-green-500/10" : "bg-red-500/10"}`}>
                      <span className={`font-mono font-bold ${step.success ? "text-green-400" : "text-red-400"}`}>{step.success ? "✓" : "✗"}</span>
                      <span className="font-mono text-cyan-300">{step.tool}</span>
                      <span className="text-muted-foreground truncate flex-1">
                        {Object.entries(step.args).slice(0, 2).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ")}
                      </span>
                      {step.error && <span className="text-red-400 truncate max-w-[200px]">{step.error}</span>}
                      {step.success && step.result && (
                        <span className="text-green-400 truncate max-w-[200px]">
                          {typeof step.result === "object" ?
                            (step.result.records_processed !== undefined ? `${step.result.records_processed} records` :
                             step.result.row_count !== undefined ? `${step.result.row_count} rows` :
                             step.result.success !== undefined ? (step.result.success ? "ok" : "failed") :
                             JSON.stringify(step.result).substring(0, 60)) :
                            String(step.result).substring(0, 60)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Final Response */}
              {entry.final_response && (
                <div className="text-xs text-foreground bg-muted/30 rounded p-2 whitespace-pre-wrap">
                  {entry.final_response}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        <div ref={logEndRef} />
      </div>

      {/* Tool Reference */}
      {tools && tools.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Available tools ({tools.length})</summary>
          <div className="mt-2 grid grid-cols-2 gap-1">
            {tools.map(t => (
              <div key={t.name} className="bg-muted/30 rounded px-2 py-1">
                <span className="font-mono text-cyan-300 text-[10px]">{t.name}</span>
                <p className="text-[9px] text-muted-foreground truncate">{t.description}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ─── Main Sovereign Control Page ───
export default function SovereignControl() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("export");

  if (!user) {
    return (
      <PublicWalkthroughShell
        title="Sovereign Control"
        description="The independence and administration workspace is available for walkthrough. Exports, restores, stream controls, schema operations, and direct system execution remain owner-only."
        sections={["Export Spine", "Restore Spine", "Admin Control", "Data Streams", "Atlas", "Intervention Timeline", "Sunam"]}
      />
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center gap-4">
        <Link href="/mission-control">
          <Button variant="outline" size="sm" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sovereign Control</h1>
          <p className="text-sm text-muted-foreground">Luminari Independence Kit — Full platform portability and administration</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="export" className="gap-1"><Download className="h-3 w-3" /> Export Spine</TabsTrigger>
          <TabsTrigger value="restore" className="gap-1"><Upload className="h-3 w-3" /> Restore Spine</TabsTrigger>
          <TabsTrigger value="admin" className="gap-1"><Shield className="h-3 w-3" /> Admin Control</TabsTrigger>
          <TabsTrigger value="streams" className="gap-1"><Activity className="h-3 w-3" /> Data Streams</TabsTrigger>
          <TabsTrigger value="atlas" className="gap-1"><Database className="h-3 w-3" /> Atlas</TabsTrigger>
          <TabsTrigger value="timeline" className="gap-1"><GitBranch className="h-3 w-3" /> Timeline</TabsTrigger>
          <TabsTrigger value="copilot" className="gap-1"><Bot className="h-3 w-3" /> Sunam</TabsTrigger>
        </TabsList>

        <TabsContent value="export"><ExportSpinePanel /></TabsContent>
        <TabsContent value="restore"><RestoreSpinePanel /></TabsContent>
        <TabsContent value="admin"><AdminControlPanel /></TabsContent>
        <TabsContent value="streams"><DataStreamPanel /></TabsContent>
        <TabsContent value="atlas"><AtlasCommandPanel /></TabsContent>
        <TabsContent value="timeline"><InterventionTimelinePanel /></TabsContent>
        <TabsContent value="copilot"><CopilotPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
