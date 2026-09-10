import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import type { read_intake_pattern_catalog } from "../../../../server/intake-pattern-catalog";

type PatternCatalog = Awaited<ReturnType<typeof read_intake_pattern_catalog>>;

function readable(value: string) {
  return value.replace(/_structural_match$/, "").replace(/_/g, " ");
}

export function IntakePatternExplorer() {
  const query = trpc.enforcementIntel.get_intake_pattern_catalog.useQuery();
  const denied = ["UNAUTHORIZED", "FORBIDDEN"].includes(
    query.error?.data?.code ?? "",
  );
  const data: PatternCatalog | undefined = denied ? undefined : query.data;

  return (
    <section
      id="signal-artifact-browser"
      className="rounded-xl border border-border bg-card p-5 space-y-5"
    >
      <div>
        <h2 className="text-xl font-semibold">
          Intake patterns: meaning and evidence
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Explore what each rule looks for, the conditions it requires, and its
          retained match history.
        </p>
        <a className="text-sm text-cyan-400 underline" href="/signal-registry">
          Browse the other signal domains
        </a>
      </div>
      {query.error && (
        <div role="alert" className="text-red-400">
          <p>
            {data
              ? "Pattern history refresh failed. Showing the last successful result."
              : query.error.message}
          </p>
          <Button
            className="mt-2"
            size="sm"
            variant="outline"
            onClick={() => {
              void query.refetch();
            }}
          >
            Retry pattern history
          </Button>
        </div>
      )}
      {query.isLoading && (
        <p role="status">Loading pattern definitions and history…</p>
      )}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <strong>{data.rules.length.toLocaleString()}</strong>
              <p className="text-sm text-muted-foreground">
                Declared pattern rules
              </p>
            </div>
            <div>
              <strong>
                {data.distinct_pattern_occurrences.toLocaleString()}
              </strong>
              <p className="text-sm text-muted-foreground">
                Distinct recorded pattern identities
              </p>
            </div>
            <div>
              <strong>{data.chronology_observations.toLocaleString()}</strong>
              <p className="text-sm text-muted-foreground">
                Retained chronology observations
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Chronology observations describe individual events. Pattern matches
            require the declared sequence and evidence conditions below.
            Repeated processing of the same declared pattern identity does not
            add another occurrence. Historical matches remain available.
          </p>
          {data.distinct_pattern_occurrences === 0 && (
            <p
              role="status"
              className="rounded-lg border border-cyan-500/30 p-3"
            >
              No identified structural pattern matches are recorded in this
              lane. The rules below explain what the system is configured to
              detect; they are not claims that those patterns have occurred.
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {data.rules.map((rule) => (
              <article
                key={rule.rule_id}
                className="rounded-lg border border-border p-4 space-y-3"
              >
                <h3 className="font-semibold capitalize">
                  {readable(rule.pattern_type)}
                </h3>
                <p>{rule.description}</p>
                <div>
                  <h4 className="text-sm font-medium">Required sequence</h4>
                  <ol className="list-decimal pl-5 text-sm space-y-1">
                    {rule.required_sequence.map((step, index) => (
                      <li key={index}>{readable(step.to_state)}</li>
                    ))}
                  </ol>
                </div>
                <p className="text-sm">
                  Within {rule.time_window_days} days; at least{" "}
                  {rule.min_independent_source_artifacts} distinct source
                  artifact
                  {rule.min_independent_source_artifacts === 1 ? "" : "s"}
                  {rule.same_entity
                    ? "; the sequence must concern the same entity"
                    : ""}
                  .
                </p>
                <p className="text-sm text-muted-foreground">
                  A sequence match records a structural relationship. It does
                  not establish motive, causation, or a legal conclusion.
                  Missing required dates or evidence leave the match unresolved.
                </p>
                <p className="text-xs text-muted-foreground">
                  Rule: {rule.rule_id} · version {rule.rule_version}
                </p>
              </article>
            ))}
          </div>
          <div>
            <h3 className="font-semibold">Recorded match history</h3>
            <p className="text-sm text-muted-foreground">
              Counts are grouped by the recorded rule version. The definitions
              above describe the current rules; earlier versions may have
              different conditions. Recorded identities are not a measure of
              independent corroboration.
            </p>
            {data.history.length === 0 ? (
              <p className="mt-2 text-sm">
                No structural match history is recorded.
              </p>
            ) : (
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr>
                      <th className="p-2">Rule / version</th>
                      <th className="p-2">Pattern type</th>
                      <th className="p-2">Pattern identities</th>
                      <th className="p-2">Processing records</th>
                      <th className="p-2">Unresolved identities</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.history.map((h) => (
                      <tr
                        key={`${h.rule_id}:${h.rule_version}:${h.breakpoint_type}`}
                        className="border-t border-border"
                      >
                        <td className="p-2">
                          {h.rule_id} / {h.rule_version}
                        </td>
                        <td className="p-2">{readable(h.breakpoint_type)}</td>
                        <td className="p-2">{h.distinct_occurrence_keys}</td>
                        <td className="p-2">{h.recorded_versions}</td>
                        <td className="p-2">{h.unresolved_identity_records}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
