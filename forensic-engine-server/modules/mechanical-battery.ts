/**
 * MECHANICAL BATTERY: SABOTAGE CLASSIFICATION MODULE
 * 
 * Classifies structural defects as intentional sabotage vs. wear-and-tear,
 * with hardened detection for LLC churn and documented sabotage patterns.
 * 
 * Statute Alignment: RCW 74.34 (Vulnerable Adult Abuse & Neglect)
 * Secondary: RCW 19.86 (Consumer Protection)
 * Jurisdiction: Washington State (King/Pierce County)
 * 
 * Sabotage Indicators:
 * - Tiled-over drains, hidden plumbing defects
 * - Duct-tape repairs on critical systems
 * - Unpermitted structural modifications
 * - Pattern of defects across multiple properties (LLC churn)
 * - Deliberate concealment of hazards
 */

import { forensicPool } from '../forensic-db';

export interface SabotageSignal {
  signal_id: string;
  entity_id: string;
  defect_type: 'PLUMBING' | 'ELECTRICAL' | 'STRUCTURAL' | 'ENVIRONMENTAL' | 'SAFETY';
  classification: 'INTENTIONAL_SABOTAGE' | 'CRIMINAL_NEGLIGENCE' | 'WEAR_AND_TEAR' | 'UNDETERMINED';
  evidence_quotes: string[];
  concealment_indicators: string[];
  statute_ref: string;
  rcw_violation: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  llc_churn_pattern: boolean;
  confidence_score: number;
  created_at: number;
}

/**
 * Detect sabotage patterns in extracted entities
 */
export async function detectSabotagePatterns(
  caseId: number,
  entities: any[]
): Promise<SabotageSignal[]> {
  const signals: SabotageSignal[] = [];

  // Sabotage keywords and patterns
  const sabotageKeywords = [
    'tiled-over', 'tiled over', 'covered', 'hidden', 'concealed',
    'duct-tape', 'duct tape', 'temporary fix', 'band-aid', 'jury-rigged',
    'unpermitted', 'no permit', 'without approval', 'unauthorized',
    'deliberately', 'intentionally', 'knowingly', 'ignored',
    'failed to repair', 'refused to fix', 'ignored complaint'
  ];

  const defectKeywords = {
    'PLUMBING': ['drain', 'pipe', 'water', 'sewage', 'plumbing', 'leak', 'flooding'],
    'ELECTRICAL': ['electrical', 'wiring', 'outlet', 'breaker', 'shock', 'fire hazard'],
    'STRUCTURAL': ['foundation', 'wall', 'roof', 'beam', 'support', 'collapse'],
    'ENVIRONMENTAL': ['mold', 'asbestos', 'lead', 'toxic', 'contamination', 'hazard'],
    'SAFETY': ['safety', 'hazard', 'dangerous', 'unsafe', 'risk', 'injury']
  };

  // Scan entities for sabotage indicators
  for (const entity of entities) {
    const entityText = `${entity.name} ${entity.description || ''}`.toLowerCase();
    
    // Check for sabotage keywords
    const hasSabotageKeyword = sabotageKeywords.some(kw => entityText.includes(kw));
    
    if (!hasSabotageKeyword) continue;

    // Determine defect type
    let defectType: keyof typeof defectKeywords = 'SAFETY';
    for (const [type, keywords] of Object.entries(defectKeywords)) {
      if (keywords.some(kw => entityText.includes(kw))) {
        defectType = type as keyof typeof defectKeywords;
        break;
      }
    }

    // Classify as intentional or negligent
    const intentionalIndicators = ['deliberately', 'intentionally', 'knowingly', 'concealed', 'hidden', 'covered'];
    const negligenceIndicators = ['failed to', 'refused to', 'ignored', 'neglected'];
    
    const hasIntentional = intentionalIndicators.some(ind => entityText.includes(ind));
    const hasNegligence = negligenceIndicators.some(ind => entityText.includes(ind));

    let classification: SabotageSignal['classification'] = 'UNDETERMINED';
    let rcwViolation = 'RCW 74.34.020 - Vulnerable Adult Abuse';
    
    if (hasIntentional) {
      classification = 'INTENTIONAL_SABOTAGE';
      rcwViolation = 'RCW 74.34.020(1) - Abuse: Willful infliction of injury';
    } else if (hasNegligence) {
      classification = 'CRIMINAL_NEGLIGENCE';
      rcwViolation = 'RCW 74.34.020(2) - Neglect: Failure to provide necessary care';
    }

    const signal: SabotageSignal = {
      signal_id: `MECHBAT-${caseId}-${Date.now()}-${Math.random()}`,
      entity_id: entity.id,
      defect_type: defectType as any,
      classification,
      evidence_quotes: [entity.name],
      concealment_indicators: sabotageKeywords.filter(kw => entityText.includes(kw)),
      statute_ref: 'RCW 74.34.020',
      rcw_violation: rcwViolation,
      severity: classification === 'INTENTIONAL_SABOTAGE' ? 'CRITICAL' : 'HIGH',
      llc_churn_pattern: false, // Will be set by cross-reference analysis
      confidence_score: hasIntentional ? 0.95 : hasNegligence ? 0.85 : 0.60,
      created_at: Date.now()
    };

    signals.push(signal);
  }

  // Detect LLC churn patterns (hardened detection)
  const organizationEntities = entities.filter(e => e.type === 'ORGANIZATION' || e.type === 'AGENCY');
  const llcChurnMap = new Map<string, any[]>();

  for (const org of organizationEntities) {
    // Extract potential LLC identifiers (simplified)
    const llcMatch = org.name.match(/LLC|Limited Liability|Corporation/i);
    if (llcMatch) {
      const key = org.name.replace(/LLC|Limited Liability|Corporation/gi, '').trim();
      if (!llcChurnMap.has(key)) {
        llcChurnMap.set(key, []);
      }
      llcChurnMap.get(key)!.push(org);
    }
  }

  // Flag LLC churn patterns
  for (const [baseEntity, llcList] of llcChurnMap.entries()) {
    if (llcList.length > 1) {
      // Mark related sabotage signals as LLC churn pattern
      for (const signal of signals) {
        if (llcList.some(llc => llc.id === signal.entity_id)) {
          signal.llc_churn_pattern = true;
          signal.severity = 'CRITICAL'; // Escalate severity for churn patterns
        }
      }
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
        `SABOTAGE_${signal.classification}`,
        JSON.stringify(signal.evidence_quotes),
        signal.statute_ref,
        signal.confidence_score,
        signal.severity,
        signal.rcw_violation,
        signal.created_at
      ]);
    } catch (error) {
      console.error(`[Mechanical Battery] Failed to persist signal ${signal.signal_id}:`, error);
    }
  }

  return signals;
}

/**
 * Query sabotage signals for a case
 */
export async function getSabotageSignals(caseId: number): Promise<SabotageSignal[]> {
  try {
    const [rows] = await forensicPool.execute(
      `SELECT * FROM forensic_signals WHERE case_id = ? AND pattern_type LIKE 'SABOTAGE_%'`,
      [caseId]
    );
    
    return rows as SabotageSignal[];
  } catch (error) {
    console.error('[Mechanical Battery] Query failed:', error);
    return [];
  }
}
