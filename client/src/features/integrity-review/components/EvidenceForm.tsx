import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus } from "lucide-react";
import { EVIDENCE_SOURCE_CLASSES } from "../config";
import type { AttachEvidencePayload, EvidenceSourceClass } from "../types";
import { readable } from "../utils";

type EvidenceFormProps = {
  candidate_id: string;
  evidence_count: number;
  on_attach: (payload: AttachEvidencePayload) => void;
  is_pending: boolean;
};

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

export function EvidenceForm({ candidate_id, evidence_count, on_attach, is_pending }: EvidenceFormProps) {
  const [source_class, set_source_class] = useState<EvidenceSourceClass>("official_primary");
  const [posture, set_posture] = useState<AttachEvidencePayload["supports_or_contradicts"]>("supports");
  const [source_relation, set_source_relation] = useState("");
  const [source_record_key, set_source_record_key] = useState("");
  const [source_uri, set_source_uri] = useState("");
  const [pinpoint, set_pinpoint] = useState("");
  const [quote_text, set_quote_text] = useState("");
  const [source_content_hash, set_source_content_hash] = useState("");

  useEffect(() => {
    set_source_relation("");
    set_source_record_key("");
    set_source_uri("");
    set_pinpoint("");
    set_quote_text("");
    set_source_content_hash("");
  }, [candidate_id, evidence_count]);

  const has_locator = Boolean(source_uri.trim() || pinpoint.trim() || quote_text.trim());
  const can_submit =
    source_relation.trim().length > 0 &&
    source_record_key.trim().length > 0 &&
    SHA256_PATTERN.test(source_content_hash.trim()) &&
    has_locator &&
    !is_pending;

  const submit = () => {
    if (!can_submit) return;
    on_attach({
      candidate_id,
      source_class,
      source_relation: source_relation.trim(),
      source_record_key: source_record_key.trim(),
      source_uri: source_uri.trim() || undefined,
      quote_text: quote_text.trim() || undefined,
      pinpoint: pinpoint.trim() || undefined,
      source_content_hash: source_content_hash.trim().toLowerCase(),
      supports_or_contradicts: posture,
    });
  };

  return (
    <div className="mt-4 rounded-lg border border-dashed p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Plus className="h-4 w-4" /> Bind corroborating or contradicting evidence
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Add only a source you reviewed. Exact record identity, a locator, and the source content
        SHA-256 are required; a source name by itself is not corroboration.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Source class</Label>
          <Select value={source_class} onValueChange={value => set_source_class(value as EvidenceSourceClass)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {EVIDENCE_SOURCE_CLASSES.map(value => (
                <SelectItem key={value} value={value}>{readable(value)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Evidence posture</Label>
          <Select
            value={posture}
            onValueChange={value => set_posture(value as AttachEvidencePayload["supports_or_contradicts"])}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["supports", "contradicts", "context_only", "unresolved"] as const).map(value => (
                <SelectItem key={value} value={value}>{readable(value)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="integrity-source-origin">Independent source origin</Label>
          <Input
            id="integrity-source-origin"
            value={source_relation}
            onChange={event => set_source_relation(event.target.value)}
            placeholder="e.g. fec.gov or wa_pdc"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="integrity-source-key">Exact source record key</Label>
          <Input
            id="integrity-source-key"
            value={source_record_key}
            onChange={event => set_source_record_key(event.target.value)}
            placeholder="Filing, matter, bill, docket, or record ID"
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="integrity-source-uri">Official source URL</Label>
          <Input
            id="integrity-source-uri"
            type="url"
            value={source_uri}
            onChange={event => set_source_uri(event.target.value)}
            placeholder="https://…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="integrity-pinpoint">Pinpoint</Label>
          <Input
            id="integrity-pinpoint"
            value={pinpoint}
            onChange={event => set_pinpoint(event.target.value)}
            placeholder="Page, section, row, timestamp, or field"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="integrity-source-hash">Source content SHA-256</Label>
          <Input
            id="integrity-source-hash"
            className="font-mono"
            value={source_content_hash}
            onChange={event => set_source_content_hash(event.target.value)}
            placeholder="64 hexadecimal characters"
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="integrity-quote">Exact quotation or excerpt</Label>
          <Textarea
            id="integrity-quote"
            value={quote_text}
            onChange={event => set_quote_text(event.target.value)}
            placeholder="Preserve the exact source language when available"
          />
        </div>
      </div>
      <Button className="mt-4 w-full" variant="outline" disabled={!can_submit} onClick={submit}>
        {is_pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Attach evidence receipt
      </Button>
    </div>
  );
}
