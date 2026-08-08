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
import {
  GOVERNED_LEGAL_REGISTRY_CONTRACT_VERSION,
  computeGovernedLegalRegistryHash,
  normalizeGovernedLegalRegistry,
} from './server/engines/intake-spine/governed-legal-registry';

const cherylDoc = Buffer.from(`
Cheryl Thompson was employed by Cascade Health Services Inc. from March 2022 until January 15, 2025.
On January 15, 2025, Cheryl Thompson was terminated from Cascade Health Services Inc.
Cheryl Thompson filed a complaint with the Department of Labor on December 20, 2024 regarding unpaid overtime.
On February 1, 2025, Cheryl Thompson received an eviction notice.
Cheryl Thompson rents from Jane Doe at 1234 Pine St, Seattle, WA 98101.
Cheryl Thompson applied for unemployment benefits on January 20, 2025.
On February 15, 2025, Cheryl Thompson received a benefits denial.
Contact: cheryl.thompson@email.com, (206) 555-0142
`);

const governedRegistry = normalizeGovernedLegalRegistry({
  contract_version: GOVERNED_LEGAL_REGISTRY_CONTRACT_VERSION,
  source_tables: [
    { table_name: 'claim_catalog', posture: 'structural_claim_registry' },
    { table_name: 'claim_validation_rules', posture: 'required_element_registry' },
    { table_name: 'legal_workflow_deadlines', posture: 'verified_deadline_registry' },
    { table_name: 'workflow_master', posture: 'procedural_workflow_registry' },
    { table_name: 'workflow_steps', posture: 'procedural_workflow_registry' },
  ],
  claims: [
    {
      registry_id: 2,
      claim_type_id: 'wrongful_termination',
      domain: 'employment',
      canonical_name: 'Wrongful Termination',
      description: 'Fixture structural claim identity only',
      governing_standards: ['State Wrongful Termination Statutes'],
      required_evidence_types: ['termination_letter'],
      allowed_evidence_types: ['email_communication', 'termination_letter'],
      jurisdiction_layer: 'all',
    },
    {
      registry_id: 4,
      claim_type_id: 'eviction_unlawful',
      domain: 'housing',
      canonical_name: 'Unlawful Eviction',
      description: 'Fixture structural claim identity only',
      governing_standards: ['State Landlord-Tenant Laws'],
      required_evidence_types: ['eviction_notice', 'lease_agreement'],
      allowed_evidence_types: ['eviction_notice', 'lease_agreement'],
      jurisdiction_layer: 'all',
    },
    {
      registry_id: 5,
      claim_type_id: 'benefits_denial',
      domain: 'benefits',
      canonical_name: 'Benefits Denial',
      description: 'Fixture structural claim identity only',
      governing_standards: ['Program Eligibility Rules'],
      required_evidence_types: ['benefit_letter'],
      allowed_evidence_types: ['benefit_letter', 'email_communication'],
      jurisdiction_layer: 'all',
    },
    {
      registry_id: 8,
      claim_type_id: 'retaliation_employment',
      domain: 'employment',
      canonical_name: 'Employment Retaliation',
      description: 'Fixture structural claim identity only',
      governing_standards: ['Anti-Retaliation Rules'],
      required_evidence_types: ['email_communication'],
      allowed_evidence_types: ['email_communication', 'termination_letter'],
      jurisdiction_layer: 'all',
    },
  ],
  elements: [
    {
      registry_id: 201,
      claim_type_id: 'wrongful_termination',
      element_name: 'protected_activity_engaged',
      element_description: 'Fixture required element',
      element_order: 1,
      required_evidence_types: ['email_communication'],
      is_required: true,
    },
    {
      registry_id: 202,
      claim_type_id: 'wrongful_termination',
      element_name: 'adverse_action_termination',
      element_description: 'Fixture required element',
      element_order: 2,
      required_evidence_types: ['termination_letter'],
      is_required: true,
    },
  ],
  deadlines: [
    {
      registry_id: 'employment-wa-fixture',
      jurisdiction: 'WA',
      claim_domain: 'employment',
      deadline_days: null,
      deadline_description: 'Fixture domain-level deadline placeholder',
      filing_body: 'Fixture labor authority',
      source_citation: 'Fixture only',
      source_url: null,
      verification_status: 'verified',
    },
  ],
  workflows: [
    {
      registry_id: 1,
      workflow_key: 'workplace_fixture',
      workflow_name: 'Workplace fixture workflow',
      issue_types: ['wrongful_termination', 'retaliation', 'wage_theft'],
      primary_agency: 'Fixture labor authority',
      initial_deadline_rule: 'Use bound verified deadline rule',
      entry_forms: ['fixture_form'],
      exhaustion_required: null,
      appeal_chain: ['fixture_appeal'],
      remedies: ['fixture_remedy'],
      steps: [
        {
          registry_id: 101,
          step_number: 1,
          action: 'Preserve the required evidence',
          owner: 'person',
          due_rule: null,
          required_document: 'termination_letter',
          output: 'preserved_evidence',
          escalation_if_failed: 'fixture_appeal',
        },
      ],
    },
  ],
});
const governedRegistryHash = computeGovernedLegalRegistryHash(governedRegistry);

