import { useState } from "react";
import { Button } from "@/components/ui/button";

type mention_evidence = {
  documentId: number;
  documentName: string | null;
  sourceArtifactId: string;
  artifactKey: string;
  sessionId: string;
  mentionText: string;
  charStart: number;
  charEnd: number;
  bindingProvenanceRefs: string[];
  sourceContext: string | null;
  sourceContextOffset: number | null;
};

export type connection_basis = {
  canonicalEntityId: string;
  canonicalEntityName: string;
  sourceMentionCount: number;
  targetMentionCount: number;
  source: mention_evidence;
  target: mention_evidence;
};

export function DocumentConnectionEvidence({ basis, onOpenDocument }: {
  basis: connection_basis[];
  onOpenDocument: (id: number) => void;
}) {
  const [visible, setVisible] = useState(3);
  return <div className="space-y-3">
    <p className="text-xs font-medium">Recorded basis: {basis.length} shared entit{basis.length === 1 ? "y" : "ies"}</p>
    {basis.slice(0, visible).map(item => <section key={item.canonicalEntityId} className="rounded-md border border-border/60 p-3 space-y-2">
      <h4 className="text-sm font-medium">{item.canonicalEntityName}</h4>
      <p className="text-xs text-muted-foreground">{item.sourceMentionCount} mention{item.sourceMentionCount === 1 ? "" : "s"} in the first document · {item.targetMentionCount} in the second. One exact mention from each document is shown.</p>
      <div className="grid gap-3 lg:grid-cols-2">
        {[item.source, item.target].map((evidence, index) => <div key={`${index}:${evidence.sourceArtifactId}:${evidence.charStart}`} className="min-w-0 rounded-md bg-muted/20 p-2.5 space-y-2">
          <button className="text-xs text-primary hover:underline text-left break-words" onClick={() => onOpenDocument(evidence.documentId)}>{evidence.documentName || `Document ${evidence.documentId}`}</button>
          <p className="text-[10px] text-muted-foreground">{evidence.sourceContext ? "Source excerpt" : "Exact source mention"}</p>
          <blockquote className="border-l-2 border-primary/30 pl-2 text-xs whitespace-pre-wrap break-words">{evidence.sourceContext ?? evidence.mentionText}</blockquote>
          <p className="text-[10px] text-muted-foreground">Mention: “{evidence.mentionText}” · characters {evidence.charStart}–{evidence.charEnd}</p>
          <details className="text-[10px] text-muted-foreground">
            <summary className="cursor-pointer">Source identity</summary>
            <div className="mt-1 space-y-1 break-all">
              <div>Artifact: <code>{evidence.artifactKey}</code></div>
              <div>Source record: <code>{evidence.sourceArtifactId}</code></div>
              <div>Session: <code>{evidence.sessionId}</code></div>
              <div>Entity: <code>{item.canonicalEntityId}</code></div>
              {evidence.sourceContextOffset !== null && <div>Excerpt starts at character {evidence.sourceContextOffset}</div>}
              {evidence.bindingProvenanceRefs.length > 0 && <div>Reviewed identity binding: {evidence.bindingProvenanceRefs.map(reference => <code className="block" key={reference}>{reference}</code>)}</div>}
            </div>
          </details>
        </div>)}
      </div>
    </section>)}
    {visible < basis.length && <Button variant="ghost" size="sm" onClick={() => setVisible(count => count + 10)}>Show more evidence ({basis.length - visible} shared entities remaining)</Button>}
  </div>;
}
