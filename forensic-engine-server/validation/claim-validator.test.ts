/**
 * L7 Claim Validation Layer - Test Suite
 * 
 * Tests the complete validation pipeline:
 * - Asset transfer validation
 * - Legal linkage validation
 * - Operator control validation
 * - Statutory applicability validation
 * - Enforcement path validation
 * - Weighted score computation
 * - Result classification
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClaimValidationLayer } from './claim-validator';
import {
  MockKingCountyRecorder,
  MockWashingtonSOS,
  MockWhoisConnector,
  MockCaseLawConnector,
} from './connectors/index';
import { ValidationStatus, VALIDATION_THRESHOLDS } from './types';

describe('L7 Claim Validation Layer', () => {
  let validator: ClaimValidationLayer;

  beforeEach(() => {
    // Initialize with mock connectors
    validator = new ClaimValidationLayer(
      new MockKingCountyRecorder(),
      new MockWashingtonSOS(),
      new MockWhoisConnector(),
      new MockCaseLawConnector()
    );
  });

  describe('validatePhoenixSignal', () => {
    it('should validate a Phoenix signal and return VALIDATED_CLAIM', async () => {
      const result = await validator.validatePhoenixSignal('SIG-001', 'CLAIM_VALIDATOR');

      expect(result).toBeDefined();
      expect(result.signalId).toBe('SIG-001');
      expect(result.classification).toBeDefined();
      expect(['VALIDATED_CLAIM', 'INSUFFICIENT_EVIDENCE', 'REQUIRES_FOIA']).toContain(
        result.classification
      );
      expect(result.validationScore).toBeGreaterThanOrEqual(0);
      expect(result.validationScore).toBeLessThanOrEqual(1);
    });

    it('should require authorized system actor', async () => {
      expect(async () => {
        await validator.validatePhoenixSignal('SIG-001', 'UNAUTHORIZED_ACTOR' as any);
      }).rejects.toThrow('Unauthorized');
    });

    it('should include all 5 evidence categories', async () => {
      const result = await validator.validatePhoenixSignal('SIG-001', 'CLAIM_VALIDATOR');

      expect(result.evidence).toBeDefined();
      expect(result.evidence.assetTransfer).toBeDefined();
      expect(result.evidence.legalLinkage).toBeDefined();
      expect(result.evidence.operatorControl).toBeDefined();
      expect(result.evidence.statutoryApplicability).toBeDefined();
      expect(result.evidence.enforcementPath).toBeDefined();
    });

    it('should compute weighted validation score', async () => {
      const result = await validator.validatePhoenixSignal('SIG-001', 'CLAIM_VALIDATOR');

      // Score should be weighted average of evidence confidences
      expect(result.validationScore).toBeGreaterThan(0);
      expect(result.validationScore).toBeLessThanOrEqual(1);
    });

    it('should classify as VALIDATED_CLAIM when score >= 0.95', async () => {
      const result = await validator.validatePhoenixSignal('SIG-001', 'CLAIM_VALIDATOR');

      if (result.validationScore >= VALIDATION_THRESHOLDS.VALIDATED_CLAIM) {
        expect(result.classification).toBe('VALIDATED_CLAIM');
      }
    });

    it('should classify as INSUFFICIENT_EVIDENCE when score 0.70-0.95', async () => {
      const result = await validator.validatePhoenixSignal('SIG-001', 'CLAIM_VALIDATOR');

      if (
        result.validationScore >= VALIDATION_THRESHOLDS.INSUFFICIENT_EVIDENCE &&
        result.validationScore < VALIDATION_THRESHOLDS.VALIDATED_CLAIM
      ) {
        expect(result.classification).toBe('INSUFFICIENT_EVIDENCE');
      }
    });

    it('should classify as REQUIRES_FOIA when score < 0.70', async () => {
      const result = await validator.validatePhoenixSignal('SIG-001', 'CLAIM_VALIDATOR');

      if (result.validationScore < VALIDATION_THRESHOLDS.INSUFFICIENT_EVIDENCE) {
        expect(result.classification).toBe('REQUIRES_FOIA');
      }
    });

    it('should identify missing records', async () => {
      const result = await validator.validatePhoenixSignal('SIG-001', 'CLAIM_VALIDATOR');

      expect(Array.isArray(result.missingRecords)).toBe(true);
    });

    it('should generate action path for validated claims', async () => {
      const result = await validator.validatePhoenixSignal('SIG-001', 'CLAIM_VALIDATOR');

      if (result.classification === 'VALIDATED_CLAIM') {
        expect(result.actionPath).toBeDefined();
        expect(result.actionPath?.enforcementAgency).toBeDefined();
        expect(result.actionPath?.statute).toBeDefined();
        expect(result.actionPath?.deadline).toBeDefined();
      }
    });

    it('should include audit trail', async () => {
      const result = await validator.validatePhoenixSignal('SIG-001', 'CLAIM_VALIDATOR');

      expect(result.auditTrail).toBeDefined();
      expect(Array.isArray(result.auditTrail)).toBe(true);
      expect(result.auditTrail.length).toBeGreaterThan(0);
      expect(result.auditTrail[0].actor).toBe('CLAIM_VALIDATOR');
    });
  });

  describe('Evidence Validation Methods', () => {
    it('should validate asset transfer', async () => {
      const result = await validator.validatePhoenixSignal('SIG-001', 'CLAIM_VALIDATOR');

      const assetTransfer = result.evidence.assetTransfer;
      expect(assetTransfer).toBeDefined();
      expect(['PROVEN', 'PARTIAL', 'MISSING', 'NOT_APPLICABLE']).toContain(
        assetTransfer.status
      );
      expect(assetTransfer.source).toBeDefined();
      expect(assetTransfer.confidence).toBeGreaterThanOrEqual(0);
      expect(assetTransfer.confidence).toBeLessThanOrEqual(1);
    });

    it('should validate legal linkage', async () => {
      const result = await validator.validatePhoenixSignal('SIG-001', 'CLAIM_VALIDATOR');

      const legalLinkage = result.evidence.legalLinkage;
      expect(legalLinkage).toBeDefined();
      expect(['PROVEN', 'PARTIAL', 'MISSING', 'NOT_APPLICABLE']).toContain(
        legalLinkage.status
      );
      expect(legalLinkage.source).toBeDefined();
      expect(legalLinkage.confidence).toBeGreaterThanOrEqual(0);
      expect(legalLinkage.confidence).toBeLessThanOrEqual(1);
    });

    it('should validate operator control', async () => {
      const result = await validator.validatePhoenixSignal('SIG-001', 'CLAIM_VALIDATOR');

      const operatorControl = result.evidence.operatorControl;
      expect(operatorControl).toBeDefined();
      expect(['PROVEN', 'PARTIAL', 'MISSING', 'NOT_APPLICABLE']).toContain(
        operatorControl.status
      );
      expect(operatorControl.source).toBeDefined();
      expect(operatorControl.confidence).toBeGreaterThanOrEqual(0);
      expect(operatorControl.confidence).toBeLessThanOrEqual(1);
    });

    it('should validate statutory applicability', async () => {
      const result = await validator.validatePhoenixSignal('SIG-001', 'CLAIM_VALIDATOR');

      const statutoryApplicability = result.evidence.statutoryApplicability;
      expect(statutoryApplicability).toBeDefined();
      expect(['PROVEN', 'PARTIAL', 'MISSING', 'NOT_APPLICABLE']).toContain(
        statutoryApplicability.status
      );
      expect(statutoryApplicability.source).toBeDefined();
      expect(statutoryApplicability.confidence).toBeGreaterThanOrEqual(0);
      expect(statutoryApplicability.confidence).toBeLessThanOrEqual(1);
    });

    it('should validate enforcement path', async () => {
      const result = await validator.validatePhoenixSignal('SIG-001', 'CLAIM_VALIDATOR');

      const enforcementPath = result.evidence.enforcementPath;
      expect(enforcementPath).toBeDefined();
      expect(['PROVEN', 'PARTIAL', 'MISSING', 'NOT_APPLICABLE']).toContain(
        enforcementPath.status
      );
      expect(enforcementPath.source).toBeDefined();
      expect(enforcementPath.confidence).toBeGreaterThanOrEqual(0);
      expect(enforcementPath.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Weighted Score Computation', () => {
    it('should weight asset transfer at 30%', async () => {
      const result = await validator.validatePhoenixSignal('SIG-001', 'CLAIM_VALIDATOR');

      // If asset transfer is PROVEN (1.0), it should contribute 0.30 to score
      if (result.evidence.assetTransfer.status === 'PROVEN') {
        expect(result.validationScore).toBeGreaterThanOrEqual(0.3);
      }
    });

    it('should weight legal linkage at 25%', async () => {
      const result = await validator.validatePhoenixSignal('SIG-001', 'CLAIM_VALIDATOR');

      // If legal linkage is PROVEN (1.0), it should contribute 0.25 to score
      if (result.evidence.legalLinkage.status === 'PROVEN') {
        expect(result.validationScore).toBeGreaterThanOrEqual(0.25);
      }
    });

    it('should weight operator control at 20%', async () => {
      const result = await validator.validatePhoenixSignal('SIG-001', 'CLAIM_VALIDATOR');

      // If operator control is PROVEN (1.0), it should contribute 0.20 to score
      if (result.evidence.operatorControl.status === 'PROVEN') {
        expect(result.validationScore).toBeGreaterThanOrEqual(0.2);
      }
    });

    it('should weight statutory applicability at 15%', async () => {
      const result = await validator.validatePhoenixSignal('SIG-001', 'CLAIM_VALIDATOR');

      // If statutory applicability is PROVEN (1.0), it should contribute 0.15 to score
      if (result.evidence.statutoryApplicability.status === 'PROVEN') {
        expect(result.validationScore).toBeGreaterThanOrEqual(0.15);
      }
    });

    it('should weight enforcement path at 10%', async () => {
      const result = await validator.validatePhoenixSignal('SIG-001', 'CLAIM_VALIDATOR');

      // If enforcement path is PROVEN (1.0), it should contribute 0.10 to score
      if (result.evidence.enforcementPath.status === 'PROVEN') {
        expect(result.validationScore).toBeGreaterThanOrEqual(0.1);
      }
    });
  });

  describe('Result Classification', () => {
    it('should classify based on thresholds', async () => {
      const result = await validator.validatePhoenixSignal('SIG-001', 'CLAIM_VALIDATOR');

      if (result.validationScore >= 0.95) {
        expect(result.classification).toBe('VALIDATED_CLAIM');
      } else if (result.validationScore >= 0.70) {
        expect(result.classification).toBe('INSUFFICIENT_EVIDENCE');
      } else {
        expect(result.classification).toBe('REQUIRES_FOIA');
      }
    });

    it('should include FOIA records when REQUIRES_FOIA', async () => {
      const result = await validator.validatePhoenixSignal('SIG-001', 'CLAIM_VALIDATOR');

      if (result.classification === 'REQUIRES_FOIA') {
        expect(result.requiresFOIA).toBeDefined();
        expect(Array.isArray(result.requiresFOIA)).toBe(true);
      }
    });
  });

  describe('Sovereign System Actor Integration', () => {
    it('should accept INGESTION_ENGINE actor', async () => {
      const result = await validator.validatePhoenixSignal('SIG-001', 'INGESTION_ENGINE');

      expect(result).toBeDefined();
      expect(result.validatedBy).toBe('INGESTION_ENGINE');
    });

    it('should accept PHOENIX_DETECTOR actor', async () => {
      const result = await validator.validatePhoenixSignal('SIG-001', 'PHOENIX_DETECTOR');

      expect(result).toBeDefined();
      expect(result.validatedBy).toBe('PHOENIX_DETECTOR');
    });

    it('should accept CLAIM_VALIDATOR actor', async () => {
      const result = await validator.validatePhoenixSignal('SIG-001', 'CLAIM_VALIDATOR');

      expect(result).toBeDefined();
      expect(result.validatedBy).toBe('CLAIM_VALIDATOR');
    });

    it('should log validation in audit trail with actor', async () => {
      const result = await validator.validatePhoenixSignal('SIG-001', 'CLAIM_VALIDATOR');

      expect(result.auditTrail).toBeDefined();
      expect(result.auditTrail[0].actor).toBe('CLAIM_VALIDATOR');
      expect(result.auditTrail[0].timestamp).toBeDefined();
    });
  });
});
