/**
 * L7 Claim Validation Layer - Main Implementation
 * 
 * Validates Phoenix signals against public records and outputs:
 * - VALIDATED_CLAIM (≥0.95)
 * - INSUFFICIENT_EVIDENCE (0.70-0.95)
 * - REQUIRES_FOIA (<0.70)
 */

import { db } from '../db';
import { SystemActor } from '../types/system-actor';
import {
  ValidationResult,
  ValidationStatus,
  EvidenceStatus,
  Evidence,
  ActionPath,
  PhoenixSignal,
  DEFAULT_VALIDATION_WEIGHTS,
  VALIDATION_THRESHOLDS,
  ENFORCEMENT_MAP,
} from './types';
import {
  IKingCountyRecorder,
  IWashingtonSOS,
  IWhoisConnector,
  ICaseLawConnector,
  MockKingCountyRecorder,
  MockWashingtonSOS,
  MockWhoisConnector,
  MockCaseLawConnector,
} from './connectors/index';

export class ClaimValidationLayer {
  private kingCountyRecorder: IKingCountyRecorder;
  private waSOS: IWashingtonSOS;
  private whois: IWhoisConnector;
  private caseLaw: ICaseLawConnector;

  constructor(
    kingCountyRecorder?: IKingCountyRecorder,
    waSOS?: IWashingtonSOS,
    whois?: IWhoisConnector,
    caseLaw?: ICaseLawConnector
  ) {
    // Use provided connectors or mock implementations
    this.kingCountyRecorder = kingCountyRecorder || new MockKingCountyRecorder();
    this.waSOS = waSOS || new MockWashingtonSOS();
    this.whois = whois || new MockWhoisConnector();
    this.caseLaw = caseLaw || new MockCaseLawConnector();
  }

  /**
   * Main validation method
   * Validates a Phoenix signal and returns a comprehensive validation result
   */
  async validatePhoenixSignal(
    signalId: string,
    actor: SystemActor
  ): Promise<ValidationResult> {
    // Only sovereign actors can validate
    if (!['INGESTION_ENGINE', 'PHOENIX_DETECTOR', 'CLAIM_VALIDATOR'].includes(actor)) {
      throw new Error(`Unauthorized: ${actor} cannot validate claims`);
    }

    console.log(`[CLAIM_VALIDATOR] Starting validation for signal ${signalId} by ${actor}`);

    // 1. Retrieve the Phoenix signal
    const signal = await this.retrieveSignal(signalId);
    if (!signal) {
      throw new Error(`Signal ${signalId} not found`);
    }

    // 2. Validate each evidence category
    console.log(`[CLAIM_VALIDATOR] Validating 5 evidence categories...`);
    const assetTransfer = await this.validateAssetTransfer(signal);
    const legalLinkage = await this.validateLegalLinkage(signal);
    const operatorControl = await this.validateOperatorControl(signal);
    const statutoryApplicability = await this.validateStatutoryApplicability(signal);
    const enforcementPath = await this.validateEnforcementPath(signal);

    // 3. Compute weighted validation score
    const validationScore = this.computeValidationScore({
      assetTransfer,
      legalLinkage,
      operatorControl,
      statutoryApplicability,
      enforcementPath,
    });

    // 4. Classify result
    const classification = this.classifyValidation(validationScore);

    // 5. Identify missing records
    const missingRecords = this.identifyMissingRecords({
      assetTransfer,
      legalLinkage,
      operatorControl,
      statutoryApplicability,
      enforcementPath,
    });

    // 6. Generate action path if validated
    const actionPath =
      classification === 'VALIDATED_CLAIM'
        ? this.generateActionPath(signal, validationScore)
        : undefined;

    // 7. Build validation result
    const result: ValidationResult = {
      signalId,
      caseId: signal.caseId,
      classification,
      validationScore,
      evidence: {
        assetTransfer,
        legalLinkage,
        operatorControl,
        statutoryApplicability,
        enforcementPath,
      },
      missingRecords,
      actionPath,
      requiresFOIA: classification === 'REQUIRES_FOIA' ? missingRecords : [],
      validatedBy: actor,
      validatedAt: new Date(),
      auditTrail: [
        {
          timestamp: new Date(),
          actor,
          action: 'VALIDATION_COMPLETE',
          details: {
            classification,
            validationScore,
            evidenceCount: 5,
          },
        },
      ],
    };

    // 8. Store validation result
    await this.storeValidationResult(result);

    console.log(
      `[CLAIM_VALIDATOR] Validation complete: ${classification} (score: ${validationScore.toFixed(2)})`
    );

    return result;
  }

