/**
 * Read-only integration check. Uses the production loader and Layer 14.
 * node --import tsx scripts/verify-existing-workflow-connections.ts [--snapshot captured-query-results.json]
 * Without --snapshot, uses the application's configured database connection.
 * Fixture claim candidates exercise routing, not legal applicability or real cases.
 */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { load_governed_legal_registry } from '../server/intake-governed-legal-registry';
import { processLayer14, RULE_MANIFEST } from '../server/engines/intake-spine/layer-14-action_paths';
import { computeGovernedLegalRegistryHash } from '../server/engines/intake-spine/governed-legal-registry';
import type { ClaimCandidate } from '../server/engines/intake-spine/layer-12-rights_and_duties_matrix';

const snapshotArg = process.argv.indexOf('--snapshot');
const captured: Array<{ query: string; rows: unknown[] }> | null = snapshotArg < 0
  ? null : JSON.parse(readFileSync(process.argv[snapshotArg + 1], 'utf8'));
const normalizeQuery = (query: string) => query.replace(/\s+/g, ' ').trim();
const pool = captured ? {
  query: async (query: string) => {
    const result = captured.find(item => normalizeQuery(item.query) === normalizeQuery(query));
    assert(result, `Snapshot does not contain the current query: ${normalizeQuery(query).slice(0, 100)}`);
    return { rows: result.rows };
  },
} as Parameters<typeof load_governed_legal_registry>[0] : undefined;

const loaded = await load_governed_legal_registry(pool);
const { manifest, rule_manifest_hash } = loaded;
assert.equal(computeGovernedLegalRegistryHash(manifest), rule_manifest_hash);
const connected = manifest.workflows.filter(workflow => workflow.source_binding);
const eligible = new Set<string>();
let exercised = 0;
for (const workflow of connected) {
  for (const claim of manifest.claims) {
    const issueTypes = [claim.claim_type_id, ...(RULE_MANIFEST.workflow_issue_aliases[claim.claim_type_id] ?? [])];
    if (!workflow.issue_types.some(issue => issueTypes.includes(issue))) continue;
    const candidate: ClaimCandidate = {
      candidate_id: `integration-check:${workflow.workflow_key}:${claim.claim_type_id}`,
      claim_type_id: claim.claim_type_id, claim_type_name: claim.canonical_name, claim_domain: claim.domain,
      subject_entity_id: 'integration-fixture-only', triggering_relationship_ids: [], triggering_transition_ids: [],
      triggering_pattern_ids: [], triggering_facts: [], matching_rule: 'integration-fixture-only',
      required_elements: [], unresolved_elements: ['Integration fixture does not establish legal applicability'],
      jurisdiction: workflow.jurisdiction!, governing_standards: [], deadline_candidates: [],
      registry_binding: { contract_version: manifest.contract_version, governed_registry_hash: rule_manifest_hash, claim_registry_id: claim.registry_id },
      applicability_status: 'candidate_unverified',
    };
    const result = processLayer14({ candidates: [candidate], governed_registry: manifest, governed_registry_hash: rule_manifest_hash });
    const path = result.data.find(path => path.workflow_key === workflow.workflow_key);
    assert(path, `Missing path for existing registry identity ${workflow.registry_id}`);
    assert.equal(path.workflow_registry_id, workflow.registry_id);
    assert.deepEqual(path.workflow_source_binding, workflow.source_binding);
    assert.equal(path.next_steps.length, workflow.steps.length);
    assert.equal(path.status, 'candidate_unverified');
    assert.equal(path.foothold_complete, false);
    assert.deepEqual(path.deadline_candidates, []);
    assert(result.data.filter(path => path.workflow_source_binding).every(path => path.workflow_jurisdiction === workflow.jurisdiction));
    eligible.add(workflow.workflow_key);
    exercised++;
  }
}
const report = {
  verification_mode: captured ? 'production_loader_with_read_only_live_query_snapshot' : 'read_only_live_database',
  real_case_execution: false,
  contract_version: manifest.contract_version,
  registry_hash: rule_manifest_hash,
  existing_master_workflows: manifest.workflows.length - connected.length,
  connected_source_workflows: connected.length,
  source_workflow_steps: connected.reduce((sum, workflow) => sum + workflow.steps.length, 0),
  source_stage_rows: new Set(connected.flatMap(workflow => workflow.source_binding!.source_stage_row_ids)).size,
  source_jurisdictions: new Set(connected.map(workflow => workflow.jurisdiction)).size,
  eligible_for_existing_claim_types: eligible.size,
  loaded_without_existing_claim_type_binding: connected.length - eligible.size,
  exercised_claim_workflow_connections: exercised,
  held_registry_records: manifest.workflow_holds?.length ?? 0,
  holds_by_reason: (manifest.workflow_holds ?? []).reduce<Record<string, number>>((counts, hold) => {
    counts[hold.reason] = (counts[hold.reason] ?? 0) + 1; return counts;
  }, {}),
  writes_performed: 0,
};
console.log(JSON.stringify(report, null, 2));
// The application's pool is only constructed in live mode.
if (!captured) {
  const { getPool } = await import('../server/db');
  await getPool().end();
}
