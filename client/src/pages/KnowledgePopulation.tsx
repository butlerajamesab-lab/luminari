import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Database, Upload, AlertTriangle, CheckCircle2, BarChart3,
  BookOpen, Scale, Building2, FileText, Users, Heart, Gavel, Library,
  Landmark, Map, Workflow, Shield, Clock, ArrowUpRight, AlertCircle, Target,
  ClipboardPaste, X, Code2
} from "lucide-react";

const TABLE_ICONS: Record<string, React.ReactNode> = {
  legal_statutes: <BookOpen className="h-4 w-4" />,
  legal_case_law: <Gavel className="h-4 w-4" />,
  agency_authority_map: <Building2 className="h-4 w-4" />,
  strategy_claim_catalog: <Scale className="h-4 w-4" />,
  lumensend_templates: <FileText className="h-4 w-4" />,
  assembly_section_library: <Library className="h-4 w-4" />,
  legislator_contacts: <Users className="h-4 w-4" />,
  advocacy_organizations: <Heart className="h-4 w-4" />,
  doctrine_registry: <Landmark className="h-4 w-4" />,
  court_directory: <Map className="h-4 w-4" />,
  workflow_master: <Workflow className="h-4 w-4" />,
  evidence_profiles: <Shield className="h-4 w-4" />,
  deadline_rules: <Clock className="h-4 w-4" />,
  escalation_routes: <ArrowUpRight className="h-4 w-4" />,
  weak_joint_triggers: <AlertCircle className="h-4 w-4" />,
  proof_frameworks: <Target className="h-4 w-4" />,
};

type TargetTruth = {
  targetKind: "seed" | "jurisdictional" | "finite_universe";
  explanation: string;
};

const DEFAULT_TARGET_TRUTH: TargetTruth = {
  targetKind: "seed",
  explanation: "This target is a seed threshold for proving the rail works. It is not a claim of national functional coverage or universe completion.",
};

const TABLE_TARGET_TRUTH: Record<string, TargetTruth> = {
  legislator_contacts: {
    targetKind: "jurisdictional",
    explanation: "Seed count only. National function requires federal, state, DC, territorial, and applicable tribal/local legislative coverage or explicitly logged gaps.",
  },
  coalition_legislators: {
    targetKind: "jurisdictional",
    explanation: "Strategic seed set only. Coalition routing is not nationally functional until jurisdiction and committee coverage are verified nationwide.",
  },
  advocacy_organizations: {
    targetKind: "jurisdictional",
    explanation: "Seed count only. Real function requires national plus state/local coverage across support domains, not one dense region.",
  },
  coalition_advocacy_orgs: {
    targetKind: "seed",
    explanation: "Minimum coalition density threshold. Counts may exceed this target without implying universe completion.",
  },
  coalition_agencies: {
    targetKind: "jurisdictional",
    explanation: "Seed count only. National function requires federal, state, DC, territorial, tribal, and local agency routing where relevant.",
  },
  court_directory: {
    targetKind: "jurisdictional",
    explanation: "Seed count only. National function requires federal, state, tribal, administrative, county, and local filing forums where relevant.",
  },
  deadline_rules: {
    targetKind: "jurisdictional",
    explanation: "Seed count only. National function requires jurisdiction-specific deadlines and fallback warnings across the main claim families.",
  },
  escalation_routes: {
    targetKind: "jurisdictional",
    explanation: "Seed count only. No-dead-end operation requires verified fallback or escalation routes across jurisdictions.",
  },
  workflow_master: {
    targetKind: "jurisdictional",
    explanation: "Seed count only. Workflows must become jurisdiction-aware before this can be called nationally functional.",
  },
  legal_statutes: {
    targetKind: "jurisdictional",
    explanation: "Seed count only. National legal grounding requires federal and jurisdiction-specific statutes across the supported problem families.",
  },
  legal_case_law: {
    targetKind: "jurisdictional",
    explanation: "Seed count only. National legal grounding requires source-bound jurisdictional case law coverage, not just record count.",
  },
};

const getTargetTruth = (tableName: string) => TABLE_TARGET_TRUTH[tableName] ?? DEFAULT_TARGET_TRUTH;

const getSeedBadgeLabel = (count: number, coverage: number) => {
  if (count === 0) return "Empty";
  if (coverage >= 100) return "Seeded";
  return `${coverage}% seed`;
};

const getSeedStatusText = (count: number, target: number, coverage: number) => {
  if (count === 0) return "No verified seed data yet";
  if (coverage >= 100) {
    const surplus = count - target;
    return surplus > 0 ? `Seed target met · +${surplus.toLocaleString()} over seed` : "Seed target met";
  }
  return `${Math.max(target - count, 0).toLocaleString()} more seed records needed`;
};

// All tables now use the universal import endpoint

