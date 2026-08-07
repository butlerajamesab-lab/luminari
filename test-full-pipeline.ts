import { parseArtifact } from './server/engines/intake-spine/parsing-substrate';
import { processLayer1 } from './server/engines/intake-spine/layer-1-stabilization_envelope';
import { processLayer2 } from './server/engines/intake-spine/layer-2-raw_intake_capture';
import { processLayer3 } from './server/engines/intake-spine/layer-3-evidence_preservation';
import { processLayer4 } from './server/engines/intake-spine/layer-4-chronology_reconstruction';
import { processLayer5 } from './server/engines/intake-spine/layer-5-verification_gate';
import { processLayer6 } from './server/engines/intake-spine/layer-6-entity_registry';
import { processLayer7 } from './server/engines/intake-spine/layer-7-relationship_graph';
import { processLayer8 } from './server/engines/intake-spine/layer-8-power_dynamics_registry';
import { processLayer9 } from './server/engines/intake-spine/layer-9-state_timeline';
import { processLayer10 } from './server/engines/intake-spine/layer-10-pattern_registry';
import { processLayer11 } from './server/engines/intake-spine/layer-11-cascade_registry';
import { processLayer12 } from './server/engines/intake-spine/layer-12-rights_and_duties_matrix';
import { processLayer13 } from './server/engines/intake-spine/layer-13-translation_layer';
import { processLayer14 } from './server/engines/intake-spine/layer-14-action_paths';

// Simulate the Cheryl scenario: cross-domain caregiving
const cherylDoc = Buffer.from(`
Cheryl Thompson was employed by Cascade Health Services Inc. from March 2022 until January 15, 2025.
On January 15, 2025, Cheryl Thompson was terminated from Cascade Health Services Inc.
Her supervisor, Mr. Robert Chen, stated the reason was "restructuring."
Cheryl had filed a complaint with the Department of Labor on December 20, 2024 regarding unpaid overtime.
On February 1, 2025, her landlord Jane Doe served an eviction notice.
Cheryl rents from Jane Doe at 1234 Pine St, Seattle, WA 98101.
The eviction notice cited non-payment of rent due to loss of income.
Cheryl applied for unemployment benefits on January 20, 2025.
Her benefits application was denied on February 15, 2025.
Contact: cheryl.thompson@email.com, (206) 555-0142
`);