  /**
   * VALIDATION METHOD 1: Asset Transfer
   * Checks for deed records, UCC filings, or lease agreements
   */
  private async validateAssetTransfer(signal: PhoenixSignal): Promise<EvidenceStatus> {
    console.log(`[CLAIM_VALIDATOR] Validating asset transfer...`);

    const address = signal.metadata.address;
    const oldUbi = signal.metadata.oldUbi;
    const newUbi = signal.metadata.newUbi;

    if (!address || !oldUbi || !newUbi) {
      return {
        status: 'NOT_APPLICABLE',
        source: 'Missing required metadata',
        confidence: 0,
        rawData: null,
      };
    }

    try {
      // Check for deed records
      const deeds = await this.kingCountyRecorder.getDeedsByAddress(address);
      const transferDeed = deeds.find(
        (deed) =>
          deed.grantor.includes(oldUbi) &&
          deed.grantee.includes(newUbi)
      );

      if (transferDeed) {
        return {
          status: 'PROVEN',
          source: `King County Recorder, Deed #${transferDeed.deedNumber}`,
          confidence: 1.0,
          rawData: transferDeed,
        };
      }

      // Check for UCC filings
      const uccFilings = await this.waSOS.getUCCFilingsByParty(oldUbi);
      const lease = uccFilings.find(
        (filing) =>
          filing.collateral.includes(address) &&
          filing.securedParty.includes(newUbi)
      );

      if (lease) {
        return {
          status: 'PARTIAL',
          source: `WA SOS UCC Filing #${lease.filingNumber}`,
          confidence: 0.7,
          rawData: lease,
        };
      }

      return {
        status: 'MISSING',
        source: 'No public deed or UCC records found',
        confidence: 0,
        rawData: null,
      };
    } catch (error: any) {
      console.error(`[CLAIM_VALIDATOR] Asset transfer validation error: ${error.message}`);
      return {
        status: 'MISSING',
        source: `Error querying records: ${error.message}`,
        confidence: 0,
        rawData: null,
      };
    }
  }

  /**
   * VALIDATION METHOD 2: Legal Linkage
   * Checks if operator is listed as officer/manager in new entity
   */
  private async validateLegalLinkage(signal: PhoenixSignal): Promise<EvidenceStatus> {
    console.log(`[CLAIM_VALIDATOR] Validating legal linkage...`);

    const newUbi = signal.metadata.newUbi;

    if (!newUbi) {
      return {
        status: 'NOT_APPLICABLE',
        source: 'Missing new UBI',
        confidence: 0,
        rawData: null,
      };
    }

    try {
      const business = await this.waSOS.getBusinessByUbi(newUbi);

      // Check for Julian Saint Clair (operator)
      const julianMatches = business.officers?.filter(
        (officer) =>
          officer.name.includes('Julian') ||
          officer.name.includes('Saint Clair') ||
          officer.name.includes('J. Saint Clair')
      );

      if (julianMatches && julianMatches.length > 0) {
        return {
          status: 'PROVEN',
          source: `WA SOS Business Filing, UBI: ${newUbi}`,
          confidence: 1.0,
          rawData: { officers: julianMatches },
        };
      }

      // Check for R. Doe (original agent)
      const doeMatches = business.officers?.filter((officer) =>
        officer.name.includes('Doe')
      );

      if (doeMatches && doeMatches.length > 0) {
        return {
          status: 'PARTIAL',
          source: `WA SOS Business Filing, UBI: ${newUbi}`,
          confidence: 0.85,
          rawData: { officers: doeMatches },
        };
      }

      return {
        status: 'MISSING',
        source: 'No matching officers found',
        confidence: 0,
        rawData: null,
      };
    } catch (error: any) {
      console.error(`[CLAIM_VALIDATOR] Legal linkage validation error: ${error.message}`);
      return {
        status: 'MISSING',
        source: `Error querying business records: ${error.message}`,
        confidence: 0,
        rawData: null,
      };
    }
  }

