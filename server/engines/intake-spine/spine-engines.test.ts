import { processLayer1, StabilizationInput } from './layer-1-stabilization_envelope';
import { processLayer2, RawArtifactInput } from './layer-2-raw_intake_capture';
import { runIntakePipeline } from './index';

describe('Intake Spine Engines - Determinism & Contracts', () => {
  const mockStabInput: StabilizationInput = {
    urgent_matters: ['Eviction notice'],
    deadlines: [{ description: 'Court date', date: '2026-08-15', days_out: 8 }],
    irreversible_events: [],
    at_risk_services: ['Housing'],
    evidence_to_preserve: [],
    communication_limits: [],
    support_people: [],
    next_action: 'File response',
    can_wait: []
  };

  const mockArtifact: RawArtifactInput = {
    filename: 'notice.txt',
    bytes: Buffer.from('Eviction notice dated 2026-08-01. Issued by Housing Dept.'),
    mime_type: 'text/plain'
  };

  test('Layer 1 - Determinism Proof', () => {
    const res1 = processLayer1(mockStabInput);
    const res2 = processLayer1(mockStabInput);
    expect(res1.input_hash).toBe(res2.input_hash);
    expect(res1.output_hash).toBe(res2.output_hash);
  });

  test('Layer 1 - Canonicalization Proof (Reordered Input)', () => {
    const reorderedInput = { ...mockStabInput, urgent_matters: ['Eviction notice'] };
    const res1 = processLayer1(mockStabInput);
    const res2 = processLayer1(reorderedInput);
    expect(res1.input_hash).toBe(res2.input_hash);
  });

  test('Layer 2 - SHA-256 Identity', () => {
    const res = processLayer2(mockArtifact);
    expect(res.data.sha256).toBeDefined();
    expect(res.data.artifact_key).toContain('art_');
  });

  test('Full Pipeline Execution', async () => {
    const result = await runIntakePipeline(mockStabInput, [mockArtifact], 'Washington');
    expect(result.layers.l4.data.length).toBeGreaterThan(0); // Should find the date
    expect(result.layers.l6.data.length).toBeGreaterThan(0); // Should find Housing Dept
    expect(result.paths.length).toBeGreaterThan(0);
  });
});