async function main() {
  const as_of = '2025-03-01';
  console.log('=== FULL PIPELINE TEST ===\n');

  // Layer 1
  const l1 = processLayer1({
    deadlines: [
      { description: 'Eviction court date', date: '2025-03-15', is_irreversible: true },
      { description: 'Benefits appeal deadline', date: '2025-04-15', is_irreversible: false },
    ],
    essential_services_at_risk: ['housing', 'income'],
    evidence_to_preserve: ['termination letter', 'eviction notice', 'benefits denial letter'],
    communication_limits: [],
    support_people: ['sister Maria'],
    what_can_wait: ['FOIA request'],
  }, as_of);
  console.log(`L1 Stabilization: ${l1.data.deadlines_sorted.length} deadlines, ${l1.data.irreversible_events.length} irreversible`);

  // Layer 2
  const l2 = processLayer2({ filename: 'cheryl_case.txt', bytes: cherylDoc, declared_mime_type: 'text/plain', entry_channel: 'web_upload' });
  console.log(`L2 Capture: ${l2.data.artifact_key}, ${l2.data.byte_size} bytes, SHA: ${l2.data.sha256.substring(0, 16)}...`);

  // Layer 3
  const l3 = processLayer3({ record: l2.data, actual_bytes: cherylDoc }, as_of);
  console.log(`L3 Preservation: ${l3.data.integrity_status}`);

  // Parsing substrate
  const parsed = await parseArtifact(l2.data.artifact_key, cherylDoc, 'text/plain');
  console.log(`\nParsing: ${parsed.extraction_status}, ${parsed.spans.length} spans`);

  // Layer 4
  const l4 = processLayer4({ artifacts: [parsed] });
  console.log(`\nL4 Chronology: ${l4.data.length} events`);
  for (const e of l4.data.slice(0, 5)) {
    console.log(`  ${e.date}: ${e.event_text.substring(0, 70)}...`);
  }

  // Layer 6
  const l6 = processLayer6({ artifacts: [parsed] });
  console.log(`\nL6 Entities: ${l6.data.length} found`);
  for (const e of l6.data) {
    console.log(`  [${e.type}] ${e.canonical_name} (${e.raw_mentions.length} mentions)`);
  }

  // Layer 5 (needs structured facts from L4)
  const facts = l4.data.map(evt => ({
    fact_id: evt.event_id,
    entity_id: evt.actor ? `ent_${evt.actor.toLowerCase().replace(/\s/g, '_')}` : 'unknown',
    attribute: 'event',
    value: evt.event_text.substring(0, 50),
    applicable_time: evt.date,
    source_artifact_key: evt.source_artifact_key,
    source_span_offset: evt.source_span_offset,
    source_text: evt.event_text,
  }));
  const l5 = processLayer5({ facts });
  console.log(`\nL5 Verification: ${l5.data.length} records`);
  const states = l5.data.reduce((acc, r) => { acc[r.verification_state] = (acc[r.verification_state] || 0) + 1; return acc; }, {} as Record<string, number>);
  console.log(`  States: ${JSON.stringify(states)}`);

  // Layer 7
  const l7 = processLayer7({ entities: l6.data, artifacts: [parsed] });
  console.log(`\nL7 Relationships: ${l7.data.length} found`);
  for (const r of l7.data) {
    console.log(`  ${r.type}: ${r.entity_a_id} → ${r.entity_b_id} (marker: "${r.marker_text}")`);
  }

  // Layer 8
  const l8 = processLayer8({ relationships: l7.data });
  console.log(`\nL8 Power Dynamics: ${l8.data.length} classified`);

  // Layer 9
  const l9 = processLayer9({ entities: l6.data, artifacts: [parsed], verification_records: l5.data });
  console.log(`\nL9 State Timeline: ${l9.data.length} transitions`);
  for (const t of l9.data) {
    console.log(`  ${t.entity_id}: ${t.from_state || '?'} → ${t.to_state} (${t.transition_date || 'undated'})`);
  }

  // Layer 10
  const l10 = processLayer10({ transitions: l9.data });
  console.log(`\nL10 Patterns: ${l10.data.length} detected`);
  for (const p of l10.data) {
    console.log(`  ${p.pattern_type} (rule: ${p.rule_id})`);
  }

  // Layer 11
  const l11 = processLayer11({ transitions: l9.data, relationships: l7.data });
  console.log(`\nL11 Cascades: ${l11.data.length} structural matches`);
  for (const c of l11.data) {
    console.log(`  ${c.cascade_match_type} (causal stated: ${c.causal_stated_in_source})`);
  }

  // Layer 12
  const l12 = processLayer12({ entities: l6.data, relationships: l7.data, transitions: l9.data, jurisdiction: 'WA', filing_date: as_of });
  console.log(`\nL12 Claim Candidates: ${l12.data.length}`);
  for (const c of l12.data) {
    console.log(`  ${c.claim_type_name}: ${c.satisfied_elements.length}/${c.required_elements.length} elements, status: ${c.applicability_status}`);
  }

  // Layer 13
  const l13 = processLayer13({ events: l4.data, entities: l6.data, claims: l12.data });
  console.log(`\nL13 Translation: ${l13.data.timeline_summary.length} timeline, ${l13.data.claim_summaries.length} claims`);

  // Layer 14
  const l14 = processLayer14({ candidates: l12.data, transitions: l9.data, filing_date: as_of });
  console.log(`\nL14 Action Paths: ${l14.data.length}`);
  for (const p of l14.data) {
    console.log(`  ${p.claim_type_name}: ${p.elements_satisfied}/${p.elements_total} elements, deadline: ${p.deadline_date || 'unknown'}, status: ${p.status}`);
  }

  // DETERMINISM TEST
  console.log('\n=== DETERMINISM REPLAY ===');
  const l4_replay = processLayer4({ artifacts: [parsed] });
  const l6_replay = processLayer6({ artifacts: [parsed] });
  console.log(`L4 hash match: ${l4.output_hash === l4_replay.output_hash}`);
  console.log(`L6 hash match: ${l6.output_hash === l6_replay.output_hash}`);
  console.log(`L4 input_hash: ${l4.input_hash}`);
  console.log(`L6 input_hash: ${l6.input_hash}`);
}

main().catch(console.error);
