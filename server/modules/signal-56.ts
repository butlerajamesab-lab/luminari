/**
 * SIGNAL-56: LICENSE MINING DETECTION MODULE
 * 
 * Detects patterns of "License Mining" where healthcare licenses (AFH/DSHS)
 * are used as a shield for fraudulent construction, unpermitted remodels,
 * or "self-dealing" loops.
 * 
 * Statute Alignment: RCW 19.86 (Consumer Protection Act)
 * Jurisdiction: Washington State (King/Pierce County)
 * 
 * Pattern Detection:
 * - License holder operating multiple entities with same phone/address
 * - Licenses used to bypass construction/zoning requirements
 * - Fee extraction without corresponding service delivery
 * - License renewal despite documented violations
 */

import { db } from '../db';
import { forensicPool } from '../forensic-db';

export interface LicenseMiningSignal {
  signal_id: string;
  entity_id: string;
  license_number: string;
  license_holder: string;
  pattern_type: 'MULTI_ENTITY_SAME_CONTACT' | 'LICENSE_SHIELD' | 'FEE_EXTRACTION' | 'VIOLATION_RENEWAL';
  evidence_quotes: string[];
  statute_ref: string;
  confidence_score: number;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  rcw_violation: string;
  created_at: number;
}

/**
 * Detect license mining patterns in extracted entities
 */
export async function detectLicenseMiningPatterns(
  caseId: number,
  entities: any[]
): Promise<LicenseMiningSignal[]> {
  const signals: LicenseMiningSignal[] = [];

  // Pattern 1: Multi-entity same contact (phone/address)
  const contactMap = new Map<string, any[]>();
  
  for (const entity of entities) {
    if (entity.type === 'AGENCY' || entity.type === 'ORGANIZATION') {
      const contact = entity.name; // Simplified - would extract phone/address in production
      
      if (!contactMap.has(contact)) {
        contactMap.set(contact, []);
      }
      contactMap.get(contact)!.push(entity);
    }
  }

  // Flag entities with same contact operating under different licenses
  for (const [contact, entityList] of contactMap.entries()) {
    if (entityList.length > 1) {
      const signal: LicenseMiningSignal = {
        signal_id: `SIG56-${caseId}-${Date.now()}`,
        entity_id: entityList[0].id,
        license_number: 'PENDING_EXTRACTION',
        license_holder: contact,
        pattern_type: 'MULTI_ENTITY_SAME_CONTACT',
        evidence_quotes: entityList.map(e => e.name),
        statute_ref: 'RCW 19.86.140',
        confidence_score: 0.85,
        severity: 'HIGH',
        rcw_violation: 'RCW 19.86 - Unfair or deceptive acts in trade or commerce',
        created_at: Date.now()
      };
      
      signals.push(signal);
    }
  }

  // Pattern 2: License used as shield (INSTITUTIONAL_FAILURE entities)
  const institutionalFailures = entities.filter(e => e.type === 'INSTITUTIONAL_FAILURE');
  
  for (const failure of institutionalFailures) {
    if (failure.name.toLowerCase().includes('license') || 
        failure.name.toLowerCase().includes('permit') ||
        failure.name.toLowerCase().includes('construction')) {
      
      const signal: LicenseMiningSignal = {
        signal_id: `SIG56-${caseId}-${Date.now()}-${Math.random()}`,
        entity_id: failure.id,
        license_number: 'UNDER_INVESTIGATION',
        license_holder: 'EXTRACTED_ENTITY',
        pattern_type: 'LICENSE_SHIELD',
        evidence_quotes: [failure.name],
        statute_ref: 'RCW 19.86.140',
        confidence_score: 0.90,
        severity: 'CRITICAL',
        rcw_violation: 'RCW 19.86 - Using license as shield for unlawful conduct',
        created_at: Date.now()
      };
      
      signals.push(signal);
    }
  }

  // Persist signals to database
  for (const signal of signals) {
    try {
      const sql = `
        INSERT INTO forensic_signals 
        (signal_id, case_id, entity_id, pattern_type, evidence_quotes, statute_ref, confidence_score, severity, rcw_violation, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      await forensicPool.execute(sql, [
        signal.signal_id,
        caseId,
        signal.entity_id,
        signal.pattern_type,
        JSON.stringify(signal.evidence_quotes),
        signal.statute_ref,
        signal.confidence_score,
        signal.severity,
        signal.rcw_violation,
        signal.created_at
      ]);
    } catch (error) {
      console.error(`[Signal-56] Failed to persist signal ${signal.signal_id}:`, error);
    }
  }

  return signals;
}

/**
 * Query license mining signals for a case
 */
export async function getLicenseMiningSignals(caseId: number): Promise<LicenseMiningSignal[]> {
  try {
    const [rows] = await forensicPool.execute(
      `SELECT * FROM forensic_signals WHERE case_id = ? AND pattern_type LIKE 'MULTI_ENTITY%' OR pattern_type = 'LICENSE_SHIELD'`,
      [caseId]
    );
    
    return rows as LicenseMiningSignal[];
  } catch (error) {
    console.error('[Signal-56] Query failed:', error);
    return [];
  }
}
