import dotenv from 'dotenv';
import express from 'express';
import { customAlphabet } from 'nanoid';
import { supabase } from './supabaseClient.js';
import {
  assertCreateCursorRequest,
  assertInvestigationTrigger,
  assertSignalIngestRequest,
  normalizeConfidence,
  validateSchema,
} from './validators.js';
import { evaluateStreamHealth, luminariStreamHealthManifest } from './streamHealthInvestigation.js';

dotenv.config();

const app = express();
const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 14);
const PORT = Number(process.env.PORT || 8787);
const DEFAULT_CREATED_BY = process.env.DEFAULT_CURSOR_CREATED_BY || 'field-atlas-local';

app.use(express.json({ limit: '5mb' }));

function apiError(res, status, message, details = undefined) {
  return res.status(status).json({ error: message, details });
}

function toPublicSignalEvent(row) {
  return {
    stream_id: row.stream_id,
    offset: Number(row.offset),
    timestamp: row.timestamp,
    signal_type: row.signal_type,
    spacetime: row.spacetime,
    provenance: row.provenance,
    payload: row.payload,
  };
}

async function requireStream(streamId) {
  const { data, error } = await supabase.from('streams').select('*').eq('stream_id', streamId).maybeSingle();
  if (error) throw error;
  return data;
}

async function findStream({ stream_id, source_id, jurisdiction_id, module_hint }) {
  if (stream_id) return requireStream(stream_id);
  let query = supabase.from('streams').select('*').eq('source_id', source_id).eq('jurisdiction_id', jurisdiction_id).eq('module_hint', module_hint).limit(1);
  const { data, error } = await query;
  if (error) throw error;
  return data?.[0] ?? null;
}

async function nextOffsetForStream(streamId) {
  const { data, error } = await supabase
    .from('signal_events')
    .select('offset')
    .eq('stream_id', streamId)
    .order('offset', { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!data?.length) return 0;
  return Number(data[0].offset) + 1;
}

async function buildRowsForIngest(body) {
  const rows = [];
  const nextOffsets = new Map();

  for (const [index, incoming] of body.signals.entries()) {
    const stream = await findStream({
      stream_id: incoming.stream_id,
      source_id: body.source_id,
      jurisdiction_id: body.jurisdiction_id,
      module_hint: body.module_hint,
    });

    if (!stream) {
      throw Object.assign(new Error(`No registered stream found for signal index ${index}`), { status: 404 });
    }

    const timestamp = incoming.timestamp ?? new Date().toISOString();
    const spacetime = incoming.spacetime ?? { region: body.jurisdiction_id };
    const provenance = {
      channel: incoming.provenance?.channel ?? 'external',
      confidence: normalizeConfidence(incoming.provenance?.confidence ?? incoming.payload?.confidence ?? 0.75),
      source_system: incoming.provenance?.source_system ?? body.source_id,
      ...incoming.provenance,
    };
    provenance.confidence = normalizeConfidence(provenance.confidence);

    let offset = incoming.offset;
    if (!Number.isInteger(offset)) {
      if (!nextOffsets.has(stream.stream_id)) {
        nextOffsets.set(stream.stream_id, await nextOffsetForStream(stream.stream_id));
      }
      offset = nextOffsets.get(stream.stream_id);
      nextOffsets.set(stream.stream_id, offset + 1);
    }

    const normalized = {
      stream_id: stream.stream_id,
      offset,
      timestamp,
      signal_type: incoming.signal_type ?? `${body.source_id}.signal`,
      spacetime,
      provenance,
      payload: {
        ...(incoming.payload ?? {}),
        provenance_tracking: {
          source_id: body.source_id,
          jurisdiction_id: body.jurisdiction_id,
          module_hint: body.module_hint,
          ingested_via: 'field-atlas-streaming-api',
          received_at: new Date().toISOString(),
        },
      },
    };

    const validation = validateSchema('signal_event.json', normalized);
    if (!validation.ok) {
      throw Object.assign(new Error(`Signal index ${index} failed schema validation`), { status: 400, details: validation.errors });
    }

    rows.push({
      ...normalized,
      source_id: body.source_id,
      jurisdiction_id: body.jurisdiction_id,
      module_hint: body.module_hint,
    });
  }

  return rows;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'field-atlas-streaming', function_id: luminariStreamHealthManifest.function_id });
});