  /**
   * VALIDATION METHOD 3: Operator Control
   * Checks WHOIS records for domain registration consistency
   */
  private async validateOperatorControl(signal: PhoenixSignal): Promise<EvidenceStatus> {
    console.log(`[CLAIM_VALIDATOR] Validating operator control...`);

    const oldDomain = signal.metadata.oldDomain;
    const newDomain = signal.metadata.newDomain;

    if (!oldDomain || !newDomain) {
      return {
        status: 'NOT_APPLICABLE',
        source: 'Missing domain metadata',
        confidence: 0,
        rawData: null,
      };
    }

    try {
      const oldWhois = await this.whois.getDomain(oldDomain);
      const newWhois = await this.whois.getDomain(newDomain);

      // Check if same registrant
      if (oldWhois.registrant === newWhois.registrant) {
        return {
          status: 'PROVEN',
          source: `WHOIS: ${oldDomain} and ${newDomain} share registrant`,
          confidence: 0.95,
          rawData: { old: oldWhois, new: newWhois },
        };
      }

      // Check if registrant matches operator
      const julianMatch =
        newWhois.registrant?.includes('Julian') ||
        newWhois.registrant?.includes('Saint Clair');

      if (julianMatch) {
        return {
          status: 'PARTIAL',
          source: `WHOIS: ${newDomain} registrant matches operator`,
          confidence: 0.8,
          rawData: newWhois,
        };
      }

      return {
        status: 'MISSING',
        source: 'No WHOIS match or registrant mismatch',
        confidence: 0,
        rawData: null,
      };
    } catch (error: any) {
      console.error(`[CLAIM_VALIDATOR] Operator control validation error: ${error.message}`);
      return {
        status: 'MISSING',
        source: `Error querying WHOIS: ${error.message}`,
        confidence: 0,
        rawData: null,
      };
    }
  }

  /**
   * VALIDATION METHOD 4: Statutory Applicability
   * Checks case law and statute text for successor liability
   */
  private async validateStatutoryApplicability(
    signal: PhoenixSignal
  ): Promise<EvidenceStatus> {
    console.log(`[CLAIM_VALIDATOR] Validating statutory applicability...`);

    try {
      // Check case law for RCW 43.20A.435
      const caseLaw = await this.caseLaw.findByStatute('RCW 43.20A.435', [
        'asset',
        'transfer',
        'successor',
        'liability',
      ]);

      if (caseLaw.length > 0) {
        return {
          status: 'PROVEN',
          source: `Case law: ${caseLaw[0].caseName}`,
          confidence: 0.95,
          rawData: caseLaw[0],
        };
      }

      // Fallback: statute text
      const statute = await this.caseLaw.getStatuteText('RCW 43.20A.435');
      if (statute) {
        return {
          status: 'PARTIAL',
          source: 'Statute text available, no case law on point',
          confidence: 0.6,
          rawData: statute,
        };
      }

      return {
        status: 'MISSING',
        source: 'No statutory or case law reference found',
        confidence: 0,
        rawData: null,
      };
    } catch (error: any) {
      console.error(
        `[CLAIM_VALIDATOR] Statutory applicability validation error: ${error.message}`
      );
      return {
        status: 'MISSING',
        source: `Error querying case law: ${error.message}`,
        confidence: 0,
        rawData: null,
      };
    }
  }

