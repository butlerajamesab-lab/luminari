import fs from 'node:fs/promises';
import path from 'node:path';
import axios from 'axios';
import { sampleOpenStatesBills, normalizeOpenStatesBillToSignal } from '../src/adapters/openStatesApiSource.js';

const apiBaseUrl = process.env.FIELD_ATLAS_API_BASE_URL || 'http://localhost:8787';
const since = new Date(Date.now() - 5 * 60_000).toISOString();

async function main() {
  const signals = sampleOpenStatesBills().map((bill, index) => ({
    ...normalizeOpenStatesBillToSignal(bill, { jurisdiction: 'wa' }),
    offset: 10_000 + index,
    provenance: {
      channel: 'external',
      confidence: index === 0 ? 0.92 : 0.38,
      source_system: 'openstates',
    },
  }));

  const ingest = await axios.post(`${apiBaseUrl}/v1/ingest/signals`, {
    source_id: 'open_states',
    jurisdiction_id: 'wa',
    module_hint: 'legislation',
    signals,
  });

  const cursor = await axios.post(`${apiBaseUrl}/v1/streams/open_states/cursors`, {
    name: `test-cycle-${Date.now()}`,
    from_offset: 10_000,
    created_by: 'test-cycle',
  });

  const events = await axios.get(`${apiBaseUrl}/v1/streams/open_states/events`, {
    params: {
      cursor_id: cursor.data.cursor_id,
      limit: 10,
    },
  });

  const investigation = await axios.post(`${apiBaseUrl}/internal/investigations/run`, {
    trigger: {
      type: 'stream_pull',
      stream_id: 'open_states',
      cursor_id: cursor.data.cursor_id,
      from_offset: 10_000,
      to_offset: 10_002,
    },
  });

  const patterns = await axios.get(`${apiBaseUrl}/v1/patterns/prime`, {
    params: {
      module: 'legislation',
      jurisdiction: 'wa',
      since,
    },
  });

  const summary = {
    ok: ingest.data.accepted === true &&
      ingest.data.ingested_count >= 3 &&
      events.data.events.length >= 3 &&
      investigation.data.status === 'completed' &&
      patterns.data.patterns.length >= 1,
    ingest: ingest.data,
    cursor: cursor.data,
    events: {
      count: events.data.events.length,
      from_offset: events.data.from_offset,
      next_offset: events.data.next_offset,
    },
    investigation: {
      job_id: investigation.data.job_id,
      status: investigation.data.status,
      emitted_patterns: investigation.data.result?.emitted_patterns ?? 0,
    },
    patterns: patterns.data.patterns.map((pattern) => ({
      pattern_id: pattern.pattern_id,
      pattern_type: pattern.pattern_type,
      severity: pattern.severity,
      confidence: pattern.confidence,
      summary: pattern.summary,
    })),
  };

  await fs.mkdir(path.resolve('test-results'), { recursive: true });
  await fs.writeFile(path.resolve('test-results/e2e-cycle.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));

  if (!summary.ok) process.exit(1);
}

main().catch((error) => {
  const details = error.response?.data ?? error.message;
  console.error(JSON.stringify({ error: details }, null, 2));
  process.exit(1);
});
