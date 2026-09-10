import type { SignalSourceObservations } from "../../../../server/signal-artifact-runtime";

type EvidenceArtifact = {
  domain_code: string;
  status: string;
  governance_status?: string | null;
  entity_resolution_status?: string | null;
  evidence: unknown;
  source_observations?: SignalSourceObservations;
};

function object(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

const labels: Record<string, string> = {
  pattern_count: "Matching observations",
  records_analyzed: "Observations analyzed",
  percentage_affected: "Share of observations (%)",
  z_score: "Standard deviations above peer mean",
  entity_mean: "Mean observations per entity",
  entity_stddev: "Standard deviation across entities",
  geography_mean: "Mean observations per geography",
  geography_stddev: "Standard deviation across geographies",
  category_mean: "Mean observations per category",
  category_stddev: "Standard deviation across categories",
  entity_name: "Matched name",
  event_offset: "Saved observation key",
};
function label(key: string) {
  return labels[key] ?? key.replaceAll("_", " ");
}

function httpUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

/** Render preserved values as text. Only field names are prettified. */
function EvidenceValue({ value }: { value: unknown }) {
  if (value == null || value === "") return <span className="se-muted">Not recorded</span>;
  if (typeof value === "string") {
    const url = httpUrl(value);
    return url ? <a href={url} target="_blank" rel="noreferrer">{value} ↗</a> : <span>{value}</span>;
  }
  if (typeof value === "number" || typeof value === "boolean") return <span>{String(value)}</span>;
  if (Array.isArray(value)) return value.length
    ? <ul>{value.map((item, index) => <li key={index}><EvidenceValue value={item} /></li>)}</ul>
    : <span className="se-muted">None recorded</span>;
  return <EvidenceFields value={value} />;
}

function EvidenceFields({ value }: { value: unknown }) {
  return <dl className="se-fields">{Object.entries(object(value)).map(([key, entry]) => (
    <div key={key}>
      <dt>{label(key)}</dt>
      <dd>{key === "raw" ? <details><summary>Full source fields</summary><EvidenceValue value={entry} /></details> : <EvidenceValue value={entry} />}</dd>
    </div>
  ))}</dl>;
}

function checks(value: unknown, found: Record<string, unknown>[] = []) {
  if (Array.isArray(value)) value.forEach((entry) => checks(entry, found));
  else {
    const row = object(value);
    if (typeof row.check === "string" && ("expected" in row || "observed" in row || "source_quote" in row)) found.push(row);
    else Object.values(row).forEach((entry) => {
      if (entry != null && typeof entry === "object") checks(entry, found);
    });
  }
  return found;
}

export function SignalEvidenceDetails({ artifact }: { artifact: EvidenceArtifact }) {
  const evidence = object(artifact.evidence);
  const statistics = object(evidence.supporting_statistics);
  const comparisons = checks(evidence.contradiction_refs);
  const saved = artifact.source_observations;
  const resolved = saved?.observations.filter((entry) => entry.resolution === "matched").length ?? 0;
  return (
    <section className="signal-evidence-details" aria-label="Detection evidence">
      <div className="se-status">
        <h3>What has been checked</h3>
        <p>Recorded verification state: <strong>{label(artifact.status)}</strong>.
          {artifact.governance_status ? <> Record status: <strong>{label(artifact.governance_status)}</strong>.</> : null}
          {artifact.entity_resolution_status ? <> Entity resolution: <strong>{label(artifact.entity_resolution_status)}</strong>.</> : null}
        </p>
        <p>You can inspect the evidence without attaching it to a case. A case link saves context; it does not review or corroborate a result. Approval of a detection method and verification of an individual result are separate decisions.</p>
      </div>

      {Object.keys(statistics).length > 0 ? <div>
        <h3>What triggered this detection</h3>
        <p>Statistics recorded by the detection run. The comparison is against its analyzed dataset.</p>
        <EvidenceFields value={statistics} />
      </div> : null}

      {comparisons.length ? <div>
        <h3>Expected and observed source text</h3>
        <p>These are the recorded automated checks. A structural mismatch can concern extraction or text binding; it does not by itself establish a contradiction in the law.</p>
        {comparisons.map((check, index) => <div className="se-record" key={index}>
          <h4>{typeof check.check === "string" ? label(check.check) : `Check ${index + 1}`}</h4>
          <EvidenceFields value={{
            recorded_result: check.finding,
            expected: check.expected,
            observed: check.observed,
            ...(check.source_quote != null ? { source_quote: check.source_quote } : {}),
          }} />
          {typeof check.expected === "string" && /[\uE000-\uF8FF]/u.test(check.expected)
            ? <p>The expected text contains a private-use character. Check the original source formatting when assessing this mismatch.</p> : null}
        </div>)}
      </div> : null}

      {artifact.domain_code === "legal_pattern" && !comparisons.length
        ? <p>No expected-versus-observed excerpt is saved on this record. Its original references remain available below.</p> : null}

      {saved ? <div>
        <h3>Source records behind this detection</h3>
        <p>{resolved} of {saved.reference_count} saved references matched their original record hashes.
          {typeof statistics.pattern_count === "number" ? <> The detection reports {statistics.pattern_count.toLocaleString()} matching observations.</> : null}
          {typeof statistics.pattern_count === "number" && statistics.pattern_count > saved.reference_count
            ? " The saved references are examples, not the complete matching dataset." : null}
        </p>
        <p>A matching hash confirms which saved record was used. Repeated observations from one source do not establish independent corroboration.</p>
        {saved.invalid_reference_count > 0 ? <p role="alert">{saved.invalid_reference_count} saved references lack a usable record key or hash.</p> : null}
        {saved.truncated ? <p>Showing the first 100 valid saved references. Additional references are preserved in the original evidence data.</p> : null}
        {saved.observations.map((record, index) => <div className="se-record" key={`${record.stream_id}:${record.event_offset}:${index}`}>
          <h4>Observation {index + 1} · {record.stream_id}</h4>
          {record.resolution === "matched" ? <>
            <EvidenceFields value={{
              source: record.source_id,
              jurisdiction: record.jurisdiction_id,
              observation_timestamp: record.observed_at,
            }} />
            <EvidenceFields value={record.payload} />
            {Object.keys(object(record.spacetime)).length ? <details><summary>Location and time context</summary><EvidenceFields value={record.spacetime} /></details> : null}
          </> : <p role="alert">{record.resolution === "missing"
            ? "The referenced observation is unavailable. Its saved key is retained below."
            : "The observation no longer matches its saved hash. Its current contents are withheld to avoid presenting changed evidence as the original."}</p>}
          <details><summary>Record identity</summary><EvidenceFields value={{ event_offset: record.event_offset, event_identity_hash: record.event_identity_hash }} /></details>
        </div>)}
        {!saved.reference_count ? <p>No source observations were saved on this detection.</p> : null}
      </div> : null}

      <style>{`
        .signal-evidence-details { min-width: 0; display: grid; gap: 18px; color: inherit; font-size: 13px; line-height: 1.65; overflow-wrap: anywhere; }
        .signal-evidence-details h3 { font: 600 17px/1.4 Arial, sans-serif; margin: 0 0 8px; }
        .signal-evidence-details h4 { font: 600 14px/1.5 Arial, sans-serif; margin: 0 0 10px; }
        .signal-evidence-details p { margin: 6px 0 12px; }
        .signal-evidence-details a, .signal-evidence-details summary { color: #E8A820; cursor: pointer; }
        .se-status, .se-record { padding: 14px; border: 1px solid rgba(255,255,255,.14); border-radius: 9px; margin-top: 10px; background: rgba(0,0,0,.15); }
        .se-fields { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,220px),1fr)); gap: 12px; margin: 10px 0; }
        .se-fields > div { min-width: 0; }
        .se-fields dt { color: #B8B0A0; font-size: 11px; text-transform: capitalize; }
        .se-fields dd { margin: 3px 0 0; white-space: pre-wrap; }
        .se-fields ul { margin: 0; padding-left: 17px; }
        .se-muted { color: #B8B0A0; }
      `}</style>
    </section>
  );
}
