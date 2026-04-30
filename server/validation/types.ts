/**
 * L7 Claim Validation Layer - Type Definitions
 * 
 * Defines the validation result structure, evidence status, and action paths
 * for the claim validation layer.
 */

import { SystemActor } from '../types/system-actor';

export type ValidationStatus = 'VALIDATED_CLAIM' | 'INSUFFICIENT_EVIDENCE' | 'REQUIRES_FOIA';

export interface EvidenceStatus {
  status: 'PROVEN' | 'PARTIAL' | 'MISSING' | 'NOT_APPLICABLE';
  source: string;
  confidence: number; // 0-1
  rawData: any;
}

export interface Evidence {
  assetTransfer: EvidenceStatus;
  legalLinkage: EvidenceStatus;
  operatorControl: EvidenceStatus;
  statutoryApplicability: EvidenceStatus;
  enforcementPath: EvidenceStatus;
}

export interface ActionPath {
  enforcementAgency: string;
  primaryContact: string;
  secondaryContact: string;
  statute: string;
  deadline: string;
  actionType: 'RECOVERY' | 'INVESTIGATION' | 'AUDIT' | 'REFERRAL';
  estimatedRecoveryAmount?: number;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ValidationResult {
  signalId: string;
  caseId: number;
  classification: ValidationStatus;
  validationScore: number; // 0-1, threshold 0.95 for VALIDATED
  evidence: Evidence;
  missingRecords: string[];
  actionPath?: ActionPath;
  requiresFOIA: string[];
  validatedBy: SystemActor;
  validatedAt: Date;
  auditTrail: {
    timestamp: Date;
    actor: SystemActor;
    action: string;
    details: any;
  }[];
}

export interface ValidationWeights {
  assetTransfer: number;
  legalLinkage: number;
  operatorControl: number;
  statutoryApplicability: number;
  enforcementPath: number;
}

export interface PhoenixSignal {
  id: string;
  caseId: number;
  signalType: string;
  linkedEntities: string[];
  metadata: {
    oldUbi?: string;
    newUbi?: string;
    address?: string;
    phone?: string;
    oldDomain?: string;
    newDomain?: string;
    grantAgency?: string;
    grantAmount?: number;
    [key: string]: any;
  };
  confidenceScore: number;
  createdAt: Date;
}

export interface PublicRecord {
  id: string;
  type: 'DEED' | 'UCC_FILING' | 'BUSINESS_FILING' | 'WHOIS' | 'CASE_LAW' | 'STATUTE';
  source: string;
  recordNumber: string;
  data: any;
  retrievedAt: Date;
}

export interface ValidationCache {
  signalId: string;
  validationResult: ValidationResult;
  expiresAt: Date;
}

export const DEFAULT_VALIDATION_WEIGHTS: ValidationWeights = {
  assetTransfer: 0.30,
  legalLinkage: 0.25,
  operatorControl: 0.20,
  statutoryApplicability: 0.15,
  enforcementPath: 0.10,
};

export const VALIDATION_THRESHOLDS = {
  VALIDATED_CLAIM: 0.95,
  INSUFFICIENT_EVIDENCE: 0.70,
  REQUIRES_FOIA: 0.00,
};

export const ENFORCEMENT_MAP: Record<string, ActionPath> = {
  'Seattle IT': {
    enforcementAgency: 'Seattle Office of Inspector General',
    primaryContact: 'seattle.gov/inspector-general',
    secondaryContact: 'WA State Auditor',
    statute: 'SMC 20.42.050',
    deadline: '3 years from award',
    actionType: 'RECOVERY',
    priority: 'HIGH',
  },
  'DSHS': {
    enforcementAgency: 'DSHS Office of Fraud and Accountability',
    primaryContact: 'dshs.wa.gov/fraud',
    secondaryContact: 'WA Attorney General',
    statute: 'RCW 43.20A.435',
    deadline: '6 years from overpayment',
    actionType: 'RECOVERY',
    priority: 'CRITICAL',
  },
  'Department of Commerce': {
    enforcementAgency: 'WA State Attorney General',
    primaryContact: 'wa.gov/ago',
    secondaryContact: 'Federal Trade Commission',
    statute: 'RCW 19.86.140',
    deadline: '3 years from violation',
    actionType: 'INVESTIGATION',
    priority: 'HIGH',
  },
};
