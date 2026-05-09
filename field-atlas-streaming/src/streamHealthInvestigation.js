import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

export const luminariStreamHealthManifest = {
  function_id: 'luminari_stream_health_v1',
  input_types: ['signal_event'],
  output_types: ['stream_health_alert', 'prime_pattern'],
  description: 'Evaluates stream staleness, signal frequency, and confidence score distribution.',
};

const THROUGHPUT_RULES = {
  low: { stale_after_hours: 72, min_signals_per_hour: 0.005 },
  medium: { stale_after_hours: 24, min_signals_per_hour: 0.025 },
  high: { stale_after_hours: 6, min_signals_per_hour: 0.1 },
  ultra: { stale_after_hours: 1, min_signals_per_hour: 1 },
};

function numericConfidence(event) {
  const value = Number(event?.provenance?.confidence);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values, avg) {
  if (values.length <= 1) return 0;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function severityFrom(score) {
  if (score >= 0.85) return 'critical';
  if (score >= 0.65) return 'high';
  if (score >= 0.4) return 'medium';
  if (score > 0) return 'low';
  return 'info';
}

export function evaluateStreamHealth({ stream, events, fromOffset, toOffset, now = new Date() }) {
  const rules = THROUGHPUT_RULES[stream.throughput_profile] ?? THROUGHPUT_RULES.low;
  const sortedEvents = [...events].sort((a, b) => Number(a.offset) - Number(b.offset));
  const latestEvent = sortedEvents.at(-1) ?? null;
  const earliestEvent = sortedEvents.at(0) ?? null;
  const latestTimestamp = latestEvent ? new Date(latestEvent.timestamp) : null;
  const earliestTimestamp = earliestEvent ? new Date(earliestEvent.timestamp) : null;
  const hoursSinceLatest = latestTimestamp ? Math.max(0, (now.getTime() - latestTimestamp.getTime()) / 3_600_000) : Infinity;
  const windowHours = earliestTimestamp && latestTimestamp
    ? Math.max(1 / 60, (latestTimestamp.getTime() - earliestTimestamp.getTime()) / 3_600_000)
    : 1;
  const signalsPerHour = sortedEvents.length / windowHours;
  const confidences = sortedEvents.map(numericConfidence);
  const averageConfidence = mean(confidences);
  const lowConfidenceRatio = confidences.length
    ? confidences.filter((value) => value < 0.55).length / confidences.length
    : 1;
  const confidenceStdDev = standardDeviation(confidences, averageConfidence);

  const checks = {
    staleness: {
      triggered: hoursSinceLatest > rules.stale_after_hours,
      threshold_hours: rules.stale_after_hours,
      observed_hours_since_latest: Number.isFinite(hoursSinceLatest) ? Number(hoursSinceLatest.toFixed(3)) : null,
    },
    signal_frequency: {
      triggered: sortedEvents.length > 0 && signalsPerHour < rules.min_signals_per_hour,
      threshold_min_signals_per_hour: rules.min_signals_per_hour,
      observed_signals_per_hour: Number(signalsPerHour.toFixed(3)),
    },
    confidence_distribution: {
      triggered: sortedEvents.length > 0 && (averageConfidence < 0.65 || lowConfidenceRatio >= 0.35),
      average_confidence: Number(averageConfidence.toFixed(3)),
      low_confidence_ratio: Number(lowConfidenceRatio.toFixed(3)),
      standard_deviation: Number(confidenceStdDev.toFixed(3)),
    },
  };

  const triggeredChecks = Object.entries(checks).filter(([, check]) => check.triggered).map(([name]) => name);
  const severityScore = Math.min(1, (
    (checks.staleness.triggered ? 0.4 : 0) +
    (checks.signal_frequency.triggered ? 0.25 : 0) +
    (checks.confidence_distribution.triggered ? 0.35 : 0)
  ));
  const severity = severityFrom(severityScore);

  const alert = {
    output_type: 'stream_health_alert',
    function_id: luminariStreamHealthManifest.function_id,
    stream_id: stream.stream_id,
    triggered: triggeredChecks.length > 0,
    severity,
    triggered_checks: triggeredChecks,
    checked_at: now.toISOString(),
    window: {
      from_offset: fromOffset,
      to_offset: toOffset,
      event_count: sortedEvents.length,
    },
    metrics: checks,
  };

  if (!alert.triggered) {
    return { alert, patterns: [] };
  }

  const summary = `Stream ${stream.stream_id} health issue detected: ${triggeredChecks.join(', ')}.`;
  const pattern = {
    pattern_id: `pp_${nanoid()}`,
    pattern_type: 'stream_health_alert',
    module: stream.module_hint,
    jurisdiction: stream.jurisdiction_id,
    stream_id: stream.stream_id,
    confidence: Number(Math.max(0.1, severityScore).toFixed(3)),
    severity,
    detected_at: now.toISOString(),
    summary,
    evidence: {
      function_id: luminariStreamHealthManifest.function_id,
      input_types: luminariStreamHealthManifest.input_types,
      output_types: luminariStreamHealthManifest.output_types,
      triggered_checks: triggeredChecks,
      checks,
      event_offsets: sortedEvents.map((event) => event.offset),
    },
    payload: {
      alert,
    },
  };

  return { alert, patterns: [pattern] };
}