export default function KnowledgePopulation() {
  const { data: stats, isLoading, refetch } = trpc.knowledgeIngestion.populationStats.useQuery();
  const [importing, setImporting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [sqlPasteTable, setSqlPasteTable] = useState<string | null>(null);
  const [sqlText, setSqlText] = useState('');
  const [sqlImporting, setSqlImporting] = useState(false);

  const universalImport = trpc.knowledgeIngestion.importUniversalJSON.useMutation();
  const sqlImport = trpc.knowledgeIngestion.importSQL.useMutation();

  const handleImportClick = (tableName: string) => {
    setActiveTable(tableName);
    fileInputRef.current?.click();
  };

  const handleSqlPaste = async () => {
    if (!sqlPasteTable || !sqlText.trim()) return;
    setSqlImporting(true);
    try {
      const result = await sqlImport.mutateAsync({
        targetTable: sqlPasteTable,
        rawSql: sqlText,
      });
      toast.success('SQL Import complete', {
        description: `Inserted: ${result.inserted}, Skipped: ${result.skipped}${result.errors?.length ? `, Errors: ${result.errors.length}` : ''}. Total parsed: ${result.total}`,
      });
      if (result.errors?.length) {
        console.warn('SQL Import errors:', result.errors);
        toast.warning(`${result.errors.length} row errors`, {
          description: result.errors.slice(0, 3).join('\n'),
        });
      }
      setSqlText('');
      setSqlPasteTable(null);
      refetch();
    } catch (err: any) {
      toast.error('SQL Import failed', {
        description: err?.message ?? 'Unknown error',
      });
    } finally {
      setSqlImporting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeTable) return;

    // Validate file size (5MB max)
    if (file.size > 5_000_000) {
      toast.error("File too large", { description: "Maximum file size is 5MB." });
      if (fileInputRef.current) fileInputRef.current.value = "";
      setActiveTable(null);
      return;
    }

    setImporting(activeTable);
    try {
      const rawJson = await file.text();
      // Validate it's parseable JSON
      try { JSON.parse(rawJson); } catch {
        toast.error("Invalid JSON", { description: "File does not contain valid JSON." });
        return;
      }

      const result = await universalImport.mutateAsync({
        targetTable: activeTable,
        rawJson,
      });

      toast.success("Import complete", {
        description: `Inserted: ${result.inserted}, Skipped: ${result.skipped}${result.errors?.length ? `, Errors: ${result.errors.length}` : ""}. Total records: ${result.total}`,
      });

      if (result.errors?.length) {
        console.warn("Import errors:", result.errors);
      }

      refetch();
    } catch (err: any) {
      toast.error("Import failed", {
        description: err?.message ?? "Unknown error",
      });
    } finally {
      setImporting(null);
      setActiveTable(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const getCoverageColor = (coverage: number) => {
    if (coverage === 0) return "text-red-400";
    if (coverage < 25) return "text-orange-400";
    if (coverage < 50) return "text-yellow-400";
    if (coverage < 75) return "text-blue-400";
    return "text-emerald-400";
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.sql,.csv,.txt,application/json,text/plain,text/csv"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6 text-primary" />
            Knowledge Backbone Population
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor and populate the reference data that powers the platform's legal intelligence.
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <BarChart3 className="h-4 w-4 mr-2" />
          Refresh Stats
        </Button>
      </div>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
            <div className="space-y-1 text-sm">
              <div className="font-medium text-amber-300">No-dead-end coverage language is active.</div>
              <p className="text-muted-foreground">
                These counts are seed thresholds unless a table explicitly says otherwise. Seeded means the rail has enough data to operate for testing and early routing; it does not mean national function, no-dead-end coverage, or universe completion.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Card */}
      {stats?.summary && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.summary.totalPopulated.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Total Records</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.summary.totalTarget.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Seed Target Records</div>
              </div>
              <div className="text-center">
                <div className={`text-3xl font-bold ${getCoverageColor(stats.summary.overallCoverage)}`}>
                  {stats.summary.overallCoverage}%
                </div>
                <div className="text-sm text-muted-foreground">Seed Coverage</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-red-400">{stats.summary.criticallyLow.length}</div>
                <div className="text-sm text-muted-foreground">Empty Tables</div>
              </div>
            </div>

            {stats.summary.criticallyLow.length > 0 && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <span className="font-medium text-red-400">Critically empty: </span>
                  <span className="text-muted-foreground">{stats.summary.criticallyLow.join(", ")}</span>
                </div>
              </div>
            )}

            {stats.summary.underPopulated.length > 0 && (
              <div className="mt-2 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-400 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <span className="font-medium text-orange-400">Under-seeded (&lt;25%): </span>
                  <span className="text-muted-foreground">{stats.summary.underPopulated.join(", ")}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Table Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stats?.tables.map((t) => {
          const targetTruth = getTargetTruth(t.name);
          const displayProgress = Math.min(t.coverage, 100);
          return (
            <Card key={t.name} className={t.count === 0 ? "border-red-500/30" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    {TABLE_ICONS[t.name] ?? <Database className="h-4 w-4" />}
                    {t.label}
                  </CardTitle>
                  <Badge variant={t.count === 0 ? "destructive" : t.coverage < 25 ? "secondary" : "default"}>
                    {getSeedBadgeLabel(t.count, t.coverage)}
                  </Badge>
                </div>
                <CardDescription className="text-xs space-y-1">
                  <div>{t.count.toLocaleString()} / {t.target.toLocaleString()} seed records</div>
                  <div className="text-muted-foreground/90">{targetTruth.explanation}</div>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <Progress value={displayProgress} className="h-2" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className={`text-xs font-medium ${getCoverageColor(t.coverage)}`}>
                    {getSeedStatusText(t.count, t.target, t.coverage)}
                  </span>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleImportClick(t.name)}
                      disabled={importing === t.name}
                      className="h-7 text-xs"
                    >
                      <Upload className="h-3 w-3 mr-1" />
                      {importing === t.name ? "Importing..." : "File"}
                    </Button>
                    <Button
                      size="sm"
                      variant={sqlPasteTable === t.name ? "default" : "outline"}
                      onClick={() => {
                        if (sqlPasteTable === t.name) {
                          setSqlPasteTable(null);
                          setSqlText('');
                        } else {
                          setSqlPasteTable(t.name);
                          setSqlText('');
                        }
                      }}
                      className="h-7 text-xs"
                    >
                      <ClipboardPaste className="h-3 w-3 mr-1" />
                      Paste SQL
                    </Button>
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Coverage type: {targetTruth.targetKind.replace(/_/g, " ")}. This card must not be read as complete national no-dead-end coverage unless that state is explicitly shown.
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* SQL Paste Panel */}
      {sqlPasteTable && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Code2 className="h-4 w-4 text-primary" />
                Paste SQL into: <span className="text-primary">{sqlPasteTable.replace(/_/g, ' ')}</span>
              </CardTitle>
              <Button size="sm" variant="ghost" onClick={() => { setSqlPasteTable(null); setSqlText(''); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              value={sqlText}
              onChange={(e) => setSqlText(e.target.value)}
              placeholder={`Paste your SQL INSERT statements here...\n\nExample:\nINSERT INTO ${sqlPasteTable} (column1, column2) VALUES ('value1', 'value2');\nINSERT INTO ${sqlPasteTable} (column1, column2) VALUES ('value3', 'value4');\n\nMulti-row VALUES also supported:\nINSERT INTO ${sqlPasteTable} (col1, col2) VALUES\n  ('a', 'b'),\n  ('c', 'd');`}
              className="w-full h-48 p-3 bg-background border border-border rounded-lg font-mono text-xs resize-y focus:outline-none focus:ring-2 focus:ring-primary/50"
              spellCheck={false}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {sqlText.trim() ? `${(sqlText.match(/INSERT\s+INTO/gi) || []).length} INSERT statement(s) detected` : 'Waiting for SQL...'}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSqlText('')}
                  disabled={!sqlText.trim() || sqlImporting}
                >
                  Clear
                </Button>
                <Button
                  size="sm"
                  onClick={handleSqlPaste}
                  disabled={!sqlText.trim() || sqlImporting}
                >
                  {sqlImporting ? 'Importing...' : 'Import SQL'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import Formats</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-3">
          <div>
            <strong className="text-foreground">SQL Paste (recommended):</strong>
            <p className="mt-1">
              Click <span className="inline-flex items-center gap-1 text-xs bg-muted px-1.5 py-0.5 rounded"><ClipboardPaste className="h-3 w-3" /> Paste SQL</span> on any table card, then paste your <code className="text-xs bg-muted px-1 py-0.5 rounded">INSERT INTO ... VALUES ...</code> statements directly.
              Supports multiple statements, multi-row VALUES, and standard SQL quoting. Non-INSERT statements (CREATE TABLE, SET, etc.) are automatically skipped.
            </p>
          </div>
          <div>
            <strong className="text-foreground">JSON File Upload:</strong>
            <p className="mt-1">
              Click <span className="inline-flex items-center gap-1 text-xs bg-muted px-1.5 py-0.5 rounded"><Upload className="h-3 w-3" /> File</span> to upload a <code className="text-xs bg-muted px-1 py-0.5 rounded">.json</code> file.
              Supports flat arrays <code className="text-xs bg-muted px-1 py-0.5 rounded">{"[{...}]"}</code> or domain-grouped objects.
              Snake_case fields are preserved and unknown columns are ignored.
            </p>
          </div>
          <p className="text-xs">
            Maximum 2,000 records per import, 5MB size limit. Duplicates may still skip until enrichment merge/upsert is implemented.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