app.post('/v1/ingest/signals', async (req, res) => {
  try {
    const errors = assertSignalIngestRequest(req.body);
    if (errors.length) return apiError(res, 400, 'Invalid SignalIngestRequest', errors);

    const rows = await buildRowsForIngest(req.body);
    if (!rows.length) return res.json({ accepted: true, ingested_count: 0 });

    const { data, error } = await supabase
      .from('signal_events')
      .upsert(rows, { onConflict: 'stream_id,offset' })
      .select('stream_id,offset');
    if (error) throw error;

    return res.json({ accepted: true, ingested_count: data?.length ?? rows.length });
  } catch (error) {
    return apiError(res, error.status || 500, error.message, error.details);
  }
});

app.get('/v1/streams/:stream_id/events', async (req, res) => {
  try {
    const streamId = req.params.stream_id;
    const stream = await requireStream(streamId);
    if (!stream) return apiError(res, 404, 'Stream not found');

    const limit = Math.min(Math.max(Number(req.query.limit || 1000), 1), 5000);
    let cursor = null;
    let fromOffset = req.query.from_offset !== undefined ? Number(req.query.from_offset) : null;

    if (req.query.cursor_id) {
      const { data, error } = await supabase
        .from('cursors')
        .select('*')
        .eq('cursor_id', String(req.query.cursor_id))
        .eq('stream_id', streamId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return apiError(res, 404, 'Cursor not found for stream');
      cursor = data;
      if (fromOffset === null || Number.isNaN(fromOffset)) fromOffset = Number(cursor.current_offset);
    }

    let query = supabase.from('signal_events').select('*').eq('stream_id', streamId).order('offset', { ascending: true }).limit(limit);
    if (fromOffset !== null && !Number.isNaN(fromOffset)) query = query.gte('offset', fromOffset);
    if (req.query.from_timestamp) query = query.gte('timestamp', String(req.query.from_timestamp));

    const { data, error } = await query;
    if (error) throw error;

    const events = (data ?? []).map(toPublicSignalEvent);
    const nextOffset = events.length ? Number(events.at(-1).offset) + 1 : fromOffset;

    if (cursor && nextOffset !== null && !Number.isNaN(nextOffset)) {
      await supabase.from('cursors').update({ current_offset: nextOffset }).eq('cursor_id', cursor.cursor_id);
    }

    return res.json({
      stream_id: streamId,
      cursor_id: cursor?.cursor_id ?? null,
      from_offset: fromOffset,
      next_offset: nextOffset,
      events,
    });
  } catch (error) {
    return apiError(res, 500, error.message);
  }
});

app.post('/v1/streams/:stream_id/cursors', async (req, res) => {
  try {
    const streamId = req.params.stream_id;
    const errors = assertCreateCursorRequest(req.body);
    if (errors.length) return apiError(res, 400, 'Invalid CreateCursorRequest', errors);

    const stream = await requireStream(streamId);
    if (!stream) return apiError(res, 404, 'Stream not found');

    let currentOffset = Number.isInteger(req.body.from_offset) ? req.body.from_offset : 0;
    if (req.body.from_timestamp) {
      const { data, error } = await supabase
        .from('signal_events')
        .select('offset')
        .eq('stream_id', streamId)
        .gte('timestamp', req.body.from_timestamp)
        .order('offset', { ascending: true })
        .limit(1);
      if (error) throw error;
      if (data?.length) currentOffset = Number(data[0].offset);
    }

    const now = new Date().toISOString();
    const cursor = {
      cursor_id: `cur_${nanoid()}`,
      stream_id: streamId,
      name: req.body.name,
      current_offset: currentOffset,
      created_by: req.body.created_by ?? DEFAULT_CREATED_BY,
      created_at: now,
      updated_at: now,
    };

    const validation = validateSchema('cursor.json', cursor);
    if (!validation.ok) return apiError(res, 400, 'Cursor schema validation failed', validation.errors);

    const { data, error } = await supabase.from('cursors').upsert(cursor, { onConflict: 'stream_id,name' }).select('*').single();
    if (error) throw error;
    return res.json(data);
  } catch (error) {
    return apiError(res, 500, error.message);
  }
});

app.post('/internal/investigations/run', async (req, res) => {
  const createdAt = new Date().toISOString();
  let job = null;

  try {
    const errors = assertInvestigationTrigger(req.body);
    if (errors.length) return apiError(res, 400, 'Invalid InvestigationTrigger', errors);

    const trigger = req.body.trigger;
    const stream = await requireStream(trigger.stream_id);
    if (!stream) return apiError(res, 404, 'Stream not found');

    job = {
      job_id: `job_${nanoid()}`,
      job_type: 'stream_health',
      stream_id: trigger.stream_id,
      cursor_id: trigger.cursor_id ?? null,
      status: 'pending',
      params: { trigger, manifest: luminariStreamHealthManifest },
      function_id: luminariStreamHealthManifest.function_id,
      created_at: createdAt,
      completed_at: null,
    };

    const { data: insertedJob, error: insertError } = await supabase.from('investigative_jobs').insert(job).select('*').single();
    if (insertError) throw insertError;
    job = insertedJob;

    await supabase.from('investigative_jobs').update({ status: 'running' }).eq('job_id', job.job_id);

    const { data: eventRows, error: eventError } = await supabase
      .from('signal_events')
      .select('*')
      .eq('stream_id', trigger.stream_id)
      .gte('offset', trigger.from_offset)
      .lte('offset', trigger.to_offset)
      .order('offset', { ascending: true });
    if (eventError) throw eventError;

    const events = (eventRows ?? []).map(toPublicSignalEvent);
    const { alert, patterns } = evaluateStreamHealth({
      stream,
      events,
      fromOffset: trigger.from_offset,
      toOffset: trigger.to_offset,
    });

    const patternsWithJob = patterns.map((pattern) => ({ ...pattern, job_id: job.job_id }));
    if (patternsWithJob.length) {
      const { error: patternError } = await supabase.from('prime_patterns').insert(patternsWithJob);
      if (patternError) throw patternError;
    }

    const completedAt = new Date().toISOString();
    const result = { alert, emitted_patterns: patternsWithJob.length };
    const { data: completedJob, error: updateError } = await supabase
      .from('investigative_jobs')
      .update({ status: 'completed', completed_at: completedAt, result })
      .eq('job_id', job.job_id)
      .select('*')
      .single();
    if (updateError) throw updateError;

    return res.status(202).json(completedJob);
  } catch (error) {
    if (job?.job_id) {
      await supabase
        .from('investigative_jobs')
        .update({ status: 'failed', completed_at: new Date().toISOString(), error: error.message })
        .eq('job_id', job.job_id);
    }
    return apiError(res, error.status || 500, error.message, error.details);
  }
});

app.get('/v1/patterns/prime', async (req, res) => {
  try {
    let query = supabase.from('prime_patterns').select('*').order('detected_at', { ascending: false }).limit(1000);
    if (req.query.module) query = query.eq('module', String(req.query.module));
    if (req.query.jurisdiction) query = query.eq('jurisdiction', String(req.query.jurisdiction));
    if (req.query.since) query = query.gte('detected_at', String(req.query.since));

    const { data, error } = await query;
    if (error) throw error;
    return res.json({ patterns: data ?? [], next_cursor: null });
  } catch (error) {
    return apiError(res, 500, error.message);
  }
});

app.use((req, res) => apiError(res, 404, `Route not found: ${req.method} ${req.path}`));

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Field Atlas Streaming API listening on http://localhost:${PORT}`);
  });
}

export default app;