  /**
   * VALIDATION METHOD 5: Enforcement Path
   * Identifies the appropriate enforcement agency and action
   */
  private async validateEnforcementPath(signal: PhoenixSignal): Promise<EvidenceStatus> {
    console.log(`[CLAIM_VALIDATOR] Validating enforcement path...`);

    const grantAgency = signal.metadata.grantAgency;

    if (!grantAgency) {
      return {
        status: 'NOT_APPLICABLE',
        source: 'Missing grant agency metadata',
        confidence: 0,
        rawData: null,
      };
    }

    const enforcement = ENFORCEMENT_MAP[grantAgency];

    if (enforcement) {
      return {
        status: 'PROVEN',
        source: `Enforcement agency: ${enforcement.enforcementAgency}`,
        confidence: 1.0,
        rawData: enforcement,
      };
    }

    return {
      status: 'MISSING',
      source: `No enforcement mapping for agency: ${grantAgency}`,
      confidence: 0,
      rawData: null,
    };
  }

  /**
   * Compute weighted validation score
   */
  private computeValidationScore(evidence: Evidence): number {
    const weights = DEFAULT_VALIDATION_WEIGHTS;

    const score =
      evidence.assetTransfer.confidence * weights.assetTransfer +
      evidence.legalLinkage.confidence * weights.legalLinkage +
      evidence.operatorControl.confidence * weights.operatorControl +
      evidence.statutoryApplicability.confidence * weights.statutoryApplicability +
      evidence.enforcementPath.confidence * weights.enforcementPath;

    return Math.min(1.0, Math.max(0, score));
  }

  /**
   * Classify validation result based on score
   */
  private classifyValidation(score: number): ValidationStatus {
    if (score >= VALIDATION_THRESHOLDS.VALIDATED_CLAIM) {
      return 'VALIDATED_CLAIM';
    } else if (score >= VALIDATION_THRESHOLDS.INSUFFICIENT_EVIDENCE) {
      return 'INSUFFICIENT_EVIDENCE';
    } else {
      return 'REQUIRES_FOIA';
    }
  }

  /**
   * Identify missing records
   */
  private identifyMissingRecords(evidence: Evidence): string[] {
    const missing: string[] = [];

    if (evidence.assetTransfer.status === 'MISSING') {
      missing.push('Deed records or UCC filings');
    }
    if (evidence.legalLinkage.status === 'MISSING') {
      missing.push('Business officer records');
    }
    if (evidence.operatorControl.status === 'MISSING') {
      missing.push('WHOIS domain registration records');
    }
    if (evidence.statutoryApplicability.status === 'MISSING') {
      missing.push('Case law or statute text');
    }
    if (evidence.enforcementPath.status === 'MISSING') {
      missing.push('Enforcement agency mapping');
    }

    return missing;
  }

  /**
   * Generate action path for validated claims
   */
  private generateActionPath(signal: PhoenixSignal, score: number): ActionPath | undefined {
    const grantAgency = signal.metadata.grantAgency;
    const enforcement = ENFORCEMENT_MAP[grantAgency];

    if (!enforcement) {
      return undefined;
    }

    return {
      ...enforcement,
      estimatedRecoveryAmount: signal.metadata.grantAmount || 0,
      priority: score >= 0.95 ? 'CRITICAL' : 'HIGH',
    };
  }

  /**
   * Retrieve Phoenix signal from database
   */
  private async retrieveSignal(signalId: string): Promise<PhoenixSignal | null> {
    // Mock implementation - would query database in production
    return {
      id: signalId,
      caseId: 1,
      signalType: 'PHOENIX_ENTITY_MASKED',
      linkedEntities: ['Renaissance 21 Childcare', 'R21 Logistics & Care'],
      metadata: {
        oldUbi: '603-xxx-xxx',
        newUbi: '605777111',
        address: '1234 SECTOR 7G, SEATTLE, WA 98101',
        phone: '206-555-0199',
        oldDomain: 'renaissance21.org',
        newDomain: 'r21logistics.com',
        grantAgency: 'Seattle IT',
        grantAmount: 50000,
      },
      confidenceScore: 0.88,
      createdAt: new Date(),
    };
  }

  /**
   * Store validation result
   */
  private async storeValidationResult(result: ValidationResult): Promise<void> {
    // Mock implementation - would store in database in production
    console.log(`[CLAIM_VALIDATOR] Storing validation result for signal ${result.signalId}`);
  }
}

// Export singleton instance
export const claimValidator = new ClaimValidationLayer();
