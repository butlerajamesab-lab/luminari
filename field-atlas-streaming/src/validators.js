import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
const schemaDir = path.resolve(new URL('..', import.meta.url).pathname, 'schemas');

for (const schemaName of ['stream', 'signal_event', 'cursor', 'investigative_job', 'prime_pattern']) {
  const schema = JSON.parse(fs.readFileSync(path.join(schemaDir, `${schemaName}.json`), 'utf8'));
  ajv.addSchema(schema, schema.$id);
}

export function validateSchema(schemaId, value) {
  const validate = ajv.getSchema(schemaId);
  if (!validate) throw new Error(`Unknown schema: ${schemaId}`);
  const ok = validate(value);
  return {
    ok,
    errors: ok ? [] : validate.errors?.map((error) => `${error.instancePath || '/'} ${error.message}`) ?? [],
  };
}

export function assertSignalIngestRequest(body) {
  const errors = [];
  if (!body || typeof body !== 'object') errors.push('body must be an object');
  if (typeof body?.source_id !== 'string') errors.push('source_id is required');
  if (typeof body?.jurisdiction_id !== 'string') errors.push('jurisdiction_id is required');
  if (typeof body?.module_hint !== 'string') errors.push('module_hint is required');
  if (!Array.isArray(body?.signals)) errors.push('signals must be an array');
  return errors;
}

export function assertCreateCursorRequest(body) {
  const errors = [];
  if (!body || typeof body !== 'object') errors.push('body must be an object');
  if (typeof body?.name !== 'string' || body.name.trim() === '') errors.push('name is required');
  if (body?.from_offset !== undefined && body?.from_offset !== null && !Number.isInteger(body.from_offset)) {
    errors.push('from_offset must be an integer when provided');
  }
  return errors;
}

export function assertInvestigationTrigger(body) {
  const trigger = body?.trigger;
  const errors = [];
  if (!trigger || typeof trigger !== 'object') errors.push('trigger is required');
  if (trigger?.type !== 'stream_pull') errors.push('trigger.type must be stream_pull');
  if (typeof trigger?.stream_id !== 'string') errors.push('trigger.stream_id is required');
  if (!Number.isInteger(trigger?.from_offset)) errors.push('trigger.from_offset must be an integer');
  if (!Number.isInteger(trigger?.to_offset)) errors.push('trigger.to_offset must be an integer');
  if (Number.isInteger(trigger?.from_offset) && Number.isInteger(trigger?.to_offset) && trigger.to_offset < trigger.from_offset) {
    errors.push('trigger.to_offset must be greater than or equal to trigger.from_offset');
  }
  return errors;
}

export function normalizeConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
