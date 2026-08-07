import { StabilizationInput, processLayer1 } from './layer-1-stabilization_envelope';
import { RawArtifactInput, processLayer2 } from './layer-2-raw_intake_capture';
import { processLayer3 } from './layer-3-evidence_preservation';
import { parseArtifact } from './parsing-substrate';
import { processLayer4 } from './layer-4-chronology_reconstruction';
import { processLayer5 } from './layer-5-verification_gate';
import { processLayer6 } from './layer-6-entity_registry';
import { processLayer7 } from './layer-7-relationship_graph';
import { processLayer8 } from './layer-8-power_dynamics_registry';
import { processLayer9 } from './layer-9-state_timeline';
import { processLayer10 } from './layer-10-pattern_registry';
import { processLayer11 } from './layer-11-cascade_registry';
import { processLayer12 } from './layer-12-rights_and_duties_matrix';
import { processLayer13 } from './layer-13-translation_layer';
import { processLayer14 } from './layer-14-action_paths';

/**
 * Universal Intake Spine Pipeline Orchestrator
 * Executes all 14 layers in dependency order.
 */
export async function runIntakePipeline(
  stabilizationInput: StabilizationInput,
  rawArtifacts: RawArtifactInput[],
  jurisdiction: string
) {
  // Layer 1
  const l1 = processLayer1(stabilizationInput);

  // Layer 2 & 3 for each artifact
  const artifacts = rawArtifacts.map(raw => {
    const l2 = processLayer2(raw);
    const l3 = processLayer3({ record: l2.data, actual_bytes: raw.bytes });
    return { l2, l3, bytes: raw.bytes };
  });

  // Shared Parsing Substrate
  const parsedArtifacts = await Promise.all(
    artifacts.map(a => parseArtifact(a.l2.data.artifact_key, a.bytes, a.l2.data.mime_type))
  );

  // Layer 4 & 6 (consume shared substrate)
  const l4 = processLayer4(parsedArtifacts);
  const l6 = processLayer6(parsedArtifacts);

  // Layer 5 (depends on 4)
  const l5 = processLayer5(l4.data);

  // Layer 7 (depends on 6)
  const l7 = processLayer7(l6.data, parsedArtifacts);

  // Layer 8 (depends on 7)
  const l8 = processLayer8(l7.data);

  // Layer 9 (depends on 4, 6, 5)
  const l9 = processLayer9(l4.data, l6.data);

  // Layer 10 (depends on 9)
  const l10 = processLayer10(l9.data);

  // Layer 11 (depends on 9, 10, 7)
  const l11 = processLayer11(l9.data);

  // Layer 12 (depends on 6, 7)
  const l12 = processLayer12(l6.data, jurisdiction);

  // Layer 13 (depends on all prior)
  const l13 = processLayer13({ 
    events: l4.data, 
    entities: l6.data, 
    claims: l12.data 
  });

  // Layer 14 (depends on 12, 1, 5, 9)
  const l14 = processLayer14(l12.data);

  return {
    layers: { l1, l2: artifacts.map(a => a.l2), l3: artifacts.map(a => a.l3), l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14 },
    summary: l13.data,
    paths: l14.data
  };
}
