// Offline audit of the recorded production snapshot. No network or database writes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const data = read('2026-09-13-prism-v25-live-correction.json');
const priorRows = [
  ...read('2026-09-13-prism-publication-batch-25.json').rows,
  ...read('2026-09-13-prism-publication-batch-02.json').rows,
];
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
  : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const one = (rows, predicate) => {
  const matches = rows.filter(predicate);
  assert.equal(matches.length, 1);
  return matches[0];
};
const pins = [
  [9794, 'b0d7efbbe02b2fe4d48c3ad6d554fb3d5eedc8c8a15804d4d9f5710d6a606a8e', '3cce5238804248bfd95e03ae00c0d1f811921cbaee9cee560ea6b09fdbaf88ae'],
  [9726, '672911c67f4d4dbfecd608bf19c5e787ff55a2d4cf024a5c5dc6d8dec6e28987', '6ccc83737c1c3077f2650a7027c1a90fde676444d1e9a0717fb37181c09f9a2b'],
  [9556, 'eb1d054fc53d75ef90b3beb6e29e296ba7082eb1e5119f791f15805d29e75ca9', 'dc552bcd96ba5f08036ff33e32aab40bee6784c9462c391e4aadd58cca184400'],
  [9195, 'cf8e0885dea1a861239a3d46b3586c1d665a853a29f2df18b751fac9004fab83', '327ea275b2f8a6768d73b9a2040d74e3d66b225690f748eb78add95c03b85ff7'],
  [9005, '81124a7ef24c96dc732e84fdaae08f2bace90e0e6fe16f14eb3b7448a21d4998', '356be4a593398b24d7b088852af4d9737d88f5c25ab919dab8f3e5d4720fc696'],
];
const semanticKeys = ['prism_engine_version', 'rule_set_id', 'rule_set_version', 'status', 'supported_findings', 'contradictions', 'missing_evidence', 'unresolved_conditions', 'cited_evidence_identifiers'];
const prismFlags = ['request_input_matches', 'request_binding_matches', 'request_trait_payload_matches', 'source_identity_matches', 'source_content_matches', 'source_bytes_match', 'receipt_input_matches', 'receipt_output_matches', 'replay_key_matches', 'rule_hash_matches', 'full_semantic_output_matches', 'exact_date_step_count_matches'];
const lighthouseFlags = ['single_expected_trait', 'request_input_matches', 'receipt_input_matches', 'receipt_output_matches', 'replay_key_matches', 'rule_hash_matches', 'full_semantic_output_matches', 'binding_identity_matches', 'binding_version_hashes_match', 'assembly_source_tuple_matches'];
assert.equal(data.fixture_only, false);
assert.equal(data.fixture_predictions.fixture_only, true);
assert.equal(data.actual_readback.prism_rows.length, 5);
assert.equal(data.actual_readback.lighthouse_rows.length, 5);
assert.equal(data.fixture_predictions.rows.length, 5);
let dates = 0;
const queues = [];
for (const [sourceId, inputHash, outputHash] of pins) {
  const expected = one(data.fixture_predictions.rows, row => row.source_document_id === sourceId);
  const p = one(data.actual_readback.prism_rows, row => row.request_id === expected.expected_v25_request_id);
  const l = one(data.actual_readback.lighthouse_rows, row => row.request_id === expected.expected_v25_request_id);
  for (const flag of prismFlags) assert.equal(p[flag], true, flag);
  for (const flag of lighthouseFlags) assert.equal(l[flag], true, flag);
  assert.equal(p.receipt_count, 1);
  assert.equal(p.receipt.input_hash, inputHash);
  assert.equal(p.receipt.output_hash, outputHash);
  assert.equal(p.receipt.rule_set_hash, '26e4ef9f6c0d389154d9a2259c99b6e7eb83a51c096e738a9470fb20ff04ec8b');
  const semantic = Object.fromEntries(semanticKeys.map(key => [key, p.receipt[key]]));
  assert.equal(hash(semantic), outputHash);
  assert.deepEqual(semantic, expected.fixture_v25_evaluation);
  assert.equal(p.receipt.deterministic_replay_key, expected.fixture_v25_replay_key);
  assert.equal(l.receipt_id, p.receipt.verification_receipt_id);
  assert.equal(l.queue_row.queue_state, 'completed');
  assert.equal(l.queue_row.attempt_count, 1);
  assert.equal(l.queue_row.receipt_count, 1);
  assert.equal(l.queue_row.expected_trait_count, 1);
  assert.equal(l.bridge_state, 'completed');
  assert.equal(l.verification_run.prism_engine_version, '2.5.0');
  assert.equal(l.verification_run.receipt_count, 1);
  assert.deepEqual(l.verification_run.status_counts, { contradicted: 1 });
  queues.push(l.queue_row.queue_id);

  const old = one(data.historical_v24_fixture_reproductions.rows, row => row.source_document_id === sourceId);
  const historical = one(priorRows, row => row.prism_verification_receipt_id === old.prior_receipt_id);
  assert.equal(historical.request_id, old.prior_request_id);
  assert.equal(historical.input_hash, old.prior_input_hash);
  assert.equal(historical.output_hash, hash(old.prior_evaluation));
  const oldModals = old.prior_evaluation.supported_findings.filter(row => row.check === 'workflow_modal_present');
  const newModals = semantic.contradictions.filter(row => row.check === 'workflow_modal_present');
  assert.equal(newModals.length, oldModals.length);
  for (const before of oldModals) {
    const after = one(newModals, row => row.step_order === before.step_order);
    for (const field of ['evaluated_span', 'source_quote', 'source_offset_start', 'source_offset_end']) assert.equal(after[field], before[field]);
    assert.equal(before.matched_modal, 'may');
    assert.equal(after.observed, 'not_observed');
    dates++;
  }
  const rosetta = one(data.immediate_preflight.rosetta, row => row.source_document_id === sourceId);
  const assembly = one(data.immediate_preflight.lighthouse, row => row.assembly_run_id === expected.assembly_run_id);
  assert.equal(String(rosetta.extraction_run_id), expected.extraction_run_id);
  for (const field of ['source_identity_hash', 'source_content_hash', 'output_content_hash', 'rule_manifest_hash', 'configuration_hash']) {
    assert.equal(rosetta[field], expected.expected_binding['rosetta_' + field]);
    assert.equal(assembly['rosetta_' + field], rosetta[field]);
  }
}
assert.equal(dates, 6);
assert.equal(new Set(queues).size, 5);
const selection = data.activation.worker_selection_update;
const env = Object.fromEntries(selection.envVars.map(row => [row.key, row.value]));
assert.deepEqual(env.PRISM_ROSETTA_QUEUE_BATCH_IDS.split(',').sort(), [...queues].sort());
assert.equal(env.PRISM_ROSETTA_QUEUE_MAX_NEW_SUBMISSIONS, '5');
assert.equal(env.PRISM_ROSETTA_QUEUE_CANARY_ID, '');
assert.equal(selection.replace, false);
assert.equal(selection.deploy.commit.id, 'f07af14cbb064bb428c604364d955d788d146603');
assert.equal(data.activation.upstream.deploy.commit.id, '61020ab01c1a608df0d1d0a1893f924e38b56917');
const logs = data.worker_execution_logs.logs;
assert.equal(logs.filter(row => row.message === '[PrismRosettaQueue] claimed {').length, 5);
assert.equal(logs.filter(row => row.message === '[PrismRosettaQueue] completed {').length, 5);
assert.equal(logs.filter(row => row.message === '[PrismRosettaQueue] submission_budget_exhausted {').length, 1);
assert.equal(data.upstream_http_logs.logs.length, 5);
for (const log of data.upstream_http_logs.logs) {
  const labels = Object.fromEntries(log.labels.map(row => [row.name, row.value]));
  assert.equal(labels.method, 'POST');
  assert.equal(labels.statusCode, '201');
  assert.equal(labels.path, '/api/v1/verification-requests');
}
for (const system of ['prism', 'lighthouse']) {
  for (const row of data.global_v25_scope[system].rows) {
    assert.equal(row.v25_rows, 5);
    assert.equal(row.distinct_identity_count ?? row.distinct_request_ids, 5);
    assert.equal(row.outside_expected_rows, 0);
  }
  const history = data.historical_preservation[system];
  assert.equal(history.all_match, true);
  for (const before of history.before) {
    const after = one(history.after, row => row.table_name === before.table_name);
    assert.equal(after.row_count, before.row_count);
    assert.equal(after.digest, before.digest);
  }
}
assert.equal(data.forward_lineage.lineage_readback.rows.length, 2);
const lineageFlags = ['complete_source_receipt_set', 'correction_code_matches', 'expected_input_matches', 'expected_output_matches', 'expected_request_matches', 'explicit_missing_modal', 'identical_end_offset', 'identical_source_span', 'identical_start_offset', 'immutable_ruleset_matches', 'original_authority_preserved', 'proof_exists_in_actual_receipt', 'proof_output_matches_receipt', 'proof_replay_matches_receipt', 'same_step', 'same_trait'];
for (const row of data.forward_lineage.lineage_readback.rows) {
  for (const flag of lineageFlags) assert.equal(row[flag], true, flag);
  assert.equal(row.current_same_assembly_rule_count, 1);
  assert.equal(row.verification_state, 'contradicted');
  assert.equal(row.prior_is_current, false);
  assert.equal(row.successor_is_current, true);
  assert.equal(row.supersedes_id, row.prior_id);
  assert.equal(row.rule_version, '2.5.0');
  const actual = one(data.actual_readback.prism_rows, p => p.request_id === row.request_id);
  assert.equal(actual.receipt.verification_receipt_id, row.prism_verification_receipt_id);
}
const originals = data.forward_lineage.preservation_readback.rows;
assert.equal(originals.length, 4);
for (const row of originals) {
  assert.equal(row.immutable_payload_preserved, true);
  assert.equal(row.permitted_history_preserved, true);
}
assert.equal(originals.filter(row => row.entire_row_unchanged_from_before_install).length, 2);
console.log(JSON.stringify({ result: 'passed', production_receipts: 5, date_steps: dates, corrected_lineages: 2, scope: 'Recorded evidence only; no production operations.' }));