async function main() {
  const as_of = '2025-03-01';

  const l1 = processLayer1({
    urgent_situation: 'Housing and income are at risk',
    deadlines: [
      { description: 'Eviction court date', date: '2025-03-15', is_irreversible: true },
      { description: 'Benefits appeal deadline', date: '2025-04-15', is_irreversible: false },
    ],
    essential_services_at_risk: ['housing', 'income'],
    evidence_to_preserve: ['termination letter', 'eviction notice', 'benefits denial letter'],
    communication_limits: [],
    support_people: ['sister Maria'],
    least_burdensome_action: 'Preserve the current notices',
    what_can_wait: ['FOIA request'],
  }, as_of);

  const l2 = processLayer2({
    filename: 'cheryl_case.txt',
    bytes: cherylDoc,
    declared_mime_type: 'text/plain',
    entry_channel: 'fixture_upload',
  });
  const l3 = processLayer3({ record: l2.data, actual_bytes: cherylDoc }, as_of);
  const parsed = await parseArtifact(l2.data.artifact_key, cherylDoc, 'text/plain');
  const l4 = processLayer4({ artifacts: [parsed] });
  const l6 = processLayer6({ artifacts: [parsed] });
  const l7 = processLayer7({ entities: l6.data, artifacts: [parsed] });
  const l9 = processLayer9({ entities: l6.data, artifacts: [parsed] });
  const l5 = processLayer5({ transitions: l9.data, relationships: l7.data });
  const l8 = processLayer8({ relationships: l7.data });
  const l10 = processLayer10({ transitions: l9.data });
  const l11 = processLayer11({ transitions: l9.data });
  const l12 = processLayer12({
    entities: l6.data,
    relationships: l7.data,
    transitions: l9.data,
    patterns: l10.data,
    jurisdiction: 'WA',
    governed_registry: governedRegistry,
    governed_registry_hash: governedRegistryHash,
  });
  const l13 = processLayer13({ events: l4.data, entities: l6.data, claims: l12.data });
  const l14 = processLayer14({
    candidates: l12.data,
    governed_registry: governedRegistry,
    governed_registry_hash: governedRegistryHash,
  });

  const layers = [l1, l2, l3, l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14];
  for (const layer of layers) {
    console.log(`${layer.layer_name}: ${layer.output_hash} unresolved=${layer.unresolved_dependencies.length}`);
  }

  // Pure deterministic replay checks on representative source-bound layers.
  const l4Replay = processLayer4({ artifacts: [parsed] });
  const l6Replay = processLayer6({ artifacts: [parsed] });
  const l7Replay = processLayer7({ entities: l6.data, artifacts: [parsed] });
  if (l4.output_hash !== l4Replay.output_hash) throw new Error('layer4_replay_mismatch');
  if (l6.output_hash !== l6Replay.output_hash) throw new Error('layer6_replay_mismatch');
  if (l7.output_hash !== l7Replay.output_hash) throw new Error('layer7_replay_mismatch');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
