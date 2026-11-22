import { Link } from "wouter";
import { ArrowLeft, BookOpen, Clock, Globe, MapPin, Shield } from "lucide-react";
import { trpc } from "@/lib/trpc";

/* ═══════════════════════════════════════════════════════════════════════
   LUMINARI — PUBLISHED SIGNALS (Gate B Kernel 2: Transparency)

   The public surface for governed signals. What appears here is a
   selection, made by a human at the governance gate in two separate
   acts: a signal is first promoted (accepted), then — distinctly —
   published. The text of each explainer is the signal's own recorded
   explanation, written deterministically when the pattern was
   detected. Nothing here is generated, scored, or inferred at read
   time, and an unpublished or demoted signal leaves this page on its
   own. Unreviewed candidates are never served publicly.
   ═══════════════════════════════════════════════════════════════════════ */

export default function PublishedSignals() {
  const published = trpc.signalPublication.listPublished.useQuery({ limit: 100 });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-10 space-y-8">
        <div>
          <Link href="/lighthouse" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Lighthouse
          </Link>
          <h1 className="mt-4 flex items-center gap-2 text-2xl font-semibold">
            <BookOpen className="h-6 w-6 text-emerald-400" />
            Published Signals
          </h1>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            These explainers are published through the Luminari governance gate. Each one is a
            recurrence observation drawn from public records — <strong className="text-foreground">not a
            finding of wrongdoing</strong>. A signal appears here only after a human reviewer has
            promoted it and then, in a separate act, chosen to publish it; both acts are recorded
            in the public governance log. If a signal is withdrawn or its promotion is reversed,
            it leaves this page.
          </p>
        </div>

        {published.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : published.isError ? (
          <p className="text-sm text-muted-foreground">
            The published signals could not be loaded right now. Please try again later.
          </p>
        ) : (published.data ?? []).length === 0 ? (
          <div className="rounded-lg border border-border p-8 text-center text-muted-foreground">
            <Shield className="mx-auto mb-2 h-8 w-8 opacity-40" />
            <p className="text-sm">No signals have been published yet.</p>
            <p className="mt-1 text-xs">
              Publication is deliberate: a person reviews each promoted signal and publishes it by name.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {(published.data ?? []).map((item: any) => (
              <article key={item.signalId} className="rounded-lg border border-border bg-card p-5">
                <h2 className="text-base font-medium leading-snug">{item.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.explanation}</p>
                {item.entityName && (
                  <p className="mt-2 text-sm">
                    Entity: <span className="font-medium">{item.entityName}</span>
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {item.jurisdiction}
                  </span>
                  <span className="flex items-center gap-1">
                    <Globe className="h-3 w-3" /> {item.stream}
                  </span>
                  <span className="capitalize">{item.category.replace(/_/g, " ")}</span>
                  <span className="capitalize">{item.severity}</span>
                  <span>Verification: {item.verificationState.replace(/_/g, " ")}</span>
                  {item.detectedAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Detected {new Date(item.detectedAt).toLocaleDateString()}
                    </span>
                  )}
                  <span>Published {new Date(item.publishedAt).toLocaleDateString()}</span>
                </div>
                <div className="mt-2 font-mono text-[10px] text-muted-foreground/70">
                  Signal record: {item.signalHash}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
