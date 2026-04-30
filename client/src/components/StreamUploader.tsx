// @ts-nocheck
/**
 * StreamUploader — Reusable JSON upload component for all 6 live data streams.
 * Accepts JSON array or CSV paste, validates shape, calls the appropriate ingest mutation.
 */
import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileJson, Loader2, CheckCircle2, AlertTriangle, X, Copy, Download } from "lucide-react";

interface StreamUploaderProps {
  title: string;
  description: string;
  sampleFields: { name: string; type: string; required?: boolean }[];
  onIngest: (records: any[]) => Promise<{ inserted: number } | any>;
  onSuccess?: () => void;
}

export function StreamUploader({ title, description, sampleFields, onIngest, onSuccess }: StreamUploaderProps) {
  const [mode, setMode] = useState<"closed" | "paste" | "file">("closed");
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<any[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [result, setResult] = useState<{ inserted: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function tryParse(text: string) {
    setParseError(null);
    setParsed(null);
    if (!text.trim()) return;
    try {
      const data = JSON.parse(text);
      const arr = Array.isArray(data) ? data : [data];
      if (arr.length === 0) {
        setParseError("Empty array — need at least 1 record");
        return;
      }
      setParsed(arr);
    } catch {
      // Try CSV parse
      const lines = text.trim().split("\n");
      if (lines.length < 2) {
        setParseError("Invalid JSON. For CSV, include a header row + at least 1 data row.");
        return;
      }
      const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
      const records = lines.slice(1).map(line => {
        const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
        const obj: Record<string, any> = {};
        headers.forEach((h, i) => {
          const val = vals[i] ?? "";
          // Try to parse numbers
          if (val && !isNaN(Number(val))) obj[h] = Number(val);
          else if (val === "true") obj[h] = true;
          else if (val === "false") obj[h] = false;
          else obj[h] = val;
        });
        return obj;
      }).filter(r => Object.values(r).some(v => v !== ""));
      if (records.length === 0) {
        setParseError("No valid data rows found in CSV");
        return;
      }
      setParsed(records);
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setRawText(text);
      tryParse(text);
      setMode("paste");
    };
    reader.readAsText(file);
  }

  async function handleIngest() {
    if (!parsed || parsed.length === 0) return;
    setIngesting(true);
    setResult(null);
    try {
      const res = await onIngest(parsed);
      setResult({ inserted: res?.inserted ?? parsed.length });
      setRawText("");
      setParsed(null);
      onSuccess?.();
    } catch (err: any) {
      setParseError(err?.message ?? "Ingestion failed");
    } finally {
      setIngesting(false);
    }
  }

  function generateSample() {
    const sample: Record<string, any> = {};
    sampleFields.forEach(f => {
      if (f.type === "number") sample[f.name] = 0;
      else if (f.type === "boolean") sample[f.name] = false;
      else sample[f.name] = `example_${f.name}`;
    });
    return JSON.stringify([sample], null, 2);
  }

  if (mode === "closed") {
    return (
      <Card className="border-dashed border-muted-foreground/30 bg-muted/10">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Upload className="h-4 w-4" />
              <span>{description}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setMode("paste")}>
                <FileJson className="h-3 w-3 mr-1" /> Paste JSON/CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="h-3 w-3 mr-1" /> Upload File
              </Button>
              <input ref={fileRef} type="file" accept=".json,.csv,.jsonl" className="hidden" onChange={handleFile} />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => { setMode("closed"); setRawText(""); setParsed(null); setParseError(null); setResult(null); }}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Schema hint */}
        <div className="flex flex-wrap gap-1">
          {sampleFields.map(f => (
            <Badge key={f.name} variant={f.required ? "default" : "outline"} className="text-[10px]">
              {f.name}{f.required ? "*" : ""}: {f.type}
            </Badge>
          ))}
        </div>

        {/* Paste area */}
        <textarea
          value={rawText}
          onChange={(e) => { setRawText(e.target.value); tryParse(e.target.value); }}
          placeholder={`Paste JSON array or CSV here...\n\nExample:\n${generateSample()}`}
          className="w-full h-32 bg-background border border-border rounded-lg p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
        />

        {/* Sample download */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setRawText(generateSample()); tryParse(generateSample()); }}>
            <Copy className="h-3 w-3 mr-1" /> Load Sample
          </Button>
          <input ref={fileRef} type="file" accept=".json,.csv,.jsonl" className="hidden" onChange={handleFile} />
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3 w-3 mr-1" /> Upload File
          </Button>
        </div>

        {/* Parse status */}
        {parseError && (
          <div className="flex items-center gap-2 text-sm text-red-400">
            <AlertTriangle className="h-4 w-4" /> {parseError}
          </div>
        )}
        {parsed && (
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> Parsed {parsed.length} record{parsed.length !== 1 ? "s" : ""} — ready to ingest
          </div>
        )}

        {/* Ingest button */}
        <Button
          onClick={handleIngest}
          disabled={!parsed || parsed.length === 0 || ingesting}
          className="w-full"
        >
          {ingesting ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Ingesting {parsed?.length} records...</>
          ) : (
            <><Upload className="h-4 w-4 mr-2" /> Ingest {parsed?.length ?? 0} Records</>
          )}
        </Button>

        {/* Result */}
        {result && (
          <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 p-2 rounded">
            <CheckCircle2 className="h-4 w-4" /> Successfully ingested {result.inserted} records
          </div>
        )}
      </CardContent>
    </Card>
  );
}
